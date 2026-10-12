-- Append-only provider evidence and independent review for uncertain eNACH/UPI AutoPay.
-- An approved review is documentation only; it never activates, fails or unlocks a mandate.
CREATE TABLE IF NOT EXISTS mandate_reconciliation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  case_id uuid NOT NULL REFERENCES mandate_reconciliation_cases(id),
  provider_evidence_reference varchar(120) NOT NULL,
  finding text NOT NULL CHECK (
    finding IN ('provider_inquiry_pending','provider_reports_registered',
                'provider_reports_not_registered','provider_outcome_inconclusive')
  ),
  submitted_by uuid NOT NULL REFERENCES users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, provider_evidence_reference),
  UNIQUE (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS mandate_reconciliation_evidence_case_idx
  ON mandate_reconciliation_evidence (tenant_id, case_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS mandate_reconciliation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  evidence_id uuid NOT NULL UNIQUE REFERENCES mandate_reconciliation_evidence(id),
  decision text NOT NULL CHECK (decision IN ('verified','insufficient_evidence')),
  reviewed_by uuid NOT NULL REFERENCES users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mandate_reconciliation_reviews_tenant_idx
  ON mandate_reconciliation_reviews (tenant_id, reviewed_at DESC);

CREATE OR REPLACE FUNCTION guard_mandate_reconciliation_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'reconciliation evidence is append-only';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM mandate_reconciliation_cases c
    JOIN payment_mandate_setup_requests s
      ON s.id = c.setup_id AND s.tenant_id = c.tenant_id
    WHERE c.id = NEW.case_id AND c.tenant_id = NEW.tenant_id
      AND s.status = 'uncertain'
  ) THEN
    RAISE EXCEPTION 'evidence requires a tenant-matched uncertain mandate';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.tenant_id = NEW.tenant_id AND m.user_id = NEW.submitted_by
      AND m.status = 'active' AND m.role_key = 'owner'
  ) THEN
    RAISE EXCEPTION 'evidence submitter must be an active tenant owner';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_mandate_reconciliation_review() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'reconciliation reviews are append-only';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM mandate_reconciliation_evidence e
    JOIN mandate_reconciliation_cases c ON c.id = e.case_id AND c.tenant_id = e.tenant_id
    JOIN payment_mandate_setup_requests s
      ON s.id = c.setup_id AND s.tenant_id = c.tenant_id
    WHERE e.id = NEW.evidence_id AND e.tenant_id = NEW.tenant_id
      AND e.submitted_by <> NEW.reviewed_by AND s.status = 'uncertain'
  ) THEN
    RAISE EXCEPTION 'review must be independent and tenant-matched to an uncertain mandate';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.tenant_id = NEW.tenant_id AND m.user_id = NEW.reviewed_by
      AND m.status = 'active' AND m.role_key = 'owner'
  ) THEN
    RAISE EXCEPTION 'reviewer must be an active tenant owner';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mandate_reconciliation_evidence_guard
  ON mandate_reconciliation_evidence;
CREATE TRIGGER mandate_reconciliation_evidence_guard
  BEFORE INSERT OR UPDATE OR DELETE ON mandate_reconciliation_evidence
  FOR EACH ROW EXECUTE FUNCTION guard_mandate_reconciliation_evidence();

DROP TRIGGER IF EXISTS mandate_reconciliation_review_guard
  ON mandate_reconciliation_reviews;
CREATE TRIGGER mandate_reconciliation_review_guard
  BEFORE INSERT OR UPDATE OR DELETE ON mandate_reconciliation_reviews
  FOR EACH ROW EXECUTE FUNCTION guard_mandate_reconciliation_review();
