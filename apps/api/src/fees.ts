import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  NotFoundException,
  Post,
  Req,
  UseGuards,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { Db } from './db';
import { syncQueuedDebitBalances, assertNoProcessingCollections } from './fee-balances';
import { AuthGuard, AuthedRequest, Roles } from './auth';
import { uuid } from './content';
import {
  externalPaymentRecordSchema,
  feeScheduleActivationSchema,
  feeScheduleCreateSchema,
  mandateRecordSchema,
  moneyMinor,
  refundRecordSchema,
} from '../../../packages/core/src/contracts';

const settlementSchema = z
  .object({
    providerReference: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._:-]{3,120}$/),
    currency: z.literal('INR'),
    amountMinor: moneyMinor,
    status: z.enum(['pending', 'settled', 'failed']).default('pending'),
    expectedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    allocations: z
      .array(
        z
          .object({
            paymentId: z.uuid(),
            amountMinor: moneyMinor,
          })
          .strict(),
      )
      .max(200)
      .default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    const allocated = v.allocations.reduce((sum, x) => sum + x.amountMinor, 0);
    if (allocated > v.amountMinor)
      ctx.addIssue({
        code: 'custom',
        path: ['allocations'],
        message: 'Allocated payment total cannot exceed settlement amount',
      });
  });

const lateFeeWaiverSchema = z.object({ reason: z.string().trim().min(3).max(240) }).strict();

@Controller('v1/admin/fees')
@UseGuards(AuthGuard)
@Roles('owner')
export class FeeOperationsController {
  constructor(@Inject(Db) private db: Db) {}

  @Get('receipts/:id')
  async receipt(@Req() req: AuthedRequest, @Param('id') id: string) {
    const row = (
      await this.db.query(
        `SELECT r.receipt_number,r.issued_at,r.snapshot
      FROM fee_receipts r JOIN payment_records p ON p.id=r.payment_id AND p.tenant_id=r.tenant_id
      WHERE r.id=$1 AND r.tenant_id=$2`,
        [uuid(id), req.actor.tenantId],
      )
    )[0];
    if (!row) throw new NotFoundException('Receipt not found');
    return row;
  }

  @Get('records')
  async financeRecords(@Req() req: AuthedRequest, @Query() query: unknown) {
    const input = z
      .object({
        kind: z.enum([
          'installments',
          'payments',
          'settlements',
          'debits',
          'reconciliation',
          'overdue',
        ]),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        search: z.string().trim().max(100).default(''),
        status: z.string().trim().max(40).default(''),
        sort: z.enum(['date', 'amount']).default('date'),
      })
      .parse(query);
    const sources = {
      installments: `SELECT i.id,s.account_reference,i.sequence,i.due_date,i.amount_minor,i.paid_amount_minor,greatest(i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor,0)::bigint AS remaining_minor,i.status,i.due_date AS sort_date,i.amount_minor AS sort_amount,s.account_reference AS search_text FROM fee_installments i JOIN fee_schedules s ON s.id=i.schedule_id AND s.tenant_id=i.tenant_id WHERE i.tenant_id=$1 AND s.status IN ('active','completed') AND i.status<>'cancelled'`,
      payments: `SELECT p.id,s.account_reference,p.provider,coalesce(p.collection_reference,p.provider_reference) AS provider_reference,p.amount_minor,p.refunded_amount_minor,p.recorded_at,p.status,p.direct_details->>'mode' AS payment_mode,r.receipt_number,p.recorded_at AS sort_date,p.amount_minor AS sort_amount,s.account_reference||' '||coalesce(p.collection_reference,p.provider_reference) AS search_text FROM payment_records p JOIN fee_schedules s ON s.id=p.schedule_id AND s.tenant_id=p.tenant_id LEFT JOIN fee_receipts r ON r.payment_id=p.id AND r.tenant_id=p.tenant_id WHERE p.tenant_id=$1`,
      settlements: `SELECT s.id,s.provider,s.provider_reference,s.amount_minor,s.settled_at,s.expected_on,s.status,(SELECT count(*)::int FROM settlement_payments sp WHERE sp.settlement_id=s.id) AS payment_count,coalesce(s.settled_at,s.created_at) AS sort_date,s.amount_minor AS sort_amount,s.provider_reference AS search_text FROM settlement_records s WHERE s.tenant_id=$1`,
      debits: `SELECT a.id,a.provider,a.installment_id,(SELECT student_id FROM student_fee_plan_assignments sf WHERE sf.tenant_id=a.tenant_id AND sf.schedule_id=a.schedule_id ORDER BY sf.assigned_on DESC LIMIT 1) AS student_id,s.account_reference,a.provider_reference,a.amount_minor,a.status,a.attempt_no,a.failure_code,a.recovery_status,a.recovery_note,a.created_at,a.created_at AS sort_date,a.amount_minor AS sort_amount,s.account_reference AS search_text FROM autopay_debit_attempts a JOIN fee_schedules s ON s.id=a.schedule_id AND s.tenant_id=a.tenant_id WHERE a.tenant_id=$1`,
      reconciliation: `SELECT r.id,s.account_reference,p.provider_reference AS payment_reference,st.provider_reference AS settlement_reference,r.status,r.reason,r.created_at,p.amount_minor,r.created_at AS sort_date,coalesce(p.amount_minor,st.amount_minor) AS sort_amount,coalesce(s.account_reference,'')||' '||coalesce(st.provider_reference,'') AS search_text FROM reconciliation_entries r LEFT JOIN payment_records p ON p.id=r.payment_id AND p.tenant_id=r.tenant_id LEFT JOIN fee_schedules s ON s.id=p.schedule_id AND s.tenant_id=r.tenant_id LEFT JOIN settlement_records st ON st.id=r.settlement_id AND st.tenant_id=r.tenant_id WHERE r.tenant_id=$1`,
      overdue: `SELECT b.schedule_id AS id,b.account_reference,b.outstanding_minor,b.overdue_minor,'overdue'::text AS status,(SELECT min(i.due_date) FROM fee_installments i WHERE i.tenant_id=b.tenant_id AND i.schedule_id=b.schedule_id AND i.status NOT IN ('cancelled','paid','adjusted') AND i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor>0) AS oldest_due_date,(SELECT min(i.due_date) FROM fee_installments i WHERE i.tenant_id=b.tenant_id AND i.schedule_id=b.schedule_id AND i.status NOT IN ('cancelled','paid','adjusted') AND i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor>0) AS sort_date,b.overdue_minor AS sort_amount,b.account_reference AS search_text FROM finance_schedule_balances b WHERE b.tenant_id=$1 AND b.overdue_minor>0`,
    };
    const result = await this.db.query(
      `WITH records AS (${sources[input.kind]}), filtered AS (
      SELECT * FROM records WHERE ($2='' OR strpos(lower(search_text),lower($2))>0) AND ($3='' OR status=$3)
    ) SELECT (SELECT count(*)::int FROM filtered) AS total,
    coalesce((SELECT json_agg(p) FROM (SELECT * FROM filtered ORDER BY ${input.sort === 'amount' ? 'sort_amount' : 'sort_date'} DESC NULLS LAST,id LIMIT $4 OFFSET $5) p),'[]'::json) AS rows`,
      [
        req.actor.tenantId,
        input.search,
        input.status,
        input.pageSize,
        (input.page - 1) * input.pageSize,
      ],
    );
    return { ...result[0], page: input.page, pageSize: input.pageSize };
  }

  @Get('schedules/:id/flex')
  async flexSchedule(@Req() req: AuthedRequest, @Param('id') id: string) {
    const rows = await this.db.query(
      `SELECT s.id,s.version,s.schedule_kind,s.total_amount_minor,
      coalesce((SELECT json_agg(i ORDER BY i.sequence) FROM (
        SELECT id,sequence,due_date,amount_minor,paid_amount_minor,adjustment_amount_minor,status,
          (paid_amount_minor=0 AND due_date>current_date AND status NOT IN ('cancelled','paid','adjusted') AND NOT EXISTS(SELECT 1 FROM payment_records fp WHERE fp.tenant_id=fee_installments.tenant_id AND fp.installment_id=fee_installments.id)) AS editable
        FROM fee_installments WHERE tenant_id=$1 AND schedule_id=s.id AND status<>'cancelled'
      ) i),'[]'::json) AS installments
      FROM fee_schedules s WHERE s.tenant_id=$1 AND s.id=$2`,
      [req.actor.tenantId, uuid(id)],
    );
    if (!rows[0]) throw new NotFoundException('Fee schedule not found');
    return rows[0];
  }

