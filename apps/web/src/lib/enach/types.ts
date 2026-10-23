/**
 * DODO.FINANCE — Flex / eNACH Sandbox System Models and Type Definitions
 * Strictly isolated for sandbox testing; no real bank money movement.
 */

export type MandateStatus =
  | 'draft'
  | 'pending_authorization'
  | 'authorized'
  | 'active'
  | 'rejected'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type DebitStatus =
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'requires_investigation';

export type ReconciliationStatus =
  | 'matched'
  | 'unmatched'
  | 'partially_matched'
  | 'requires_investigation';

export type AuthMethod =
  | 'NetBanking (Simulated)'
  | 'Debit Card (Simulated)'
  | 'Aadhaar OTP (Simulated)';

export interface SandboxAuthorizationEvent {
  id: string;
  mandate_id: string;
  event_type: 'request_created' | 'payer_opened' | 'authorized' | 'rejected' | 'expired';
  method: AuthMethod;
  status: 'success' | 'rejected' | 'pending';
  bank_name: string;
  ip_address: string;
  user_agent: string;
  timestamp: string;
  details?: string;
}

export interface MandateHistoryItem {
  timestamp: string;
  action: string;
  actor: string;
  previous_status?: MandateStatus;
  new_status: MandateStatus;
  reason?: string;
}

export interface LinkedInstallment {
  id: string;
  sequence: number;
  name: string;
  period_start?: string;
  period_end?: string;
  due_date: string;
  amount_minor: number;
  status: 'pending' | 'paid' | 'overdue' | 'scheduled';
}

export interface SandboxMandate {
  id: string;
  mandate_reference: string;
  tenant_id: string;
  environment: 'sandbox';
  provider: 'sandbox_enach';
  student_id: string;
  student_name: string;
  account_reference: string;
  payer_name: string;
  payer_phone: string;
  payer_email: string;
  bank_name: string;
  masked_account: string;
  ifsc_code: string;
  fee_plan: string;
  max_amount_minor: number;
  frequency: 'monthly' | 'bi-monthly' | 'quarterly' | 'as_presented';
  start_date: string;
  end_date: string;
  status: MandateStatus;
  rail: 'eNACH (Sandbox)';
  auth_mode: AuthMethod;
  created_at: string;
  updated_at: string;
  authorization_events: SandboxAuthorizationEvent[];
  history: MandateHistoryItem[];
  linked_installments: LinkedInstallment[];
}

export interface SandboxDebitAttempt {
  id: string;
  mandate_id: string;
  mandate_reference: string;
  tenant_id: string;
  environment: 'sandbox';
  provider: 'sandbox_enach';
  student_id: string;
  student_name: string;
  account_reference: string;
  payer_name: string;
  payer_phone: string;
  installment_id: string;
  installment_name: string;
  amount_minor: number;
  scheduled_date: string;
  execution_date: string;
  status: DebitStatus;
  attempt_no: number;
  max_retries: number;
  failure_code?: string | null;
  failure_reason?: string | null;
  recovery_status?: 'eligible' | 'ineligible' | 'retry_scheduled' | 'recovered' | 'exhausted' | null;
  next_retry_date?: string | null;
  provider_batch_id: string;
  provider_reference: string;
  reconciled: boolean;
  created_at: string;
}

export interface SandboxReconciliationRecord {
  id: string;
  debit_attempt_id: string;
  mandate_id: string;
  mandate_reference: string;
  student_name: string;
  tenant_id: string;
  environment: 'sandbox';
  expected_amount_minor: number;
  simulated_successful_amount_minor: number;
  variance_minor: number;
  status: ReconciliationStatus;
  exception_reason?: string | null;
  reconciliation_date: string;
  batch_reference: string;
  clearing_cycle: string;
}

export interface SandboxNotification {
  id: string;
  event_type:
    | 'mandate_registered'
    | 'mandate_authorized'
    | 'mandate_rejected'
    | 'upcoming_debit'
    | 'debit_succeeded'
    | 'debit_failed'
    | 'retry_scheduled';
  recipient_name: string;
  recipient_phone: string;
  recipient_email: string;
  channel: 'WhatsApp (Simulated)' | 'SMS (Simulated)' | 'Email (Simulated)';
  title: string;
  message: string;
  status: 'delivered' | 'pending' | 'failed';
  sent_at: string;
  tenant_id: string;
  environment: 'sandbox';
}

export interface SandboxAuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  event_type:
    | 'mandate_created'
    | 'mandate_authorized'
    | 'mandate_rejected'
    | 'mandate_cancelled'
    | 'debit_scheduled'
    | 'debit_executed'
    | 'debit_retried'
    | 'reconciliation_run'
    | 'notification_sent'
    | 'settings_updated';
  entity_type: 'SandboxMandate' | 'SandboxDebitAttempt' | 'SandboxReconciliation' | 'SandboxNotification';
  entity_id: string;
  reference: string;
  action: string;
  details: string;
  tenant_id: string;
  ip_address: string;
}

export interface StudentEnachMapping {
  student_id: string;
  student_name: string;
  student_reference: string;
  group_name: string;
  course: string;
  payer_name: string;
  payer_phone: string;
  payer_email: string;
  fee_plan: string;
  total_fee_minor: number;
  paid_minor: number;
  remaining_minor: number;
  installments_count: number;
  next_due_date?: string;
  mandate_status: MandateStatus | 'not_setup';
  mandate_id?: string;
  mandate_reference?: string;
  max_amount_minor?: number;
  installments?: LinkedInstallment[];
}
