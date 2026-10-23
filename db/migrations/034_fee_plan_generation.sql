-- Optional generation identity preserves existing manual drafts and their history.
ALTER TABLE fee_plan_versions ADD COLUMN IF NOT EXISTS generation_key uuid;
ALTER TABLE fee_plan_versions ADD COLUMN IF NOT EXISTS generation_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS fee_plan_generation_key_idx
  ON fee_plan_versions(tenant_id,generation_key) WHERE generation_key IS NOT NULL;
