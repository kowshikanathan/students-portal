import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Inject,
  Post,
  Param,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Db } from './db';
import { AuthGuard, AuthedRequest, Roles } from './auth';
import { encrypt } from '../../../packages/core/src/security';
import { paymentProviderEventSchema } from '../../../packages/core/src/contracts';
import { PaymentProviderController } from './payment-provider';

export const sandboxProvider = 'sandbox_enach';
function enabled() {
  if (
    process.env.AUTOPAY_PROVIDER_MODE !== 'sandbox' ||
    process.env.DEPLOYMENT_MODE === 'production'
  )
    throw new ForbiddenException('Sandbox eNACH is not enabled');
}
async function apply(db: Db, tenantId: string, input: unknown) {
  const event = paymentProviderEventSchema.parse(input);
  return new PaymentProviderController(db).applyVerifiedEvent(
    sandboxProvider,
    event,
    createHash('sha256').update(JSON.stringify(event)).digest('hex'),
    tenantId,
  );
}

/** Uses the same durable attempt, payment event, receipt and settlement records as other providers. */
export async function submitSandboxDebit(db: Db, attemptId: string) {
  enabled();
  const attempt = await db.tx(async (c) => {
    const row = (
      await c.query(
        `SELECT a.*,i.amount_minor AS charge_minor,i.adjustment_amount_minor,i.paid_amount_minor,
      s.created_by AS actor_id,s.status AS schedule_status,m.status AS mandate_status,i.status AS installment_status
      FROM autopay_debit_attempts a JOIN fee_installments i ON i.id=a.installment_id AND i.tenant_id=a.tenant_id
      JOIN fee_schedules s ON s.id=a.schedule_id AND s.tenant_id=a.tenant_id
      JOIN payment_mandates m ON m.id=a.mandate_id AND m.tenant_id=a.tenant_id
      WHERE a.id=$1 AND a.provider=$2 FOR UPDATE OF i,a`,
        [attemptId, sandboxProvider],
      )
    ).rows[0];
    if (!row) throw new ConflictException('Sandbox debit attempt not found');
    if (['failed', 'cancelled'].includes(row.status)) return null;
    if (row.status === 'confirmed') return row;
    if (row.status === 'uncertain') return null;
    if (row.status === 'queued') {
      const remaining =
        Number(row.charge_minor) -
        Number(row.adjustment_amount_minor) -
        Number(row.paid_amount_minor);
      const checkout = (
        await c.query(
          `SELECT id FROM payment_checkout_sessions WHERE tenant_id=$1 AND installment_id=$2 AND (status='uncertain' OR (status IN('requested','created') AND (expires_at IS NULL OR expires_at>now()))) LIMIT 1`,
          [row.tenant_id, row.installment_id],
        )
      ).rows[0];
      if (
        remaining <= 0 ||
        row.schedule_status !== 'active' ||
        row.mandate_status !== 'active' ||
        ['paid', 'cancelled', 'adjusted'].includes(row.installment_status) ||
        checkout
      ) {
        await c.query(
          `UPDATE autopay_debit_attempts SET status='cancelled',failure_code='NO_PAYABLE_BALANCE',updated_at=now() WHERE id=$1`,
          [row.id],
        );
        await db.audit(c, 'sandbox', 'fees.autopay.cancelled', row.id, {
          tenantId: row.tenant_id,
          reason: 'Installment is no longer eligible',
        });
        return null;
      }
      const rival = (
        await c.query(
          `SELECT id FROM autopay_debit_attempts WHERE tenant_id=$1 AND installment_id=$2 AND id<>$3 AND status IN ('submitted','uncertain') LIMIT 1`,
          [row.tenant_id, row.installment_id, row.id],
        )
      ).rows[0];
      if (rival) throw new ConflictException('Another debit is processing');
      row.amount_minor = remaining;
      row.provider_reference = 'SDB-' + row.id;
      await c.query(
        `UPDATE autopay_debit_attempts SET amount_minor=$2,status=$3,provider_reference=$4,submitted_at=now(),updated_at=now() WHERE id=$1`,
        [
          row.id,
          remaining,
          row.sandbox_outcome === 'uncertain' ? 'uncertain' : 'submitted',
          row.provider_reference,
        ],
      );
      await db.audit(c, 'sandbox', 'fees.autopay.submitted', row.id, {
        tenantId: row.tenant_id,
        amountMinor: remaining,
      });
    }
    return row;
  });
  if (!attempt) return { status: 'skipped' };
  if (attempt.sandbox_outcome === 'uncertain') return { status: 'uncertain' };
  if (attempt.status !== 'confirmed')
    await apply(db, attempt.tenant_id, {
      eventId: 'SBE-' + attempt.id,
      type: attempt.sandbox_outcome === 'failed' ? 'payment_failed' : 'payment_confirmed',
      merchantAttemptId: attempt.id,
      installmentId: attempt.installment_id,
      providerReference: attempt.provider_reference,
      amountMinor: Number(attempt.amount_minor),
      currency: 'INR',
      occurredAt: new Date(attempt.created_at).toISOString(),
      ...(attempt.sandbox_outcome === 'failed' ? { reasonCode: 'SANDBOX_INSUFFICIENT_FUNDS' } : {}),
    });
  // Retrying after a crash completes settlement without creating another payment.
  if (attempt.sandbox_outcome === 'successful')
    await db.tx(async (c) => {
      const payment = (
        await c.query(
          `SELECT * FROM payment_records WHERE tenant_id=$1 AND provider=$2 AND provider_reference=$3 FOR UPDATE`,
          [attempt.tenant_id, sandboxProvider, attempt.provider_reference],
        )
      ).rows[0];
      if (!payment) throw new ConflictException('Sandbox payment has not been confirmed');
      const recovered = await c.query(
        `UPDATE autopay_debit_attempts SET recovery_status='resolved',recovery_note='Recovered through successful sandbox retry',updated_at=now() WHERE tenant_id=$1 AND installment_id=$2 AND status='failed' AND recovery_status<>'resolved' RETURNING id`,
        [attempt.tenant_id, attempt.installment_id],
      );
      for (const row of recovered.rows)
        await db.audit(c, 'sandbox', 'fees.debit.recovered', row.id, {
          tenantId: attempt.tenant_id,
          paymentId: payment.id,
        });
      const settlement = (
        await c.query(
          `INSERT INTO settlement_records(tenant_id,provider,provider_reference,currency,amount_minor,status,settled_at,recorded_by)
      VALUES($1,$2,$3,'INR',$4,'settled',now(),$5) ON CONFLICT DO NOTHING RETURNING id`,
          [
            attempt.tenant_id,
            sandboxProvider,
            'SSET-' + attempt.id,
            payment.amount_minor,
            attempt.actor_id,
          ],
        )
      ).rows[0];
      if (!settlement) return;
      await c.query(
        `INSERT INTO settlement_payments(settlement_id,payment_id,amount_minor) VALUES($1,$2,$3)`,
        [settlement.id, payment.id, payment.amount_minor],
      );
      await c.query(
        `INSERT INTO reconciliation_entries(tenant_id,payment_id,settlement_id,status,reason,created_by) VALUES($1,$2,$3,'matched','Sandbox provider settlement',$4)`,
        [attempt.tenant_id, payment.id, settlement.id, attempt.actor_id],
      );
      await db.audit(c, 'sandbox', 'fees.settlement.matched', settlement.id, {
        tenantId: attempt.tenant_id,
        paymentId: payment.id,
        attemptId: attempt.id,
      });
    });
  return { status: attempt.sandbox_outcome };
}

