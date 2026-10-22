-- Phase 2: Enhanced Mandate Management, Bank Metadata & Bulk Uploads
-- Additive columns for payment_mandate_setup_requests
ALTER TABLE payment_mandate_setup_requests ADD COLUMN IF NOT EXISTS auth_method text DEFAULT 'unknown';
ALTER TABLE payment_mandate_setup_requests ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE payment_mandate_setup_requests ADD COLUMN IF NOT EXISTS bank_ifsc text;
ALTER TABLE payment_mandate_setup_requests ADD COLUMN IF NOT EXISTS bank_account_masked text;
ALTER TABLE payment_mandate_setup_requests ADD COLUMN IF NOT EXISTS max_amount_minor bigint;
ALTER TABLE payment_mandate_setup_requests ADD COLUMN IF NOT EXISTS link_delivery_status text DEFAULT 'not_sent';
ALTER TABLE payment_mandate_setup_requests ADD COLUMN IF NOT EXISTS link_sent_at timestamptz;
ALTER TABLE payment_mandate_setup_requests ADD COLUMN IF NOT EXISTS raw_provider_status text;

-- Additive columns for payment_mandates
ALTER TABLE payment_mandates ADD COLUMN IF NOT EXISTS umrn text;
ALTER TABLE payment_mandates ADD COLUMN IF NOT EXISTS auth_method text DEFAULT 'unknown';
ALTER TABLE payment_mandates ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE payment_mandates ADD COLUMN IF NOT EXISTS bank_ifsc text;
ALTER TABLE payment_mandates ADD COLUMN IF NOT EXISTS bank_account_masked text;
ALTER TABLE payment_mandates ADD COLUMN IF NOT EXISTS max_amount_minor bigint;
ALTER TABLE payment_mandates ADD COLUMN IF NOT EXISTS frequency text DEFAULT 'as_presented';
ALTER TABLE payment_mandates ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE payment_mandates ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE payment_mandates ADD COLUMN IF NOT EXISTS raw_provider_status text;

CREATE INDEX IF NOT EXISTS payment_mandates_umrn_idx ON payment_mandates(tenant_id, umrn) WHERE umrn IS NOT NULL;

-- Bulk mandate batch tracking
CREATE TABLE IF NOT EXISTS mandate_bulk_batches(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  filename text NOT NULL,
  row_count integer NOT NULL,
  valid_count integer NOT NULL,
  error_count integer NOT NULL,
  status text NOT NULL CHECK(status IN('validated','committed','failed')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mandate_bulk_rows(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  batch_id uuid NOT NULL REFERENCES mandate_bulk_batches(id),
  row_index integer NOT NULL,
  account_reference text NOT NULL,
  max_amount_minor bigint NOT NULL,
  bank_ifsc text,
  bank_account_masked text,
  auth_method text,
  status text NOT NULL CHECK(status IN('valid','invalid','processed','error')),
  error_message text,
  setup_id uuid REFERENCES payment_mandate_setup_requests(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mandate_bulk_batch_idx ON mandate_bulk_rows(tenant_id, batch_id, row_index);

