/**
 * DODO.FINANCE — Flex / eNACH Backend Service & Sandbox Engine
 * Provides realistic NPCI eNACH sandbox state, idempotent debit runs,
 * retry management, isolated reconciliation, notification logs, and audit trails.
 *
 * NOTE: Strictly isolated in Sandbox mode. No real money movement, no bank credentials.
 */

import { NextRequest, NextResponse } from 'next/server';
import type {
  SandboxMandate,
  SandboxDebitAttempt,
  SandboxReconciliationRecord,
  SandboxNotification,
  SandboxAuditEvent,
  StudentEnachMapping,
  LinkedInstallment,
  MandateStatus,
  DebitStatus,
  AuthMethod,
} from './types';
import { CURRENT_PROVIDER_METRICS } from './provider';

// Tenant ID constant
const TENANT_ID = 'tenant-delhi-campus';

// -------------------------------------------------------------
// In-Memory Sandbox Storage (Durable for runtime lifecycle)
// -------------------------------------------------------------

export const SANDBOX_MANDATES: SandboxMandate[] = [
  {
    id: 'mnd-sbx-001',
    mandate_reference: 'UMRN-SBX-2026-9901',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    provider: 'sandbox_enach',
    student_id: 'stu-1',
    student_name: 'Aarav Sharma',
    account_reference: 'DPS-2026-089',
    payer_name: 'Rajesh Sharma',
    payer_phone: '+91 98765 43210',
    payer_email: 'rajesh.sharma@example.com',
    bank_name: 'HDFC Bank',
    masked_account: '•••• 4321',
    ifsc_code: 'HDFC0001234',
    fee_plan: 'Quarterly Tuition & Transport',
    max_amount_minor: 5000000, // ₹50,000 cap
    frequency: 'monthly',
    start_date: '2026-10-01',
    end_date: '2027-04-30',
    status: 'active',
    rail: 'eNACH (Sandbox)',
    auth_mode: 'NetBanking (Simulated)',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:05:00Z',
    authorization_events: [
      {
        id: 'auth-ev-1',
        mandate_id: 'mnd-sbx-001',
        event_type: 'request_created',
        method: 'NetBanking (Simulated)',
        status: 'pending',
        bank_name: 'HDFC Bank',
        ip_address: '103.21.144.12',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        timestamp: '2026-10-01T10:00:15Z',
        details: 'Mandate registration link generated and sent to payer',
      },
      {
        id: 'auth-ev-2',
        mandate_id: 'mnd-sbx-001',
        event_type: 'authorized',
        method: 'NetBanking (Simulated)',
        status: 'success',
        bank_name: 'HDFC Bank',
        ip_address: '103.21.144.12',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        timestamp: '2026-10-01T10:04:42Z',
        details: 'Simulated approval confirmed with HDFC Corporate NetBanking gateway',
      },
    ],
    history: [
      {
        timestamp: '2026-10-01T10:00:00Z',
        action: 'Mandate Created',
        actor: 'rakeshanimator143@gmail.com (Institution Owner)',
        new_status: 'pending_authorization',
        reason: 'One-click initiation for student Aarav Sharma',
      },
      {
        timestamp: '2026-10-01T10:04:42Z',
        action: 'Mandate Authorized',
        actor: 'Payer: Rajesh Sharma (via NetBanking Simulator)',
        previous_status: 'pending_authorization',
        new_status: 'active',
        reason: 'Payer approved eNACH debit cap ₹50,000/mo',
      },
    ],
    linked_installments: [
      {
        id: 'inst-1',
        sequence: 1,
        name: 'Quarter 1 Tuition Fee',
        period_start: '2026-07-01',
        period_end: '2026-09-30',
        due_date: '2026-07-10',
        amount_minor: 2500000,
        status: 'paid',
      },
      {
        id: 'inst-2',
        sequence: 2,
        name: 'Quarter 2 Tuition Fee',
        period_start: '2026-10-01',
        period_end: '2026-12-31',
        due_date: '2026-10-25',
        amount_minor: 2500000,
        status: 'scheduled',
      },
      {
        id: 'inst-3',
        sequence: 3,
        name: 'Quarter 3 Tuition Fee',
        period_start: '2027-01-01',
        period_end: '2027-03-31',
        due_date: '2027-01-15',
        amount_minor: 2500000,
        status: 'pending',
      },
    ],
  },
  {
    id: 'mnd-sbx-002',
    mandate_reference: 'UMRN-SBX-2026-8812',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    provider: 'sandbox_enach',
    student_id: 'stu-2',
    student_name: 'Diya Patel',
    account_reference: 'DPS-2026-104',
    payer_name: 'Ananya Patel',
    payer_phone: '+91 98220 11984',
    payer_email: 'ananya.patel@example.com',
    bank_name: 'ICICI Bank',
    masked_account: '•••• 8823',
    ifsc_code: 'ICIC0000941',
    fee_plan: 'Senior Secondary Annual Instalments',
    max_amount_minor: 4000000,
    frequency: 'monthly',
    start_date: '2026-10-03',
    end_date: '2027-03-31',
    status: 'active',
    rail: 'eNACH (Sandbox)',
    auth_mode: 'Debit Card (Simulated)',
    created_at: '2026-10-03T11:30:00Z',
    updated_at: '2026-10-03T11:35:00Z',
    authorization_events: [
      {
        id: 'auth-ev-3',
        mandate_id: 'mnd-sbx-002',
        event_type: 'authorized',
        method: 'Debit Card (Simulated)',
        status: 'success',
        bank_name: 'ICICI Bank',
        ip_address: '49.37.112.98',
        user_agent: 'Mobile Safari/604.1',
        timestamp: '2026-10-03T11:34:10Z',
        details: 'Simulated 3DS card authorization successful',
      },
    ],
    history: [
      {
        timestamp: '2026-10-03T11:30:00Z',
        action: 'Mandate Created',
        actor: 'rakeshanimator143@gmail.com',
        new_status: 'pending_authorization',
      },
      {
        timestamp: '2026-10-03T11:34:10Z',
        action: 'Mandate Authorized',
        actor: 'Payer: Ananya Patel',
        previous_status: 'pending_authorization',
        new_status: 'active',
      },
    ],
    linked_installments: [
      {
        id: 'inst-101',
        sequence: 1,
        name: 'Term 1 Fee',
        period_start: '2026-07-01',
        period_end: '2026-10-15',
        due_date: '2026-07-15',
        amount_minor: 1800000,
        status: 'paid',
      },
      {
        id: 'inst-102',
        sequence: 2,
        name: 'Term 2 Fee',
        period_start: '2026-10-16',
        period_end: '2027-01-15',
        due_date: '2026-10-28',
        amount_minor: 1800000,
        status: 'scheduled',
      },
    ],
  },
  {
    id: 'mnd-sbx-003',
    mandate_reference: 'UMRN-SBX-2026-7729',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    provider: 'sandbox_enach',
    student_id: 'stu-3',
    student_name: 'Vikram Mehta',
    account_reference: 'DPS-2026-141',
    payer_name: 'Vikram Mehta',
    payer_phone: '+91 97110 55432',
    payer_email: 'vikram.mehta@example.com',
    bank_name: 'State Bank of India',
    masked_account: '•••• 1209',
    ifsc_code: 'SBIN0004012',
    fee_plan: 'Science Stream Bi-Monthly',
    max_amount_minor: 6000000,
    frequency: 'monthly',
    start_date: '2026-10-18',
    end_date: '2027-05-31',
    status: 'active',
    rail: 'eNACH (Sandbox)',
    auth_mode: 'Aadhaar OTP (Simulated)',
    created_at: '2026-10-18T14:20:00Z',
    updated_at: '2026-10-18T14:20:00Z',
    authorization_events: [
      {
        id: 'auth-ev-4',
        mandate_id: 'mnd-sbx-003',
        event_type: 'request_created',
        method: 'Aadhaar OTP (Simulated)',
        status: 'pending',
        bank_name: 'State Bank of India',
        ip_address: '157.34.88.201',
        user_agent: 'Chrome/124.0.0.0',
        timestamp: '2026-10-18T14:20:05Z',
        details: 'Awaiting simulated Aadhaar OTP verification from parent',
      },
    ],
    history: [
      {
        timestamp: '2026-10-18T14:20:00Z',
        action: 'Mandate Created',
        actor: 'rakeshanimator143@gmail.com',
        new_status: 'pending_authorization',
      },
    ],
    linked_installments: [
      {
        id: 'inst-201',
        sequence: 1,
        name: 'Instalment #1',
        period_start: '2026-10-18',
        period_end: '2026-12-31',
        due_date: '2026-10-30',
        amount_minor: 3200000,
        status: 'pending',
      },
    ],
  },
  {
    id: 'mnd-sbx-004',
    mandate_reference: 'UMRN-SBX-2026-4401',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    provider: 'sandbox_enach',
    student_id: 'stu-4-demo',
    student_name: 'Kabir Das',
    account_reference: 'DPS-2026-202',
    payer_name: 'Sanjay Das',
    payer_phone: '+91 99887 66554',
    payer_email: 'sanjay.das@example.com',
    bank_name: 'Axis Bank',
    masked_account: '•••• 9940',
    ifsc_code: 'UTIB0000211',
    fee_plan: 'Standard Secondary Plan',
    max_amount_minor: 4500000,
    frequency: 'quarterly',
    start_date: '2026-10-20',
    end_date: '2027-04-30',
    status: 'draft',
    rail: 'eNACH (Sandbox)',
    auth_mode: 'NetBanking (Simulated)',
    created_at: '2026-10-20T09:15:00Z',
    updated_at: '2026-10-20T09:15:00Z',
    authorization_events: [],
    history: [
      {
        timestamp: '2026-10-20T09:15:00Z',
        action: 'Draft Created',
        actor: 'rakeshanimator143@gmail.com',
        new_status: 'draft',
      },
    ],
    linked_installments: [],
  },
  {
    id: 'mnd-sbx-005',
    mandate_reference: 'UMRN-SBX-2026-3392',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    provider: 'sandbox_enach',
    student_id: 'stu-5',
    student_name: 'Ananya Joshi',
    account_reference: 'DPS-2026-305',
    payer_name: 'Meera Joshi',
    payer_phone: '+91 98112 33445',
    payer_email: 'meera.joshi@example.com',
    bank_name: 'Kotak Mahindra Bank',
    masked_account: '•••• 7712',
    ifsc_code: 'KKBK0000188',
    fee_plan: 'Primary Montessori Plan',
    max_amount_minor: 3500000,
    frequency: 'monthly',
    start_date: '2026-09-01',
    end_date: '2027-03-31',
    status: 'rejected',
    rail: 'eNACH (Sandbox)',
    auth_mode: 'NetBanking (Simulated)',
    created_at: '2026-09-05T14:10:00Z',
    updated_at: '2026-09-05T14:15:00Z',
    authorization_events: [
      {
        id: 'auth-ev-5',
        mandate_id: 'mnd-sbx-005',
        event_type: 'rejected',
        method: 'NetBanking (Simulated)',
        status: 'rejected',
        bank_name: 'Kotak Mahindra Bank',
        ip_address: '115.99.231.10',
        user_agent: 'Chrome/120.0',
        timestamp: '2026-09-05T14:15:00Z',
        details: 'Simulated decline by payer at authorization gateway',
      },
    ],
    history: [
      {
        timestamp: '2026-09-05T14:10:00Z',
        action: 'Mandate Created',
        actor: 'rakeshanimator143@gmail.com',
        new_status: 'pending_authorization',
      },
      {
        timestamp: '2026-09-05T14:15:00Z',
        action: 'Mandate Rejected',
        actor: 'Payer: Meera Joshi',
        previous_status: 'pending_authorization',
        new_status: 'rejected',
        reason: 'Payer rejected mandate cap during NetBanking simulation',
      },
    ],
    linked_installments: [],
  },
  {
    id: 'mnd-sbx-006',
    mandate_reference: 'UMRN-SBX-2026-1184',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    provider: 'sandbox_enach',
    student_id: 'stu-6',
    student_name: 'Rohan Verma',
    account_reference: 'DPS-2026-411',
    payer_name: 'Amit Verma',
    payer_phone: '+91 97123 44556',
    payer_email: 'amit.verma@example.com',
    bank_name: 'Punjab National Bank',
    masked_account: '•••• 5521',
    ifsc_code: 'PUNB0002100',
    fee_plan: 'Quarterly Middle School',
    max_amount_minor: 4000000,
    frequency: 'monthly',
    start_date: '2026-08-01',
    end_date: '2027-03-31',
    status: 'cancelled',
    rail: 'eNACH (Sandbox)',
    auth_mode: 'Debit Card (Simulated)',
    created_at: '2026-08-10T10:00:00Z',
    updated_at: '2026-10-10T12:00:00Z',
    authorization_events: [],
    history: [
      {
        timestamp: '2026-08-10T10:00:00Z',
        action: 'Mandate Created',
        actor: 'rakeshanimator143@gmail.com',
        new_status: 'active',
      },
      {
        timestamp: '2026-10-10T12:00:00Z',
        action: 'Mandate Cancelled',
        actor: 'rakeshanimator143@gmail.com (Staff)',
        previous_status: 'active',
        new_status: 'cancelled',
        reason: 'Student opted for upfront direct settlement',
      },
    ],
    linked_installments: [],
  },
];

