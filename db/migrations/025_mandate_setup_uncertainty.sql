-- Treat ambiguous mandate creation responses as pending reconciliation rather than failures.
-- Existing deployments retain the original table, indexes, ownership and history.
ALTER TABLE payment_mandate_setup_requests
  DROP CONSTRAINT IF EXISTS payment_mandate_setup_requests_status_check;
ALTER TABLE payment_mandate_setup_requests
  ADD CONSTRAINT payment_mandate_setup_requests_status_check
  CHECK (status IN ('requested','created','uncertain','active','failed','cancelled','expired'));

CREATE INDEX IF NOT EXISTS mandate_setup_uncertain_reconciliation_idx
  ON payment_mandate_setup_requests(tenant_id,created_at)
  WHERE status='uncertain';
