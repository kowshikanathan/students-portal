import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Db } from './db';
import { AuthGuard, AuthedRequest } from './auth';
import { FeeOperationsController } from './fees';
import { FeePlanController } from './fee-plans';
import { AcademicOperationsController } from './academic';

type Operation =
  'assign_plan' | 'update_flex' | 'update_due_date' | 'prepare_enach' | 'import_students';
const permission: Record<Operation, string> = {
  assign_plan: 'fee.plan.manage',
  update_flex: 'fee.schedule.edit',
  update_due_date: 'fee.schedule.edit',
  prepare_enach: 'enach.manage',
  import_students: 'customer.import',
};
const text = z.string().trim().min(2).max(80);
const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  text.optional(),
);
const futureRow = z
  .object({
    dueDate: z.iso.date(),
    amountMinor: z.number().int().positive().max(1_000_000_000_000),
  })
  .strict();
function authorized(req: AuthedRequest, operation: Operation) {
  if (req.actor.tenantRole !== 'owner' && !req.actor.permissions?.includes(permission[operation]))
    throw new ForbiddenException('This role cannot perform this bulk action');
}
class RowFailure extends Error {
  constructor(
    readonly row: number,
    message: string,
  ) {
    super(message);
  }
}

@Controller('v1/admin/fees/bulk')
@UseGuards(AuthGuard)
export class FinanceBulkController {
  constructor(@Inject(Db) private db: Db) {}

