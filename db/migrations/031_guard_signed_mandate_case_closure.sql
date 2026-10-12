-- Database-enforced, one-way closure of uncertain mandate investigations.
-- Reuse migration 027 case table and migration 030 resolution columns.
-- Only a tenant-matched APPLIED mandate event and corresponding final setup state
-- can close a case; no changes to original case fields or later edits are allowed.
CREATE OR REPLACE FUNCTION guard_mandate_reconciliation_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE authoritative boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' OR NEW.resolved_at IS NOT NULL
      OR NEW.resolution_provider_event_id IS NOT NULL THEN
      RAISE EXCEPTION 'new mandate investigation must remain open';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM payment_mandate_setup_requests r
      WHERE r.id=NEW.setup_id AND r.tenant_id=NEW.tenant_id
        AND r.status='uncertain'
    ) THEN
      RAISE EXCEPTION 'mandate investigation requires a tenant-matched uncertain setup';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id=NEW.tenant_id AND m.user_id=NEW.created_by
        AND m.status='active' AND m.role_key='owner'
    ) THEN
      RAISE EXCEPTION 'mandate investigation requires an active tenant owner';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'open' OR NEW.status <> 'resolved_signed'
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.setup_id IS DISTINCT FROM OLD.setup_id
       OR NEW.provider_case_reference IS DISTINCT FROM OLD.provider_case_reference
       OR NEW.evidence_summary IS DISTINCT FROM OLD.evidence_summary
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.resolved_at IS NULL
       OR NEW.resolution_provider_event_id IS NULL THEN
      RAISE EXCEPTION 'mandate investigation is immutable except signed final resolution';
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM payment_provider_events e
      JOIN payment_mandate_setup_requests r
        ON r.id=NEW.setup_id AND r.tenant_id=NEW.tenant_id
      WHERE e.id=NEW.resolution_provider_event_id
        AND e.tenant_id=NEW.tenant_id
        AND e.provider=r.provider
        AND e.event_type='mandate_status'
        AND e.status='applied'
        AND r.provider_reference=e.normalized_payload->>'providerReference'
        AND r.schedule_id::text=e.normalized_payload->>'scheduleId'
        AND r.rail=e.normalized_payload->>'rail'
        AND (
          (r.status='active' AND e.normalized_payload->>'status'='active')
          OR
          (r.status='failed' AND e.normalized_payload->>'status' IN ('failed','revoked'))
        )
    ) INTO authoritative;
    IF NOT authoritative THEN
      RAISE EXCEPTION 'resolution requires a correlated applied terminal provider event';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'mandate investigation cannot be deleted';
END;
$$;

DROP TRIGGER IF EXISTS mandate_reconciliation_tenant_guard ON mandate_reconciliation_cases;
CREATE TRIGGER mandate_reconciliation_tenant_guard
  BEFORE INSERT OR UPDATE OR DELETE ON mandate_reconciliation_cases
  FOR EACH ROW EXECUTE FUNCTION guard_mandate_reconciliation_tenant();
