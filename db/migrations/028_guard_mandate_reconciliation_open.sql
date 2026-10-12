-- Reject investigation cases for unrelated tenants or already-resolved registrations
-- even when a caller bypasses the HTTP controller.
CREATE OR REPLACE FUNCTION guard_mandate_reconciliation_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM payment_mandate_setup_requests r
    WHERE r.id = NEW.setup_id AND r.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'mandate reconciliation case tenant mismatch';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM payment_mandate_setup_requests r
      WHERE r.id = NEW.setup_id
        AND r.tenant_id = NEW.tenant_id
        AND r.status = 'uncertain'
    ) THEN
      RAISE EXCEPTION 'only uncertain mandate setups can open investigation cases';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = NEW.tenant_id
        AND m.user_id = NEW.created_by
        AND m.status = 'active'
        AND m.role_key = 'owner'
    ) THEN
      RAISE EXCEPTION 'reconciliation case author must be an active tenant owner';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