export const SANDBOX_DEBIT_ATTEMPTS: SandboxDebitAttempt[] = [
  {
    id: 'deb-sbx-001',
    mandate_id: 'mnd-sbx-001',
    mandate_reference: 'UMRN-SBX-2026-9901',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    provider: 'sandbox_enach',
    student_id: 'stu-1',
    student_name: 'Aarav Sharma',
    account_reference: 'DPS-2026-089',
    payer_name: 'Rajesh Sharma',
    payer_phone: '+91 98765 43210',
    installment_id: 'inst-1',
    installment_name: 'Quarter 1 Tuition Fee',
    amount_minor: 2500000,
    scheduled_date: '2026-10-15',
    execution_date: '2026-10-15T09:00:00Z',
    status: 'succeeded',
    attempt_no: 1,
    max_retries: 3,
    provider_batch_id: 'BATCH-NPCI-20261015-01',
    provider_reference: 'DEB-SBX-2026-10-001',
    reconciled: true,
    created_at: '2026-10-15T09:00:00Z',
  },
  {
    id: 'deb-sbx-002',
    mandate_id: 'mnd-sbx-002',
    mandate_reference: 'UMRN-SBX-2026-8812',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    provider: 'sandbox_enach',
    student_id: 'stu-2',
    student_name: 'Diya Patel',
    account_reference: 'DPS-2026-104',
    payer_name: 'Ananya Patel',
    payer_phone: '+91 98220 11984',
    installment_id: 'inst-101',
    installment_name: 'Term 1 Fee',
    amount_minor: 1800000,
    scheduled_date: '2026-10-15',
    execution_date: '2026-10-15T09:00:00Z',
    status: 'succeeded',
    attempt_no: 1,
    max_retries: 3,
    provider_batch_id: 'BATCH-NPCI-20261015-01',
    provider_reference: 'DEB-SBX-2026-10-002',
    reconciled: true,
    created_at: '2026-10-15T09:00:00Z',
  },
  {
    id: 'deb-sbx-003',
    mandate_id: 'mnd-sbx-003',
    mandate_reference: 'UMRN-SBX-2026-7729',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    provider: 'sandbox_enach',
    student_id: 'stu-3',
    student_name: 'Vikram Mehta',
    account_reference: 'DPS-2026-141',
    payer_name: 'Vikram Mehta',
    payer_phone: '+91 97110 55432',
    installment_id: 'inst-201',
    installment_name: 'Instalment #1',
    amount_minor: 3200000,
    scheduled_date: '2026-10-16',
    execution_date: '2026-10-16T09:00:00Z',
    status: 'failed',
    attempt_no: 1,
    max_retries: 3,
    failure_code: 'NPCI-05',
    failure_reason: 'Insufficient funds in payer bank account (Simulated NPCI-05)',
    recovery_status: 'retry_scheduled',
    next_retry_date: '2026-10-24',
    provider_batch_id: 'BATCH-NPCI-20261016-02',
    provider_reference: 'DEB-SBX-2026-10-003',
    reconciled: false,
    created_at: '2026-10-16T09:00:00Z',
  },
  {
    id: 'deb-sbx-004',
    mandate_id: 'mnd-sbx-005',
    mandate_reference: 'UMRN-SBX-2026-3392',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    provider: 'sandbox_enach',
    student_id: 'stu-5',
    student_name: 'Ananya Joshi',
    account_reference: 'DPS-2026-305',
    payer_name: 'Meera Joshi',
    payer_phone: '+91 98112 33445',
    installment_id: 'inst-301',
    installment_name: 'Montessori Term 1',
    amount_minor: 2200000,
    scheduled_date: '2026-10-18',
    execution_date: '2026-10-18T09:00:00Z',
    status: 'failed',
    attempt_no: 1,
    max_retries: 3,
    failure_code: 'NPCI-51',
    failure_reason: 'Mandate expired / rejected prior to debit presentation (Simulated NPCI-51)',
    recovery_status: 'ineligible',
    next_retry_date: null,
    provider_batch_id: 'BATCH-NPCI-20261018-01',
    provider_reference: 'DEB-SBX-2026-10-004',
    reconciled: false,
    created_at: '2026-10-18T09:00:00Z',
  },
  {
    id: 'deb-sbx-005',
    mandate_id: 'mnd-sbx-001',
    mandate_reference: 'UMRN-SBX-2026-9901',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    provider: 'sandbox_enach',
    student_id: 'stu-1',
    student_name: 'Aarav Sharma',
    account_reference: 'DPS-2026-089',
    payer_name: 'Rajesh Sharma',
    payer_phone: '+91 98765 43210',
    installment_id: 'inst-2',
    installment_name: 'Quarter 2 Tuition Fee',
    amount_minor: 2500000,
    scheduled_date: '2026-10-25',
    execution_date: '2026-10-25T09:00:00Z',
    status: 'queued',
    attempt_no: 0,
    max_retries: 3,
    provider_batch_id: 'BATCH-SCHEDULED-OCT25',
    provider_reference: 'DEB-SBX-PENDING-005',
    reconciled: false,
    created_at: '2026-10-20T10:00:00Z',
  },
  {
    id: 'deb-sbx-006',
    mandate_id: 'mnd-sbx-002',
    mandate_reference: 'UMRN-SBX-2026-8812',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    provider: 'sandbox_enach',
    student_id: 'stu-2',
    student_name: 'Diya Patel',
    account_reference: 'DPS-2026-104',
    payer_name: 'Ananya Patel',
    payer_phone: '+91 98220 11984',
    installment_id: 'inst-102',
    installment_name: 'Term 2 Fee',
    amount_minor: 1800000,
    scheduled_date: '2026-10-28',
    execution_date: '2026-10-28T09:00:00Z',
    status: 'queued',
    attempt_no: 0,
    max_retries: 3,
    provider_batch_id: 'BATCH-SCHEDULED-OCT28',
    provider_reference: 'DEB-SBX-PENDING-006',
    reconciled: false,
    created_at: '2026-10-20T10:00:00Z',
  },
];

