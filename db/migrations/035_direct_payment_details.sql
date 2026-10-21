-- Preserve direct payment evidence on the existing ledger; no second ledger.
ALTER TABLE payment_records ADD COLUMN direct_details jsonb NOT NULL DEFAULT '{}';
