import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { AuthGuard, AuthedRequest, Roles } from './auth';

export const overviewFilters = z
  .object({
    period: z.enum(['today', '7days', 'month', 'custom']).default('month'),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    branchId: z.uuid().optional(),
    planId: z.uuid().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.period === 'custom' &&
      (!v.from ||
        !v.to ||
        v.from > v.to ||
        (Date.parse(v.to) - Date.parse(v.from)) / 86400000 > 365)
    )
      ctx.addIssue({ code: 'custom', message: 'Choose an ordered date range of at most 366 days' });
  });

// Each financial relation is aggregated independently to avoid multiplying payments
// by mandates/attempts. List endpoints' display limits never affect these totals.
export const overviewSql = `WITH bounds AS (
 SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today,
 CASE $2 WHEN 'today' THEN (now() AT TIME ZONE 'Asia/Kolkata')::date
 WHEN '7days' THEN (now() AT TIME ZONE 'Asia/Kolkata')::date-6
 WHEN 'custom' THEN $3::date ELSE date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')::date END AS start_on,
 CASE WHEN $2='custom' THEN $4::date ELSE (now() AT TIME ZONE 'Asia/Kolkata')::date END AS end_on
), scoped AS (
 SELECT s.* FROM fee_schedules s WHERE s.tenant_id=$1
 AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM student_fee_plan_assignments a JOIN academic_students st ON st.id=a.student_id AND st.tenant_id=a.tenant_id WHERE a.schedule_id=s.id AND a.tenant_id=$1 AND st.branch_id=$5))
 AND ($6::uuid IS NULL OR EXISTS(SELECT 1 FROM student_fee_plan_assignments a WHERE a.schedule_id=s.id AND a.tenant_id=$1 AND a.plan_id=$6))
), installments AS (
 SELECT i.*,s.account_reference,greatest(0,i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor) AS outstanding
 FROM fee_installments i JOIN scoped s ON s.id=i.schedule_id AND s.tenant_id=i.tenant_id
 WHERE i.tenant_id=$1 AND s.status IN('active','completed') AND i.status NOT IN('cancelled','adjusted')
), payments AS (
 SELECT p.*,(p.recorded_at AT TIME ZONE 'Asia/Kolkata')::date AS day FROM payment_records p
 JOIN scoped s ON s.id=p.schedule_id AND s.tenant_id=p.tenant_id WHERE p.tenant_id=$1
), attempts AS (
 SELECT a.* FROM autopay_debit_attempts a JOIN scoped s ON s.id=a.schedule_id AND s.tenant_id=a.tenant_id WHERE a.tenant_id=$1
), mandates AS (
 SELECT m.* FROM payment_mandates m JOIN scoped s ON s.id=m.schedule_id AND s.tenant_id=m.tenant_id WHERE m.tenant_id=$1
), setups AS (
 SELECT r.* FROM payment_mandate_setup_requests r JOIN scoped s ON s.id=r.schedule_id AND s.tenant_id=r.tenant_id WHERE r.tenant_id=$1
), settlements AS (
 SELECT r.* FROM settlement_records r WHERE r.tenant_id=$1
 AND (($5::uuid IS NULL AND $6::uuid IS NULL) OR EXISTS(
 SELECT 1 FROM settlement_payments sp JOIN payments p ON p.id=sp.payment_id WHERE sp.settlement_id=r.id))
), failed_installments AS (
 SELECT DISTINCT installment_id FROM attempts,bounds WHERE status='failed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date<=end_on
)
SELECT json_build_object(
 'timezone','Asia/Kolkata','from',b.start_on,'to',b.end_on,'asOf',now(),
 'summary',json_build_object(
 'collectedMinor',(SELECT coalesce(sum(amount_minor-refunded_amount_minor),0)::text FROM payments WHERE day BETWEEN b.start_on AND b.end_on),
 'todayMinor',(SELECT coalesce(sum(amount_minor-refunded_amount_minor),0)::text FROM payments WHERE day=b.today),
 'expectedMinor',(SELECT coalesce(sum(amount_minor-adjustment_amount_minor),0)::text FROM installments WHERE due_date BETWEEN b.start_on AND b.end_on),
 'paidAgainstExpectedMinor',(SELECT coalesce(sum(least(paid_amount_minor,amount_minor-adjustment_amount_minor)),0)::text FROM installments WHERE due_date BETWEEN b.start_on AND b.end_on),
 'overdueMinor',(SELECT coalesce(sum(outstanding),0)::text FROM installments WHERE due_date<b.today),
 'upcomingMinor',(SELECT coalesce(sum(outstanding),0)::text FROM installments WHERE due_date BETWEEN b.today AND b.today+6),
 'activeMandates',(SELECT count(*) FROM mandates WHERE status='active'),
 'registrationTotal',(SELECT count(*) FROM setups WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN b.start_on AND b.end_on),
 'registrationActive',(SELECT count(*) FROM setups WHERE status='active' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN b.start_on AND b.end_on),
 'failedDebits',(SELECT count(*) FROM attempts WHERE status='failed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN b.start_on AND b.end_on),
 'pendingSettlements',(SELECT count(*) FROM settlements WHERE status='pending'),
 'pendingSettlementMinor',(SELECT coalesce(sum(amount_minor),0)::text FROM settlements WHERE status='pending'),
 'failedInstallments',(SELECT count(*) FROM failed_installments),
 'recoveredInstallments',(SELECT count(*) FROM failed_installments f JOIN installments i ON i.id=f.installment_id WHERE i.status='paid' AND i.outstanding=0)
 ),
 'daily',coalesce((SELECT json_agg(d ORDER BY d.day) FROM (
 SELECT series.chart_day::date AS day,
 (SELECT coalesce(sum(amount_minor-refunded_amount_minor),0)::text FROM payments p WHERE p.day=series.chart_day::date) AS collected_minor,
 (SELECT coalesce(sum(amount_minor-adjustment_amount_minor),0)::text FROM installments i WHERE i.due_date=series.chart_day::date) AS expected_minor,
 (SELECT count(*) FROM attempts a WHERE a.status='failed' AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::date=series.chart_day::date) AS failed
 FROM generate_series(b.start_on::timestamp,b.end_on::timestamp,interval '1 day') AS series(chart_day)
 ) d),'[]'::json),
 'funnel',coalesce((SELECT json_agg(f) FROM (SELECT status,count(*) AS count FROM setups WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN b.start_on AND b.end_on GROUP BY status ORDER BY status) f),'[]'::json),
 'upcoming',coalesce((SELECT json_agg(u) FROM (SELECT id,schedule_id,account_reference,sequence,due_date,outstanding::text AS outstanding_minor FROM installments WHERE outstanding>0 AND due_date BETWEEN b.today AND b.today+6 ORDER BY due_date,id LIMIT 20) u),'[]'::json),
 'failures',coalesce((SELECT json_agg(f) FROM (SELECT coalesce(failure_code,'UNSPECIFIED') AS failure_code,count(*) AS count FROM attempts WHERE status='failed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN b.start_on AND b.end_on GROUP BY failure_code ORDER BY count(*) DESC LIMIT 10) f),'[]'::json),
 'activity',coalesce((SELECT json_agg(p) FROM (SELECT id,schedule_id,amount_minor::text,status,recorded_at FROM payments WHERE day BETWEEN b.start_on AND b.end_on ORDER BY recorded_at DESC,id LIMIT 10) p),'[]'::json)
) AS result FROM bounds b`;

