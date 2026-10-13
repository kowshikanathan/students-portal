-- Tenant-scoped eNACH operational annotations; never amend financial ledger/provider evidence.
-- Field definitions may be created by authorized owner. Values are optional notes
-- attached to existing tenant-owned financial records, not payment instructions.
CREATE TABLE IF NOT EXISTS enach_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text NOT NULL CHECK (length(label) BETWEEN 2 AND 80),
  kind text NOT NULL CHECK (kind IN ('text','number','date','choice')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,key),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS enach_custom_fields_tenant_idx
  ON enach_custom_fields(tenant_id,created_at,id);

CREATE TABLE IF NOT EXISTS enach_custom_values (
  tenant_id uuid NOT NULL,
  field_id uuid NOT NULL,
  record_type text NOT NULL CHECK
    (record_type IN ('mandates','setups','debits','settlements','checkouts')),
  record_id uuid NOT NULL,
  value text NOT NULL CHECK (length(value) <= 160),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,field_id,record_type,record_id),
  FOREIGN KEY (tenant_id,field_id) REFERENCES enach_custom_fields(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS enach_custom_values_records_idx
  ON enach_custom_values(tenant_id,record_type,record_id);
