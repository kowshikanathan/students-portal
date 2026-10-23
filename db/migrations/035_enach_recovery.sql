-- Operational follow-up is separate from the authoritative installment ledger.
CREATE TABLE IF NOT EXISTS enach_recovery_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 installment_id uuid NOT NULL REFERENCES fee_installments(id),
 assigned_to uuid REFERENCES users(id),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','following_up','closed')),
 next_followup_on date,
 version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,installment_id)
);
CREATE INDEX IF NOT EXISTS enach_recovery_followup_idx ON enach_recovery_cases(tenant_id,status,next_followup_on);
CREATE TABLE IF NOT EXISTS enach_recovery_actions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 case_id uuid NOT NULL REFERENCES enach_recovery_cases(id),
 idempotency_key uuid NOT NULL,
 payload_hash text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN('open','following_up','closed')),
 note text NOT NULL CHECK(length(note) BETWEEN 3 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);
CREATE OR REPLACE FUNCTION guard_enach_recovery_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='enach_recovery_cases' THEN
   IF NOT EXISTS(SELECT 1 FROM fee_installments WHERE id=NEW.installment_id AND tenant_id=NEW.tenant_id) THEN RAISE EXCEPTION 'Recovery installment outside tenant'; END IF;
   IF NEW.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=NEW.assigned_to AND tenant_id=NEW.tenant_id AND status='active') THEN RAISE EXCEPTION 'Recovery assignee outside tenant'; END IF;
 ELSE
   IF NOT EXISTS(SELECT 1 FROM enach_recovery_cases WHERE id=NEW.case_id AND tenant_id=NEW.tenant_id) THEN RAISE EXCEPTION 'Recovery case outside tenant'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enach_recovery_case_scope BEFORE INSERT OR UPDATE ON enach_recovery_cases FOR EACH ROW EXECUTE FUNCTION guard_enach_recovery_scope();
CREATE TRIGGER enach_recovery_action_scope BEFORE INSERT ON enach_recovery_actions FOR EACH ROW EXECUTE FUNCTION guard_enach_recovery_scope();
CREATE OR REPLACE FUNCTION guard_enach_recovery_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Recovery action history is append-only'; END $$;
CREATE TRIGGER enach_recovery_history_immutable BEFORE UPDATE OR DELETE ON enach_recovery_actions FOR EACH ROW EXECUTE FUNCTION guard_enach_recovery_history();
