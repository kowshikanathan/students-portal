-- A collection can allocate across installments while retaining the existing ledger.
ALTER TABLE payment_records ADD COLUMN collection_key uuid,ADD COLUMN collection_reference text;
CREATE INDEX payment_collection_group_idx ON payment_records(tenant_id,collection_key) WHERE collection_key IS NOT NULL;
