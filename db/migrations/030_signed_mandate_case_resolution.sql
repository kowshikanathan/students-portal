-- Resolve investigation queue items only after an authoritative signed mandate event.
-- Keep the append-only evidence/review ledger. Never enable manual bank status overrides.
ALTER TABLE mandate_reconciliation_cases
  DROP CONSTRAINT IF EXISTS mandate_reconciliation_cases_status_check;
ALTER TABLE mandate_reconciliation_cases
  ADD CONSTRAINT mandate_reconciliation_cases_status_check
  CHECK (status IN ('open','resolved_signed'));

ALTER TABLE mandate_reconciliation_cases
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_provider_event_id uuid REFERENCES payment_provider_events(id);

ALTER TABLE mandate_reconciliation_cases
  ADD CONSTRAINT mandate_reconciliation_case_resolution_consistency
  CHECK (
    (status = 'open' AND resolved_at IS NULL AND resolution_provider_event_id IS NULL)
    OR
    (status = 'resolved_signed' AND resolved_at IS NOT NULL
      AND resolution_provider_event_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS mandate_reconciliation_cases_open_idx
  ON mandate_reconciliation_cases(tenant_id,created_at DESC)
  WHERE status='open';
