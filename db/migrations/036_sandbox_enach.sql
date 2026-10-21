-- Sandbox scenarios remain attached to the existing debit attempt lifecycle.
ALTER TABLE autopay_debit_attempts ADD COLUMN sandbox_outcome text NOT NULL DEFAULT 'successful'
  CHECK(sandbox_outcome IN ('successful','failed','uncertain'));
