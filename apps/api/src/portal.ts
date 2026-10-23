import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Db } from './db';
import { decrypt, digest, encrypt, keyed, token } from '../../../packages/core/src/security';
import { submitSandboxDebit } from './sandbox-enach';
import { PaymentProviderController } from './payment-provider';

interface StudentPortalSession {
  sessionId: string;
  studentId: string;
  tenantId: string;
  scheduleId: string;
  accountReference: string;
  accessToken: string;
  expiresAt: number;
}

export function securePortalCookie() {
  return {
    httpOnly: true,
    secure: process.env.DEPLOYMENT_MODE === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

@Controller('v1/portal')
export class StudentPortalController {
  constructor(@Inject(Db) private db: Db) {}

  private async getStudentSession(req: Request): Promise<StudentPortalSession> {
    const raw =
      req.cookies?.jodo_student_session ||
      req.headers['x-portal-token'] ||
      (typeof req.headers.authorization === 'string' &&
      req.headers.authorization.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (typeof raw !== 'string' || !raw) {
      throw new UnauthorizedException('Sign in to the student and parent portal');
    }

    try {
      const decoded = decrypt<StudentPortalSession>(raw);
      if (!decoded?.studentId || !decoded?.tenantId) {
        throw new Error('Invalid session payload');
      }
      if (!decoded.expiresAt || decoded.expiresAt <= Date.now()) throw new Error('Expired');
      const sessionRows = await this.db.query(
        `SELECT ps.id FROM student_portal_sessions ps
         JOIN academic_students s ON s.id=ps.student_id AND s.tenant_id=ps.tenant_id
         WHERE ps.id=$1 AND ps.student_id=$2 AND ps.tenant_id=$3
           AND ps.revoked_at IS NULL AND ps.expires_at>now()
           AND s.status='active'`,
        [decoded.sessionId, decoded.studentId, decoded.tenantId],
      );
      if (!sessionRows || !sessionRows.length) throw new Error('Revoked or invalid session');
      return decoded;
    } catch {
      throw new UnauthorizedException('Student portal session expired or invalid');
    }
  }

  private assertSandbox() {
    if (
      process.env.AUTOPAY_PROVIDER_MODE !== 'sandbox' ||
      process.env.DEPLOYMENT_MODE === 'production'
    ) {
      throw new ForbiddenException('Sandbox eNACH is unavailable in this deployment');
    }
  }

  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = z
      .object({
        studentReference: z.string().trim().min(1).max(100),
        identifier: z.string().trim().min(1).max(100),
      })
      .parse(body);

    const val1 = input.studentReference.trim();
    const val2 = input.identifier.trim();

    // 1. Try finding access via cryptographic token hash if identifier is 30+ chars
    let access: { id: string; tenant_id: string; access_id: string } | null = null;
    if (val2.length >= 30) {
      const rows = await this.db.query<{ id: string; tenant_id: string; access_id: string }>(
        `SELECT s.id, s.tenant_id, t.id AS access_id FROM payer_access_tokens t
         JOIN fee_schedules s ON s.id=t.schedule_id
         JOIN fee_payers p ON p.id=s.payer_id AND p.tenant_id=s.tenant_id
         WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND t.expires_at>now() AND p.active=true`,
        [digest(val2)],
      );
      access = rows[0] || null;
    }

    // 2. Query academic student
    let students: any[] = [];
    if (access) {
      students = await this.db.query(
        `SELECT s.id, s.tenant_id, s.student_reference, s.full_name, s.email, s.phone,
                sfa.schedule_id, sch.account_reference, sch.status AS schedule_status
         FROM academic_students s
         LEFT JOIN student_fee_plan_assignments sfa ON sfa.student_id=s.id AND sfa.tenant_id=s.tenant_id
         LEFT JOIN fee_schedules sch ON sch.id=sfa.schedule_id AND sch.tenant_id=s.tenant_id
         WHERE (lower(s.student_reference)=lower($1) OR s.id::text=$1)
           AND s.tenant_id=$2 AND sch.id=$3 AND s.status='active'
         ORDER BY CASE WHEN sch.status='active' THEN 0 ELSE 1 END
         LIMIT 1`,
        [val1, access.tenant_id, access.id],
      );
    }

    // Fallback: match student by reference, phone, or email across either field
    if (!students || students.length === 0) {
      students = await this.db.query(
        `SELECT s.id, s.tenant_id, s.student_reference, s.full_name, s.email, s.phone,
                sfa.schedule_id, sch.account_reference, sch.status AS schedule_status
         FROM academic_students s
         LEFT JOIN student_fee_plan_assignments sfa ON sfa.student_id=s.id AND sfa.tenant_id=s.tenant_id
         LEFT JOIN fee_schedules sch ON sch.id=sfa.schedule_id AND sch.tenant_id=s.tenant_id
         WHERE (
           lower(s.student_reference)=lower($1) OR s.phone=$1 OR lower(s.email)=lower($1) OR
           lower(s.student_reference)=lower($2) OR s.phone=$2 OR lower(s.email)=lower($2) OR
           s.phone LIKE '%' || $1 || '%' OR s.phone LIKE '%' || $2 || '%'
         ) AND s.status='active'
         ORDER BY CASE WHEN sch.status='active' THEN 0 ELSE 1 END
         LIMIT 1`,
        [val1, val2],
      );
    }

    const student = students[0];
    if (!student) {
      throw new UnauthorizedException('Student enrollment number or details not found');
    }

    let scheduleId = student.schedule_id;
    let accountReference = student.account_reference || student.student_reference;

    // If no schedule assigned yet, find any active schedule for this account reference
    if (!scheduleId) {
      const sch = (
        await this.db.query(
          `SELECT id, account_reference FROM fee_schedules WHERE tenant_id=$1 AND account_reference=$2 LIMIT 1`,
          [student.tenant_id, student.student_reference],
        )
      )[0];
      if (sch) {
        scheduleId = sch.id;
        accountReference = sch.account_reference;
      }
    }

    // Resolve or issue access token ID for student portal session
    let accessId = access?.access_id;
    if (!accessId && scheduleId) {
      const existingToken = (
        await this.db.query(
          `SELECT id FROM payer_access_tokens WHERE schedule_id=$1 AND tenant_id=$2 AND expires_at>now() AND revoked_at IS NULL LIMIT 1`,
          [scheduleId, student.tenant_id],
        )
      )[0];
      if (existingToken) {
        accessId = existingToken.id;
      } else {
        const dummyHash = digest('portal_' + student.id + '_' + Date.now());
        const newToken = (
          await this.db.query(
            `INSERT INTO payer_access_tokens(tenant_id, schedule_id, token_hash, expires_at)
             VALUES($1, $2, $3, now() + interval '30 days') RETURNING id`,
            [student.tenant_id, scheduleId, dummyHash],
          )
        )[0];
        accessId = newToken?.id;
      }
    }

    const portalSession = (
      await this.db.query(
        "INSERT INTO student_portal_sessions(tenant_id,student_id,schedule_id,access_token_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days') RETURNING id",
        [student.tenant_id, student.id, scheduleId, accessId || null],
      )
    )[0];

    const sessionPayload: StudentPortalSession = {
      sessionId: portalSession!.id,
      studentId: student.id,
      tenantId: student.tenant_id,
      scheduleId: scheduleId || '',
      accountReference,
      accessToken: val2,
      expiresAt: Date.now() + 7 * 86400000,
    };

    const sessionToken = encrypt(sessionPayload);
    res.cookie('jodo_student_session', sessionToken, securePortalCookie());

    return {
      status: 'authenticated',
      token: sessionToken,
      student: {
        id: student.id,
        studentReference: student.student_reference,
        fullName: student.full_name,
      },
    };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const session = await this.getStudentSession(req);

    const [studentRows, tenantRows, scheduleRows, installments, components, payments, mandates] =
      await Promise.all([
        this.db.query(
          `SELECT s.id, s.tenant_id, s.student_reference, s.full_name, s.email, s.phone, s.status,
                  (SELECT label FROM academic_years ay WHERE ay.tenant_id=s.tenant_id AND ay.id=s.academic_year_id) AS academic_year,
                  (SELECT name FROM branches br WHERE br.tenant_id=s.tenant_id AND br.id=s.branch_id) AS campus,
                  (SELECT string_agg(c.label, ', ') FROM student_catalogue_assignments ca JOIN academic_catalogue c ON c.id=ca.catalogue_id WHERE ca.tenant_id=s.tenant_id AND ca.student_id=s.id AND c.kind='course') AS course,
                  (SELECT string_agg(c.label, ', ') FROM student_catalogue_assignments ca JOIN academic_catalogue c ON c.id=ca.catalogue_id WHERE ca.tenant_id=s.tenant_id AND ca.student_id=s.id AND c.kind='grade') AS grade,
                  (SELECT string_agg(c.label, ', ') FROM student_catalogue_assignments ca JOIN academic_catalogue c ON c.id=ca.catalogue_id WHERE ca.tenant_id=s.tenant_id AND ca.student_id=s.id AND c.kind='batch') AS group_name
           FROM academic_students s WHERE s.id=$1 AND s.tenant_id=$2`,
          [session.studentId, session.tenantId],
        ),
        this.db.query(
          `SELECT t.id, t.display_name AS name, t.slug,
                  (SELECT support_email FROM tenant_brand_versions bv WHERE bv.tenant_id=t.id AND bv.status='published' LIMIT 1) AS support_email
           FROM tenants t WHERE t.id=$1`,
          [session.tenantId],
        ),
        this.db.query(
          `SELECT s.id, s.account_reference, s.total_amount_minor, s.gross_amount_minor, s.concession_amount_minor,
                  s.status, s.payer_id, p.encrypted_profile, fp.name AS plan_name
           FROM fee_schedules s
           LEFT JOIN fee_payers p ON p.id=s.payer_id
           LEFT JOIN student_fee_plan_assignments sfa ON sfa.schedule_id=s.id AND sfa.tenant_id=s.tenant_id
           LEFT JOIN fee_plan_versions fp ON fp.id=sfa.plan_id AND fp.tenant_id=s.tenant_id
           WHERE s.id=$1 AND s.tenant_id=$3 AND $2::text IS NOT NULL AND s.status IN ('active','completed')
           LIMIT 1`,
          [session.scheduleId || randomUUID(), session.accountReference, session.tenantId],
        ),
        this.db.query(
          `SELECT i.id, i.sequence, i.due_date, i.amount_minor, i.paid_amount_minor, i.adjustment_amount_minor,
                  greatest(i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor, 0)::bigint AS remaining_minor,
                  i.status
           FROM fee_installments i
           WHERE i.tenant_id=$1 AND i.schedule_id=$2 AND $3::text IS NOT NULL
             AND i.status<>'cancelled'
           ORDER BY i.due_date, i.sequence`,
          [session.tenantId, session.scheduleId || randomUUID(), session.accountReference],
        ),
        this.db.query(
          `SELECT c.id, c.code, c.label, c.amount_minor
           FROM fee_schedule_components c
           WHERE c.tenant_id=$1 AND c.schedule_id=$2 AND $3::text IS NOT NULL
           ORDER BY c.label`,
          [session.tenantId, session.scheduleId || randomUUID(), session.accountReference],
        ),
        this.db.query(
          `SELECT p.id, p.amount_minor, p.recorded_at, p.status, p.provider,
                  coalesce(p.collection_reference, p.provider_reference) AS transaction_id,
                  p.direct_details->>'mode' AS payment_mode,
                  r.receipt_number, r.issued_at
           FROM payment_records p
           LEFT JOIN fee_receipts r ON r.payment_id=p.id AND r.tenant_id=p.tenant_id
           WHERE p.tenant_id=$1 AND p.schedule_id=$2 AND $3::text IS NOT NULL
           ORDER BY p.recorded_at DESC`,
          [session.tenantId, session.scheduleId || randomUUID(), session.accountReference],
        ),
        this.db.query(
          `SELECT m.id, m.rail, m.provider, m.provider_reference, m.status, m.last_event_at, m.umrn, m.bank_name, m.bank_account_masked, m.bank_ifsc, m.max_amount_minor
           FROM payment_mandates m
           WHERE m.tenant_id=$1 AND m.schedule_id=$2 AND $3::text IS NOT NULL
           ORDER BY CASE WHEN m.status='active' THEN 0 ELSE 1 END, m.last_event_at DESC
           LIMIT 1`,
          [session.tenantId, session.scheduleId || randomUUID(), session.accountReference],
        ),
      ]);

    const student = studentRows[0];
    if (!student) throw new NotFoundException('Student record not found');

    const schedule = scheduleRows[0];
    const actualScheduleId = schedule?.id || session.scheduleId;

    // Get shared financial balances view
    const balanceRows = await this.db.query(
      `SELECT net_payable_minor, paid_minor, outstanding_minor
       FROM finance_schedule_balances
       WHERE tenant_id=$1 AND schedule_id=$2`,
      [session.tenantId, actualScheduleId || randomUUID()],
    );
    const balances = balanceRows[0] || {
      net_payable_minor: installments.reduce(
        (sum, i) => sum + Number(i.amount_minor) - Number(i.adjustment_amount_minor || 0),
        0,
      ),
      paid_minor: installments.reduce((sum, i) => sum + Number(i.paid_amount_minor || 0), 0),
      outstanding_minor: installments.reduce((sum, i) => sum + Number(i.remaining_minor || 0), 0),
    };

    // Payer profile details
    let payerName = student.full_name;
    let payerEmail = student.email || '';
    let payerPhone = student.phone || '';

    if (schedule?.encrypted_profile) {
      try {
        const prof = decrypt<{ displayName?: string; email?: string; phone?: string }>(
          schedule.encrypted_profile,
        );
        if (prof.displayName) payerName = prof.displayName;
        if (prof.email) payerEmail = prof.email;
        if (prof.phone) payerPhone = prof.phone;
      } catch {}
    } else {
      const g = (
        await this.db.query(
          `SELECT g.display_name, g.email, g.phone FROM academic_guardian_links l
           JOIN academic_guardians g ON g.id=l.guardian_id
           WHERE l.student_id=$1 AND l.tenant_id=$2 LIMIT 1`,
          [student.id, session.tenantId],
        )
      )[0];
      if (g) {
        payerName = g.display_name;
        if (g.email) payerEmail = g.email;
        if (g.phone) payerPhone = g.phone;
      }
    }

    // Upcoming installment
    const upcomingInstallment =
      installments.find(
        (i) =>
          Number(i.remaining_minor) > 0 && !['cancelled', 'paid', 'adjusted'].includes(i.status),
      ) || null;

    const mandate = mandates[0] || null;
    let masterSchedule = await this.db.query(
      'SELECT i.id, i.sequence, i.due_date, i.amount_minor FROM fee_plan_installments i JOIN student_fee_plan_assignments a ON a.plan_id=i.plan_id AND a.tenant_id=i.tenant_id WHERE a.schedule_id=$1 AND a.student_id=$2 AND a.tenant_id=$3 ORDER BY i.sequence',
      [session.scheduleId, session.studentId, session.tenantId],
    );

    if (!masterSchedule || masterSchedule.length === 0) {
      masterSchedule = await this.db.query(
        `SELECT i.id, i.sequence, i.due_date, i.amount_minor
         FROM fee_plan_installments i
         JOIN fee_plan_versions v ON v.id = i.plan_id AND v.tenant_id = i.tenant_id
         WHERE v.tenant_id = $1 AND v.status IN ('effective', 'validated', 'draft')
         ORDER BY v.version DESC, i.sequence
         LIMIT 6`,
        [session.tenantId],
      );
    }

    const mappedMasterSchedule = masterSchedule.map((m: any) => {
      const matchingInst = installments.find(
        (inst: any) => Number(inst.sequence) === Number(m.sequence),
      );
      const amountMinor = Number(m.amount_minor || 0);
      const paidMinor = Number(matchingInst?.paid_amount_minor || 0);
      const remainingMinor = Math.max(0, amountMinor - paidMinor);
      const isPaid = remainingMinor === 0;
      return {
        id: matchingInst?.id || m.id,
        sequence: m.sequence,
        dueDate: m.due_date,
        amountMinor: String(amountMinor),
        paidAmountMinor: String(paidMinor),
        remainingMinor: String(remainingMinor),
        status: isPaid ? 'paid' : 'scheduled',
      };
    });

    return {
      masterSchedule: mappedMasterSchedule,
      student: {
        id: student.id,
        studentReference: student.student_reference,
        fullName: student.full_name,
        email: student.email,
        phone: student.phone,
        status: student.status,
        campus: student.campus,
        academicYear: student.academic_year,
        course: student.course,
        grade: student.grade,
        groupName: student.group_name,
      },
      payer: {
        name: payerName,
        email: payerEmail,
        phone: payerPhone,
      },
      institution: {
        id: tenantRows[0]?.id || session.tenantId,
        name: tenantRows[0]?.name || 'Institution',
        supportEmail: tenantRows[0]?.support_email || 'accounts@institution.edu',
      },
      plan: {
        name: schedule?.plan_name || 'Master Fee Structure',
        status: schedule?.status || 'active',
        scheduleId: actualScheduleId,
      },
      summary: {
        netPayableMinor: String(balances.net_payable_minor || 0),
        paidMinor: String(balances.paid_minor || 0),
        outstandingMinor: String(balances.outstanding_minor || 0),
      },
      feeComponents: components.map((c) => ({
        id: c.id,
        code: c.code,
        label: c.label,
        amountMinor: c.amount_minor,
      })),
      installments: installments.map((i) => ({
        id: i.id,
        sequence: i.sequence,
        dueDate: i.due_date,
        amountMinor: i.amount_minor,
        paidAmountMinor: i.paid_amount_minor,
        remainingMinor: i.remaining_minor,
        status: i.status,
      })),
      upcomingInstallment: upcomingInstallment
        ? {
            id: upcomingInstallment.id,
            sequence: upcomingInstallment.sequence,
            dueDate: upcomingInstallment.due_date,
            remainingMinor: upcomingInstallment.remaining_minor,
            status: upcomingInstallment.status,
          }
        : null,
      enach: {
        status: mandate?.status || 'not_registered',
        rail: mandate?.rail || 'enach',
        provider: mandate?.provider || 'sandbox_enach',
        mandateReference: mandate?.umrn || mandate?.provider_reference || null,
        mandateId: mandate?.id || null,
        umrn: mandate?.umrn || null,
        bankName: mandate?.bank_name || null,
        accountMask: mandate?.bank_account_masked || null,
        ifsc: mandate?.bank_ifsc || null,
        maxAmountMinor: mandate?.max_amount_minor || null,
        upcomingDebit:
          mandate?.status === 'active' && upcomingInstallment
            ? {
                amountMinor: upcomingInstallment.remaining_minor,
                scheduledDate: upcomingInstallment.due_date,
                installmentId: upcomingInstallment.id,
              }
            : null,
      },
      transactions: payments.map((p) => ({
        id: p.id,
        amountMinor: p.amount_minor,
        recordedAt: p.recorded_at,
        status: p.status,
        mode: p.payment_mode || (p.provider === 'sandbox_enach' ? 'eNACH' : 'Direct Payment'),
        transactionId: p.transaction_id,
        receiptNumber: p.receipt_number,
      })),
    };
  }

  @Get('form-config')
  async getFormConfig(@Req() req: Request) {
    const session = await this.getStudentSession(req);
    const rows = await this.db.query(
      `SELECT fields, components, rules, instructions FROM student_payment_form_configs WHERE tenant_id=$1`,
      [session.tenantId],
    );
    if (!rows[0]) {
      return {
        fields: [
          {
            key: 'payer_name',
            label: 'Payer Name',
            visible: true,
            required: true,
            editable: true,
            order: 1,
          },
          {
            key: 'payer_email',
            label: 'Payer Email',
            visible: true,
            required: true,
            editable: true,
            order: 2,
          },
          {
            key: 'payer_phone',
            label: 'Payer Phone',
            visible: true,
            required: true,
            editable: true,
            order: 3,
          },
          {
            key: 'student_name',
            label: 'Student Name',
            visible: true,
            required: true,
            editable: false,
            order: 4,
          },
          {
            key: 'course',
            label: 'Course',
            visible: true,
            required: false,
            editable: false,
            order: 5,
          },
          {
            key: 'grade',
            label: 'Grade / Class',
            visible: true,
            required: false,
            editable: false,
            order: 6,
          },
        ],
        components: [
          {
            code: 'REG',
            label: 'Registration Fee',
            visible: true,
            required: true,
            selectable: false,
            fixed: true,
          },
          {
            code: 'CRS',
            label: 'Course Fee',
            visible: true,
            required: true,
            selectable: false,
            fixed: true,
          },
          {
            code: 'TUI',
            label: 'Tuition Fee',
            visible: true,
            required: false,
            selectable: true,
            fixed: false,
          },
        ],
        rules: {
          allow_full_payment: true,
          allow_partial_payment: true,
          allow_advance_payment: true,
          min_partial_amount_minor: 100000,
          max_partial_amount_minor: null,
          require_down_payment: false,
          enable_enach: true,
          allow_payer_contact_editing: true,
          allow_fee_component_selection: true,
        },
        instructions:
          'Review your fee schedule and submit payer details to complete eNACH registration.',
      };
    }
    return rows[0];
  }

  @Post('enach/register')
  async registerEnach(@Req() req: Request, @Body() body: unknown) {
    const session = await this.getStudentSession(req);
    this.assertSandbox();

    // 1. Fetch form configuration to enforce rules on the backend
    const configRows = await this.db.query(
      `SELECT fields, rules FROM student_payment_form_configs WHERE tenant_id=$1`,
      [session.tenantId],
    );
    const config = configRows[0];
    const fieldsConfig: any[] = config?.fields || [];
    const rulesConfig: any = config?.rules || {};

    const input = z
      .object({
        payerName: z.string().trim().min(2).max(160),
        payerEmail: z.preprocess(
          (v) => (v === '' ? undefined : v),
          z.string().trim().email().max(200).optional(),
        ),
        payerPhone: z.preprocess(
          (v) => (v === '' ? undefined : v),
          z
            .string()
            .trim()
            .regex(/^\+?[\d ()-]{8,20}$/)
            .optional(),
        ),
        bankName: z.string().trim().min(2).max(100),
        accountNumber: z.string().trim().min(8).max(34),
        ifsc: z
          .string()
          .trim()
          .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i),
        accountType: z.enum(['savings', 'current']).default('savings'),
        consent: z.literal(true),
      })
      .parse(body);

    if (rulesConfig.enable_enach === false)
      throw new ForbiddenException('eNACH registration is disabled by your institution');
    const current = await this.me(req);
    const values: Record<string, string | undefined> = {
      payer_name: input.payerName,
      payer_email: input.payerEmail,
      payer_phone: input.payerPhone,
    };
    const stored: Record<string, string> = {
      payer_name: current.payer.name,
      payer_email: current.payer.email,
      payer_phone: current.payer.phone,
    };
    for (const key of Object.keys(values)) {
      const field = fieldsConfig.find((f) => f.key === key);
      if ((field?.required ?? true) && field?.visible !== false && !values[key])
        throw new ConflictException('Complete the required payer fields');
      if (
        (field?.editable === false ||
          field?.visible === false ||
          rulesConfig.allow_payer_contact_editing === false) &&
        (values[key] || '') !== stored[key]
      ) {
        throw new ForbiddenException('Institution-configured payer details are read-only');
      }
    }

    const schedule = (
      await this.db.query(
        `SELECT id, account_reference, payer_id, status FROM fee_schedules
         WHERE tenant_id=$1 AND id=$2 AND $3::text IS NOT NULL AND status='active'
         LIMIT 1`,
        [session.tenantId, session.scheduleId || randomUUID(), session.accountReference],
      )
    )[0];

    if (!schedule) {
      throw new ConflictException('Active fee schedule not found for this student');
    }

    const existing = (
      await this.db.query(
        "SELECT id,provider_reference FROM payment_mandates WHERE tenant_id=$1 AND schedule_id=$2 AND status='active' AND rail='enach'",
        [session.tenantId, schedule.id],
      )
    )[0];
    if (existing)
      return {
        status: 'active',
        mandateId: existing.id,
        providerReference: existing.provider_reference,
        message: 'eNACH Registration Successful / Mandate Active',
      };
    const idempotencyKey = randomUUID();

    const setup = await this.db.tx(async (c) => {
      await c.query('SELECT id FROM fee_schedules WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [
        schedule.id,
        session.tenantId,
      ]);
      const active = (
        await c.query(
          "SELECT id,provider_reference FROM payment_mandates WHERE schedule_id=$1 AND tenant_id=$2 AND rail='enach' AND status='active'",
          [schedule.id, session.tenantId],
        )
      ).rows[0];
      if (active) return { ...active, alreadyActive: true };
      let payerId = schedule.payer_id;
      if (!payerId) {
        const p = (
          await c.query(
            `INSERT INTO fee_payers(tenant_id, account_reference, encrypted_profile, preferred_channel, created_by)
             VALUES($1, $2, $3, 'email', (SELECT m.user_id FROM memberships m WHERE m.tenant_id=$1 AND m.status='active' LIMIT 1))
             ON CONFLICT(tenant_id, account_reference) DO UPDATE SET updated_at=fee_payers.updated_at
             RETURNING id`,
            [
              session.tenantId,
              schedule.account_reference,
              encrypt({
                accountReference: schedule.account_reference,
                preferredChannel: 'email',
                locale: 'en-IN',
                displayName: input.payerName,
                email: input.payerEmail,
                phone: input.payerPhone,
                bankName: input.bankName,
                accountNumberMasked: '••••' + input.accountNumber.slice(-4),
                ifsc: input.ifsc.toUpperCase(),
              }),
            ],
          )
        ).rows[0];
        payerId = p.id;
        await c.query(`UPDATE fee_schedules SET payer_id=$2 WHERE id=$1`, [schedule.id, payerId]);
      } else {
        // Update profile
        await c.query(
          `UPDATE fee_payers SET encrypted_profile=$2, preferred_channel='email', updated_at=now() WHERE id=$1`,
          [
            payerId,
            encrypt({
              accountReference: schedule.account_reference,
              preferredChannel: 'email',
              locale: 'en-IN',
              displayName: input.payerName,
              email: input.payerEmail,
              phone: input.payerPhone,
              bankName: input.bankName,
              accountNumberMasked: '••••' + input.accountNumber.slice(-4),
              ifsc: input.ifsc.toUpperCase(),
            }),
          ],
        );
      }

      const reqRow = (
        await c.query(
          `INSERT INTO payment_mandate_setup_requests(tenant_id, schedule_id, payer_id, idempotency_key, provider, rail, return_token_hash, status, provider_reference)
           VALUES($1, $2, $3, $4, 'sandbox_enach', 'enach', $5, 'created', $6)
           RETURNING *`,
          [session.tenantId, schedule.id, payerId, idempotencyKey, token(), 'SM-' + idempotencyKey],
        )
      ).rows[0];

      await this.db.audit(
        c,
        'portal:' + session.studentId,
        'fees.sandbox.registration',
        reqRow.id,
        {
          tenantId: session.tenantId,
          scheduleId: schedule.id,
          sandboxConsent: true,
        },
      );

      // Make mandate active via payment provider event
      const providerCtrl = new PaymentProviderController(this.db.transactionView(c));
      await providerCtrl.applyVerifiedEvent(
        'sandbox_enach',
        {
          eventId: 'SME-' + reqRow.id,
          type: 'mandate_status',
          merchantSetupId: reqRow.id,
          scheduleId: reqRow.schedule_id,
          rail: 'enach',
          providerReference: reqRow.provider_reference,
          status: 'active',
          occurredAt: new Date().toISOString(),
        },
        token(),
        session.tenantId,
      );

      await c.query(
        `UPDATE payment_mandates
         SET bank_name=$1, bank_account_masked=$2, bank_ifsc=$3, umrn=$4
         WHERE schedule_id=$5 AND tenant_id=$6 AND status='active'`,
        [
          input.bankName || 'State Bank of India',
          input.accountNumber ? '•••• ' + input.accountNumber.slice(-4) : '•••• 4421',
          (input.ifsc || 'SBIN0001234').toUpperCase(),
          'UMRN-' + randomUUID().slice(0, 8).toUpperCase(),
          schedule.id,
          session.tenantId,
        ],
      );

      return reqRow;
    });

    if (setup.alreadyActive)
      return {
        status: 'active',
        mandateId: setup.id,
        providerReference: setup.provider_reference,
        message: 'eNACH Registration Successful / Mandate Active',
      };

    return {
      status: 'active',
      mandateId: setup.id,
      providerReference: setup.provider_reference,
      message: 'eNACH Registration Successful · Mandate Active',
      note: 'Sandbox eNACH registration complete. Simulated recurring collection is now active.',
    };
  }

    @Post('installments/test')
  async addTestInstallment(@Req() req: Request) {
    const session = await this.getStudentSession(req);
    this.assertSandbox();

    const schedule = (
      await this.db.query(
        `SELECT id FROM fee_schedules WHERE tenant_id=$1 AND id=$2 LIMIT 1`,
        [session.tenantId, session.scheduleId],
      )
    )[0];
    if (!schedule) throw new ConflictException('Fee schedule not found');

    const maxDateRow = (
      await this.db.query(
        `SELECT coalesce(max(due_date), now()) AS max_due_date, coalesce(max(sequence), 0)::int AS max_seq FROM fee_installments WHERE tenant_id=$1 AND schedule_id=$2`,
        [session.tenantId, schedule.id],
      )
    )[0];
    const nextSeq = Number(maxDateRow?.max_seq || 0) + 1;
    const baseTime = maxDateRow?.max_due_date ? new Date(maxDateRow.max_due_date).getTime() : Date.now();
    const nextDueDate = new Date(baseTime + 30 * 24 * 60 * 60 * 1000);

    const instId = randomUUID();

    await this.db.query(
      `INSERT INTO fee_installments (
         id, tenant_id, schedule_id, sequence, due_date,
         amount_minor, adjustment_amount_minor, paid_amount_minor, status
       ) VALUES ($1, $2, $3, $4, $5, 500000, 0, 0, 'scheduled')`,
      [instId, session.tenantId, schedule.id, nextSeq, nextDueDate.toISOString()],
    );

    await this.db.query(
      `UPDATE fee_schedules SET status='active' WHERE id=$1`,
      [schedule.id],
    );

    return { success: true, installmentId: instId };
  }

  @Post('enach/simulate-debit')
  async simulateDebit(@Req() req: Request, @Body() body: unknown) {
    const session = await this.getStudentSession(req);
    this.assertSandbox();

    const input = z
      .object({
        outcome: z.enum(['successful', 'failed', 'uncertain']).default('successful'),
        installmentId: z.string().trim().optional(),
      })
      .parse(body);

    const isUuid =
      !!input.installmentId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.installmentId);
    const targetInstallmentId = isUuid ? input.installmentId : null;

    // 1. Find the next unpaid installment
    const schedule = (
      await this.db.query(
        `SELECT id, account_reference FROM fee_schedules
         WHERE tenant_id=$1 AND id=$2 AND $3::text IS NOT NULL AND status IN ('active', 'completed')
         LIMIT 1`,
        [session.tenantId, session.scheduleId || randomUUID(), session.accountReference],
      )
    )[0];

    if (!schedule) throw new ConflictException('Active fee schedule not found');

    const installment = (
      await this.db.query(
        `SELECT i.*, m.id AS mandate_id,
                greatest(i.amount_minor - i.adjustment_amount_minor - i.paid_amount_minor, 0)::bigint AS remaining_minor
         FROM fee_installments i
         JOIN payment_mandates m ON m.schedule_id=i.schedule_id AND m.tenant_id=i.tenant_id AND m.status='active'
         WHERE i.tenant_id=$1 AND i.schedule_id=$2 AND ($3::uuid IS NULL OR i.id=$3)
           AND i.status NOT IN ('paid', 'cancelled', 'adjusted')
           AND i.amount_minor - i.adjustment_amount_minor - i.paid_amount_minor > 0
         ORDER BY i.due_date, i.sequence
         LIMIT 1`,
        [session.tenantId, schedule.id, targetInstallmentId],
      )
    )[0];

    if (!installment) {
      throw new ConflictException(
        'No payable installment balance found. Upcoming balance is zero; no debit executed.',
      );
    }

    const remainingBalance = Number(installment.remaining_minor);
    if (remainingBalance <= 0) {
      throw new ConflictException('Installment balance is zero. Debit blocked.');
    }

    // Ensure schedule is marked active if it has payable balance
    await this.db.query(
      `UPDATE fee_schedules SET status='active' WHERE id=$1 AND status='completed'`,
      [schedule.id],
    );

    // Prevent concurrent in-flight debit attempts
    const inFlight = (
      await this.db.query(
        `SELECT id FROM autopay_debit_attempts WHERE tenant_id=$1 AND installment_id=$2 AND status IN ('queued', 'submitted') LIMIT 1`,
        [session.tenantId, installment.id],
      )
    )[0];
    if (inFlight) {
      throw new ConflictException('A debit attempt is currently being processed for this installment.');
    }

    // Determine next attempt number for this installment to satisfy unique constraint
    const existingAttempts = (
      await this.db.query(
        `SELECT coalesce(max(attempt_no), 0)::int AS attempts FROM autopay_debit_attempts WHERE tenant_id=$1 AND installment_id=$2`,
        [session.tenantId, installment.id],
      )
    )[0];
    const nextAttemptNo = Number(existingAttempts?.attempts || 0) + 1;

    const idempotencyKey = randomUUID();

    // Create queued attempt with incremented attempt_no
    const attempt = (
      await this.db.query(
        `INSERT INTO autopay_debit_attempts(
           tenant_id, schedule_id, mandate_id, installment_id, idempotency_key, provider,
           amount_minor, currency, status, sandbox_outcome, attempt_no
         ) VALUES($1, $2, $3, $4, $5, 'sandbox_enach', $6, 'INR', 'queued', $7, $8)
         RETURNING *`,
        [
          session.tenantId,
          schedule.id,
          installment.mandate_id,
          installment.id,
          idempotencyKey,
          remainingBalance,
          input.outcome,
          nextAttemptNo,
        ],
      )
    )[0];
    if (!attempt) throw new ConflictException('Failed to initiate debit attempt');

    // Execute debit using shared submitSandboxDebit (recalculates remaining collectible balance from backend records!)
    const result = await submitSandboxDebit(this.db, attempt.id);

    if (input.outcome === 'failed') {
      return {
        status: 'failed',
        message: 'Sandbox eNACH debit failed: Insufficient funds simulated.',
        attemptId: attempt.id,
        installmentRemainingMinor: remainingBalance,
      };
    }

    if (input.outcome === 'uncertain') {
      return {
        status: 'uncertain',
        message: 'Sandbox eNACH debit uncertain: Awaiting bank reconciliation.',
        attemptId: attempt.id,
      };
    }

    if (result.status !== 'successful')
      return {
        status: result.status,
        message: 'Debit is awaiting confirmation. No payment completion has been recorded.',
      };

    // Successful verified debit: Fetch payment complete details
    const payment = (
      await this.db.query(
        `SELECT p.id, p.amount_minor, p.recorded_at, p.status,
                coalesce(p.collection_reference, p.provider_reference) AS transaction_id,
                r.receipt_number, r.issued_at
         FROM payment_records p
         JOIN fee_receipts r ON r.payment_id=p.id
         WHERE p.tenant_id=$1 AND p.provider='sandbox_enach' AND p.provider_reference='SDB-'||$2
         LIMIT 1`,
        [session.tenantId, attempt.id],
      )
    )[0];

    if (!payment)
      throw new ConflictException('No confirmed financial payment exists for this debit');

    // Fetch updated balance
    const updatedBalances = (
      await this.db.query(
        `SELECT net_payable_minor, paid_minor, outstanding_minor FROM finance_schedule_balances
         WHERE tenant_id=$1 AND schedule_id=$2`,
        [session.tenantId, schedule.id],
      )
    )[0] || { net_payable_minor: 0, paid_minor: 0, outstanding_minor: 0 };

    const studentInfo = (
      await this.db.query(
        `SELECT s.full_name, s.email, s.phone,
                (SELECT string_agg(c.label, ', ') FROM student_catalogue_assignments ca JOIN academic_catalogue c ON c.id=ca.catalogue_id WHERE ca.student_id=s.id AND c.kind='course') AS course,
                (SELECT string_agg(c.label, ', ') FROM student_catalogue_assignments ca JOIN academic_catalogue c ON c.id=ca.catalogue_id WHERE ca.student_id=s.id AND c.kind='grade') AS grade
         FROM academic_students s WHERE s.id=$1`,
        [session.studentId],
      )
    )[0];

    return {
      status: 'payment_complete',
      paymentComplete: {
        payerName: studentInfo?.full_name || 'Payer',
        payerEmail: studentInfo?.email || '',
        payerPhone: studentInfo?.phone || '',
        studentName: studentInfo?.full_name || 'Student',
        course: studentInfo?.course || '—',
        grade: studentInfo?.grade || '—',
        receiptNumber: payment?.receipt_number || 'RCP-SIMULATED',
        transactionId: payment?.transaction_id || 'TXN-' + attempt.id,
        paymentDate: payment?.recorded_at || new Date().toISOString(),
        paymentMode: 'eNACH',
        amountMinor: Number(payment.amount_minor),
        totalAmountMinor: updatedBalances.net_payable_minor,
        paidMinor: updatedBalances.paid_minor,
        outstandingMinor: updatedBalances.outstanding_minor,
        paymentStatus: 'confirmed',
      },
    };
  }

  @Get('receipts/:receiptNumber')
  async getReceipt(@Req() req: Request, @Param('receiptNumber') receiptNumber: string) {
    const session = await this.getStudentSession(req);

    const receipt = (
      await this.db.query(
        `SELECT r.receipt_number, r.issued_at, r.snapshot,
                p.amount_minor, p.recorded_at, coalesce(p.collection_reference, p.provider_reference) AS transaction_id,
                p.direct_details->>'mode' AS payment_mode,
                t.display_name AS institution_name,
                r.snapshot->'receiptConfig' AS receipt_config
         FROM fee_receipts r
         JOIN payment_records p ON p.id=r.payment_id
         JOIN tenants t ON t.id=p.tenant_id
         WHERE r.receipt_number=$1 AND p.tenant_id=$2 AND p.schedule_id=$3`,
        [receiptNumber, session.tenantId, session.scheduleId],
      )
    )[0];

    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.getStudentSession(req);
    await this.db.query(
      'UPDATE student_portal_sessions SET revoked_at=now() WHERE id=$1 AND tenant_id=$2',
      [session.sessionId, session.tenantId],
    );
    res.clearCookie('jodo_student_session', { path: '/' });
    return { status: 'logged_out' };
  }
}
