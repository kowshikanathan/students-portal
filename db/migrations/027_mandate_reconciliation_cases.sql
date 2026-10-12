-- eNACH and UPI AutoPay uncertain-registration investigation cases.
-- This is an evidence queue, NOT a mandate-status override or retry authorization.
CREATE TABLE IF NOT EXISTS mandate_reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  setup_id uuid NOT NULL UNIQUE REFERENCES payment_mandate_setup_requests(id),
  provider_case_reference varchar(120) NOT NULL,
  evidence_summary varchar(2000) NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status = 'open'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mandate_reconciliation_cases_tenant_created_idx
  ON mandate_reconciliation_cases(tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION guard_mandate_reconciliation_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM payment_mandate_setup_requests r
    WHERE r.id = NEW.setup_id AND r.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'mandate reconciliation case tenant mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mandate_reconciliation_tenant_guard ON mandate_reconciliation_cases;
CREATE TRIGGER mandate_reconciliation_tenant_guard
  BEFORE INSERT OR UPDATE ON mandate_reconciliation_cases
  FOR EACH ROW EXECUTE FUNCTION guard_mandate_reconciliation_tenant();