@Controller('v1/admin/fees/sandbox')
@UseGuards(AuthGuard)
@Roles('owner')
export class SandboxEnachController {
  constructor(@Inject(Db) private db: Db) {}

  @Get('mandates/:id')
  async getMandateStatus(@Req() req: AuthedRequest, @Param('id') id: string) {
    const row = (
      await this.db.query(
        `SELECT m.id,m.schedule_id,m.provider_reference,m.status,m.last_event_at,
      (SELECT status FROM payment_mandate_setup_requests ps WHERE ps.tenant_id=m.tenant_id AND ps.provider=m.provider AND ps.provider_reference=m.provider_reference ORDER BY created_at DESC LIMIT 1) AS setup_status
      FROM payment_mandates m WHERE m.tenant_id=$1 AND m.id=$2 AND m.provider=$3`,
        [req.actor.tenantId, z.uuid().parse(id), sandboxProvider],
      )
    )[0];
    if (!row) throw new ConflictException('Sandbox mandate not found');
    return {
      ...row,
      status:
        row.setup_status === 'expired'
          ? 'expired'
          : row.status === 'revoked'
            ? 'cancelled'
            : row.status === 'failed'
              ? 'rejected'
              : row.status === 'pending'
                ? row.setup_status === 'requested'
                  ? 'pending'
                  : 'created'
                : row.status,
    };
  }

