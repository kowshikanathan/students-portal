import type { PoolClient } from 'pg';
import { Db } from './db';
import { ConflictException } from '@nestjs/common';

/** Caller holds the affected installment locks before checking in-flight collections. */
export async function assertNoProcessingCollections(
  c: PoolClient,
  tenantId: string,
  installmentId: string | null,
  scheduleId: string | null = null,
) {
  const debit = (
    await c.query(
      `SELECT id FROM autopay_debit_attempts WHERE tenant_id=$1 AND (installment_id=$2 OR schedule_id=$3) AND status IN ('submitted','uncertain') LIMIT 1`,
      [tenantId, installmentId, scheduleId],
    )
  ).rows[0];
  const checkout = (
    await c.query(
      `SELECT id FROM payment_checkout_sessions WHERE tenant_id=$1 AND (installment_id=$2 OR schedule_id=$3) AND (status='uncertain' OR (status IN ('requested','created') AND (expires_at IS NULL OR expires_at>now()))) LIMIT 1`,
      [tenantId, installmentId, scheduleId],
    )
  ).rows[0];
  if (debit || checkout)
    throw new ConflictException(
      'A collection is processing or requires reconciliation. Resolve it before changing this balance.',
    );
}

/** Called inside the ledger transaction. Submitted/uncertain attempts are never rewritten. */
export async function syncQueuedDebitBalances(
  c: PoolClient,
  db: Db,
  tenantId: string,
  installmentId: string,
  actor: string,
) {
  const balance = (
    await c.query(
      `SELECT CASE WHEN status IN ('paid','cancelled','adjusted') THEN 0 ELSE greatest(amount_minor-adjustment_amount_minor-paid_amount_minor,0) END::bigint AS remaining_minor FROM fee_installments WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [tenantId, installmentId],
    )
  ).rows[0];
  if (!balance) return;
  const remaining = Number(balance.remaining_minor);
  if (remaining === 0) {
    const recovered = await c.query(
      `UPDATE autopay_debit_attempts SET recovery_status='resolved',recovery_note='Remaining balance cleared by payment or adjustment',updated_at=now() WHERE tenant_id=$1 AND installment_id=$2 AND status='failed' AND recovery_status<>'resolved' RETURNING id`,
      [tenantId, installmentId],
    );
    for (const row of recovered.rows)
      await db.audit(c, actor, 'fees.debit.recovered', row.id, {
        tenantId,
        installmentId,
        reason: 'Remaining balance cleared',
      });
  }
  const queued = (
    await c.query(
      `SELECT id,amount_minor FROM autopay_debit_attempts WHERE tenant_id=$1 AND installment_id=$2 AND status='queued' FOR UPDATE`,
      [tenantId, installmentId],
    )
  ).rows;
  for (const attempt of queued) {
    if (remaining === Number(attempt.amount_minor)) continue;
    await c.query(
      `UPDATE autopay_debit_attempts SET amount_minor=CASE WHEN $2::bigint>0 THEN $2 ELSE amount_minor END,status=CASE WHEN $2::bigint>0 THEN 'queued' ELSE 'cancelled' END,failure_code=CASE WHEN $2::bigint>0 THEN NULL ELSE 'ZERO_REMAINING_BALANCE' END,updated_at=now() WHERE id=$1`,
      [attempt.id, remaining],
    );
    await db.audit(c, actor, 'fees.autopay.balance_adjusted', attempt.id, {
      tenantId,
      installmentId,
      oldAmountMinor: Number(attempt.amount_minor),
      newAmountMinor: remaining,
    });
  }
}
