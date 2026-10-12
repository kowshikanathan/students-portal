-- Prevent duplicate live authorizations even if a writer bypasses the webhook
-- controller or two workers race. A fee schedule may have at most one active
-- mandate across eNACH and UPI AutoPay rails.
--
-- Existing conflicting production data is NEVER deleted or auto-rewritten:
-- migration fails explicitly so financial operations can investigate it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payment_mandates
    WHERE status='active'
    GROUP BY schedule_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'duplicate active mandates exist; reconcile externally before installing active mandate constraint';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS payment_mandates_one_active_per_schedule_idx
  ON payment_mandates(schedule_id) WHERE status='active';