  @Post('mandates/:id/state')
  async changeMandateState(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    enabled();
    const mandateId = z.uuid().parse(id);
    const input = z
      .object({
        state: z.enum(['created', 'pending', 'active', 'rejected', 'cancelled', 'expired']),
        reason: z.string().trim().min(3).max(300),
      })
      .strict()
      .parse(body);
    const mandate = (
      await this.db.query(
        `SELECT * FROM payment_mandates WHERE tenant_id=$1 AND id=$2 AND provider=$3`,
        [req.actor.tenantId, mandateId, sandboxProvider],
      )
    )[0];
    if (!mandate) throw new ConflictException('Sandbox mandate not found');
    const status =
      input.state === 'active'
        ? 'active'
        : input.state === 'rejected'
          ? 'failed'
          : ['cancelled', 'expired'].includes(input.state)
            ? 'revoked'
            : 'pending';
    const result = await apply(this.db, req.actor.tenantId, {
      eventId: 'SMSTATE-' + randomUUID(),
      type: 'mandate_status',
      scheduleId: mandate.schedule_id,
      rail: 'enach',
      providerReference: mandate.provider_reference,
      status,
      occurredAt: new Date(
        Math.max(Date.now(), new Date(mandate.last_event_at).getTime() + 1),
      ).toISOString(),
    });
    if (!result.accepted) throw new ConflictException('Sandbox state transition was rejected');
    if (result.status === 'applied')
      await this.db.tx(async (c) => {
        const setupStatus =
          input.state === 'pending'
            ? 'requested'
            : input.state === 'rejected'
              ? 'failed'
              : input.state;
        await c.query(
          `UPDATE payment_mandate_setup_requests SET status=$3,failure_code=CASE WHEN $3='failed' THEN 'SANDBOX_REJECTED' ELSE NULL END,updated_at=now() WHERE tenant_id=$1 AND provider_reference=$2 AND provider=$4`,
          [req.actor.tenantId, mandate.provider_reference, setupStatus, sandboxProvider],
        );
        if (status !== 'active')
          await c.query(
            `UPDATE autopay_debit_attempts SET status='cancelled',failure_code='MANDATE_NOT_ACTIVE',updated_at=now() WHERE tenant_id=$1 AND mandate_id=$2 AND status='queued'`,
            [req.actor.tenantId, mandateId],
          );
        await this.db.audit(c, req.actor.id, 'fees.sandbox.mandate.state', mandateId, {
          tenantId: req.actor.tenantId,
          oldValue: mandate.status,
          newValue: input.state,
          reason: input.reason,
        });
      });
    return this.getMandateStatus(req, mandateId);
  }

  @Post('debits/:id/recovery')
  async recovery(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    enabled();
    const attemptId = z.uuid().parse(id);
    const input = z
      .object({
        status: z.enum(['contacted', 'resolved']),
        reason: z.string().trim().min(3).max(300),
      })
      .strict()
      .parse(body);
    return this.db.tx(async (c) => {
      const row = (
        await c.query(
          `UPDATE autopay_debit_attempts SET recovery_status=$3,recovery_note=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND provider=$5 AND status='failed' RETURNING id`,
          [req.actor.tenantId, attemptId, input.status, input.reason, sandboxProvider],
        )
      ).rows[0];
      if (!row) throw new ConflictException('Failed sandbox debit not found');
      await this.db.audit(c, req.actor.id, 'fees.debit.recovery', attemptId, {
        tenantId: req.actor.tenantId,
        ...input,
      });
      return row;
    });
  }