@Controller('v1/admin/enach')
@UseGuards(AuthGuard)
@Roles('owner')
export class EnachOverviewController {
  constructor(@Inject(Db) private db: Db) {}
  @Get('overview')
  async overview(@Req() req: AuthedRequest, @Query() query: unknown) {
    const v = overviewFilters.parse(query);
    const rows = await this.db.query(overviewSql, [
      req.actor.tenantId,
      v.period,
      v.from || null,
      v.to || null,
      v.branchId || null,
      v.planId || null,
    ]);
    return rows[0]!.result;
  }
  @Get('filters')
  async filters(@Req() req: AuthedRequest) {
    const [branches, plans] = await Promise.all([
      this.db.query('SELECT id,name FROM branches WHERE tenant_id=$1 ORDER BY name', [
        req.actor.tenantId,
      ]),
      this.db.query(
        'SELECT id,name,version FROM fee_plan_versions WHERE tenant_id=$1 ORDER BY name,version DESC',
        [req.actor.tenantId],
      ),
    ]);
    return { branches, plans };
  }
  @Get('overview/records')
  async records(@Req() req: AuthedRequest, @Query() query: unknown) {
    const input = z
      .object({
        period: z.enum(['today', '7days', 'month', 'custom']).optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        branchId: z.uuid().optional(),
        planId: z.uuid().optional(),
        kind: z.enum([
          'collected',
          'today',
          'expected',
          'overdue',
          'upcoming',
          'mandates',
          'registrations',
          'failed',
          'settlements',
          'recovery',
        ]),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .strict()
      .parse(query);
    const { kind, page, ...filters } = input;
    const v = overviewFilters.parse(filters);
    const sources: Record<typeof kind, string> = {
      collected:
        'SELECT id,amount_minor::text AS amount_minor,status,recorded_at AS date FROM payments,bounds WHERE day BETWEEN start_on AND end_on',
      today:
        'SELECT id,amount_minor::text AS amount_minor,status,recorded_at AS date FROM payments,bounds WHERE day=today',
      expected:
        'SELECT id,(amount_minor-adjustment_amount_minor)::text AS amount_minor,status,due_date AS date FROM installments,bounds WHERE due_date BETWEEN start_on AND end_on',
      overdue:
        'SELECT id,outstanding::text AS amount_minor,status,due_date AS date FROM installments,bounds WHERE due_date<today AND outstanding>0',
      upcoming:
        'SELECT id,outstanding::text AS amount_minor,status,due_date AS date FROM installments,bounds WHERE due_date BETWEEN today AND today+6 AND outstanding>0',
      mandates:
        "SELECT id,NULL::text AS amount_minor,status,last_event_at AS date FROM mandates WHERE status='active'",
      registrations:
        "SELECT id,NULL::text AS amount_minor,status,created_at AS date FROM setups,bounds WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN start_on AND end_on",
      failed:
        "SELECT id,amount_minor::text AS amount_minor,status,created_at AS date FROM attempts,bounds WHERE status='failed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN start_on AND end_on",
      settlements:
        "SELECT id,amount_minor::text AS amount_minor,status,created_at AS date FROM settlements WHERE status='pending'",
      recovery:
        'SELECT i.id,i.outstanding::text AS amount_minor,i.status,i.due_date AS date FROM installments i JOIN failed_installments f ON f.installment_id=i.id',
    };
    const ctes = overviewSql.slice(0, overviewSql.indexOf('SELECT json_build_object('));
    return this.db.query(
      ctes + `SELECT * FROM (${sources[kind]}) detail ORDER BY date DESC,id LIMIT 50 OFFSET $7`,
      [
        req.actor.tenantId,
        v.period,
        v.from || null,
        v.to || null,
        v.branchId || null,
        v.planId || null,
        (page - 1) * 50,
      ],
    );
  }
}
