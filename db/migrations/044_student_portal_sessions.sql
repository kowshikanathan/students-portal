-- Revocable parent sessions reuse the existing schedule-bound payer access grants.
CREATE TABLE student_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  student_id uuid NOT NULL REFERENCES academic_students(id),
  schedule_id uuid NOT NULL REFERENCES fee_schedules(id),
  access_token_id uuid NOT NULL REFERENCES payer_access_tokens(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_portal_sessions_access_idx ON student_portal_sessions(access_token_id);