  @Post('debits/:id/resolve')
  async resolve(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    enabled();
    const attemptId = z.uuid().parse(id);
    const input = z
      .object({
        outcome: z.enum(['successful', 'failed']),
        reason: z.string().trim().min(3).max(300),
      })
      .strict()
      .parse(body);
    await this.db.tx(async (c) => {
      const row = (
        await c.query(
          `SELECT id,installment_id FROM autopay_debit_attempts WHERE tenant_id=$1 AND id=$2 AND provider=$3`,
          [req.actor.tenantId, attemptId, sandboxProvider],
        )
      ).rows[0];
      if (!row) throw new ConflictException('Sandbox attempt not found');
      await c.query('SELECT id FROM fee_installments WHERE id=$1 FOR UPDATE', [row.installment_id]);
      const changed = (
        await c.query(
          `UPDATE autopay_debit_attempts SET status='submitted',sandbox_outcome=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='uncertain' RETURNING id`,
          [req.actor.tenantId, attemptId, input.outcome],
        )
      ).rows[0];
      if (!changed)
        throw new ConflictException('Only an uncertain sandbox attempt can be resolved');
      await this.db.audit(c, req.actor.id, 'fees.sandbox.debit.resolve', attemptId, {
        tenantId: req.actor.tenantId,
        ...input,
      });
    });
    return submitSandboxDebit(this.db, attemptId);
  }

  @Post('register')
  async register(@Req() req: AuthedRequest, @Body() body: unknown) {
    enabled();
    const input = z
      .object({
        scheduleId: z.uuid(),
        idempotencyKey: z.uuid(),
        holderName: z.string().trim().min(2).max(120),
        sandboxConsent: z.literal(true),
      })
      .strict()
      .parse(body);
    const setup = await this.db.tx(async (c) => {
      const s = (
        await c.query(
          `SELECT * FROM fee_schedules WHERE tenant_id=$1 AND id=$2 AND status='active' FOR UPDATE`,
          [req.actor.tenantId, input.scheduleId],
        )
      ).rows[0];
      if (!s) throw new ConflictException('Active fee schedule not found');
      const existing = (
        await c.query(
          `SELECT * FROM payment_mandate_setup_requests WHERE tenant_id=$1 AND idempotency_key=$2`,
          [req.actor.tenantId, input.idempotencyKey],
        )
      ).rows[0];
      if (existing) {
        if (existing.schedule_id !== s.id || existing.provider !== sandboxProvider)
          throw new ConflictException('Registration key was already used');
        return existing;
      }
      const active = (
        await c.query(
          `SELECT id FROM payment_mandates WHERE tenant_id=$1 AND schedule_id=$2 AND status='active' LIMIT 1`,
          [req.actor.tenantId, s.id],
        )
      ).rows[0];
      if (active) throw new ConflictException('This schedule already has an active mandate');
      let payerId = s.payer_id;
      if (!payerId) {
        const payer = (
          await c.query(
            `INSERT INTO fee_payers(tenant_id,account_reference,encrypted_profile,preferred_channel,created_by) VALUES($1,$2,$3,'none',$4) ON CONFLICT(tenant_id,account_reference) DO UPDATE SET updated_at=fee_payers.updated_at RETURNING id`,
            [
              req.actor.tenantId,
              s.account_reference,
              encrypt({ displayName: input.holderName }),
              req.actor.id,
            ],
          )
        ).rows[0];
        payerId = payer.id;
        await c.query(`UPDATE fee_schedules SET payer_id=$2 WHERE id=$1`, [s.id, payerId]);
      }
      const row = (
        await c.query(
          `INSERT INTO payment_mandate_setup_requests(tenant_id,schedule_id,payer_id,idempotency_key,provider,rail,return_token_hash,status,provider_reference) VALUES($1,$2,$3,$4,$5,'enach',$6,'created',$7) RETURNING *`,
          [
            req.actor.tenantId,
            s.id,
            payerId,
            input.idempotencyKey,
            sandboxProvider,
            createHash('sha256').update(input.idempotencyKey).digest('hex'),
            'SM-' + input.idempotencyKey,
          ],
        )
      ).rows[0];
      await this.db.audit(c, req.actor.id, 'fees.sandbox.registration', row.id, {
        tenantId: req.actor.tenantId,
        scheduleId: s.id,
        sandboxConsent: true,
      });
      return row;
    });
    return apply(this.db, req.actor.tenantId, {
      eventId: 'SME-' + setup.id,
      type: 'mandate_status',
      merchantSetupId: setup.id,
      scheduleId: setup.schedule_id,
      rail: 'enach',
      providerReference: setup.provider_reference,
      status: 'active',
      occurredAt: new Date(setup.created_at).toISOString(),
    });
  }