export const SANDBOX_RECONCILIATION_RECORDS: SandboxReconciliationRecord[] = [
  {
    id: 'rec-sbx-001',
    debit_attempt_id: 'deb-sbx-001',
    mandate_id: 'mnd-sbx-001',
    mandate_reference: 'UMRN-SBX-2026-9901',
    student_name: 'Aarav Sharma',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    expected_amount_minor: 2500000,
    simulated_successful_amount_minor: 2500000,
    variance_minor: 0,
    status: 'matched',
    reconciliation_date: '2026-10-16T11:00:00Z',
    batch_reference: 'REC-BATCH-20261016',
    clearing_cycle: 'NPCI Daily Settlement Cycle 1',
  },
  {
    id: 'rec-sbx-002',
    debit_attempt_id: 'deb-sbx-002',
    mandate_id: 'mnd-sbx-002',
    mandate_reference: 'UMRN-SBX-2026-8812',
    student_name: 'Diya Patel',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    expected_amount_minor: 1800000,
    simulated_successful_amount_minor: 1800000,
    variance_minor: 0,
    status: 'matched',
    reconciliation_date: '2026-10-16T11:00:00Z',
    batch_reference: 'REC-BATCH-20261016',
    clearing_cycle: 'NPCI Daily Settlement Cycle 1',
  },
  {
    id: 'rec-sbx-003',
    debit_attempt_id: 'deb-sbx-003',
    mandate_id: 'mnd-sbx-003',
    mandate_reference: 'UMRN-SBX-2026-7729',
    student_name: 'Vikram Mehta',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    expected_amount_minor: 3200000,
    simulated_successful_amount_minor: 0,
    variance_minor: 3200000,
    status: 'unmatched',
    exception_reason: 'Debit returned unpaid: Insufficient funds (NPCI-05)',
    reconciliation_date: '2026-10-17T11:00:00Z',
    batch_reference: 'REC-BATCH-20261017',
    clearing_cycle: 'NPCI Daily Settlement Cycle 2',
  },
  {
    id: 'rec-sbx-004',
    debit_attempt_id: 'deb-sbx-004',
    mandate_id: 'mnd-sbx-005',
    mandate_reference: 'UMRN-SBX-2026-3392',
    student_name: 'Ananya Joshi',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
    expected_amount_minor: 2200000,
    simulated_successful_amount_minor: 0,
    variance_minor: 2200000,
    status: 'requires_investigation',
    exception_reason: 'Presentation rejected due to mandate expiry (NPCI-51)',
    reconciliation_date: '2026-10-19T11:00:00Z',
    batch_reference: 'REC-BATCH-20261019',
    clearing_cycle: 'NPCI Daily Settlement Cycle 1',
  },
];

export const SANDBOX_NOTIFICATIONS: SandboxNotification[] = [
  {
    id: 'notif-sbx-001',
    event_type: 'mandate_registered',
    recipient_name: 'Rajesh Sharma',
    recipient_phone: '+91 98765 43210',
    recipient_email: 'rajesh.sharma@example.com',
    channel: 'WhatsApp (Simulated)',
    title: 'eNACH Mandate Setup Initiated',
    message:
      'Dear Rajesh Sharma, Delhi Public School has initiated eNACH auto-debit registration for Aarav Sharma (DPS-2026-089) with monthly cap of ₹50,000.',
    status: 'delivered',
    sent_at: '2026-10-01T10:01:00Z',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
  },
  {
    id: 'notif-sbx-002',
    event_type: 'mandate_authorized',
    recipient_name: 'Rajesh Sharma',
    recipient_phone: '+91 98765 43210',
    recipient_email: 'rajesh.sharma@example.com',
    channel: 'WhatsApp (Simulated)',
    title: 'eNACH Mandate Successfully Activated',
    message:
      'Confirmation: Your eNACH mandate UMRN-SBX-2026-9901 is now ACTIVE. Scheduled instalments will be debited automatically with prior reminder.',
    status: 'delivered',
    sent_at: '2026-10-01T10:05:00Z',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
  },
  {
    id: 'notif-sbx-003',
    event_type: 'upcoming_debit',
    recipient_name: 'Rajesh Sharma',
    recipient_phone: '+91 98765 43210',
    recipient_email: 'rajesh.sharma@example.com',
    channel: 'SMS (Simulated)',
    title: 'Upcoming Fee Auto-Debit Reminder',
    message:
      'Reminder: Scheduled eNACH auto-debit of ₹25,000 for Aarav Sharma will be presented to HDFC Bank on 25-Oct-2026. Please ensure sufficient balance.',
    status: 'delivered',
    sent_at: '2026-10-23T09:00:00Z',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
  },
  {
    id: 'notif-sbx-004',
    event_type: 'debit_succeeded',
    recipient_name: 'Rajesh Sharma',
    recipient_phone: '+91 98765 43210',
    recipient_email: 'rajesh.sharma@example.com',
    channel: 'WhatsApp (Simulated)',
    title: 'Fee Payment Received via eNACH',
    message:
      'Receipt: ₹25,000 collected successfully for Quarter 1 Tuition Fee via eNACH Auto-debit. Transaction reference: DEB-SBX-2026-10-001.',
    status: 'delivered',
    sent_at: '2026-10-15T09:05:00Z',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
  },
  {
    id: 'notif-sbx-005',
    event_type: 'debit_failed',
    recipient_name: 'Vikram Mehta',
    recipient_phone: '+91 97110 55432',
    recipient_email: 'vikram.mehta@example.com',
    channel: 'WhatsApp (Simulated)',
    title: 'Urgent: eNACH Debit Unsuccessful',
    message:
      'Alert: Scheduled auto-debit of ₹32,000 for Vikram Mehta could not be cleared due to insufficient funds (NPCI-05). Re-presentment scheduled for 24-Oct-2026.',
    status: 'delivered',
    sent_at: '2026-10-16T09:30:00Z',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
  },
  {
    id: 'notif-sbx-006',
    event_type: 'retry_scheduled',
    recipient_name: 'Vikram Mehta',
    recipient_phone: '+91 97110 55432',
    recipient_email: 'vikram.mehta@example.com',
    channel: 'SMS (Simulated)',
    title: 'eNACH Retry Scheduled',
    message:
      'Your institution has scheduled auto-debit re-attempt (2/3) for fee balance ₹32,000 on 24-Oct-2026. Contact accounts if you need assistance.',
    status: 'delivered',
    sent_at: '2026-10-17T10:00:00Z',
    tenant_id: TENANT_ID,
    environment: 'sandbox',
  },
];

