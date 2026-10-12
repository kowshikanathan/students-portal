import { z } from 'zod';
import { Db } from '../../api/src/db';

const debitProviderResponseSchema = z
  .object({
    providerReference: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._:-]{3,120}$/),
    status: z.enum(['accepted', 'rejected']),
    reasonCode: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_-]{2,80}$/)
      .optional(),
  })
  .strict();

function configuredHosts() {
  return new Set(
    (process.env.AUTOPAY_ALLOWED_HOSTS || '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

function safeProviderUrl(raw: string) {
  const url = new URL(raw);
  if (url.username || url.password) throw new Error('AUTOPAY_DEBIT_CREATE_URL_UNSAFE');
  const local =
    process.env.DEPLOYMENT_MODE !== 'production' &&
    ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    throw new Error('AUTOPAY_DEBIT_CREATE_URL_NOT_HTTPS');
  if (!configuredHosts().has(url.hostname.toLowerCase()))
    throw new Error('AUTOPAY_DEBIT_CREATE_URL_NOT_ALLOWLISTED');
  return url;
}

function nextRetry(attemptNo: number) {
  if (attemptNo === 1) return "now()+interval '1 hour'";
  if (attemptNo === 2) return "now()+interval '24 hours'";
  return "now()+interval '48 hours'";
}

export async function submitAutopayDebit(db: Db, eventId: string) {
  if (process.env.AUTOPAY_PROVIDER_MODE !== 'mandate_api') return 'disabled';

  const attempt = (
    await db.query(
      `SELECT a.*,m.provider_reference AS mandate_reference
       FROM autopay_debit_attempts a
       JOIN payment_mandates m ON m.id=a.mandate_id
       JOIN outbox o ON o.aggregate_id=a.id
       WHERE o.event_id=$1 AND o.type='autopay.debit.requested'
       LIMIT 1`,
      [eventId],
    )
  )[0];
  if (!attempt) throw new Error('AUTOPAY_ATTEMPT_NOT_FOUND');
  if (['submitted', 'confirmed', 'cancelled', 'failed'].includes(attempt.status))
    return 'provider_accepted';
  // A network timeout does not mean a debit failed. A retry could debit the
  // payer twice if a partner does not preserve the idempotency contract.
  if (attempt.status === 'uncertain') return 'reconciliation_required';

  // A payment, fee adjustment or mandate revocation may have happened since
  // this outbox entry was queued. Re-check the authoritative state before
  // contacting the bank. Never submit a stale or oversized debit.
  const payable = (
    await db.query(
      `SELECT a.id
       FROM autopay_debit_attempts a
       JOIN fee_installments i ON i.id=a.installment_id
         AND i.schedule_id=a.schedule_id AND i.tenant_id=a.tenant_id
       JOIN fee_schedules s ON s.id=a.schedule_id AND s.tenant_id=a.tenant_id
       JOIN payment_mandates m ON m.id=a.mandate_id
         AND m.schedule_id=a.schedule_id AND m.tenant_id=a.tenant_id
       WHERE a.id=$1 AND a.status='queued'
         AND s.status='active' AND m.status='active'
         AND i.status NOT IN ('paid','cancelled','adjusted')
         AND i.due_date<=current_date
         AND i.amount_minor-coalesce(i.adjustment_amount_minor,0)-i.paid_amount_minor>=a.amount_minor
       LIMIT 1`,
      [attempt.id],
    )
  )[0];
  if (!payable) {
    await db.tx(async (c) => {
      const cancelled = await c.query(
        `UPDATE autopay_debit_attempts
         SET status='cancelled',failure_code='DEBIT_NO_LONGER_ELIGIBLE',
             next_retry_at=NULL,updated_at=now()
         WHERE id=$1 AND status='queued'`,
        [attempt.id],
      );
      if (cancelled.rowCount)
        await db.audit(c, 'worker', 'fees.autopay.stale_cancelled', attempt.id, {
          scheduleId: attempt.schedule_id,
          installmentId: attempt.installment_id,
        });
    });
    return 'provider_accepted';
  }

  const maxAttempts = Math.max(1, Math.min(10, Number(process.env.AUTOPAY_MAX_ATTEMPTS || 3)));
  const url = safeProviderUrl(process.env.AUTOPAY_DEBIT_CREATE_URL || '');
  const timeoutMs = Number(process.env.AUTOPAY_TIMEOUT_MS || 5000);
  const secret = process.env.AUTOPAY_API_KEY!;

  let result: z.infer<typeof debitProviderResponseSchema>;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + secret,
        'Content-Type': 'application/json',
        'Idempotency-Key': attempt.idempotency_key,
      },
      body: JSON.stringify({
        merchantAttemptId: attempt.id,
        scheduleId: attempt.schedule_id,
        installmentId: attempt.installment_id,
        mandateReference: attempt.mandate_reference,
        amountMinor: Number(attempt.amount_minor),
        currency: attempt.currency,
        metadata: {
          scheduleId: attempt.schedule_id,
          installmentId: attempt.installment_id,
          debitAttemptId: attempt.id,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error('PROVIDER_HTTP_' + response.status);
    result = debitProviderResponseSchema.parse(await response.json());
  } catch {
    await db.tx(async (c) => {
      const changed = await c.query(
        `UPDATE autopay_debit_attempts
         SET status='uncertain',failure_code='PROVIDER_SUBMIT_UNCERTAIN',
             next_retry_at=NULL,updated_at=now()
         WHERE id=$1 AND status='queued'`,
        [attempt.id],
      );
      if (changed.rowCount)
        await db.audit(c, 'worker', 'fees.autopay.reconciliation_required', attempt.id, {
          installmentId: attempt.installment_id,
          attemptNo: Number(attempt.attempt_no),
        });
    });
    // Block automatic outbox retries until an authoritative, signed status
    // or a separately approved provider reconciliation resolves this attempt.
    return 'reconciliation_required';
  }

  await db.tx(async (c) => {
    // Payment confirmation callbacks lock the same installment. This lock
    // serializes a fast signed webhook with the slower debit-create response.
    await c.query(
      'SELECT id FROM fee_installments WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
      [attempt.installment_id, attempt.tenant_id],
    );
    const confirmedPayment = (
      await c.query(
        `SELECT id FROM payment_records
         WHERE tenant_id=$1 AND provider=$2 AND provider_reference=$3
           AND installment_id=$4 AND amount_minor=$5 AND currency=$6
           AND recorded_via='provider'
         LIMIT 1`,
        [
          attempt.tenant_id,
          attempt.provider,
          result.providerReference,
          attempt.installment_id,
          attempt.amount_minor,
          attempt.currency,
        ],
      )
    ).rows[0];

    if (confirmedPayment) {
      // A signed callback can complete before the debit-create HTTP response.
      // Link the original attempt to the proven payment, never downgrade it.
      const reconciled = await c.query(
        `UPDATE autopay_debit_attempts
         SET provider_reference=$2,status='confirmed',completed_at=coalesce(completed_at,now()),
             failure_code=NULL,next_retry_at=NULL,updated_at=now()
         WHERE id=$1 AND status IN('queued','uncertain','submitted','failed')
         RETURNING id`,
        [attempt.id, result.providerReference],
      );
      if (reconciled.rowCount)
        await db.audit(c, 'worker', 'fees.autopay.early_confirmation_reconciled', attempt.id, {
          paymentId: confirmedPayment.id,
          installmentId: attempt.installment_id,
        });
      return;
    }

    if (result.status === 'rejected') {
      const retrySql =
        attempt.attempt_no < maxAttempts ? nextRetry(Number(attempt.attempt_no)) : 'NULL';
      const updated = await c.query(
        `UPDATE autopay_debit_attempts
         SET provider_reference=$2,status='failed',failure_code=$3,
             next_retry_at=${retrySql},updated_at=now()
         WHERE id=$1 AND status IN('queued','uncertain')`,
        [attempt.id, result.providerReference, result.reasonCode || 'PROVIDER_REJECTED'],
      );
      if (!updated.rowCount) return;
      await db.audit(c, 'worker', 'fees.autopay.rejected', attempt.id, {
        installmentId: attempt.installment_id,
        providerReference: result.providerReference,
        attemptNo: Number(attempt.attempt_no),
        reasonCode: result.reasonCode || 'PROVIDER_REJECTED',
      });
      return;
    }

    const updated = await c.query(
      `UPDATE autopay_debit_attempts
       SET provider_reference=$2,status='submitted',failure_code=NULL,next_retry_at=NULL,
           submitted_at=now(),updated_at=now()
       WHERE id=$1 AND status IN('queued','uncertain')`,
      [attempt.id, result.providerReference],
    );
    if (!updated.rowCount) return;
    await db.audit(c, 'worker', 'fees.autopay.submitted', attempt.id, {
      installmentId: attempt.installment_id,
      providerReference: result.providerReference,
      attemptNo: Number(attempt.attempt_no),
      amountMinor: Number(attempt.amount_minor),
    });
  });
  return 'provider_accepted';
}
