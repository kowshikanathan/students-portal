-- Preserve ambiguous hosted checkout creation outcomes for independent reconciliation.
-- A timeout or unreadable bank response cannot be treated as proof that no payment
-- session exists. Preserve original financial records; do not purge any rows.
ALTER TABLE payment_checkout_sessions
  DROP CONSTRAINT IF EXISTS payment_checkout_sessions_status_check;
ALTER TABLE payment_checkout_sessions
  ADD CONSTRAINT payment_checkout_sessions_status_check
  CHECK (status IN ('requested','created','uncertain','completed','failed','cancelled','expired'));

-- Expand the existing one-open-checkout guarantee rather than introducing a
-- second checkout pipeline. A pending unknown outcome blocks another payment.
DROP INDEX IF EXISTS payment_checkout_sessions_one_open_installment_idx;
CREATE UNIQUE INDEX payment_checkout_sessions_one_open_installment_idx
  ON payment_checkout_sessions(installment_id)
  WHERE status IN ('requested','created','uncertain');

CREATE INDEX IF NOT EXISTS payment_checkout_uncertain_reconciliation_idx
  ON payment_checkout_sessions(tenant_id,created_at DESC)
  WHERE status='uncertain';