export const SANDBOX_AUDIT_LOGS: SandboxAuditEvent[] = [
  {
    id: 'aud-sbx-001',
    timestamp: '2026-10-01T10:00:00Z',
    actor: 'rakeshanimator143@gmail.com (Institution Owner)',
    event_type: 'mandate_created',
    entity_type: 'SandboxMandate',
    entity_id: 'mnd-sbx-001',
    reference: 'UMRN-SBX-2026-9901',
    action: 'Created Sandbox Mandate Registration',
    details: 'Initiated mandate request for Aarav Sharma (DPS-2026-089) with monthly cap ₹50,000',
    tenant_id: TENANT_ID,
    ip_address: '192.168.1.104 (Campus Local)',
  },
  {
    id: 'aud-sbx-002',
    timestamp: '2026-10-01T10:04:42Z',
    actor: 'Payer: Rajesh Sharma (NetBanking Simulator)',
    event_type: 'mandate_authorized',
    entity_type: 'SandboxMandate',
    entity_id: 'mnd-sbx-001',
    reference: 'UMRN-SBX-2026-9901',
    action: 'Simulated Payer Authorization Confirmed',
    details: 'Mandate transition from pending_authorization to active via HDFC NetBanking',
    tenant_id: TENANT_ID,
    ip_address: '103.21.144.12 (Payer Gateway)',
  },
  {
    id: 'aud-sbx-003',
    timestamp: '2026-10-15T09:00:00Z',
    actor: 'SYSTEM_AUTOPAY_SCHEDULER',
    event_type: 'debit_executed',
    entity_type: 'SandboxDebitAttempt',
    entity_id: 'deb-sbx-001',
    reference: 'DEB-SBX-2026-10-001',
    action: 'Scheduled Debit Batch Presentation',
    details: 'Presented ₹25,000 to clearing rail for student Aarav Sharma; cleared successfully',
    tenant_id: TENANT_ID,
    ip_address: '127.0.0.1 (Scheduler)',
  },
  {
    id: 'aud-sbx-004',
    timestamp: '2026-10-16T09:00:00Z',
    actor: 'SYSTEM_AUTOPAY_SCHEDULER',
    event_type: 'debit_executed',
    entity_type: 'SandboxDebitAttempt',
    entity_id: 'deb-sbx-003',
    reference: 'DEB-SBX-2026-10-003',
    action: 'Debit Presentation Return / Failure',
    details: 'Debit attempt 1 failed with NPCI-05 (Insufficient funds). Auto-retry scheduled.',
    tenant_id: TENANT_ID,
    ip_address: '127.0.0.1 (Scheduler)',
  },
  {
    id: 'aud-sbx-005',
    timestamp: '2026-10-17T11:00:00Z',
    actor: 'SYSTEM_RECONCILIATION_CRON',
    event_type: 'reconciliation_run',
    entity_type: 'SandboxReconciliation',
    entity_id: 'rec-sbx-003',
    reference: 'REC-BATCH-20261017',
    action: 'Reconciliation Exception Logged',
    details: 'Flagged ₹32,000 unpaid debit exception into isolated sandbox ledger',
    tenant_id: TENANT_ID,
    ip_address: '127.0.0.1 (Reconciliation)',
  },
];

// -------------------------------------------------------------
// Helper: Student eNACH Mapping Generator
// -------------------------------------------------------------

export function buildStudentInstallments(
  studentId: string,
  totalMinor: number,
  paidMinor: number,
  count: number = 4,
  mandate?: SandboxMandate
): LinkedInstallment[] {
  if (mandate && Array.isArray(mandate.linked_installments) && mandate.linked_installments.length > 0) {
    return mandate.linked_installments.map((inst, idx) => ({
      ...inst,
      period_start: inst.period_start || (idx === 0 ? '2026-07-01' : idx === 1 ? '2026-10-01' : idx === 2 ? '2027-01-01' : '2027-04-01'),
      period_end: inst.period_end || (idx === 0 ? '2026-09-30' : idx === 1 ? '2026-12-31' : idx === 2 ? '2027-03-31' : '2027-06-30'),
    }));
  }

  const quarters = [
    { name: 'Instalment #1: Term 1 Tuition Fee', start: '2026-07-01', end: '2026-09-30', due: '2026-07-10' },
    { name: 'Instalment #2: Term 2 Tuition Fee', start: '2026-10-01', end: '2026-12-31', due: '2026-10-25' },
    { name: 'Instalment #3: Term 3 Tuition Fee', start: '2027-01-01', end: '2027-03-31', due: '2027-01-15' },
    { name: 'Instalment #4: Term 4 Final Term Fee', start: '2027-04-01', end: '2027-06-30', due: '2027-04-15' },
  ];

  const n = Math.max(1, Math.min(count, 4));
  const perInstMinor = Math.round(totalMinor / n);
  let accumulatedPaid = paidMinor;

  return quarters.slice(0, n).map((q, idx) => {
    let status: 'paid' | 'scheduled' | 'pending' = 'pending';
    if (accumulatedPaid >= perInstMinor) {
      status = 'paid';
      accumulatedPaid -= perInstMinor;
    } else if (idx === 0 || (idx === 1 && accumulatedPaid > 0)) {
      status = 'scheduled';
    }

    return {
      id: `inst-${studentId}-${idx + 1}`,
      sequence: idx + 1,
      name: q.name,
      period_start: q.start,
      period_end: q.end,
      due_date: q.due,
      amount_minor: perInstMinor,
      status,
    };
  });
}