  @Post('preview')
  async preview(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = z
      .object({
        operation: z.enum([
          'assign_plan',
          'update_flex',
          'update_due_date',
          'prepare_enach',
          'import_students',
        ]),
        reason: z.string().trim().min(3).max(200),
        rows: z.array(z.unknown()).min(1).max(100),
      })
      .strict()
      .parse(body);
    authorized(req, input.operation);
    if (input.operation === 'update_flex' && input.rows.length > 20)
      throw new ConflictException('Use at most 20 complete Flex schedules per batch');
    const normalized: Record<string, any>[] = [],
      outcomes: Array<{ row: number; student: string; status: string; error?: string }> = [],
      seen = new Set<string>();
    for (let index = 0; index < input.rows.length; index++) {
      let label = '';
      try {
        if (input.operation === 'import_students') {
          const row = z
            .object({
              studentReference: text,
              fullName: z.string().trim().min(2).max(160),
              email: z.string().trim().email().max(200).optional(),
              phone: z
                .string()
                .trim()
                .regex(/^\+?[\d ()-]{8,20}$/)
                .optional(),
              course: z.string().trim().max(160).optional(),
              grade: z.string().trim().max(160).optional(),
              groupName: z.string().trim().max(160).optional(),
              campus: z.string().trim().max(160).optional(),
              academicYear: z.string().trim().max(160).optional(),
              guardianName: z.string().trim().min(2).max(160).optional(),
              guardianEmail: z.string().trim().email().max(200).optional(),
              guardianPhone: z
                .string()
                .trim()
                .regex(/^\+?[\d ()-]{8,20}$/)
                .optional(),
            })
            .passthrough()
            .parse(input.rows[index]);
          label = row.studentReference;

          if (seen.has(row.studentReference)) {
            throw new ConflictException('Duplicate student reference in this file');
          }
          seen.add(row.studentReference);

          const existing = await this.db.query(
            `SELECT id FROM academic_students WHERE tenant_id=$1 AND student_reference=$2`,
            [req.actor.tenantId, row.studentReference],
          );
          if (existing.length > 0) {
            throw new ConflictException('Student reference already exists in this institution');
          }
          normalized.push(row);
          outcomes.push({ row: index + 1, student: label, status: 'valid' });
          continue;
        }

        const base = z
          .object({ studentReference: text, accountReference: optionalText })
          .passthrough()
          .parse(input.rows[index]);
        label = base.studentReference;
        const students = await this.db.query(
          `SELECT id,student_reference,branch_id,academic_year_id FROM academic_students WHERE tenant_id=$1 AND student_reference=$2 AND status='active'`,
          [req.actor.tenantId, base.studentReference],
        );
        const student = students[0];
        if (!student) throw new ConflictException('Active student not found');
        if (input.operation === 'assign_plan') {
          const row = z
            .object({ studentReference: text, planKey: text, accountReference: optionalText })
            .strict()
            .parse(input.rows[index]);
          const plan = (
            await this.db.query(
              `SELECT * FROM fee_plan_versions WHERE tenant_id=$1 AND plan_key=$2 AND status='effective' ORDER BY version DESC LIMIT 1`,
              [req.actor.tenantId, row.planKey],
            )
          )[0];
          if (!plan) throw new ConflictException('Effective master plan not found');
          if (
            (plan.branch_id && plan.branch_id !== student.branch_id) ||
            (plan.academic_year_id && plan.academic_year_id !== student.academic_year_id)
          )
            throw new ConflictException('Student does not match this plan campus or academic year');
          if (
            (
              await this.db.query(
                'SELECT id FROM student_fee_plan_assignments WHERE tenant_id=$1 AND student_id=$2 AND plan_id=$3',
                [req.actor.tenantId, student.id, plan.id],
              )
            ).length
          )
            throw new ConflictException('This plan was already assigned to this student');
          const key = student.id + ':' + plan.id;
          if (seen.has(key)) throw new ConflictException('Duplicate student and plan in this file');
          seen.add(key);
          const accountReference =
            row.accountReference ||
            (/^[A-Za-z0-9_-]{2,80}$/.test(row.studentReference)
              ? row.studentReference
              : 'STU-' + student.id);
          if (!/^[A-Za-z0-9_-]{2,80}$/.test(accountReference))
            throw new ConflictException(
              'Account reference must use letters, numbers, underscores or hyphens',
            );
          normalized.push({ studentId: student.id, planId: plan.id, accountReference });
        } else {
          const schedules = await this.db.query(
            `SELECT DISTINCT s.id,s.payer_id FROM student_fee_plan_assignments a JOIN fee_schedules s ON s.id=a.schedule_id AND s.tenant_id=a.tenant_id WHERE a.tenant_id=$1 AND a.student_id=$2 AND a.status='active' AND s.status='active' AND ($3::text IS NULL OR s.account_reference=$3)`,
            [req.actor.tenantId, student.id, base.accountReference || null],
          );
          if (schedules.length !== 1)
            throw new ConflictException(
              schedules.length
                ? 'Include an account reference to choose one active schedule'
                : 'Active assigned fee schedule not found',
            );
          const schedule = schedules[0]!;
          if (seen.has(schedule.id)) throw new ConflictException('Use one row per fee schedule');
          seen.add(schedule.id);
          if (input.operation === 'prepare_enach')
            normalized.push({
              studentId: student.id,
              scheduleId: schedule.id,
              accountReference: base.accountReference || student.student_reference,
              payerLinked: Boolean(schedule.payer_id),
            });
          else {
            const existing = await new FeeOperationsController(this.db).flexSchedule(
              req,
              schedule.id,
            );
            const editable = existing.installments.filter((i: any) => i.editable);
            if (!editable.length)
              throw new ConflictException('No unpaid future installments can be changed');
            let installments: Array<{ dueDate: string; amountMinor: number }>;
            if (input.operation === 'update_due_date') {
              const row = z
                .object({
                  studentReference: text,
                  accountReference: optionalText,
                  installmentSequence: z.coerce.number().int().positive(),
                  dueDate: z.iso.date(),
                })
                .strict()
                .parse(input.rows[index]);
              if (!editable.some((i: any) => i.sequence === row.installmentSequence))
                throw new ConflictException(
                  'Installment is paid, historical or unavailable for editing',
                );
              installments = editable.map((i: any) => ({
                dueDate:
                  i.sequence === row.installmentSequence
                    ? row.dueDate
                    : String(i.due_date).slice(0, 10),
                amountMinor: Number(i.amount_minor) - Number(i.adjustment_amount_minor),
              }));
            } else {
              const row = z
                .object({
                  studentReference: text,
                  accountReference: optionalText,
                  installments: z.array(futureRow).min(1).max(60),
                })
                .strict()
                .parse(input.rows[index]);
              installments = row.installments;
            }
            const today = (await this.db.query('SELECT current_date::text AS today'))[0]!.today;
            const frozenDates = new Set(
              existing.installments
                .filter((i: any) => !i.editable)
                .map((i: any) => String(i.due_date).slice(0, 10)),
            );
            if (
              installments.some((i) => i.dueDate <= today || frozenDates.has(i.dueDate)) ||
              new Set(installments.map((i) => i.dueDate)).size !== installments.length
            )
              throw new ConflictException(
                'Use unique future dates that preserve historical installments',
              );
            if (
              installments.reduce((sum, i) => sum + i.amountMinor, 0) !==
              editable.reduce(
                (sum: number, i: any) =>
                  sum + Number(i.amount_minor) - Number(i.adjustment_amount_minor),
                0,
              )
            )
              throw new ConflictException('Future installment totals must reconcile');
            normalized.push({
              scheduleId: schedule.id,
              version: existing.version,
              installments,
              reason: input.reason,
            });
          }
        }
        outcomes.push({ row: index + 1, student: label, status: 'valid' });
      } catch (error) {
        outcomes.push({
          row: index + 1,
          student: label,
          status: 'invalid',
          error:
            error instanceof z.ZodError
              ? 'Check this row against the template'
              : error instanceof ConflictException
                ? error.message
                : 'This row could not be validated',
        });
      }
    }
    const status = outcomes.some((row) => row.status === 'invalid') ? 'invalid' : 'validated';
    const run = await this.db.tx(async (c) => {
      const row = (
        await c.query(
          `INSERT INTO finance_bulk_runs(tenant_id,created_by,operation,status,normalized_rows,outcomes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [
            req.actor.tenantId,
            req.actor.id,
            input.operation,
            status,
            JSON.stringify(normalized),
            JSON.stringify(outcomes),
          ],
        )
      ).rows[0];
      await this.db.audit(c, req.actor.id, 'fees.bulk.preview', row.id, {
        tenantId: req.actor.tenantId,
        operation: input.operation,
        rows: outcomes.length,
        status,
        reason: input.reason,
      });
      return row;
    });
    return { id: run.id, status, rows: outcomes, canApply: status === 'validated' };
  }

  @Post('apply')
  async apply(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { runId } = z.object({ runId: z.uuid() }).strict().parse(body);
    try {
      return await this.db.tx(async (c) => {
        const run = (
          await c.query('SELECT * FROM finance_bulk_runs WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
            req.actor.tenantId,
            runId,
          ])
        ).rows[0];
        if (!run) throw new ConflictException('Bulk preview not found');
        authorized(req, run.operation);
        if (run.status === 'applied')
          return { id: run.id, status: 'applied', rows: run.outcomes, replayed: true };
        if (run.status === 'failed')
          return {
            id: run.id,
            status: 'failed',
            rows: run.outcomes,
            replayed: true,
            message: 'The entire batch was rolled back. Create a new preview.',
          };
        if (run.status !== 'validated' || new Date(run.expires_at).getTime() <= Date.now())
          throw new ConflictException('Create a new valid preview before applying this batch');
        const scoped = this.db.transactionView(c),
          fees = new FeeOperationsController(scoped),
          plans = new FeePlanController(scoped),
          outcomes = [];
        for (let index = 0; index < run.normalized_rows.length; index++) {
          const row = run.normalized_rows[index];
          try {
            if (run.operation === 'import_students')
              await new AcademicOperationsController(scoped).createStudent(req, row);
            else if (run.operation === 'assign_plan')
              await plans.assign(req, row.planId, {
                studentId: row.studentId,
                accountReference: row.accountReference,
              });
            else if (run.operation === 'update_flex' || run.operation === 'update_due_date')
              await fees.editFlex(req, row.scheduleId, {
                version: row.version,
                installments: row.installments,
                reason: row.reason,
              });
            else {
              const ready = (
                await c.query(
                  `SELECT s.id FROM fee_schedules s JOIN student_fee_plan_assignments a ON a.schedule_id=s.id AND a.tenant_id=s.tenant_id WHERE s.tenant_id=$1 AND s.id=$2 AND a.student_id=$3 AND s.status='active' LIMIT 1`,
                  [req.actor.tenantId, row.scheduleId, row.studentId],
                )
              ).rows[0];
              if (!ready)
                throw new ConflictException('Schedule is no longer ready for registration');
            }
            outcomes.push({
              ...run.outcomes[index],
              status: run.operation === 'prepare_enach' ? 'ready' : 'applied',
            });
          } catch (error) {
            throw new RowFailure(
              index + 1,
              error instanceof ConflictException ? error.message : 'This row could not be applied',
            );
          }
        }
        await c.query(
          `UPDATE finance_bulk_runs SET status='applied',outcomes=$2,applied_at=now() WHERE id=$1`,
          [runId, JSON.stringify(outcomes)],
        );
        await this.db.audit(c, req.actor.id, 'fees.bulk.apply', runId, {
          tenantId: req.actor.tenantId,
          operation: run.operation,
          rows: outcomes.length,
        });
        return { id: runId, status: 'applied', rows: outcomes, replayed: false };
      });
    } catch (error) {
      if (!(error instanceof RowFailure)) throw error;
      return this.db.tx(async (c) => {
        const run = (
          await c.query('SELECT * FROM finance_bulk_runs WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
            req.actor.tenantId,
            runId,
          ])
        ).rows[0];
        if (run.status === 'applied')
          return { id: runId, status: 'applied', rows: run.outcomes, replayed: true };
        const outcomes = run.outcomes.map((row: any) => ({
          ...row,
          status: row.row === error.row ? 'failed' : 'not_applied',
          ...(row.row === error.row ? { error: error.message } : {}),
        }));
        await c.query(
          `UPDATE finance_bulk_runs SET status='failed',outcomes=$3 WHERE tenant_id=$1 AND id=$2`,
          [req.actor.tenantId, runId, JSON.stringify(outcomes)],
        );
        await this.db.audit(c, req.actor.id, 'fees.bulk.rolled_back', runId, {
          tenantId: req.actor.tenantId,
          row: error.row,
          reason: error.message,
        });
        return {
          id: runId,
          status: 'failed',
          rows: outcomes,
          message: 'The entire batch was rolled back. No row was applied.',
        };
      });
    }
  }

  @Get('export/:type')
  async exportCsv(@Req() req: AuthedRequest, @Param('type') type: string, @Res() res: Response) {
    if (req.actor.tenantRole !== 'owner' && !req.actor.permissions?.includes('report.read')) {
      throw new ForbiddenException('Report read permission is required for export');
    }
    let data: any[] = [];
    const filename = `${type}-export.csv`;
    let headers: string[] = [];

    if (type === 'students') {
      const rows = await this.db.query(
        `SELECT s.student_reference, s.full_name, s.email, s.phone, s.status,
                (SELECT label FROM academic_years ay WHERE ay.tenant_id=s.tenant_id AND ay.id=s.academic_year_id) AS academic_year,
                (SELECT name FROM branches br WHERE br.tenant_id=s.tenant_id AND br.id=s.branch_id) AS campus,
                (SELECT string_agg(c.label, ', ') FROM student_catalogue_assignments ca JOIN academic_catalogue c ON c.id=ca.catalogue_id WHERE ca.tenant_id=s.tenant_id AND ca.student_id=s.id AND c.kind='course') AS course
         FROM academic_students s WHERE s.tenant_id=$1 ORDER BY s.full_name`,
        [req.actor.tenantId],
      );
      headers = [
        'Student ID',
        'Full Name',
        'Email',
        'Phone',
        'Status',
        'Academic Year',
        'Campus',
        'Course',
      ];
      data = rows.map((r) => [
        r.student_reference,
        r.full_name,
        r.email || '',
        r.phone || '',
        r.status,
        r.academic_year || '',
        r.campus || '',
        r.course || '',
      ]);
    } else if (type === 'installments') {
      const rows = await this.db.query(
        `SELECT s.account_reference, i.sequence, i.due_date, i.amount_minor, i.paid_amount_minor,
                greatest(i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor,0)::bigint AS remaining_minor, i.status
         FROM fee_installments i JOIN fee_schedules s ON s.id=i.schedule_id AND s.tenant_id=i.tenant_id
         WHERE i.tenant_id=$1 AND s.status IN ('active','completed') AND i.status<>'cancelled'
         ORDER BY i.due_date`,
        [req.actor.tenantId],
      );
      headers = [
        'Account',
        'Installment #',
        'Due Date',
        'Amount (Paise)',
        'Paid (Paise)',
        'Remaining (Paise)',
        'Status',
      ];
      data = rows.map((r) => [
        r.account_reference,
        r.sequence,
        r.due_date,
        r.amount_minor,
        r.paid_amount_minor,
        r.remaining_minor,
        r.status,
      ]);
    } else if (type === 'payments') {
      const rows = await this.db.query(
        `SELECT s.account_reference, coalesce(p.collection_reference, p.provider_reference) AS reference,
                p.direct_details->>'mode' AS payment_mode, p.amount_minor, p.recorded_at, r.receipt_number, p.status
         FROM payment_records p JOIN fee_schedules s ON s.id=p.schedule_id AND s.tenant_id=p.tenant_id
         LEFT JOIN fee_receipts r ON r.payment_id=p.id AND r.tenant_id=p.tenant_id
         WHERE p.tenant_id=$1 ORDER BY p.recorded_at DESC`,
        [req.actor.tenantId],
      );
      headers = [
        'Account',
        'Reference',
        'Mode',
        'Amount (Paise)',
        'Date',
        'Receipt Number',
        'Status',
      ];
      data = rows.map((r) => [
        r.account_reference,
        r.reference,
        r.payment_mode || 'eNACH',
        r.amount_minor,
        r.recorded_at,
        r.receipt_number || '',
        r.status,
      ]);
    } else if (type === 'mandates') {
      const rows = await this.db.query(
        `SELECT s.account_reference, m.provider, m.provider_reference, m.rail, m.status, m.last_event_at
         FROM payment_mandates m JOIN fee_schedules s ON s.id=m.schedule_id AND s.tenant_id=m.tenant_id
         WHERE m.tenant_id=$1 ORDER BY m.last_event_at DESC`,
        [req.actor.tenantId],
      );
      headers = ['Account', 'Provider', 'Mandate Reference', 'Rail', 'Status', 'Updated At'];
      data = rows.map((r) => [
        r.account_reference,
        r.provider,
        r.provider_reference,
        r.rail,
        r.status,
        r.last_event_at,
      ]);
    } else {
      headers = ['Message'];
      data = [['Export type not supported']];
    }

    const sanitize = (val: any) => {
      let str = String(val ?? '');
      if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
      if (/[",\n\r]/.test(str)) str = `"${str.replaceAll('"', '""')}"`;
      return str;
    };

    const csv =
      '\uFEFF' +
      [headers.map(sanitize).join(','), ...data.map((row) => row.map(sanitize).join(','))].join(
        '\r\n',
      );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
