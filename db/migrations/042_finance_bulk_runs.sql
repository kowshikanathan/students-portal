CREATE TABLE finance_bulk_runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  created_by uuid NOT NULL REFERENCES users(id),
  operation text NOT NULL CHECK(operation IN ('assign_plan','update_flex','update_due_date','prepare_enach')),
  status text NOT NULL CHECK(status IN ('validated','invalid','applied','failed')),
  normalized_rows jsonb NOT NULL,
  outcomes jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
  applied_at timestamptz
);
CREATE INDEX finance_bulk_runs_tenant_idx ON finance_bulk_runs(tenant_id,created_at DESC);