  @Post('schedules/:id/flex')
  async editFlex(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    const scheduleId = uuid(id);
    const input = z
      .object({
        version: z.number().int().positive(),
        reason: z.string().trim().min(3).max(300),
        installments: z
          .array(z.object({ dueDate: z.iso.date(), amountMinor: moneyMinor }).strict())
          .min(1)
          .max(60),
      })
      .strict()
      .parse(body);
    if (new Set(input.installments.map((i) => i.dueDate)).size !== input.installments.length)
      throw new UnprocessableEntityException('Installment dates must be unique');
    return this.db.tx(async (c) => {
      const s = (
        await c.query(
          `SELECT * FROM fee_schedules WHERE tenant_id=$1 AND id=$2 AND status='active' FOR UPDATE`,
          [req.actor.tenantId, scheduleId],
        )
      ).rows[0];
      if (!s || s.version !== input.version)
        throw new ConflictException('Schedule changed. Refresh before editing.');
      const pending = (
        await c.query(
          `SELECT id FROM autopay_debit_attempts WHERE tenant_id=$1 AND schedule_id=$2 AND status IN ('submitted','uncertain') LIMIT 1`,
          [req.actor.tenantId, scheduleId],
        )
      ).rows[0];
      const checkouts = (
        await c.query(
          `SELECT id FROM payment_checkout_sessions WHERE tenant_id=$1 AND schedule_id=$2 AND (status='uncertain' OR (status IN('requested','created') AND (expires_at IS NULL OR expires_at>now()))) LIMIT 1`,
          [req.actor.tenantId, scheduleId],
        )
      ).rows[0];
      if (pending || checkouts)
        throw new ConflictException('Resolve processing payments before changing the schedule');
      const rows = (
        await c.query(
          `SELECT *,due_date::text AS due_date, (paid_amount_minor=0 AND due_date>current_date AND status NOT IN ('cancelled','paid','adjusted') AND NOT EXISTS(SELECT 1 FROM payment_records fp WHERE fp.tenant_id=fee_installments.tenant_id AND fp.installment_id=fee_installments.id)) AS editable FROM fee_installments WHERE tenant_id=$1 AND schedule_id=$2 ORDER BY sequence FOR UPDATE`,
          [req.actor.tenantId, scheduleId],
        )
      ).rows;
      const currentTotal = rows
        .filter((i) => i.status !== 'cancelled')
        .reduce((sum, i) => sum + Number(i.amount_minor) - Number(i.adjustment_amount_minor), 0);
      const fixed = rows.filter((i) => i.status !== 'cancelled' && !i.editable);
      const fixedTotal = fixed.reduce(
        (sum, i) => sum + Number(i.amount_minor) - Number(i.adjustment_amount_minor),
        0,
      );
      const futureTotal = input.installments.reduce((sum, i) => sum + i.amountMinor, 0);
      if (fixedTotal + futureTotal !== currentTotal)
        throw new UnprocessableEntityException(
          'Future installments must reconcile to the current net payable',
        );
      const today = (await c.query(`SELECT current_date::text AS today`)).rows[0].today;
      const fixedDates = new Set(fixed.map((i) => new Date(i.due_date).toISOString().slice(0, 10)));
      if (input.installments.some((i) => i.dueDate <= today || fixedDates.has(i.dueDate)))
        throw new UnprocessableEntityException(
          'Use future dates that do not conflict with preserved installments',
        );
      // Preserve every historical row and receipt. Only unpaid future items retire.
      const editableIds = rows.filter((i) => i.editable).map((i) => i.id);
      if (!editableIds.length)
        throw new ConflictException('No unpaid future installments can be customized');
      await c.query(
        `UPDATE autopay_debit_attempts SET status='cancelled',failure_code='FLEX_SCHEDULE_REPLACED',updated_at=now() WHERE tenant_id=$1 AND installment_id=ANY($2::uuid[]) AND status='queued'`,
        [req.actor.tenantId, editableIds],
      );
      await c.query(
        `UPDATE fee_installments SET status='cancelled' WHERE tenant_id=$1 AND id=ANY($2::uuid[])`,
        [req.actor.tenantId, editableIds],
      );
      // Existing uniqueness includes retired rows. Keep their dates for history;
      // reuse rows at identical dates, and append genuinely new dates/sequences.
      let sequence = Math.max(0, ...rows.map((i) => Number(i.sequence)));
      let discountPool = rows
        .filter((i) => i.editable)
        .reduce((sum, i) => sum + Number(i.adjustment_amount_minor), 0);
      for (const item of [...input.installments].sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate),
      )) {
        const discount = discountPool;
        discountPool = 0;
        const grossAmount = item.amountMinor + discount;
        const same = rows.find(
          (i) => i.editable && new Date(i.due_date).toISOString().slice(0, 10) === item.dueDate,
        );
        if (same)
          await c.query(
            `UPDATE fee_installments SET amount_minor=$2,adjustment_amount_minor=$3,status='scheduled' WHERE id=$1`,
            [same.id, grossAmount, discount],
          );
        else {
          const occupied = rows.some(
            (i) => new Date(i.due_date).toISOString().slice(0, 10) === item.dueDate,
          );
          if (occupied)
            throw new ConflictException(
              'This date belongs to a historical installment. Choose a different future date.',
            );
          await c.query(
            `INSERT INTO fee_installments(tenant_id,schedule_id,sequence,due_date,amount_minor,adjustment_amount_minor) VALUES($1,$2,$3,$4,$5,$6)`,
            [req.actor.tenantId, scheduleId, ++sequence, item.dueDate, grossAmount, discount],
          );
        }
      }
      await c.query(
        `UPDATE fee_schedules SET schedule_kind='flex',version=version+1,updated_at=now() WHERE id=$1`,
        [scheduleId],
      );
      await this.db.audit(c, req.actor.id, 'fees.schedule.flex', scheduleId, {
        tenantId: req.actor.tenantId,
        reason: input.reason,
        oldValue: rows,
        newValue: input.installments,
      });
      return { id: scheduleId, version: s.version + 1, status: 'saved' };
    });
  }

  @Get('students')
  async students(@Req() req: AuthedRequest, @Query() query: unknown) {
    const input = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        search: z.string().trim().max(100).default(''),
        status: z.enum(['all', 'active', 'inactive', 'withdrawn', 'graduated']).default('all'),
        sort: z.enum(['name', 'reference']).default('name'),
      })
      .parse(query);
    const rows = await this.db.query(
      `WITH matched AS (
        SELECT id,full_name,student_reference FROM academic_students
        WHERE tenant_id=$1 AND ($2='all' OR status=$2)
          AND ($3='' OR strpos(lower(full_name),lower($3))>0 OR strpos(lower(student_reference),lower($3))>0)
      ), filtered AS (
        SELECT s.id,s.full_name,s.student_reference,s.status,t.display_name AS institute,
          (SELECT label FROM academic_years ay WHERE ay.tenant_id=s.tenant_id AND ay.id=s.academic_year_id) AS academic_year,
          (SELECT name FROM branches br WHERE br.tenant_id=s.tenant_id AND br.id=s.branch_id) AS campus,
          (SELECT string_agg(c.label,', ' ORDER BY c.label) FROM student_catalogue_assignments ca JOIN academic_catalogue c ON c.id=ca.catalogue_id AND c.tenant_id=ca.tenant_id WHERE ca.tenant_id=s.tenant_id AND ca.student_id=s.id AND ca.ended_on IS NULL AND ca.effective_on<=current_date AND c.kind='course') AS course,
          (SELECT string_agg(c.label,', ' ORDER BY c.label) FROM student_catalogue_assignments ca JOIN academic_catalogue c ON c.id=ca.catalogue_id AND c.tenant_id=ca.tenant_id WHERE ca.tenant_id=s.tenant_id AND ca.student_id=s.id AND ca.ended_on IS NULL AND ca.effective_on<=current_date AND c.kind='batch') AS group_name,
          (SELECT string_agg(c.label,', ' ORDER BY c.label) FROM student_catalogue_assignments ca JOIN academic_catalogue c ON c.id=ca.catalogue_id AND c.tenant_id=ca.tenant_id WHERE ca.tenant_id=s.tenant_id AND ca.student_id=s.id AND ca.ended_on IS NULL AND ca.effective_on<=current_date AND c.kind='grade') AS grade,
          coalesce((SELECT m.status FROM payment_mandates m WHERE m.tenant_id=s.tenant_id AND m.rail='enach' AND EXISTS(SELECT 1 FROM student_fee_plan_assignments fa WHERE fa.tenant_id=s.tenant_id AND fa.student_id=s.id AND fa.schedule_id=m.schedule_id) ORDER BY CASE WHEN m.status='active' THEN 0 ELSE 1 END,m.last_event_at DESC LIMIT 1),'not_registered') AS enach_status,
          coalesce(b.net_payable_minor,0)::bigint AS net_payable_minor,
          coalesce(b.paid_minor,0)::bigint AS paid_minor,
          coalesce(b.outstanding_minor,0)::bigint AS outstanding_minor
        FROM (SELECT ast.* FROM academic_students ast WHERE ast.id IN (
          SELECT id FROM matched ORDER BY CASE WHEN $4='reference' THEN student_reference ELSE full_name END,id LIMIT $5 OFFSET $6
        )) s JOIN tenants t ON t.id=s.tenant_id
        LEFT JOIN LATERAL (
          SELECT sum(f.net_payable_minor) AS net_payable_minor,sum(f.paid_minor) AS paid_minor,sum(f.outstanding_minor) AS outstanding_minor
          FROM finance_schedule_balances f
          WHERE f.tenant_id=s.tenant_id AND EXISTS (
            SELECT 1 FROM student_fee_plan_assignments a
            WHERE a.tenant_id=s.tenant_id AND a.student_id=s.id AND a.schedule_id=f.schedule_id
          )
        ) b ON true
        WHERE s.tenant_id=$1 AND ($2='all' OR s.status=$2)
          AND ($3='' OR strpos(lower(s.full_name),lower($3))>0 OR strpos(lower(s.student_reference),lower($3))>0)
      ) SELECT (SELECT count(*)::int FROM matched) AS total,
        coalesce((SELECT json_agg(p) FROM (
          SELECT * FROM filtered ORDER BY CASE WHEN $4='reference' THEN student_reference ELSE full_name END,id
        ) p),'[]'::json) AS rows`,
      [
        req.actor.tenantId,
        input.status,
        input.search,
        input.sort,
        input.pageSize,
        (input.page - 1) * input.pageSize,
      ],
    );
    return { ...rows[0], page: input.page, pageSize: input.pageSize };
  }

  @Get('students/:id')
  async student(@Req() req: AuthedRequest, @Param('id') id: string) {
    const studentId = uuid(id);
    const rows = await this.db.query(
      `WITH balances AS (
        SELECT b.* FROM finance_schedule_balances b WHERE b.tenant_id=$2 AND EXISTS (
          SELECT 1 FROM student_fee_plan_assignments a WHERE a.student_id=$1 AND a.tenant_id=$2 AND a.schedule_id=b.schedule_id
        )
      ) SELECT s.id,s.full_name,s.student_reference,s.status,t.display_name AS institute,
          (SELECT label FROM academic_years ay WHERE ay.tenant_id=s.tenant_id AND ay.id=s.academic_year_id) AS academic_year,
          (SELECT name FROM branches br WHERE br.tenant_id=s.tenant_id AND br.id=s.branch_id) AS campus,
          (SELECT string_agg(c.label,', ' ORDER BY c.label) FROM student_catalogue_assignments ca JOIN academic_catalogue c ON c.id=ca.catalogue_id AND c.tenant_id=ca.tenant_id WHERE ca.tenant_id=s.tenant_id AND ca.student_id=s.id AND ca.ended_on IS NULL AND ca.effective_on<=current_date AND c.kind='course') AS course,
          (SELECT string_agg(c.label,', ' ORDER BY c.label) FROM student_catalogue_assignments ca JOIN academic_catalogue c ON c.id=ca.catalogue_id AND c.tenant_id=ca.tenant_id WHERE ca.tenant_id=s.tenant_id AND ca.student_id=s.id AND ca.ended_on IS NULL AND ca.effective_on<=current_date AND c.kind='batch') AS group_name,
          (SELECT string_agg(c.label,', ' ORDER BY c.label) FROM student_catalogue_assignments ca JOIN academic_catalogue c ON c.id=ca.catalogue_id AND c.tenant_id=ca.tenant_id WHERE ca.tenant_id=s.tenant_id AND ca.student_id=s.id AND ca.ended_on IS NULL AND ca.effective_on<=current_date AND c.kind='grade') AS grade,
          coalesce((SELECT m.status FROM payment_mandates m WHERE m.tenant_id=s.tenant_id AND m.rail='enach' AND EXISTS(SELECT 1 FROM student_fee_plan_assignments fa WHERE fa.tenant_id=s.tenant_id AND fa.student_id=s.id AND fa.schedule_id=m.schedule_id) ORDER BY CASE WHEN m.status='active' THEN 0 ELSE 1 END,m.last_event_at DESC LIMIT 1),'not_registered') AS enach_status,
        coalesce((SELECT json_agg(b) FROM balances b),'[]'::json) AS balances,
        (SELECT json_build_object('net_payable_minor',coalesce(sum(net_payable_minor),0),
          'paid_minor',coalesce(sum(paid_minor),0),'outstanding_minor',coalesce(sum(outstanding_minor),0)) FROM balances) AS summary
      FROM academic_students s JOIN tenants t ON t.id=s.tenant_id WHERE s.id=$1 AND s.tenant_id=$2`,
      [studentId, req.actor.tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Student not found');
    return rows[0];
  }

  @Get('students/:id/records')
  async studentRecords(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const studentId = uuid(id);
    const input = z
      .object({
        section: z.enum([
          'components',
          'master',
          'installments',
          'payments',
          'mandates',
          'receipts',
        ]),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(query);
    const sources = {
      master: `SELECT p.id,p.sequence,p.due_date,p.amount_minor FROM fee_plan_installments p JOIN student_fee_plan_assignments a ON a.plan_id=p.plan_id AND a.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND a.student_id=$2 AND a.status='active'`,
      components: `SELECT c.id,c.label,c.code,c.amount_minor,s.account_reference FROM fee_schedule_components c JOIN fee_schedules s ON s.id=c.schedule_id WHERE c.tenant_id=$1 AND EXISTS (SELECT 1 FROM student_fee_plan_assignments a WHERE a.tenant_id=$1 AND a.student_id=$2 AND a.schedule_id=c.schedule_id)`,
      installments: `SELECT i.id,i.sequence,i.due_date,i.amount_minor,i.paid_amount_minor,i.adjustment_amount_minor,greatest(i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor,0)::bigint AS remaining_minor,i.status FROM fee_installments i WHERE i.tenant_id=$1 AND EXISTS (SELECT 1 FROM student_fee_plan_assignments a WHERE a.tenant_id=$1 AND a.student_id=$2 AND a.schedule_id=i.schedule_id)`,
      payments: `SELECT p.id,coalesce(p.collection_reference,p.provider_reference) AS provider_reference,p.amount_minor,p.refunded_amount_minor,p.recorded_at,p.status FROM payment_records p WHERE p.tenant_id=$1 AND EXISTS (SELECT 1 FROM student_fee_plan_assignments a WHERE a.tenant_id=$1 AND a.student_id=$2 AND a.schedule_id=p.schedule_id)`,
      mandates: `SELECT m.id,m.provider,m.provider_reference,m.status,m.last_event_at,m.rail FROM payment_mandates m WHERE m.tenant_id=$1 AND m.rail='enach' AND EXISTS (SELECT 1 FROM student_fee_plan_assignments a WHERE a.tenant_id=$1 AND a.student_id=$2 AND a.schedule_id=m.schedule_id)`,
      receipts: `SELECT r.id,r.receipt_number,r.issued_at,r.payment_id FROM fee_receipts r JOIN payment_records p ON p.id=r.payment_id AND p.tenant_id=r.tenant_id WHERE r.tenant_id=$1 AND EXISTS (SELECT 1 FROM student_fee_plan_assignments a WHERE a.tenant_id=$1 AND a.student_id=$2 AND a.schedule_id=p.schedule_id)`,
    };
    const order = {
      master: 'due_date,id',
      components: 'label,id',
      installments: 'due_date,id',
      payments: 'recorded_at DESC,id',
      mandates: 'last_event_at DESC,id',
      receipts: 'issued_at DESC,id',
    };
    const result = await this.db.query(
      `WITH records AS (${sources[input.section]})
      SELECT (SELECT count(*)::int FROM records) AS total,
      coalesce((SELECT json_agg(p) FROM (SELECT * FROM records ORDER BY ${order[input.section]} LIMIT $3 OFFSET $4) p),'[]'::json) AS rows`,
      [req.actor.tenantId, studentId, input.pageSize, (input.page - 1) * input.pageSize],
    );
    return { ...result[0], page: input.page, pageSize: input.pageSize };
  }

  @Get('dashboard')
  async dashboard(@Req() req: AuthedRequest) {
    const rows = await this.db.query(
      `SELECT
        (SELECT count(*)::int FROM academic_students WHERE tenant_id=$1) AS students,
        coalesce(sum(net_payable_minor),0)::bigint AS net_payable_minor,
        coalesce(sum(paid_minor),0)::bigint AS paid_minor,
        coalesce(sum(outstanding_minor),0)::bigint AS outstanding_minor,
        coalesce(sum(overdue_minor),0)::bigint AS overdue_minor,
        coalesce(sum(due_today_minor),0)::bigint AS due_today_minor,
        coalesce(sum(upcoming_week_minor),0)::bigint AS upcoming_week_minor,
        (SELECT coalesce(sum(greatest(i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor,0)),0)::bigint FROM fee_installments i JOIN fee_schedules s ON s.id=i.schedule_id AND s.tenant_id=i.tenant_id WHERE i.tenant_id=$1 AND s.status='active' AND i.status NOT IN ('cancelled','adjusted','paid') AND i.due_date>=date_trunc('week',current_date) AND i.due_date<date_trunc('week',current_date)+interval '1 week') AS expected_week_minor,
        (SELECT coalesce(sum(greatest(i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor,0)),0)::bigint FROM fee_installments i JOIN fee_schedules s ON s.id=i.schedule_id AND s.tenant_id=i.tenant_id WHERE i.tenant_id=$1 AND s.status='active' AND i.status NOT IN ('cancelled','adjusted','paid') AND i.due_date>=date_trunc('month',current_date) AND i.due_date<date_trunc('month',current_date)+interval '1 month') AS expected_month_minor,
        (SELECT coalesce(sum(amount_minor-refunded_amount_minor),0)::bigint FROM payment_records WHERE tenant_id=$1 AND recorded_at>=date_trunc('month',current_date)) AS collected_month_minor,
        (SELECT coalesce(sum(b.due_today_minor+b.upcoming_week_minor),0)::bigint FROM finance_schedule_balances b WHERE b.tenant_id=$1 AND EXISTS(SELECT 1 FROM payment_mandates m WHERE m.tenant_id=$1 AND m.schedule_id=b.schedule_id AND m.rail='enach' AND m.status='active')) AS upcoming_enach_minor,
        (SELECT coalesce(sum(greatest(i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor,0)),0)::bigint FROM fee_installments i JOIN fee_schedules s ON s.id=i.schedule_id AND s.tenant_id=i.tenant_id WHERE i.tenant_id=$1 AND s.status='active' AND i.status NOT IN ('paid','adjusted','cancelled') AND EXISTS(SELECT 1 FROM autopay_debit_attempts a WHERE a.tenant_id=$1 AND a.installment_id=i.id AND a.status='failed' AND a.recovery_status<>'resolved')) AS failed_debit_remaining_minor,
        (SELECT json_agg(x ORDER BY x.month) FROM (SELECT m.period::date AS month,
          (SELECT coalesce(sum(i.amount_minor-i.adjustment_amount_minor),0)::bigint FROM fee_installments i JOIN fee_schedules s ON s.id=i.schedule_id AND s.tenant_id=i.tenant_id WHERE i.tenant_id=$1 AND s.status IN ('active','completed') AND i.status<>'cancelled' AND i.due_date>=m.period AND i.due_date<m.period+interval '1 month') AS expected_minor,
          (SELECT coalesce(sum(p.amount_minor-p.refunded_amount_minor),0)::bigint FROM payment_records p WHERE p.tenant_id=$1 AND p.recorded_at>=m.period AND p.recorded_at<m.period+interval '1 month') AS collected_minor
          FROM generate_series(date_trunc('month',current_date)-interval '5 months',date_trunc('month',current_date),interval '1 month') AS m(period)) x) AS trend,
        (SELECT count(*)::int FROM payment_mandates WHERE tenant_id=$1 AND rail='enach' AND status='active') AS active_mandates,
        (SELECT count(*)::int FROM autopay_debit_attempts WHERE tenant_id=$1 AND status='failed') AS failed_debits,
        (SELECT coalesce(sum(amount_minor),0)::bigint FROM settlement_records WHERE tenant_id=$1 AND status='pending') AS pending_settlements_minor,
        (SELECT count(*)::int FROM reconciliation_entries WHERE tenant_id=$1 AND status IN ('unmatched','needs_review')) AS reconciliation_review,
        coalesce((SELECT json_agg(x) FROM (
          SELECT i.id,s.account_reference,i.sequence,i.due_date,
            greatest(i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor,0)::bigint AS remaining_minor
          FROM fee_installments i JOIN fee_schedules s ON s.id=i.schedule_id AND s.tenant_id=i.tenant_id
          WHERE i.tenant_id=$1 AND s.status='active' AND i.status NOT IN ('cancelled','adjusted','paid')
            AND i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor>0
          ORDER BY i.due_date,i.id LIMIT 8
        ) x),'[]'::json) AS upcoming,
        coalesce((SELECT json_agg(x) FROM (
          SELECT p.id,s.account_reference,p.amount_minor,p.status,p.recorded_at
          FROM payment_records p JOIN fee_schedules s ON s.id=p.schedule_id AND s.tenant_id=p.tenant_id
          WHERE p.tenant_id=$1 ORDER BY p.recorded_at DESC,p.id LIMIT 8
        ) x),'[]'::json) AS recent_payments
      FROM finance_schedule_balances WHERE tenant_id=$1`,
      [req.actor.tenantId],
    );
    return { ...rows[0], updatedAt: new Date().toISOString() };
  }

  @Get('overview')
  async overview(@Req() req: AuthedRequest) {
    const [summary, upcoming, mandates, reconciliation] = await Promise.all([
      this.db.query(
        `SELECT
          (SELECT count(*)::int FROM fee_schedules WHERE tenant_id=$1) AS schedules,
          count(*) FILTER (WHERE status='active')::int AS active_schedules,
          coalesce(sum(net_payable_minor),0)::bigint AS scheduled_minor,
          coalesce(sum(paid_minor),0)::bigint AS confirmed_minor,
          coalesce(sum(outstanding_minor),0)::bigint AS outstanding_minor,
          coalesce(sum(overdue_minor),0)::bigint AS overdue_minor
        FROM finance_schedule_balances WHERE tenant_id=$1`,
        [req.actor.tenantId],
      ),
      this.db.query(
        `SELECT i.id,i.schedule_id,s.account_reference,i.sequence,i.due_date,i.amount_minor,i.paid_amount_minor,
          CASE
            WHEN i.status='paid' THEN 'paid'
            WHEN i.due_date<current_date THEN 'overdue'
            WHEN i.due_date=current_date THEN 'due'
            ELSE i.status
          END AS effective_status
        FROM fee_installments i
        JOIN fee_schedules s ON s.id=i.schedule_id
        WHERE s.tenant_id=$1 AND s.status='active' AND i.status NOT IN('cancelled','adjusted')
        ORDER BY i.due_date,i.sequence
        LIMIT 100`,
        [req.actor.tenantId],
      ),
      this.db.query(
        `SELECT status,count(*)::int AS count
         FROM payment_mandates WHERE tenant_id=$1 GROUP BY status ORDER BY status`,
        [req.actor.tenantId],
      ),
      this.db.query(
        `SELECT status,count(*)::int AS count
         FROM reconciliation_entries WHERE tenant_id=$1 GROUP BY status ORDER BY status`,
        [req.actor.tenantId],
      ),
    ]);
    return {
      summary: summary[0],
      upcoming,
      mandates,
      reconciliation,
      providerMode: 'external-evidence-recording',
      moneyMovement: false,
      note: 'This module manages fee schedules and records externally confirmed payment evidence. It does not move money or perform lending.',
    };
  }

  @Get('schedules')
  async schedules(@Req() req: AuthedRequest) {
    return this.db.query(
      `SELECT s.*,
        coalesce((
          SELECT json_agg(
            json_build_object(
              'id',i.id,
              'sequence',i.sequence,
              'dueDate',i.due_date,
              'amountMinor',i.amount_minor,
              'paidAmountMinor',i.paid_amount_minor,
              'status',CASE
                WHEN i.status='paid' THEN 'paid'
                WHEN i.due_date<current_date AND i.status NOT IN('paid','cancelled','adjusted') THEN 'overdue'
                WHEN i.due_date=current_date AND i.status NOT IN('paid','cancelled','adjusted') THEN 'due'
                ELSE i.status
              END
            ) ORDER BY i.sequence
          )
          FROM fee_installments i WHERE i.schedule_id=s.id
        ), '[]'::json) AS installments,
        coalesce((
          SELECT json_agg(
            json_build_object(
              'id',fc.id,'code',fc.code,'label',fc.label,'amountMinor',fc.amount_minor,
              'bankRouteKey',fc.bank_route_key
            ) ORDER BY fc.code
          )
          FROM fee_schedule_components fc WHERE fc.schedule_id=s.id
        ), '[]'::json) AS components,
        coalesce((
          SELECT json_agg(
            json_build_object(
              'id',cn.id,'code',cn.code,'label',cn.label,'amountMinor',cn.amount_minor,
              'reason',cn.reason
            ) ORDER BY cn.code
          )
          FROM fee_schedule_concessions cn WHERE cn.schedule_id=s.id
        ), '[]'::json) AS concessions,
        (
          SELECT json_build_object(
            'id',lf.id,'mode',lf.mode,'graceDays',lf.grace_days,'amountMinor',lf.amount_minor,
            'capMinor',lf.cap_minor,'active',lf.active
          )
          FROM late_fee_rules lf WHERE lf.schedule_id=s.id
        ) AS late_fee
      FROM fee_schedules s
      WHERE s.tenant_id=$1
      ORDER BY s.created_at DESC
      LIMIT 200`,
      [req.actor.tenantId],
    );
  }

  @Post('schedules')
  async createSchedule(@Body() body: unknown, @Req() req: AuthedRequest) {
    const v = feeScheduleCreateSchema.parse(body);
    const total = v.installments.reduce((sum, x) => sum + x.amountMinor, 0);
    if (!Number.isSafeInteger(total))
      throw new UnprocessableEntityException('Schedule total is outside supported limits');
    return this.db.tx(async (c) => {
      if (v.payerId) {
        const payer = (
          await c.query('SELECT id FROM fee_payers WHERE id=$1 AND tenant_id=$2 AND active=true', [
            v.payerId,
            req.actor.tenantId,
          ])
        ).rows[0];
        if (!payer)
          throw new ConflictException('Payer profile is outside this workspace or inactive');
      }
      const schedule = (
        await c.query(
          `INSERT INTO fee_schedules(
             tenant_id,account_reference,payer_id,scope_type,scope_reference,currency,total_amount_minor,
             gross_amount_minor,concession_amount_minor,note,created_by
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [
            req.actor.tenantId,
            v.accountReference,
            v.payerId || null,
            v.scopeType,
            v.scopeReference,
            v.currency,
            total,
            v.components.length ? v.components.reduce((sum, x) => sum + x.amountMinor, 0) : total,
            v.concessions.reduce((sum, x) => sum + x.amountMinor, 0),
            v.note,
            req.actor.id,
          ],
        )
      ).rows[0];
      for (const component of v.components) {
        await c.query(
          `INSERT INTO fee_schedule_components(schedule_id,code,label,amount_minor,bank_route_key)
           VALUES($1,$2,$3,$4,$5)`,
          [
            schedule.id,
            component.code,
            component.label,
            component.amountMinor,
            component.bankRouteKey || null,
          ],
        );
      }
      for (const concession of v.concessions) {
        await c.query(
          `INSERT INTO fee_schedule_concessions(schedule_id,code,label,amount_minor,reason)
           VALUES($1,$2,$3,$4,$5)`,
          [
            schedule.id,
            concession.code,
            concession.label,
            concession.amountMinor,
            concession.reason,
          ],
        );
      }
      if (v.lateFee) {
        await c.query(
          `INSERT INTO late_fee_rules(schedule_id,mode,grace_days,amount_minor,cap_minor)
           VALUES($1,$2,$3,$4,$5)`,
          [
            schedule.id,
            v.lateFee.mode,
            v.lateFee.graceDays,
            v.lateFee.amountMinor,
            v.lateFee.capMinor || null,
          ],
        );
      }
      for (let n = 0; n < v.installments.length; n++) {
        const i = v.installments[n]!;
        await c.query(
          `INSERT INTO fee_installments(schedule_id,sequence,due_date,amount_minor)
           VALUES($1,$2,$3,$4)`,
          [schedule.id, n + 1, i.dueDate, i.amountMinor],
        );
      }
      await this.db.audit(c, req.actor.id, 'fees.schedule.create', schedule.id, {
        accountReference: v.accountReference,
        currency: v.currency,
        totalAmountMinor: total,
        installmentCount: v.installments.length,
        payerLinked: !!v.payerId,
        scopeType: v.scopeType,
        scopeReference: v.scopeReference,
        componentCount: v.components.length,
        concessionCount: v.concessions.length,
        lateFeeConfigured: !!v.lateFee,
      });
      return schedule;
    });
  }

  @Post('schedules/:id/activate')
  async activate(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const scheduleId = uuid(id);
    const v = feeScheduleActivationSchema.parse(body);
    return this.db.tx(async (c) => {
      const schedule = (
        await c.query('SELECT * FROM fee_schedules WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [
          scheduleId,
          req.actor.tenantId,
        ])
      ).rows[0];
      if (!schedule) throw new ConflictException('Fee schedule does not exist');
      if (schedule.version !== v.expectedVersion)
        throw new ConflictException('Fee schedule changed; reload before activating');
      if (schedule.status !== 'draft')
        throw new ConflictException('Only draft fee schedules can be activated');
      const total = (
        await c.query(
          'SELECT coalesce(sum(amount_minor),0)::bigint AS total FROM fee_installments WHERE schedule_id=$1',
          [scheduleId],
        )
      ).rows[0]!.total;
      if (BigInt(total) !== BigInt(schedule.total_amount_minor))
        throw new ConflictException('Installment total does not equal schedule total');
      const updated = (
        await c.query(
          `UPDATE fee_schedules
           SET status='active',version=version+1,updated_at=now()
           WHERE id=$1 AND tenant_id=$2 RETURNING *`,
          [scheduleId, req.actor.tenantId],
        )
      ).rows[0];
      await this.db.audit(c, req.actor.id, 'fees.schedule.activate', scheduleId);
      return updated;
    });
  }

  @Get('analytics')
  async analytics(@Req() req: AuthedRequest) {
    const [byScope, byComponent, collectionTrend, lateFees] = await Promise.all([
      this.db.query(
        `SELECT s.scope_type,s.scope_reference,
          count(*)::int AS schedules,
          coalesce(sum(b.net_payable_minor),0)::bigint AS scheduled_minor,
          coalesce(sum(b.paid_minor),0)::bigint AS paid_minor,
          coalesce(sum(b.outstanding_minor),0)::bigint AS outstanding_minor
         FROM fee_schedules s JOIN finance_schedule_balances b ON b.schedule_id=s.id AND b.tenant_id=s.tenant_id
         WHERE s.tenant_id=$1 GROUP BY s.scope_type,s.scope_reference
         ORDER BY scheduled_minor DESC,s.scope_reference LIMIT 200`,
        [req.actor.tenantId],
      ),
      this.db.query(
        `SELECT code,label,coalesce(sum(amount_minor),0)::bigint AS configured_minor,
          count(DISTINCT schedule_id)::int AS schedules
         FROM fee_schedule_components
         WHERE tenant_id=$1
         GROUP BY code,label
         ORDER BY configured_minor DESC,code
         LIMIT 100`,
        [req.actor.tenantId],
      ),
      this.db.query(
        `SELECT date_trunc('month',recorded_at)::date AS month,
          coalesce(sum(amount_minor-refunded_amount_minor),0)::bigint AS net_collected_minor,
          count(*)::int AS payments
         FROM payment_records
         WHERE tenant_id=$1
         GROUP BY 1 ORDER BY 1 DESC LIMIT 24`,
        [req.actor.tenantId],
      ),
      this.db.query(
        `SELECT status,count(*)::int AS count,coalesce(sum(amount_minor),0)::bigint AS amount_minor
         FROM late_fee_assessments
         WHERE tenant_id=$1 GROUP BY status ORDER BY status`,
        [req.actor.tenantId],
      ),
    ]);
    return { byScope, byComponent, collectionTrend, lateFees };
  }

  @Get('late-fees')
  async lateFees(@Req() req: AuthedRequest) {
    return this.db.query(
      `SELECT a.id,a.schedule_id,a.installment_id,a.assessment_date,a.amount_minor,a.status,
              a.waived_reason,s.account_reference,s.scope_type,s.scope_reference,i.sequence,i.due_date
       FROM late_fee_assessments a
       JOIN fee_schedules s ON s.id=a.schedule_id
       JOIN fee_installments i ON i.id=a.installment_id
       WHERE a.tenant_id=$1
       ORDER BY a.assessment_date DESC,a.created_at DESC
       LIMIT 300`,
      [req.actor.tenantId],
    );
  }

  @Post('late-fees/:id/waive')
  async waiveLateFee(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const assessmentId = uuid(id);
    const v = lateFeeWaiverSchema.parse(body);
    return this.db.tx(async (c) => {
      const row = (
        await c.query(
          `UPDATE late_fee_assessments
           SET status='waived',waived_reason=$2
           WHERE id=$1 AND tenant_id=$3 AND status='assessed'
           RETURNING *`,
          [assessmentId, v.reason, req.actor.tenantId],
        )
      ).rows[0];
      if (!row) throw new ConflictException('Late fee is missing or no longer assessable');
      await this.db.audit(c, req.actor.id, 'fees.late_fee.waive', assessmentId, {
        scheduleId: row.schedule_id,
        installmentId: row.installment_id,
        amountMinor: row.amount_minor,
        reason: v.reason,
      });
      return row;
    });
  }

  @Get('payments')
  async payments(@Req() req: AuthedRequest) {
    return this.db.query(
      `SELECT p.id,p.schedule_id,p.installment_id,p.provider,p.provider_reference,
        p.amount_minor,p.refunded_amount_minor,p.currency,p.status,p.evidence_note,p.recorded_at,
        s.account_reference,i.sequence,i.due_date
       FROM payment_records p
       JOIN fee_schedules s ON s.id=p.schedule_id
       JOIN fee_installments i ON i.id=p.installment_id
       WHERE p.tenant_id=$1
       ORDER BY p.recorded_at DESC
       LIMIT 300`,
      [req.actor.tenantId],
    );
  }

  @Post('payments/external-confirmation')
  async recordPayment(@Body() body: unknown, @Req() req: AuthedRequest) {
    const v = externalPaymentRecordSchema.parse(body);
    return this.db.tx((c) => this.applyRecordedPayment(c, v, req));
  }

  @Post('students/:id/payments')
  async recordAdvance(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    const studentId = uuid(id),
      input = externalPaymentRecordSchema.omit({ installmentId: true }).parse(body);
    return this.db.tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'collection:' + input.idempotencyKey,
      ]);
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'payment-reference:' + req.actor.tenantId + ':' + input.providerReference,
      ]);
      const replay = (
        await c.query(
          `SELECT p.*,r.receipt_number,
        EXISTS(SELECT 1 FROM student_fee_plan_assignments a WHERE a.tenant_id=$1 AND a.student_id=$3 AND a.schedule_id=p.schedule_id) AS student_linked
        FROM payment_records p LEFT JOIN fee_receipts r ON r.payment_id=p.id AND r.tenant_id=p.tenant_id
        WHERE p.tenant_id=$1 AND p.collection_key=$2 ORDER BY p.recorded_at,p.id`,
          [req.actor.tenantId, input.idempotencyKey, studentId],
        )
      ).rows;
      if (replay.length) {
        if (
          replay.some(
            (p) =>
              !p.student_linked ||
              p.collection_reference !== input.providerReference ||
              p.currency !== input.currency ||
              p.evidence_note !== input.evidenceNote ||
              !isDeepStrictEqual(p.direct_details || {}, input.directPayment || {}),
          ) ||
          replay.reduce((sum, p) => sum + Number(p.amount_minor), 0) !== input.amountMinor
        )
          throw new ConflictException('Collection key was already used for a different payment');
        return { payments: replay, allocatedAmountMinor: input.amountMinor, replayed: true };
      }
      const student = (
        await c.query('SELECT id FROM academic_students WHERE tenant_id=$1 AND id=$2', [
          req.actor.tenantId,
          studentId,
        ])
      ).rows[0];
      if (!student) throw new NotFoundException('Student not found');
      const installments = (
        await c.query(
          `SELECT i.* FROM fee_installments i JOIN fee_schedules s ON s.id=i.schedule_id AND s.tenant_id=i.tenant_id
        WHERE i.tenant_id=$1 AND s.status='active' AND i.status NOT IN ('paid','cancelled','adjusted') AND i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor>0
        AND EXISTS(SELECT 1 FROM student_fee_plan_assignments a WHERE a.tenant_id=$1 AND a.student_id=$2 AND a.schedule_id=s.id)
        ORDER BY i.due_date,i.sequence,i.id LIMIT 1000 FOR UPDATE OF i,s`,
          [req.actor.tenantId, studentId],
        )
      ).rows;
      if (
        installments.reduce(
          (sum, i) =>
            sum +
            Number(i.amount_minor) -
            Number(i.adjustment_amount_minor) -
            Number(i.paid_amount_minor),
          0,
        ) < input.amountMinor
      )
        throw new UnprocessableEntityException(
          installments.length === 1000
            ? 'Payment spans too many installments. Use a smaller payment.'
            : 'Payment exceeds the student outstanding balance',
        );
      let remaining = input.amountMinor;
      const payments = [];
      for (const installment of installments) {
        if (remaining === 0) break;
        const amount = Math.min(
          remaining,
          Number(installment.amount_minor) -
            Number(installment.adjustment_amount_minor) -
            Number(installment.paid_amount_minor),
        );
        const bytes = createHash('sha256')
          .update(input.idempotencyKey + ':' + installment.id)
          .digest()
          .subarray(0, 16);
        bytes[6] = (bytes[6]! & 15) | 64;
        bytes[8] = (bytes[8]! & 63) | 128;
        const key = bytes
          .toString('hex')
          .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
        payments.push(
          await this.applyRecordedPayment(
            c,
            {
              ...input,
              installmentId: installment.id,
              idempotencyKey: key,
              providerReference: 'COL-' + input.idempotencyKey + '-' + (payments.length + 1),
              amountMinor: amount,
            },
            req,
            { key: input.idempotencyKey, reference: input.providerReference },
          ),
        );
        remaining -= amount;
      }
      await this.db.audit(c, req.actor.id, 'fees.payment.advance_allocated', input.idempotencyKey, {
        tenantId: req.actor.tenantId,
        studentId,
        amountMinor: input.amountMinor,
        reference: input.providerReference,
        paymentIds: payments.map((p) => p.id),
      });
      return { payments, allocatedAmountMinor: input.amountMinor, replayed: false };
    });
  }

  private async applyRecordedPayment(
    c: PoolClient,
    v: z.infer<typeof externalPaymentRecordSchema>,
    req: AuthedRequest,
    collection?: { key: string; reference: string },
  ) {
    const originalReference = collection?.reference || v.providerReference;
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      'payment-reference:' + req.actor.tenantId + ':' + originalReference,
    ]);
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['payment:' + v.idempotencyKey]);
    const replay = (
      await c.query('SELECT * FROM payment_records WHERE tenant_id=$1 AND idempotency_key=$2', [
        req.actor.tenantId,
        v.idempotencyKey,
      ])
    ).rows[0];
    if (replay) {
      if (
        replay.installment_id !== v.installmentId ||
        Number(replay.amount_minor) !== v.amountMinor ||
        replay.provider_reference !== v.providerReference ||
        replay.currency !== v.currency ||
        replay.evidence_note !== v.evidenceNote ||
        !isDeepStrictEqual(replay.direct_details || {}, v.directPayment || {})
      )
        throw new ConflictException('Submission key was already used for a different payment');
      const receipt = (
        await c.query(
          'SELECT id,receipt_number,issued_at FROM fee_receipts WHERE payment_id=$1 AND tenant_id=$2',
          [replay.id, req.actor.tenantId],
        )
      ).rows[0];
      return { ...replay, receipt, replayed: true };
    }

    const referenceUsed = (
      await c.query(
        `SELECT id FROM payment_records WHERE tenant_id=$1 AND provider='manual_external' AND (collection_reference=$2 OR provider_reference=$2) AND ($3::uuid IS NULL OR collection_key IS DISTINCT FROM $3) LIMIT 1`,
        [req.actor.tenantId, originalReference, collection?.key || null],
      )
    ).rows[0];
    if (referenceUsed) throw new ConflictException('This payment reference was already recorded');
    const installment = (
      await c.query(
        `SELECT i.*,s.status AS schedule_status,s.currency,s.account_reference,s.payer_id,
                  p.preferred_channel,
                  (SELECT ast.full_name FROM student_fee_plan_assignments a JOIN academic_students ast ON ast.id=a.student_id AND ast.tenant_id=a.tenant_id WHERE a.tenant_id=s.tenant_id AND a.schedule_id=s.id ORDER BY a.assigned_on DESC LIMIT 1) AS student_name,
                  (SELECT display_name FROM tenants WHERE id=s.tenant_id) AS institute_name
           FROM fee_installments i
           JOIN fee_schedules s ON s.id=i.schedule_id
           LEFT JOIN fee_payers p ON p.id=s.payer_id
           WHERE i.id=$1 AND s.tenant_id=$2
           FOR UPDATE OF i,s`,
        [v.installmentId, req.actor.tenantId],
      )
    ).rows[0];
    if (!installment) throw new ConflictException('Installment does not exist');
    if (installment.schedule_status !== 'active')
      throw new ConflictException(
        'Fee schedule must be active before payment evidence is recorded',
      );
    if (installment.status === 'cancelled')
      throw new ConflictException('Cancelled installment cannot accept payment evidence');
    if (installment.currency !== v.currency)
      throw new ConflictException('Payment currency does not match schedule currency');
    await assertNoProcessingCollections(c, req.actor.tenantId, v.installmentId);
    const remaining =
      Number(installment.amount_minor) -
      Number(installment.adjustment_amount_minor || 0) -
      Number(installment.paid_amount_minor);
    if (v.amountMinor > remaining)
      throw new UnprocessableEntityException('Payment exceeds the installment balance');

    const payment = (
      await c.query(
        `INSERT INTO payment_records(
            schedule_id,installment_id,idempotency_key,provider_reference,amount_minor,currency,
            evidence_note,recorded_by,direct_details,collection_key,collection_reference
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          RETURNING *`,
        [
          installment.schedule_id,
          v.installmentId,
          v.idempotencyKey,
          v.providerReference,
          v.amountMinor,
          v.currency,
          v.evidenceNote,
          req.actor.id,
          v.directPayment || {},
          collection?.key || null,
          collection?.reference || null,
        ],
      )
    ).rows[0];
    const nextPaid = Number(installment.paid_amount_minor) + v.amountMinor;
    const nextStatus =
      nextPaid + Number(installment.adjustment_amount_minor || 0) ===
      Number(installment.amount_minor)
        ? 'paid'
        : 'part_paid';
    await c.query('UPDATE fee_installments SET paid_amount_minor=$2,status=$3 WHERE id=$1', [
      v.installmentId,
      nextPaid,
      nextStatus,
    ]);
    await syncQueuedDebitBalances(c, this.db, req.actor.tenantId, v.installmentId, req.actor.id);
    const open = (
      await c.query(
        `SELECT count(*)::int AS count FROM fee_installments
           WHERE schedule_id=$1 AND status NOT IN('paid','cancelled','adjusted')`,
        [installment.schedule_id],
      )
    ).rows[0]!.count;
    if (open === 0)
      await c.query(
        `UPDATE fee_schedules SET status='completed',version=version+1,updated_at=now() WHERE id=$1`,
        [installment.schedule_id],
      );
    const receiptNumber = 'RCP-' + randomUUID().replaceAll('-', '').toUpperCase();
    const receipt = (
      await c.query(
        `INSERT INTO fee_receipts(payment_id,receipt_number,snapshot)
           VALUES($1,$2,$3) RETURNING id,receipt_number,issued_at`,
        [
          payment.id,
          receiptNumber,
          {
            studentName: installment.student_name || null,
            instituteName: installment.institute_name || null,
            scheduleId: installment.schedule_id,
            accountReference: installment.account_reference || null,
            installmentId: v.installmentId,
            amountMinor: v.amountMinor,
            currency: v.currency,
            providerReference: collection?.reference || v.providerReference,
            collectionKey: collection?.key || null,
            recordedAt: payment.recorded_at,
            directPayment: v.directPayment || null,
            notes: v.evidenceNote,
          },
        ],
      )
    ).rows[0];
    const eventId = randomUUID();
    await c.query(
      `INSERT INTO outbox(event_id,type,aggregate_id,payload)
         VALUES($1,'payment.external_confirmed',$2,$3)`,
      [
        eventId,
        payment.id,
        {
          scheduleId: installment.schedule_id,
          amountMinor: v.amountMinor,
          receiptId: receipt.id,
          receiptNumber: receipt.receipt_number,
          payerCommunication: Boolean(
            installment.payer_id &&
            installment.preferred_channel &&
            installment.preferred_channel !== 'none',
          ),
        },
      ],
    );
    if (
      installment.payer_id &&
      installment.preferred_channel &&
      installment.preferred_channel !== 'none'
    ) {
      await c.query(
        `INSERT INTO fee_communication_log(
             event_id,schedule_id,installment_id,payer_id,channel,kind,status
           ) VALUES($1,$2,$3,$4,$5,'receipt','pending')`,
        [
          eventId,
          installment.schedule_id,
          v.installmentId,
          installment.payer_id,
          installment.preferred_channel,
        ],
      );
    }
    await this.db.audit(c, req.actor.id, 'fees.payment.external_confirmed', payment.id, {
      scheduleId: installment.schedule_id,
      providerReference: v.providerReference,
      amountMinor: v.amountMinor,
      eventId,
    });
    return { ...payment, receipt, replayed: false };
  }

  @Post('refunds')
  async refund(@Body() body: unknown, @Req() req: AuthedRequest) {
    const v = refundRecordSchema.parse(body);
    return this.db.tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['refund:' + v.idempotencyKey]);
      const replay = (
        await c.query('SELECT * FROM payment_refunds WHERE tenant_id=$1 AND idempotency_key=$2', [
          req.actor.tenantId,
          v.idempotencyKey,
        ])
      ).rows[0];
      if (replay) return { ...replay, replayed: true };
      const payment = (
        await c.query('SELECT * FROM payment_records WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [
          v.paymentId,
          req.actor.tenantId,
        ])
      ).rows[0];
      if (!payment) throw new ConflictException('Payment record does not exist');
      const refundable = Number(payment.amount_minor) - Number(payment.refunded_amount_minor);
      if (v.amountMinor > refundable)
        throw new UnprocessableEntityException('Refund exceeds the remaining refundable amount');
      const refund = (
        await c.query(
          `INSERT INTO payment_refunds(payment_id,idempotency_key,amount_minor,reason,recorded_by)
           VALUES($1,$2,$3,$4,$5) RETURNING *`,
          [v.paymentId, v.idempotencyKey, v.amountMinor, v.reason, req.actor.id],
        )
      ).rows[0];
      const newRefunded = Number(payment.refunded_amount_minor) + v.amountMinor;
      await c.query(
        `UPDATE payment_records
         SET refunded_amount_minor=$2,status=$3
         WHERE id=$1`,
        [
          v.paymentId,
          newRefunded,
          newRefunded === Number(payment.amount_minor) ? 'refunded' : 'partially_refunded',
        ],
      );
      const installment = (
        await c.query('SELECT * FROM fee_installments WHERE id=$1 FOR UPDATE', [
          payment.installment_id,
        ])
      ).rows[0]!;
      const newPaid = Math.max(0, Number(installment.paid_amount_minor) - v.amountMinor);
      const status =
        newPaid === 0
          ? new Date(installment.due_date) < new Date()
            ? 'overdue'
            : 'scheduled'
          : newPaid + Number(installment.adjustment_amount_minor || 0) ===
              Number(installment.amount_minor)
            ? 'paid'
            : 'part_paid';
      await c.query('UPDATE fee_installments SET paid_amount_minor=$2,status=$3 WHERE id=$1', [
        installment.id,
        newPaid,
        status,
      ]);
      await syncQueuedDebitBalances(c, this.db, req.actor.tenantId, installment.id, req.actor.id);
      await c.query(
        `UPDATE fee_schedules
         SET status=CASE WHEN status='completed' THEN 'active' ELSE status END,
             version=version+1,updated_at=now()
         WHERE id=$1`,
        [payment.schedule_id],
      );
      const eventId = randomUUID();
      await c.query(
        `INSERT INTO outbox(event_id,type,aggregate_id,payload)
         VALUES($1,'payment.refund_recorded',$2,$3)`,
        [eventId, refund.id, { paymentId: v.paymentId, amountMinor: v.amountMinor }],
      );
      await this.db.audit(c, req.actor.id, 'fees.refund.record', refund.id, {
        paymentId: v.paymentId,
        amountMinor: v.amountMinor,
        eventId,
      });
      return { ...refund, replayed: false };
    });
  }

  @Get('communications')
  communications(@Req() req: AuthedRequest) {
    return this.db.query(
      `SELECT c.id,c.event_id,c.schedule_id,c.installment_id,c.channel,c.kind,c.status,
              c.provider_reference,c.last_error,c.created_at,c.updated_at,s.account_reference
       FROM fee_communication_log c
       JOIN fee_schedules s ON s.id=c.schedule_id
       WHERE c.tenant_id=$1
       ORDER BY c.created_at DESC
       LIMIT 300`,
      [req.actor.tenantId],
    );
  }

  @Get('mandates')
  mandates(@Req() req: AuthedRequest) {
    return this.db.query(
      `SELECT m.*,s.account_reference
       FROM payment_mandates m JOIN fee_schedules s ON s.id=m.schedule_id
       WHERE m.tenant_id=$1
       ORDER BY m.last_event_at DESC LIMIT 300`,
      [req.actor.tenantId],
    );
  }

  @Post('mandates')
  async mandate(@Body() body: unknown, @Req() req: AuthedRequest) {
    const v = mandateRecordSchema.parse(body);
    return this.db.tx(async (c) => {
      const schedule = (
        await c.query('SELECT id,status FROM fee_schedules WHERE id=$1 AND tenant_id=$2', [
          v.scheduleId,
          req.actor.tenantId,
        ])
      ).rows[0];
      if (!schedule) throw new ConflictException('Fee schedule does not exist');
      const old = (
        await c.query(
          `SELECT * FROM payment_mandates
           WHERE tenant_id=$1 AND provider='external' AND provider_reference=$2 FOR UPDATE`,
          [req.actor.tenantId, v.providerReference],
        )
      ).rows[0];
      const row = old
        ? (
            await c.query(
              `UPDATE payment_mandates
               SET status=$2,last_event_at=now(),recorded_by=$3
               WHERE id=$1 RETURNING *`,
              [old.id, v.status, req.actor.id],
            )
          ).rows[0]
        : (
            await c.query(
              `INSERT INTO payment_mandates(schedule_id,rail,provider_reference,status,recorded_by)
               VALUES($1,$2,$3,$4,$5) RETURNING *`,
              [v.scheduleId, v.rail, v.providerReference, v.status, req.actor.id],
            )
          ).rows[0];
      await this.db.audit(c, req.actor.id, 'fees.mandate.record', row.id, {
        scheduleId: v.scheduleId,
        rail: v.rail,
        status: v.status,
      });
      return row;
    });
  }

  @Get('settlements')
  settlements(@Req() req: AuthedRequest) {
    return this.db.query(
      `SELECT s.*,
        coalesce(
          json_agg(json_build_object('paymentId',sp.payment_id,'amountMinor',sp.amount_minor))
          FILTER (WHERE sp.payment_id IS NOT NULL),
          '[]'::json
        ) AS allocations
       FROM settlement_records s
       LEFT JOIN settlement_payments sp ON sp.settlement_id=s.id
       WHERE s.tenant_id=$1
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT 200`,
      [req.actor.tenantId],
    );
  }

  @Post('settlements')
  async settlement(@Body() body: unknown, @Req() req: AuthedRequest) {
    const v = settlementSchema.parse(body);
    return this.db.tx(async (c) => {
      const row = (
        await c.query(
          `INSERT INTO settlement_records(
             tenant_id,provider_reference,currency,amount_minor,expected_on,settled_at,status,recorded_by
           ) VALUES($1,$2,$3,$4,$5,CASE WHEN $6='settled' THEN now() ELSE NULL END,$6,$7)
           RETURNING *`,
          [
            req.actor.tenantId,
            v.providerReference,
            v.currency,
            v.amountMinor,
            v.expectedOn || null,
            v.status,
            req.actor.id,
          ],
        )
      ).rows[0];
      for (const allocation of v.allocations) {
        const payment = (
          await c.query('SELECT id,currency FROM payment_records WHERE id=$1 AND tenant_id=$2', [
            allocation.paymentId,
            req.actor.tenantId,
          ])
        ).rows[0];
        if (!payment) throw new ConflictException('Settlement references an unknown payment');
        if (payment.currency !== v.currency)
          throw new ConflictException('Settlement currency does not match payment currency');
        await c.query(
          `INSERT INTO settlement_payments(settlement_id,payment_id,amount_minor)
           VALUES($1,$2,$3)`,
          [row.id, allocation.paymentId, allocation.amountMinor],
        );
        await c.query(
          `INSERT INTO reconciliation_entries(payment_id,settlement_id,status,reason,created_by)
           VALUES($1,$2,'matched','Explicit operator allocation',$3)`,
          [allocation.paymentId, row.id, req.actor.id],
        );
      }
      await this.db.audit(c, req.actor.id, 'fees.settlement.record', row.id, {
        providerReference: v.providerReference,
        amountMinor: v.amountMinor,
        status: v.status,
        allocationCount: v.allocations.length,
      });
      return row;
    });
  }

  @Get('reconciliation')
  reconciliation(@Req() req: AuthedRequest) {
    return this.db.query(
      `SELECT r.*,p.provider_reference AS payment_reference,s.provider_reference AS settlement_reference
       FROM reconciliation_entries r
       LEFT JOIN payment_records p ON p.id=r.payment_id
       LEFT JOIN settlement_records s ON s.id=r.settlement_id
       WHERE r.tenant_id=$1
       ORDER BY r.created_at DESC
       LIMIT 300`,
      [req.actor.tenantId],
    );
  }
}
