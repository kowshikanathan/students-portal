CREATE INDEX IF NOT EXISTS academic_students_tenant_name_idx ON academic_students(tenant_id,full_name,id);
CREATE INDEX IF NOT EXISTS academic_students_tenant_reference_idx ON academic_students(tenant_id,student_reference,id);
CREATE INDEX IF NOT EXISTS payment_records_tenant_date_idx ON payment_records(tenant_id,recorded_at DESC,id);
CREATE INDEX IF NOT EXISTS installments_tenant_date_idx ON fee_installments(tenant_id,due_date,id) WHERE status<>'cancelled';
CREATE INDEX IF NOT EXISTS settlements_tenant_date_idx ON settlement_records(tenant_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS debit_attempts_tenant_date_idx ON autopay_debit_attempts(tenant_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS reconciliation_tenant_date_idx ON reconciliation_entries(tenant_id,created_at DESC,id);