export function getStudentEnachMappings(allStudents?: any[]): StudentEnachMapping[] {
  const baseDemoStudents = [
    {
      id: 'stu-1',
      name: 'Aarav Sharma',
      ref: 'DPS-2026-089',
      group: 'Grade 10-A',
      course: 'CBSE Secondary',
      payer: 'Rajesh Sharma',
      phone: '+91 98765 43210',
      email: 'rajesh.sharma@example.com',
      plan: 'Quarterly Tuition & Transport',
      total_minor: 10000000,
      paid_minor: 2500000,
      remaining_minor: 7500000,
      installments: 4,
      next_due: '2026-10-25',
    },
    {
      id: 'stu-2',
      name: 'Diya Patel',
      ref: 'DPS-2026-104',
      group: 'Grade 12-B',
      course: 'Commerce Stream',
      payer: 'Ananya Patel',
      phone: '+91 98220 11984',
      email: 'ananya.patel@example.com',
      plan: 'Senior Secondary Annual',
      total_minor: 7200000,
      paid_minor: 1800000,
      remaining_minor: 5400000,
      installments: 4,
      next_due: '2026-10-28',
    },
    {
      id: 'stu-3',
      name: 'Rohan Mehta',
      ref: 'DPS-2026-141',
      group: 'Grade 11-A',
      course: 'Science Stream',
      payer: 'Vikram Mehta',
      phone: '+91 97110 55432',
      email: 'vikram.mehta@example.com',
      plan: 'Science Stream Bi-Monthly',
      total_minor: 9600000,
      paid_minor: 0,
      remaining_minor: 9600000,
      installments: 3,
      next_due: '2026-10-30',
    },
    {
      id: 'stu-4-demo',
      name: 'Kabir Das',
      ref: 'DPS-2026-202',
      group: 'Grade 9-C',
      course: 'CBSE Secondary',
      payer: 'Sanjay Das',
      phone: '+91 99887 66554',
      email: 'sanjay.das@example.com',
      plan: 'Standard Secondary Plan',
      total_minor: 9000000,
      paid_minor: 0,
      remaining_minor: 9000000,
      installments: 3,
      next_due: '2026-11-05',
    },
    {
      id: 'stu-5',
      name: 'Ananya Joshi',
      ref: 'DPS-2026-305',
      group: 'Grade 3-A',
      course: 'Primary School',
      payer: 'Meera Joshi',
      phone: '+91 98112 33445',
      email: 'meera.joshi@example.com',
      plan: 'Primary Montessori Plan',
      total_minor: 6600000,
      paid_minor: 0,
      remaining_minor: 6600000,
      installments: 3,
      next_due: '2026-11-10',
    },
    {
      id: 'stu-6',
      name: 'Rohan Verma',
      ref: 'DPS-2026-411',
      group: 'Grade 7-B',
      course: 'Middle School',
      payer: 'Amit Verma',
      phone: '+91 97123 44556',
      email: 'amit.verma@example.com',
      plan: 'Quarterly Middle School',
      total_minor: 8000000,
      paid_minor: 2000000,
      remaining_minor: 6000000,
      installments: 4,
      next_due: '2026-11-15',
    },
    {
      id: 'stu-7',
      name: 'Riya Sen',
      ref: 'DPS-2026-522',
      group: 'Grade 8-A',
      course: 'Middle School',
      payer: 'Debashish Sen',
      phone: '+91 98301 22334',
      email: 'debashish.sen@example.com',
      plan: 'Middle School Standard',
      total_minor: 8500000,
      paid_minor: 0,
      remaining_minor: 8500000,
      installments: 3,
      next_due: '2026-11-20',
    },
  ];

  const mergedList: StudentEnachMapping[] = [];
  const seenIds = new Set<string>();
  const seenRefs = new Set<string>();
  const seenNames = new Set<string>();

  // 1. Process active students from DEMO_STUDENTS first (includes newly created students like V Rakesh)
  if (Array.isArray(allStudents) && allStudents.length > 0) {
    for (const s of allStudents) {
      const studentId = String(s.id || s.student_id);
      const studentName = String(s.full_name || s.fullName || s.student_name || 'Student');
      const studentRef = String(s.student_reference || s.studentReference || s.account_reference || s.enrollment_number || 'DPS-2026');
      const groupName = String(s.group_name || s.groupName || (s.grade ? `Grade ${s.grade}` : 'Grade 10-A'));
      const course = String(s.course || 'CBSE Secondary');
      const payerName = String(s.guardian_name || s.guardianName || s.payer_name || `${studentName} Guardian`);
      const payerPhone = String(s.guardian_phone || s.guardianPhone || s.payer_phone || '+91 98765 43210');
      const payerEmail = String(s.guardian_email || s.guardianEmail || s.payer_email || 'guardian@example.com');
      const feePlan = String(s.fee_plan || 'Academic Standard Plan');
      const totalMinor = Number(s.net_payable_minor || s.total_fee_minor || 12000000);
      const paidMinor = Number(s.paid_minor || 0);
      const remainingMinor = Number(s.outstanding_minor !== undefined ? s.outstanding_minor : totalMinor - paidMinor);
      const installmentsCount = Number(s.installments_count || 4);
      const nextDue = s.next_due_date || '2026-11-15';

      const mandate = SANDBOX_MANDATES.find(
        (m) =>
          m.student_id === studentId ||
          (studentRef && m.account_reference.toLowerCase() === studentRef.toLowerCase()) ||
          m.student_name.toLowerCase() === studentName.toLowerCase()
      );

      seenIds.add(studentId);
      if (studentRef) seenRefs.add(studentRef.toLowerCase());
      seenNames.add(studentName.toLowerCase());

      mergedList.push({
        student_id: studentId,
        student_name: studentName,
        student_reference: studentRef,
        group_name: groupName,
        course,
        payer_name: payerName,
        payer_phone: payerPhone,
        payer_email: payerEmail,
        fee_plan: feePlan,
        total_fee_minor: totalMinor,
        paid_minor: paidMinor,
        remaining_minor: remainingMinor,
        installments_count: installmentsCount,
        next_due_date: nextDue,
        mandate_status: mandate ? mandate.status : (s.enach_status === 'active' ? 'active' : 'not_setup'),
        mandate_id: mandate?.id,
        mandate_reference: mandate?.mandate_reference,
        max_amount_minor: mandate?.max_amount_minor,
        installments: buildStudentInstallments(studentId, totalMinor, paidMinor, installmentsCount, mandate),
      });
    }
  }

  // 2. Append any baseline demo students not already present
  for (const b of baseDemoStudents) {
    if (!seenIds.has(b.id) && !seenRefs.has(b.ref.toLowerCase()) && !seenNames.has(b.name.toLowerCase())) {
      const mandate = SANDBOX_MANDATES.find((m) => m.student_id === b.id || m.account_reference.toLowerCase() === b.ref.toLowerCase());
      seenIds.add(b.id);
      seenRefs.add(b.ref.toLowerCase());
      seenNames.add(b.name.toLowerCase());
      mergedList.push({
        student_id: b.id,
        student_name: b.name,
        student_reference: b.ref,
        group_name: b.group,
        course: b.course,
        payer_name: b.payer,
        payer_phone: b.phone,
        payer_email: b.email,
        fee_plan: b.plan,
        total_fee_minor: b.total_minor,
        paid_minor: b.paid_minor,
        remaining_minor: b.remaining_minor,
        installments_count: b.installments,
        next_due_date: b.next_due,
        mandate_status: mandate ? mandate.status : 'not_setup',
        mandate_id: mandate?.id,
        mandate_reference: mandate?.mandate_reference,
        max_amount_minor: mandate?.max_amount_minor,
        installments: buildStudentInstallments(b.id, b.total_minor, b.paid_minor, b.installments, mandate),
      });
    }
  }

  return mergedList;
}

// -------------------------------------------------------------
// Route Handler for All Flex / eNACH Endpoints
// -------------------------------------------------------------

