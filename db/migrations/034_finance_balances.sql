-- Shared receivable definition. Payment and receipt history is unchanged.
CREATE OR REPLACE VIEW finance_schedule_balances AS
SELECT s.id AS schedule_id, s.tenant_id, s.account_reference, s.status,
  coalesce(sum(i.amount_minor-i.adjustment_amount_minor),0)::bigint AS net_payable_minor,
  coalesce(sum(i.paid_amount_minor),0)::bigint AS paid_minor,
  coalesce(sum(greatest(i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor,0)),0)::bigint AS outstanding_minor,
  coalesce(sum(greatest(i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor,0)) FILTER (WHERE i.due_date<current_date),0)::bigint AS overdue_minor,
  coalesce(sum(greatest(i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor,0)) FILTER (WHERE i.due_date=current_date),0)::bigint AS due_today_minor,
  coalesce(sum(greatest(i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor,0)) FILTER (WHERE i.due_date>current_date AND i.due_date<=current_date+7),0)::bigint AS upcoming_week_minor
FROM fee_schedules s
LEFT JOIN fee_installments i ON i.schedule_id=s.id AND i.tenant_id=s.tenant_id AND i.status<>'cancelled'
WHERE s.status IN ('active','completed')
GROUP BY s.id,s.tenant_id,s.account_reference,s.status;
