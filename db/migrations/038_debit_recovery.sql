ALTER TABLE autopay_debit_attempts
  ADD COLUMN recovery_status text NOT NULL DEFAULT 'open' CHECK(recovery_status IN ('open','contacted','resolved')),
  ADD COLUMN recovery_note text NOT NULL DEFAULT '';