export async function handleEnachRoute(
  req: NextRequest,
  path: string,
  method: string,
  allStudents?: any[],
): Promise<NextResponse | null> {
  // 1. Overview Dashboard (Module 1)
  if (path === 'admin/enach/overview' && method === 'GET') {
    const totalMandates = SANDBOX_MANDATES.length;
    const activeMandates = SANDBOX_MANDATES.filter((m) => m.status === 'active').length;
    const pendingSetups = SANDBOX_MANDATES.filter(
      (m) => m.status === 'pending_authorization' || m.status === 'draft',
    ).length;

    const upcomingDebits = SANDBOX_DEBIT_ATTEMPTS.filter((d) => d.status === 'queued');
    const upcomingDebitsMinor = upcomingDebits.reduce((acc, d) => acc + d.amount_minor, 0);

    const successfulDebits = SANDBOX_DEBIT_ATTEMPTS.filter((d) => d.status === 'succeeded');
    const successfulDebitsMinor = successfulDebits.reduce((acc, d) => acc + d.amount_minor, 0);

    const failedDebits = SANDBOX_DEBIT_ATTEMPTS.filter((d) => d.status === 'failed');
    const failedDebitsMinor = failedDebits.reduce((acc, d) => acc + d.amount_minor, 0);

    const pendingInvestigations = SANDBOX_RECONCILIATION_RECORDS.filter(
      (r) => r.status === 'requires_investigation' || r.status === 'unmatched',
    ).length;

    const simulatedRecoveryAmountMinor = failedDebits
      .filter((d) => d.recovery_status === 'retry_scheduled')
      .reduce((acc, d) => acc + d.amount_minor, 0);

    return NextResponse.json({
      kpis: {
        total_mandates: totalMandates,
        active_sandbox_mandates: activeMandates,
        pending_registrations: pendingSetups,
        upcoming_simulated_debits_count: upcomingDebits.length,
        upcoming_simulated_debits_minor: upcomingDebitsMinor,
        successful_simulated_debits_count: successfulDebits.length,
        successful_simulated_debits_minor: successfulDebitsMinor,
        failed_simulated_debits_count: failedDebits.length,
        failed_simulated_debits_minor: failedDebitsMinor,
        pending_investigations: pendingInvestigations,
        simulated_recovery_minor: simulatedRecoveryAmountMinor,
      },
      funnel: [
        { status: 'Active (Sandbox)', count: activeMandates, color: '#0d9488' },
        { status: 'Pending Authorization', count: pendingSetups, color: '#f59e0b' },
        {
          status: 'Rejected',
          count: SANDBOX_MANDATES.filter((m) => m.status === 'rejected').length,
          color: '#ef4444',
        },
        {
          status: 'Cancelled',
          count: SANDBOX_MANDATES.filter((m) => m.status === 'cancelled').length,
          color: '#64748b',
        },
      ],
      upcoming_schedule: upcomingDebits.map((d) => ({
        id: d.id,
        student_name: d.student_name,
        account_reference: d.account_reference,
        installment_name: d.installment_name,
        amount_minor: d.amount_minor,
        scheduled_date: d.scheduled_date,
        mandate_reference: d.mandate_reference,
      })),
      recent_activity: SANDBOX_AUDIT_LOGS.slice(0, 5),
      failed_alerts: failedDebits.map((f) => ({
        id: f.id,
        student_name: f.student_name,
        amount_minor: f.amount_minor,
        failure_code: f.failure_code,
        failure_reason: f.failure_reason,
        execution_date: f.execution_date,
        retry_eligible: f.recovery_status === 'retry_scheduled' || f.recovery_status === 'eligible',
      })),
      provider: CURRENT_PROVIDER_METRICS,
      sandbox_notice: 'SANDBOX MODE — NO REAL BANK TRANSACTIONS',
    });
  }

  // 2. Mandate Operations & Management (Modules 2 & 3)
  if (path === 'admin/fees/mandates') {
    if (method === 'GET') {
      const search = (req.nextUrl.searchParams.get('search') || '').toLowerCase().trim();
      const status = req.nextUrl.searchParams.get('status') || '';

      let results = [...SANDBOX_MANDATES];
      if (search) {
        results = results.filter(
          (m) =>
            m.mandate_reference.toLowerCase().includes(search) ||
            m.student_name.toLowerCase().includes(search) ||
            m.account_reference.toLowerCase().includes(search) ||
            m.payer_name.toLowerCase().includes(search) ||
            m.bank_name.toLowerCase().includes(search),
        );
      }
      if (status) {
        results = results.filter((m) => m.status === status);
      }
      return NextResponse.json(results);
    }

    if (method === 'POST') {
      let body: any = {};
      try {
        body = await req.json();
      } catch {}

      const studentId = body.student_id;
      if (!studentId) {
        return NextResponse.json({ error: 'Student ID is required' }, { status: 400 });
      }

      // Guard: Prevent duplicate active mandates covering the same student
      const existingActive = SANDBOX_MANDATES.find(
        (m) => m.student_id === studentId && (m.status === 'active' || m.status === 'pending_authorization'),
      );
      if (existingActive) {
        return NextResponse.json(
          {
            error: `Student ${existingActive.student_name} already has an ${existingActive.status} mandate (${existingActive.mandate_reference}). Duplicate mandates are not allowed.`,
          },
          { status: 409 },
        );
      }

      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const newReference = `UMRN-SBX-2026-${randomSuffix}`;
      const newId = `mnd-sbx-${Date.now().toString().slice(-6)}`;

      const newMandate: SandboxMandate = {
        id: newId,
        mandate_reference: newReference,
        tenant_id: TENANT_ID,
        environment: 'sandbox',
        provider: 'sandbox_enach',
        student_id: studentId,
        student_name: body.student_name || 'Selected Student',
        account_reference: body.account_reference || `DPS-2026-${randomSuffix}`,
        payer_name: body.payer_name || 'Primary Guardian',
        payer_phone: body.payer_phone || '+91 98765 00000',
        payer_email: body.payer_email || 'parent@example.com',
        bank_name: body.bank_name || 'HDFC Bank',
        masked_account: `•••• ${body.account_last4 || '1234'}`,
        ifsc_code: body.ifsc_code || 'HDFC0001000',
        fee_plan: body.fee_plan || 'Academic Standard Fee Schedule',
        max_amount_minor: Number(body.max_amount_minor || 5000000),
        frequency: body.frequency || 'monthly',
        start_date: body.start_date || new Date().toISOString().slice(0, 10),
        end_date: body.end_date || '2027-04-30',
        status: 'pending_authorization',
        rail: 'eNACH (Sandbox)',
        auth_mode: body.auth_mode || 'NetBanking (Simulated)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        authorization_events: [
          {
            id: `auth-ev-${Date.now()}`,
            mandate_id: newId,
            event_type: 'request_created',
            method: body.auth_mode || 'NetBanking (Simulated)',
            status: 'pending',
            bank_name: body.bank_name || 'HDFC Bank',
            ip_address: '192.168.1.104 (Campus Local)',
            user_agent: 'Antigravity IDE Agent Sandbox',
            timestamp: new Date().toISOString(),
            details: 'Sandbox mandate registration request initiated',
          },
        ],
        history: [
          {
            timestamp: new Date().toISOString(),
            action: 'Mandate Request Created',
            actor: 'rakeshanimator143@gmail.com (Institution Staff)',
            new_status: 'pending_authorization',
            reason: 'Initiated via One-Click Sandbox Setup',
          },
        ],
        linked_installments: Array.isArray(body.installments) && body.installments.length > 0
          ? body.installments.map((inst: any, idx: number) => ({
              id: inst.id || `inst-auto-${idx + 1}`,
              sequence: idx + 1,
              name: inst.name || `Instalment #${idx + 1}`,
              period_start: inst.period_start || body.start_date || '2026-07-01',
              period_end: inst.period_end || body.end_date || '2027-04-30',
              due_date: inst.due_date || '2026-11-15',
              amount_minor: Number(inst.amount_minor || 2500000),
              status: inst.status || 'scheduled',
            }))
          : [
              {
                id: `inst-auto-1`,
                sequence: 1,
                name: 'Quarter 1 Tuition Fee',
                period_start: body.start_date || '2026-07-01',
                period_end: '2026-09-30',
                due_date: '2026-11-15',
                amount_minor: Math.round(Number(body.max_amount_minor || 5000000) * 0.7),
                status: 'scheduled',
              },
            ],
      };

      SANDBOX_MANDATES.unshift(newMandate);

      // Record audit event
      SANDBOX_AUDIT_LOGS.unshift({
        id: `aud-sbx-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: 'rakeshanimator143@gmail.com',
        event_type: 'mandate_created',
        entity_type: 'SandboxMandate',
        entity_id: newId,
        reference: newReference,
        action: `Created Sandbox Mandate for ${newMandate.student_name}`,
        details: `Cap: ₹${newMandate.max_amount_minor / 100}, Bank: ${newMandate.bank_name}`,
        tenant_id: TENANT_ID,
        ip_address: '192.168.1.104',
      });

      // Emitted simulated notification
      SANDBOX_NOTIFICATIONS.unshift({
        id: `notif-sbx-${Date.now()}`,
        event_type: 'mandate_registered',
        recipient_name: newMandate.payer_name,
        recipient_phone: newMandate.payer_phone,
        recipient_email: newMandate.payer_email,
        channel: 'WhatsApp (Simulated)',
        title: 'eNACH Mandate Setup Initiated',
        message: `Dear ${newMandate.payer_name}, eNACH registration link generated for ${newMandate.student_name} (${newMandate.account_reference}). Ref: ${newReference}`,
        status: 'delivered',
        sent_at: new Date().toISOString(),
        tenant_id: TENANT_ID,
        environment: 'sandbox',
      });

      return NextResponse.json({
        ok: true,
        mandate: newMandate,
        message: 'Sandbox mandate created successfully. Payer authorization simulated pending.',
      });
    }
  }

  // 2b. Mandate Simulated Authorization (Approve / Reject)
  if (path.startsWith('admin/fees/mandates/') && path.endsWith('/authorize') && method === 'POST') {
    const parts = path.split('/');
    const mandateId = parts[3];
    const mandate = SANDBOX_MANDATES.find((m) => m.id === mandateId || m.mandate_reference === mandateId);

    if (!mandate) {
      return NextResponse.json({ error: 'Mandate not found' }, { status: 404 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const action = body.action === 'reject' ? 'reject' : 'approve';
    const methodChoice: AuthMethod = body.method || mandate.auth_mode || 'NetBanking (Simulated)';
    const bankChoice = body.bank_name || mandate.bank_name;

    const previousStatus = mandate.status;
    const newStatus: MandateStatus = action === 'approve' ? 'active' : 'rejected';
    mandate.status = newStatus;
    mandate.updated_at = new Date().toISOString();

    const authEvent = {
      id: `auth-ev-${Date.now()}`,
      mandate_id: mandate.id,
      event_type: action === 'approve' ? ('authorized' as const) : ('rejected' as const),
      method: methodChoice,
      status: action === 'approve' ? ('success' as const) : ('rejected' as const),
      bank_name: bankChoice,
      ip_address: '103.21.144.12 (Payer Simulator)',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      timestamp: new Date().toISOString(),
      details:
        action === 'approve'
          ? `Simulated approval completed via ${methodChoice} (${bankChoice})`
          : `Simulated rejection: Payer declined terms (${methodChoice})`,
    };
    mandate.authorization_events.push(authEvent);

    mandate.history.push({
      timestamp: new Date().toISOString(),
      action: action === 'approve' ? 'Mandate Authorized (Sandbox)' : 'Mandate Rejected (Sandbox)',
      actor: `Payer: ${mandate.payer_name} (Simulator)`,
      previous_status: previousStatus,
      new_status: newStatus,
      reason: action === 'approve' ? 'Payer accepted auto-debit terms' : 'Payer declined authorization',
    });

    SANDBOX_AUDIT_LOGS.unshift({
      id: `aud-sbx-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: `Payer: ${mandate.payer_name} (Simulator)`,
      event_type: action === 'approve' ? 'mandate_authorized' : 'mandate_rejected',
      entity_type: 'SandboxMandate',
      entity_id: mandate.id,
      reference: mandate.mandate_reference,
      action: action === 'approve' ? 'Payer Authorized Mandate' : 'Payer Declined Mandate',
      details: `Method: ${methodChoice}, Bank: ${bankChoice}`,
      tenant_id: TENANT_ID,
      ip_address: '103.21.144.12',
    });

    SANDBOX_NOTIFICATIONS.unshift({
      id: `notif-sbx-${Date.now()}`,
      event_type: action === 'approve' ? 'mandate_authorized' : 'mandate_rejected',
      recipient_name: mandate.payer_name,
      recipient_phone: mandate.payer_phone,
      recipient_email: mandate.payer_email,
      channel: 'WhatsApp (Simulated)',
      title: action === 'approve' ? 'eNACH Mandate Activated' : 'eNACH Authorization Declined',
      message:
        action === 'approve'
          ? `Your eNACH mandate ${mandate.mandate_reference} for ${mandate.student_name} is now ACTIVE.`
          : `Mandate authorization was declined for ${mandate.student_name}. You may re-initiate setup.`,
      status: 'delivered',
      sent_at: new Date().toISOString(),
      tenant_id: TENANT_ID,
      environment: 'sandbox',
    });

    return NextResponse.json({
      ok: true,
      mandate,
      message: `Mandate is now ${newStatus}.`,
    });
  }

  // 2c. Mandate Cancellation
  if (path.startsWith('admin/fees/mandates/') && path.endsWith('/cancel') && method === 'POST') {
    const parts = path.split('/');
    const mandateId = parts[3];
    const mandate = SANDBOX_MANDATES.find((m) => m.id === mandateId || m.mandate_reference === mandateId);

    if (!mandate) {
      return NextResponse.json({ error: 'Mandate not found' }, { status: 404 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const reason = body.reason || 'Staff requested cancellation';
    const previousStatus = mandate.status;
    mandate.status = 'cancelled';
    mandate.updated_at = new Date().toISOString();

    mandate.history.push({
      timestamp: new Date().toISOString(),
      action: 'Mandate Cancelled (Sandbox)',
      actor: 'rakeshanimator143@gmail.com (Staff)',
      previous_status: previousStatus,
      new_status: 'cancelled',
      reason,
    });

    SANDBOX_AUDIT_LOGS.unshift({
      id: `aud-sbx-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'rakeshanimator143@gmail.com',
      event_type: 'mandate_cancelled',
      entity_type: 'SandboxMandate',
      entity_id: mandate.id,
      reference: mandate.mandate_reference,
      action: 'Cancelled Sandbox Mandate',
      details: `Reason: ${reason}`,
      tenant_id: TENANT_ID,
      ip_address: '192.168.1.104',
    });

    return NextResponse.json({
      ok: true,
      mandate,
      message: 'Mandate successfully cancelled.',
    });
  }

  // 3. Student eNACH Mapping (Module 4)
  if (path === 'admin/enach/student-mapping' && method === 'GET') {
    const mappings = getStudentEnachMappings(allStudents);
    return NextResponse.json(mappings);
  }

  // 4. Automatic Debits & Transactions (Modules 5 & 6)
  if (path === 'admin/fees/autopay-attempts' && method === 'GET') {
    const status = req.nextUrl.searchParams.get('status') || '';
    const search = (req.nextUrl.searchParams.get('search') || '').toLowerCase().trim();

    let debits = [...SANDBOX_DEBIT_ATTEMPTS];
    if (status) {
      debits = debits.filter((d) => d.status === status);
    }
    if (search) {
      debits = debits.filter(
        (d) =>
          d.mandate_reference.toLowerCase().includes(search) ||
          d.student_name.toLowerCase().includes(search) ||
          d.account_reference.toLowerCase().includes(search) ||
          d.installment_name.toLowerCase().includes(search) ||
          d.provider_reference.toLowerCase().includes(search),
      );
    }
    return NextResponse.json(debits);
  }

  // 4b. Trigger Scheduled Debit Simulation Batch
  if (path === 'admin/enach/debits/simulate' && method === 'POST') {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const mode = body.simulation_mode || 'auto'; // 'auto', 'force_fail', 'force_success'
    const queuedItems = SANDBOX_DEBIT_ATTEMPTS.filter((d) => d.status === 'queued');

    const executedCount = queuedItems.length;
    let successCount = 0;
    let failCount = 0;

    queuedItems.forEach((debit, idx) => {
      debit.execution_date = new Date().toISOString();
      debit.attempt_no = 1;

      const shouldFail = mode === 'force_fail' || (mode === 'auto' && idx === queuedItems.length - 1);

      if (shouldFail) {
        debit.status = 'failed';
        debit.failure_code = 'NPCI-05';
        debit.failure_reason = 'Insufficient funds in payer bank account (Simulated NPCI-05)';
        debit.recovery_status = 'retry_scheduled';
        debit.next_retry_date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
        failCount++;

        SANDBOX_NOTIFICATIONS.unshift({
          id: `notif-sbx-${Date.now()}-${idx}`,
          event_type: 'debit_failed',
          recipient_name: debit.payer_name,
          recipient_phone: debit.payer_phone,
          recipient_email: 'parent@example.com',
          channel: 'WhatsApp (Simulated)',
          title: 'eNACH Debit Unsuccessful',
          message: `Scheduled auto-debit of ₹${debit.amount_minor / 100} for ${debit.student_name} failed (Insufficient Funds). Re-presentment scheduled.`,
          status: 'delivered',
          sent_at: new Date().toISOString(),
          tenant_id: TENANT_ID,
          environment: 'sandbox',
        });
      } else {
        debit.status = 'succeeded';
        debit.reconciled = true;
        successCount++;

        SANDBOX_NOTIFICATIONS.unshift({
          id: `notif-sbx-${Date.now()}-${idx}`,
          event_type: 'debit_succeeded',
          recipient_name: debit.payer_name,
          recipient_phone: debit.payer_phone,
          recipient_email: 'parent@example.com',
          channel: 'WhatsApp (Simulated)',
          title: 'Fee Payment Received via eNACH',
          message: `₹${debit.amount_minor / 100} collected successfully for ${debit.installment_name}. Reference: ${debit.provider_reference}`,
          status: 'delivered',
          sent_at: new Date().toISOString(),
          tenant_id: TENANT_ID,
          environment: 'sandbox',
        });
      }
    });

    SANDBOX_AUDIT_LOGS.unshift({
      id: `aud-sbx-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'rakeshanimator143@gmail.com (Staff Triggered)',
      event_type: 'debit_executed',
      entity_type: 'SandboxDebitAttempt',
      entity_id: 'batch-simulated',
      reference: `BATCH-SIM-${Date.now().toString().slice(-6)}`,
      action: 'Simulated Debit Run Executed',
      details: `Total: ${executedCount}, Cleared: ${successCount}, Failed: ${failCount}`,
      tenant_id: TENANT_ID,
      ip_address: '192.168.1.104',
    });

    return NextResponse.json({
      ok: true,
      executed: executedCount,
      succeeded: successCount,
      failed: failCount,
      message: `Processed ${executedCount} debits (${successCount} succeeded, ${failCount} simulated fail).`,
    });
  }

  // 5. Failed Payments & Retries (Modules 7 & 8)
  if (path === 'admin/enach/failed-debits' && method === 'GET') {
    const failed = SANDBOX_DEBIT_ATTEMPTS.filter((d) => d.status === 'failed');
    return NextResponse.json(failed);
  }

  // 5b. Retry a Failed Debit
  if (path.startsWith('admin/enach/debits/') && path.endsWith('/retry') && method === 'POST') {
    const parts = path.split('/');
    const debitId = parts[3];
    const debit = SANDBOX_DEBIT_ATTEMPTS.find((d) => d.id === debitId);

    if (!debit) {
      return NextResponse.json({ error: 'Debit attempt not found' }, { status: 404 });
    }

    // Guard: Check retry limits and mandate status
    const mandate = SANDBOX_MANDATES.find((m) => m.id === debit.mandate_id);
    if (!mandate || mandate.status !== 'active') {
      return NextResponse.json(
        { error: 'Cannot retry debit: Associated mandate is not active or has been cancelled.' },
        { status: 400 },
      );
    }

    if (debit.attempt_no >= debit.max_retries) {
      return NextResponse.json(
        { error: `Maximum retry attempts (${debit.max_retries}) exhausted for this debit instruction.` },
        { status: 400 },
      );
    }

    debit.attempt_no += 1;
    debit.execution_date = new Date().toISOString();

    // In retry simulation, mark as recovered
    debit.status = 'succeeded';
    debit.recovery_status = 'recovered';
    debit.failure_reason = null;
    debit.failure_code = null;
    debit.reconciled = true;

    SANDBOX_AUDIT_LOGS.unshift({
      id: `aud-sbx-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'rakeshanimator143@gmail.com (Staff Action)',
      event_type: 'debit_retried',
      entity_type: 'SandboxDebitAttempt',
      entity_id: debit.id,
      reference: debit.mandate_reference,
      action: `Executed Retry #${debit.attempt_no} for ${debit.student_name}`,
      details: `Recovered ₹${debit.amount_minor / 100} successfully in simulation`,
      tenant_id: TENANT_ID,
      ip_address: '192.168.1.104',
    });

    SANDBOX_NOTIFICATIONS.unshift({
      id: `notif-sbx-${Date.now()}`,
      event_type: 'debit_succeeded',
      recipient_name: debit.payer_name,
      recipient_phone: debit.payer_phone,
      recipient_email: 'parent@example.com',
      channel: 'WhatsApp (Simulated)',
      title: 'Fee Payment Recovered via Retry',
      message: `Retry successful: ₹${debit.amount_minor / 100} cleared via eNACH auto-debit for ${debit.student_name}.`,
      status: 'delivered',
      sent_at: new Date().toISOString(),
      tenant_id: TENANT_ID,
      environment: 'sandbox',
    });

    return NextResponse.json({
      ok: true,
      debit,
      message: `Retry #${debit.attempt_no} executed and recovered successfully.`,
    });
  }

  // 6. Reconciliation (Module 9)
  if (path === 'admin/enach/reconciliation' && method === 'GET') {
    return NextResponse.json(SANDBOX_RECONCILIATION_RECORDS);
  }

  if (path === 'admin/enach/reconciliation/run' && method === 'POST') {
    // Run reconciliation batch simulation
    const batchId = `REC-BATCH-${Date.now().toString().slice(-6)}`;
    SANDBOX_AUDIT_LOGS.unshift({
      id: `aud-sbx-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'rakeshanimator143@gmail.com',
      event_type: 'reconciliation_run',
      entity_type: 'SandboxReconciliation',
      entity_id: batchId,
      reference: batchId,
      action: 'Executed Sandbox Reconciliation Batch',
      details: `Reconciled ${SANDBOX_RECONCILIATION_RECORDS.length} entries against simulated clearing reports`,
      tenant_id: TENANT_ID,
      ip_address: '192.168.1.104',
    });

    return NextResponse.json({
      ok: true,
      batch_reference: batchId,
      matched: SANDBOX_RECONCILIATION_RECORDS.filter((r) => r.status === 'matched').length,
      discrepant: SANDBOX_RECONCILIATION_RECORDS.filter((r) => r.status !== 'matched').length,
      message: 'Reconciliation batch executed successfully.',
    });
  }

  // 7. Notifications (Module 10)
  if (path === 'admin/enach/notifications' && method === 'GET') {
    return NextResponse.json(SANDBOX_NOTIFICATIONS);
  }

  if (path === 'admin/enach/notifications/test' && method === 'POST') {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const testNotif: SandboxNotification = {
      id: `notif-sbx-${Date.now()}`,
      event_type: body.event_type || 'upcoming_debit',
      recipient_name: body.recipient_name || 'Test Parent',
      recipient_phone: body.recipient_phone || '+91 98765 00000',
      recipient_email: body.recipient_email || 'test.parent@example.com',
      channel: body.channel || 'WhatsApp (Simulated)',
      title: body.title || 'Sandbox Fee Reminder Preview',
      message:
        body.message ||
        'This is a simulated preview of an eNACH collection notification. No real message was dispatched.',
      status: 'delivered',
      sent_at: new Date().toISOString(),
      tenant_id: TENANT_ID,
      environment: 'sandbox',
    };

    SANDBOX_NOTIFICATIONS.unshift(testNotif);

    return NextResponse.json({
      ok: true,
      notification: testNotif,
      message: 'Test notification simulated and logged.',
    });
  }

  // 8. Reports (Module 11)
  if (path === 'admin/enach/reports' && method === 'GET') {
    const reportType = req.nextUrl.searchParams.get('type') || 'active_mandates';
    let reportData: any[] = [];

    switch (reportType) {
      case 'registrations':
        reportData = SANDBOX_MANDATES.map((m) => ({
          mandate_reference: m.mandate_reference,
          student_name: m.student_name,
          payer_name: m.payer_name,
          bank_name: m.bank_name,
          max_amount: m.max_amount_minor / 100,
          status: m.status,
          created_at: m.created_at,
        }));
        break;
      case 'active_mandates':
        reportData = SANDBOX_MANDATES.filter((m) => m.status === 'active').map((m) => ({
          mandate_reference: m.mandate_reference,
          student_name: m.student_name,
          account_reference: m.account_reference,
          payer_name: m.payer_name,
          bank_name: m.bank_name,
          max_amount: m.max_amount_minor / 100,
          frequency: m.frequency,
          start_date: m.start_date,
          end_date: m.end_date,
        }));
        break;
      case 'pending_authorizations':
        reportData = SANDBOX_MANDATES.filter((m) => m.status === 'pending_authorization').map((m) => ({
          mandate_reference: m.mandate_reference,
          student_name: m.student_name,
          payer_name: m.payer_name,
          payer_phone: m.payer_phone,
          bank_name: m.bank_name,
          cap_amount: m.max_amount_minor / 100,
          initiated_at: m.created_at,
        }));
        break;
      case 'scheduled_debits':
        reportData = SANDBOX_DEBIT_ATTEMPTS.filter((d) => d.status === 'queued').map((d) => ({
          debit_id: d.id,
          student_name: d.student_name,
          mandate_ref: d.mandate_reference,
          installment: d.installment_name,
          amount: d.amount_minor / 100,
          scheduled_date: d.scheduled_date,
        }));
        break;
      case 'successful_debits':
        reportData = SANDBOX_DEBIT_ATTEMPTS.filter((d) => d.status === 'succeeded').map((d) => ({
          debit_id: d.id,
          provider_ref: d.provider_reference,
          student_name: d.student_name,
          amount: d.amount_minor / 100,
          execution_date: d.execution_date,
          reconciled: d.reconciled ? 'Yes' : 'No',
        }));
        break;
      case 'failed_debits':
        reportData = SANDBOX_DEBIT_ATTEMPTS.filter((d) => d.status === 'failed').map((d) => ({
          debit_id: d.id,
          student_name: d.student_name,
          amount: d.amount_minor / 100,
          failure_code: d.failure_code,
          failure_reason: d.failure_reason,
          retry_status: d.recovery_status,
          next_retry: d.next_retry_date,
        }));
        break;
      case 'recovery_attempts':
        reportData = SANDBOX_DEBIT_ATTEMPTS.filter((d) => d.attempt_no > 1 || d.recovery_status).map((d) => ({
          debit_id: d.id,
          student_name: d.student_name,
          attempt_no: d.attempt_no,
          max_retries: d.max_retries,
          status: d.status,
          recovery_status: d.recovery_status,
        }));
        break;
      case 'reconciliation':
        reportData = SANDBOX_RECONCILIATION_RECORDS.map((r) => ({
          rec_id: r.id,
          debit_id: r.debit_attempt_id,
          mandate_ref: r.mandate_reference,
          student_name: r.student_name,
          expected_amount: r.expected_amount_minor / 100,
          simulated_cleared: r.simulated_successful_amount_minor / 100,
          variance: r.variance_minor / 100,
          status: r.status,
          exception: r.exception_reason || 'None',
        }));
        break;
      case 'investigations':
        reportData = SANDBOX_RECONCILIATION_RECORDS.filter(
          (r) => r.status === 'requires_investigation' || r.status === 'unmatched',
        ).map((r) => ({
          rec_id: r.id,
          mandate_ref: r.mandate_reference,
          student_name: r.student_name,
          variance: r.variance_minor / 100,
          status: r.status,
          exception: r.exception_reason,
          date: r.reconciliation_date,
        }));
        break;
      default:
        reportData = [];
    }

    return NextResponse.json({
      report_type: reportType,
      rows: reportData,
      total: reportData.length,
      watermark: 'SANDBOX / TEST DATA REPORT — STRICTLY NON-FINANCIAL',
    });
  }

  // 9. Compliance & Audit (Module 12)
  if (path === 'admin/enach/audit' && method === 'GET') {
    return NextResponse.json(SANDBOX_AUDIT_LOGS);
  }

  // 10. Provider Diagnostics (Module 13 / Section 7)
  if (path === 'provider/enach/diagnostics' && method === 'GET') {
    return NextResponse.json(CURRENT_PROVIDER_METRICS);
  }

  return null;
}