  @Post('debits')
  async debit(@Req() req: AuthedRequest, @Body() body: unknown) {
    enabled();
    const input = z
      .object({
        installmentId: z.uuid(),
        idempotencyKey: z.uuid(),
        outcome: z.enum(['successful', 'failed', 'uncertain']).default('successful'),
      })
      .strict()
      .parse(body);
    const attempt = await this.db.tx(async (c) => {
      const i = (
        await c.query(
          `SELECT i.*,m.id AS mandate_id FROM fee_installments i JOIN fee_schedules s ON s.id=i.schedule_id AND s.tenant_id=i.tenant_id JOIN payment_mandates m ON m.schedule_id=s.id AND m.tenant_id=s.tenant_id AND m.status='active' AND m.provider=$3 WHERE i.tenant_id=$1 AND i.id=$2 AND s.status='active' FOR UPDATE OF i`,
          [req.actor.tenantId, input.installmentId, sandboxProvider],
        )
      ).rows[0];
      const replay = (
        await c.query(
          `SELECT * FROM autopay_debit_attempts WHERE tenant_id=$1 AND idempotency_key=$2`,
          [req.actor.tenantId, input.idempotencyKey],
        )
      ).rows[0];
      if (replay) {
        if (
          replay.installment_id !== input.installmentId ||
          replay.sandbox_outcome !== input.outcome
        )
          throw new ConflictException('Debit key was already used');
        return replay;
      }
      if (!i) throw new ConflictException('An active sandbox mandate is required');
      const pending = (
        await c.query(
          `SELECT id FROM autopay_debit_attempts WHERE tenant_id=$1 AND installment_id=$2 AND status IN ('queued','submitted','uncertain') LIMIT 1`,
          [req.actor.tenantId, i.id],
        )
      ).rows[0];
      if (pending)
        throw new ConflictException(
          'An existing debit must finish or be reconciled before retrying',
        );
      const remaining =
        Number(i.amount_minor) - Number(i.adjustment_amount_minor) - Number(i.paid_amount_minor);
      if (remaining <= 0 || ['cancelled', 'adjusted', 'paid'].includes(i.status))
        throw new ConflictException('Installment has no remaining balance');
      const latest = (
        await c.query(
          `SELECT coalesce(max(attempt_no),0)::int AS attempts FROM autopay_debit_attempts WHERE tenant_id=$1 AND installment_id=$2`,
          [req.actor.tenantId, i.id],
        )
      ).rows[0];
      if (latest.attempts >= 10) throw new ConflictException('Maximum debit attempts reached');
      const row = (
        await c.query(
          `INSERT INTO autopay_debit_attempts(tenant_id,schedule_id,installment_id,mandate_id,idempotency_key,provider,amount_minor,currency,attempt_no,sandbox_outcome) VALUES($1,$2,$3,$4,$5,$6,$7,'INR',$8,$9) RETURNING *`,
          [
            req.actor.tenantId,
            i.schedule_id,
            i.id,
            i.mandate_id,
            input.idempotencyKey,
            sandboxProvider,
            remaining,
            latest.attempts + 1,
            input.outcome,
          ],
        )
      ).rows[0];
      await this.db.audit(c, req.actor.id, 'fees.sandbox.debit.queued', row.id, {
        tenantId: req.actor.tenantId,
        installmentId: i.id,
        amountMinor: remaining,
        outcome: input.outcome,
      });
      return row;
    });
    return submitSandboxDebit(this.db, attempt.id);
  }
}
