import { NextRequest, NextResponse } from 'next/server';
import { handleEnachRoute } from '@/lib/enach/backend-service';

const DEMO_USER = {
  id: 'usr-demo-owner',
  email: 'rakeshanimator143@gmail.com',
  role: 'owner',
};

const DEMO_TENANT = {
  id: 'tenant-delhi-campus',
  name: 'Delhi Public School (Demo)',
  role: 'owner',
  status: 'active',
  readOnly: false,
  permissions: [
    'dashboard.read',
    'customer.read',
    'customer.create',
    'finance.admin',
    'fee.plan.manage',
    'fee.schedule.edit',
    'enach.manage',
    'content.read',
    'content.write',
    'enquiries.read',
    'leads.read',
    'mandates.read',
    'tenant.admin',
  ],
};

const DEMO_WORKSPACES = [
  {
    id: 'tenant-delhi-campus',
    name: 'Delhi Public School (Demo)',
    role: 'owner',
    status: 'active',
    readOnly: false,
  },
  {
    id: 'tenant-bangalore-campus',
    name: 'DPS Bangalore South (Demo)',
    role: 'owner',
    status: 'active',
    readOnly: false,
  },
];

const DEMO_SESSION = {
  user: DEMO_USER,
  tenant: DEMO_TENANT,
  workspaces: DEMO_WORKSPACES,
  csrf: 'demo-csrf-token-xyz',
};

const DEMO_DASHBOARD = {
  students: 342,
  expected_week_minor: '24000000',
  expected_month_minor: '95000000',
  collected_month_minor: '71000000',
  upcoming_enach_minor: '18000000',
  failed_debit_remaining_minor: '250000',
  trend: [
    { month: '2026-06-01', expected_minor: 8000000, collected_minor: 7500000 },
    { month: '2026-07-01', expected_minor: 8500000, collected_minor: 8200000 },
    { month: '2026-08-01', expected_minor: 9000000, collected_minor: 8800000 },
    { month: '2026-09-01', expected_minor: 9500000, collected_minor: 9100000 },
    { month: '2026-10-01', expected_minor: 9500000, collected_minor: 7100000 },
  ],
  net_payable_minor: '85000000',
  paid_minor: '62000000',
  outstanding_minor: '23000000',
  overdue_minor: '4500000',
  due_today_minor: '850000',
  upcoming_week_minor: '2400000',
  pending_settlements_minor: '1200000',
  active_mandates: 128,
  failed_debits: 2,
  reconciliation_review: 1,
  updatedAt: new Date().toISOString(),
  upcoming: [
    {
      id: 'inst-1',
      account_reference: 'DPS-2026-089',
      sequence: 2,
      due_date: '2026-10-25',
      remaining_minor: '2500000',
    },
    {
      id: 'inst-2',
      account_reference: 'DPS-2026-104',
      sequence: 3,
      due_date: '2026-10-28',
      remaining_minor: '1800000',
    },
    {
      id: 'inst-3',
      account_reference: 'DPS-2026-141',
      sequence: 1,
      due_date: '2026-10-30',
      remaining_minor: '3200000',
    },
  ],
  recent_payments: [
    {
      id: 'pay-1',
      account_reference: 'DPS-2026-042',
      amount_minor: '3500000',
      status: 'settled',
      recorded_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    },
    {
      id: 'pay-2',
      account_reference: 'DPS-2026-077',
      amount_minor: '2200000',
      status: 'settled',
      recorded_at: new Date(Date.now() - 3600000 * 20).toISOString(),
    },
    {
      id: 'pay-3',
      account_reference: 'DPS-2026-115',
      amount_minor: '1500000',
      status: 'settled',
      recorded_at: new Date(Date.now() - 3600000 * 36).toISOString(),
    },
  ],
};

const STUDENT_CUSTOM_PAYMENTS: Record<string, any[]> = {};
const STUDENT_CUSTOM_RECEIPTS: Record<string, any[]> = {};

const DEMO_STUDENTS = [
  {
    id: 'stu-rakesh',
    full_name: 'V Rakesh',
    student_reference: 'test',
    status: 'enrolled',
    institute: 'Delhi Public School (Demo)',
    group_name: 'Grade 10-A',
    course: 'CBSE Secondary',
    grade: '10',
    academic_year: '2026-27',
    campus: 'Delhi Main Campus',
    email: 'rakesh.student@example.com',
    phone: '+91 98765 00000',
    guardian_name: 'Rakesh Guardian',
    guardian_email: 'rakesh.guardian@example.com',
    guardian_phone: '+91 98765 43210',
    enach_status: 'pending',
    net_payable_minor: '12000000',
    paid_minor: '0',
    outstanding_minor: '12000000',
  },
  {
    id: 'stu-1',
    full_name: 'Aarav Sharma',
    student_reference: 'DPS-2026-089',
    status: 'enrolled',
    institute: 'Delhi Public School (Demo)',
    group_name: 'Grade 10-A',
    course: 'CBSE Secondary',
    grade: '10',
    academic_year: '2026-27',
    enach_status: 'active',
    net_payable_minor: '12000000',
    paid_minor: '6000000',
    outstanding_minor: '6000000',
  },
  {
    id: 'stu-2',
    full_name: 'Diya Patel',
    student_reference: 'DPS-2026-104',
    status: 'enrolled',
    institute: 'Delhi Public School (Demo)',
    group_name: 'Grade 8-B',
    course: 'CBSE Middle School',
    grade: '8',
    academic_year: '2026-27',
    enach_status: 'active',
    net_payable_minor: '11000000',
    paid_minor: '7500000',
    outstanding_minor: '3500000',
  },
  {
    id: 'stu-3',
    full_name: 'Rohan Mehta',
    student_reference: 'DPS-2026-141',
    status: 'enrolled',
    institute: 'Delhi Public School (Demo)',
    group_name: 'Grade 12-Science',
    course: 'CBSE Senior Secondary',
    grade: '12',
    academic_year: '2026-27',
    enach_status: 'pending',
    net_payable_minor: '14500000',
    paid_minor: '5000000',
    outstanding_minor: '9500000',
  },
];

const DEMO_ACADEMIC_OVERVIEW = {
  students: [
    {
      id: 'stu-1',
      student_reference: 'DPS-2026-089',
      full_name: 'Aarav Sharma',
      date_of_birth: '2010-05-14',
      status: 'active',
      branch_code: 'DEL-MAIN',
      branch_name: 'Delhi Main Campus',
      academic_year: '2026-27',
    },
    {
      id: 'stu-2',
      student_reference: 'DPS-2026-104',
      full_name: 'Diya Patel',
      date_of_birth: '2012-08-22',
      status: 'active',
      branch_code: 'DEL-MAIN',
      branch_name: 'Delhi Main Campus',
      academic_year: '2026-27',
    },
    {
      id: 'stu-3',
      student_reference: 'DPS-2026-141',
      full_name: 'Rohan Mehta',
      date_of_birth: '2008-11-03',
      status: 'active',
      branch_code: 'DEL-SOUTH',
      branch_name: 'Delhi South Campus',
      academic_year: '2026-27',
    },
  ],
  guardians: [
    {
      id: 'g-1',
      display_name: 'Rajesh Sharma',
      email: 'rajesh.sharma@example.com',
      phone: '+91 98765 43210',
      verification_status: 'verified',
      active_links: 1,
    },
    {
      id: 'g-2',
      display_name: 'Ananya Patel',
      email: 'ananya.patel@example.com',
      phone: '+91 98765 43211',
      verification_status: 'verified',
      active_links: 1,
    },
  ],
  catalogue: [
    {
      id: 'cat-1',
      kind: 'grade',
      code: 'G10',
      label: 'Grade 10',
      parent_id: null,
      parent_label: null,
      status: 'active',
      version: 1,
    },
    {
      id: 'cat-2',
      kind: 'section',
      code: '10-A',
      label: 'Section 10-A',
      parent_id: 'cat-1',
      parent_label: 'Grade 10',
      status: 'active',
      version: 1,
    },
    {
      id: 'cat-3',
      kind: 'grade',
      code: 'G8',
      label: 'Grade 8',
      parent_id: null,
      parent_label: null,
      status: 'active',
      version: 1,
    },
    {
      id: 'cat-4',
      kind: 'section',
      code: '8-B',
      label: 'Section 8-B',
      parent_id: 'cat-3',
      parent_label: 'Grade 8',
      status: 'active',
      version: 1,
    },
    {
      id: 'cat-5',
      kind: 'course',
      code: 'CBSE-SEC',
      label: 'CBSE Secondary Curriculum',
      parent_id: null,
      parent_label: null,
      status: 'active',
      version: 1,
    },
  ],
  imports: [
    {
      id: 'imp-1',
      source_system: 'Student-ERP-CSV',
      status: 'completed',
      row_count: 342,
      valid_count: 342,
      error_count: 0,
      committed_count: 342,
    },
  ],
  conflicts: [],
};

const DEMO_TENANT_OVERVIEW = {
  tenant: {
    id: 'tenant-delhi-campus',
    slug: 'delhi-public-school',
    display_name: 'Delhi Public School (Demo)',
    legal_name: 'Delhi Public School Educational Society',
    status: 'active',
    locale: 'en-IN',
  },
  onboarding: {
    current_step: 'completed',
    draft: {},
    version: 1,
    updated_at: new Date().toISOString(),
  },
  entities: [
    {
      id: 'ent-1',
      name: 'DPS Educational Society',
      registration_reference: 'TRUST-DEL-2026-901',
      status: 'active',
    },
  ],
  branches: [
    {
      id: 'br-1',
      legal_entity_id: 'ent-1',
      legal_entity_name: 'DPS Educational Society',
      code: 'DEL-MAIN',
      name: 'Delhi Main Campus (Mathura Road)',
      city: 'New Delhi',
      state: 'Delhi',
      status: 'active',
    },
    {
      id: 'br-2',
      legal_entity_id: 'ent-1',
      legal_entity_name: 'DPS Educational Society',
      code: 'DEL-SOUTH',
      name: 'Delhi South Campus (RK Puram)',
      city: 'New Delhi',
      state: 'Delhi',
      status: 'active',
    },
  ],
  academicYears: [
    {
      id: 'ay-1',
      label: '2026-2027',
      starts_on: '2026-04-01',
      ends_on: '2027-03-31',
      status: 'active',
    },
  ],
  brandVersions: [
    {
      id: 'bv-1',
      name: 'DPS Green & Gold',
      primary_colour: '#0f766e',
      accent_colour: '#0d9488',
      support_email: 'accounts@dps-demo.invalid',
      locale: 'en-IN',
      status: 'published',
      version: 1,
    },
  ],
  domains: [
    {
      id: 'dom-1',
      hostname: 'dps.example.com',
      status: 'verified',
      verified_at: '2026-09-01T00:00:00Z',
    },
  ],
  members: [
    {
      id: 'mem-1',
      user_id: 'usr-demo-owner',
      email: 'rakeshanimator143@gmail.com',
      role_key: 'owner',
      status: 'active',
      branch_id: null,
    },
    {
      id: 'mem-2',
      user_id: 'usr-demo-finance',
      email: 'finance.admin@dps-demo.invalid',
      role_key: 'builder',
      status: 'active',
      branch_id: 'br-1',
    },
    {
      id: 'mem-3',
      user_id: 'usr-demo-cashier',
      email: 'cashier@dps-demo.invalid',
      role_key: 'support',
      status: 'active',
      branch_id: 'br-1',
    },
  ],
  roles: [
    {
      id: 'role-1',
      role_key: 'owner',
      name: 'Institution Owner',
      description: 'Complete administrative, financial, and operational access across all campuses.',
      grants: ['*'],
      explicit_denies: [],
      status: 'published',
      version: 1,
    },
    {
      id: 'role-2',
      role_key: 'builder',
      name: 'Finance & Fee Operations Manager',
      description: 'Manages installments, fee structures, refunds, waivers, and collections.',
      grants: ['finance.admin', 'dashboard.read', 'customer.read', 'customer.create'],
      explicit_denies: [],
      status: 'published',
      version: 1,
    },
  ],
  approvals: [],
  permissionCatalogue: [
    'dashboard.read',
    'customer.read',
    'customer.create',
    'finance.admin',
    'fee.plan.manage',
    'fee.schedule.edit',
    'enach.manage',
    'content.read',
    'content.write',
    'tenant.admin',
  ],
  workspaceRole: 'owner',
};

const DEMO_MANDATES = [
  {
    id: 'man-1',
    account_reference: 'DPS-2026-089',
    provider_reference: 'ENACH-HDFC-9901',
    status: 'active',
    rail: 'eNACH',
    max_amount_minor: 5000000,
    frequency: 'monthly',
    account_holder: 'Rajesh Sharma',
    bank_name: 'HDFC Bank',
    masked_account: '•••• 4321',
    created_at: '2026-10-01T10:00:00Z',
  },
  {
    id: 'man-2',
    account_reference: 'DPS-2026-104',
    provider_reference: 'ENACH-ICICI-8812',
    status: 'active',
    rail: 'eNACH',
    max_amount_minor: 4000000,
    frequency: 'monthly',
    account_holder: 'Ananya Patel',
    bank_name: 'ICICI Bank',
    masked_account: '•••• 8823',
    created_at: '2026-10-03T11:30:00Z',
  },
  {
    id: 'man-3',
    account_reference: 'DPS-2026-141',
    provider_reference: 'ENACH-SBI-7729',
    status: 'pending',
    rail: 'eNACH',
    max_amount_minor: 6000000,
    frequency: 'monthly',
    account_holder: 'Vikram Mehta',
    bank_name: 'State Bank of India',
    masked_account: '•••• 1209',
    created_at: '2026-10-18T14:20:00Z',
  },
];

const DEMO_SETUPS = [
  {
    id: 'set-1',
    account_reference: 'DPS-2026-089',
    provider_reference: 'SETUP-9901',
    status: 'completed',
    rail: 'eNACH',
    created_at: '2026-10-01T09:45:00Z',
  },
  {
    id: 'set-2',
    account_reference: 'DPS-2026-104',
    provider_reference: 'SETUP-8812',
    status: 'completed',
    rail: 'eNACH',
    created_at: '2026-10-03T11:15:00Z',
  },
  {
    id: 'set-3',
    account_reference: 'DPS-2026-141',
    provider_reference: 'SETUP-7729',
    status: 'uncertain',
    rail: 'eNACH',
    created_at: '2026-10-18T14:10:00Z',
  },
];

const DEMO_DEBITS = [
  {
    id: 'deb-1',
    account_reference: 'DPS-2026-089',
    provider_reference: 'DEB-2026-10-001',
    amount_minor: 2500000,
    attempt_no: 1,
    status: 'settled',
    rail: 'eNACH',
    created_at: '2026-10-15T09:00:00Z',
  },
  {
    id: 'deb-2',
    account_reference: 'DPS-2026-104',
    provider_reference: 'DEB-2026-10-002',
    amount_minor: 1800000,
    attempt_no: 1,
    status: 'settled',
    rail: 'eNACH',
    created_at: '2026-10-15T09:00:00Z',
  },
  {
    id: 'deb-3',
    account_reference: 'DPS-2026-141',
    provider_reference: 'DEB-2026-10-003',
    amount_minor: 3200000,
    attempt_no: 1,
    status: 'failed',
    failure_code: 'INSUFFICIENT_FUNDS',
    recovery_status: 'retry_scheduled',
    rail: 'eNACH',
    created_at: '2026-10-16T09:00:00Z',
  },
];

const DEMO_PAYMENTS_LIST = [
  {
    id: 'PAY-2026-9041',
    account_reference: 'DPS-2026-089',
    student_name: 'Aarav Sharma',
    student_id: 'stu-1',
    payer_name: 'Rajesh Sharma',
    payer_phone: '+91 98765 43210',
    payer_email: 'rajesh.sharma@example.com',
    fee_category: 'Tuition Fee (Q2)',
    amount_minor: 3000000,
    payment_mode: 'eNACH Autopay',
    provider_reference: 'ENACH-99812-NPCI',
    recorded_at: '2026-10-22T09:15:00Z',
    receipt_number: 'DPS-REC-2026-0089',
    status: 'settled',
    refunded_amount_minor: 0,
    breakdown: [
      { label: 'Tuition Fee', amount_minor: 2500000 },
      { label: 'Activity & Sports', amount_minor: 500000 },
    ],
  },
  {
    id: 'PAY-2026-9042',
    account_reference: 'DPS-2026-104',
    student_name: 'Diya Patel',
    student_id: 'stu-2',
    payer_name: 'Ananya Patel',
    payer_phone: '+91 98765 43211',
    payer_email: 'ananya.patel@example.com',
    fee_category: 'Tuition & Development Fee',
    amount_minor: 4500000,
    payment_mode: 'UPI (Instant)',
    provider_reference: 'UPI-8849201948',
    recorded_at: '2026-10-22T08:30:00Z',
    receipt_number: 'DPS-REC-2026-0090',
    status: 'settled',
    refunded_amount_minor: 0,
    breakdown: [
      { label: 'Tuition Fee', amount_minor: 3500000 },
      { label: 'Development Fund', amount_minor: 1000000 },
    ],
  },
  {
    id: 'PAY-2026-9043',
    account_reference: 'DPS-2026-141',
    student_name: 'Rohan Mehta',
    student_id: 'stu-3',
    payer_name: 'Suresh Mehta',
    payer_phone: '+91 98765 43212',
    payer_email: 'suresh.mehta@example.com',
    fee_category: 'Science Laboratory Fee',
    amount_minor: 2000000,
    payment_mode: 'Netbanking (HDFC)',
    provider_reference: 'NETB-HDFC-882103',
    recorded_at: '2026-10-21T16:45:00Z',
    receipt_number: 'DPS-REC-2026-0091',
    status: 'settled',
    refunded_amount_minor: 0,
    breakdown: [{ label: 'Lab & Practical Fee', amount_minor: 2000000 }],
  },
  {
    id: 'PAY-2026-9044',
    account_reference: 'DPS-2026-055',
    student_name: 'Kavya Reddy',
    student_id: 'stu-4',
    payer_name: 'Venkat Reddy',
    payer_phone: '+91 98765 43213',
    payer_email: 'venkat.reddy@example.com',
    fee_category: 'Quarterly Tuition (Q2)',
    amount_minor: 3500000,
    payment_mode: 'Credit Card',
    provider_reference: 'CARD-TXN-449102',
    recorded_at: '2026-10-21T11:20:00Z',
    receipt_number: 'DPS-REC-2026-0092',
    status: 'settled',
    refunded_amount_minor: 0,
    breakdown: [{ label: 'Tuition Fee', amount_minor: 3500000 }],
  },
  {
    id: 'PAY-2026-9045',
    account_reference: 'DPS-2026-062',
    student_name: 'Ananya Gupta',
    student_id: 'stu-5',
    payer_name: 'Pooja Gupta',
    payer_phone: '+91 98765 43214',
    payer_email: 'pooja.gupta@example.com',
    fee_category: 'Transport & Activity Fee',
    amount_minor: 1500000,
    payment_mode: 'eNACH Autopay',
    provider_reference: 'ENACH-99813-NPCI',
    recorded_at: '2026-10-20T09:00:00Z',
    receipt_number: 'DPS-REC-2026-0093',
    status: 'settled',
    refunded_amount_minor: 0,
    breakdown: [
      { label: 'Campus Transport', amount_minor: 1000000 },
      { label: 'Activity Fee', amount_minor: 500000 },
    ],
  },
  {
    id: 'PAY-2026-9046',
    account_reference: 'DPS-2026-077',
    student_name: 'Vivaan Malhotra',
    student_id: 'stu-6',
    payer_name: 'Karan Malhotra',
    payer_phone: '+91 98765 43215',
    payer_email: 'karan.malhotra@example.com',
    fee_category: 'Tuition Fee (Q2)',
    amount_minor: 3000000,
    payment_mode: 'UPI (Instant)',
    provider_reference: 'UPI-9920184719',
    recorded_at: '2026-10-20T14:10:00Z',
    receipt_number: 'DPS-REC-2026-0094',
    status: 'settled',
    refunded_amount_minor: 0,
    breakdown: [{ label: 'Tuition Fee', amount_minor: 3000000 }],
  },
  {
    id: 'PAY-2026-9047',
    account_reference: 'DPS-2026-092',
    student_name: 'Ishan Verma',
    student_id: 'stu-7',
    payer_name: 'Sunita Verma',
    payer_phone: '+91 98765 43216',
    payer_email: 'sunita.verma@example.com',
    fee_category: 'Development Fee',
    amount_minor: 1200000,
    payment_mode: 'Direct (NEFT/IMPS)',
    provider_reference: 'NEFT-AXIS-99210',
    recorded_at: '2026-10-19T10:05:00Z',
    receipt_number: 'DPS-REC-2026-0095',
    status: 'settled',
    refunded_amount_minor: 0,
    breakdown: [{ label: 'Development Fund', amount_minor: 1200000 }],
  },
  {
    id: 'PAY-2026-9048',
    account_reference: 'DPS-2026-118',
    student_name: 'Tara Nair',
    student_id: 'stu-8',
    payer_name: 'Madhavan Nair',
    payer_phone: '+91 98765 43217',
    payer_email: 'madhavan.nair@example.com',
    fee_category: 'Tuition Fee (Q2)',
    amount_minor: 3200000,
    payment_mode: 'eNACH Autopay',
    provider_reference: 'ENACH-99814-NPCI',
    recorded_at: '2026-10-19T09:00:00Z',
    receipt_number: 'DPS-REC-2026-0096',
    status: 'processing',
    refunded_amount_minor: 0,
    breakdown: [{ label: 'Tuition Fee', amount_minor: 3200000 }],
  },
  {
    id: 'PAY-2026-9049',
    account_reference: 'DPS-2026-133',
    student_name: 'Aditya Joshi',
    student_id: 'stu-9',
    payer_name: 'Sanjay Joshi',
    payer_phone: '+91 98765 43218',
    payer_email: 'sanjay.joshi@example.com',
    fee_category: 'Tuition Fee (Q2)',
    amount_minor: 2800000,
    payment_mode: 'eNACH Autopay',
    provider_reference: 'ENACH-99815-NPCI',
    recorded_at: '2026-10-18T09:00:00Z',
    receipt_number: 'DPS-REC-2026-0097',
    status: 'failed',
    failure_reason: 'Insufficient funds (NPCI code 05)',
    refunded_amount_minor: 0,
    breakdown: [{ label: 'Tuition Fee', amount_minor: 2800000 }],
  },
  {
    id: 'PAY-2026-9050',
    account_reference: 'DPS-2026-150',
    student_name: 'Meera Singhania',
    student_id: 'stu-10',
    payer_name: 'Alok Singhania',
    payer_phone: '+91 98765 43219',
    payer_email: 'alok.singhania@example.com',
    fee_category: 'Admission & Security Fee',
    amount_minor: 4500000,
    payment_mode: 'Credit Card',
    provider_reference: 'CARD-TXN-902194',
    recorded_at: '2026-10-17T15:30:00Z',
    receipt_number: 'DPS-REC-2026-0098',
    status: 'refunded',
    refunded_amount_minor: 4500000,
    refund_reason: 'Admission cancellation within grace period',
    breakdown: [{ label: 'Refunded Admission Fee', amount_minor: 4500000 }],
  },
];

const DEMO_SETTLEMENTS_DETAILED = [
  {
    id: 'stl-101',
    provider_reference: 'SETTL-2026-10-22',
    provider: 'NPCI eNACH Payout',
    amount_minor: 18500000,
    gross_amount_minor: 18600000,
    fee_deduction_minor: 100000,
    settled_at: '2026-10-22T11:45:00Z',
    masked_bank_account: 'HDFC Bank •••• 4092 (Fee Collection A/C)',
    bank_utr: 'HDFCN26295018491',
    payment_count: 6,
    status: 'settled',
    associated_payments: [
      { id: 'PAY-2026-9041', student: 'Aarav Sharma (DPS-2026-089)', amount_minor: 3000000, mode: 'eNACH', category: 'Tuition' },
      { id: 'PAY-2026-9042', student: 'Diya Patel (DPS-2026-104)', amount_minor: 4500000, mode: 'UPI', category: 'Tuition & Dev' },
      { id: 'PAY-2026-9043', student: 'Rohan Mehta (DPS-2026-141)', amount_minor: 2000000, mode: 'Netbanking', category: 'Lab' },
      { id: 'PAY-2026-9044', student: 'Kavya Reddy (DPS-2026-055)', amount_minor: 3500000, mode: 'Card', category: 'Tuition' },
      { id: 'PAY-2026-9045', student: 'Ananya Gupta (DPS-2026-062)', amount_minor: 1500000, mode: 'eNACH', category: 'Transport' },
      { id: 'PAY-2026-9046', student: 'Vivaan Malhotra (DPS-2026-077)', amount_minor: 4000000, mode: 'eNACH', category: 'Tuition' },
    ],
  },
  {
    id: 'stl-102',
    provider_reference: 'SETTL-2026-10-19',
    provider: 'Razorpay Route (Direct UPI/Card)',
    amount_minor: 24000000,
    gross_amount_minor: 24240000,
    fee_deduction_minor: 240000,
    settled_at: '2026-10-19T14:30:00Z',
    masked_bank_account: 'HDFC Bank •••• 4092 (Fee Collection A/C)',
    bank_utr: 'AXISCN2628509871',
    payment_count: 8,
    status: 'settled',
    associated_payments: [
      { id: 'PAY-2026-8911', student: 'Pooja Iyer (DPS-2026-031)', amount_minor: 4000000, mode: 'UPI', category: 'Tuition' },
      { id: 'PAY-2026-8912', student: 'Siddharth Rao (DPS-2026-049)', amount_minor: 3500000, mode: 'Card', category: 'Tuition' },
      { id: 'PAY-2026-8913', student: 'Nisha Kapoor (DPS-2026-068)', amount_minor: 4500000, mode: 'UPI', category: 'Tuition & Dev' },
      { id: 'PAY-2026-8914', student: 'Arjun Das (DPS-2026-081)', amount_minor: 3000000, mode: 'UPI', category: 'Tuition' },
      { id: 'PAY-2026-8915', student: 'Sneha Jain (DPS-2026-095)', amount_minor: 2500000, mode: 'Netbanking', category: 'Activity' },
      { id: 'PAY-2026-8916', student: 'Manish Pandey (DPS-2026-112)', amount_minor: 2500000, mode: 'UPI', category: 'Tuition' },
      { id: 'PAY-2026-8917', student: 'Ritu Sen (DPS-2026-124)', amount_minor: 2000000, mode: 'Card', category: 'Transport' },
      { id: 'PAY-2026-8918', student: 'Devansh Bhatia (DPS-2026-139)', amount_minor: 2000000, mode: 'Netbanking', category: 'Lab' },
    ],
  },
  {
    id: 'stl-103',
    provider_reference: 'SETTL-2026-10-15',
    provider: 'NPCI eNACH Payout',
    amount_minor: 15900000,
    gross_amount_minor: 16000000,
    fee_deduction_minor: 100000,
    settled_at: '2026-10-15T12:00:00Z',
    masked_bank_account: 'HDFC Bank •••• 4092 (Fee Collection A/C)',
    bank_utr: 'ICICN2628204567',
    payment_count: 5,
    status: 'settled',
    associated_payments: [
      { id: 'PAY-2026-8801', student: 'Tanvi Goyal (DPS-2026-015)', amount_minor: 3500000, mode: 'eNACH', category: 'Tuition' },
      { id: 'PAY-2026-8802', student: 'Varun Joshi (DPS-2026-027)', amount_minor: 3000000, mode: 'eNACH', category: 'Tuition' },
      { id: 'PAY-2026-8803', student: 'Anushka Sen (DPS-2026-039)', amount_minor: 3200000, mode: 'eNACH', category: 'Tuition' },
      { id: 'PAY-2026-8804', student: 'Karan Singhal (DPS-2026-044)', amount_minor: 3100000, mode: 'eNACH', category: 'Tuition' },
      { id: 'PAY-2026-8805', student: 'Maya Pillai (DPS-2026-052)', amount_minor: 3100000, mode: 'eNACH', category: 'Tuition' },
    ],
  },
  {
    id: 'stl-104',
    provider_reference: 'SETTL-2026-10-23',
    provider: 'NPCI eNACH Payout (In Transit)',
    amount_minor: 3600000,
    gross_amount_minor: 3620000,
    fee_deduction_minor: 20000,
    settled_at: '2026-10-23T06:00:00Z',
    masked_bank_account: 'HDFC Bank •••• 4092 (Fee Collection A/C)',
    bank_utr: 'Pending Bank Confirmation',
    payment_count: 2,
    status: 'processing',
    associated_payments: [
      { id: 'PAY-2026-9048', student: 'Tara Nair (DPS-2026-118)', amount_minor: 3200000, mode: 'eNACH', category: 'Tuition' },
      { id: 'PAY-2026-9051', student: 'Armaan Khan (DPS-2026-129)', amount_minor: 400000, mode: 'eNACH', category: 'Activity' },
    ],
  },
];
const DEMO_SETTLEMENTS = DEMO_SETTLEMENTS_DETAILED;

const DEMO_OVERDUE_RECORDS = [
  {
    id: 'ovd-1',
    student_name: 'Rohan Mehta',
    account_reference: 'DPS-2026-141',
    student_id: 'stu-3',
    class_name: 'Grade 12-Science',
    due_date: '2026-09-15',
    outstanding_minor: 9500000,
    days_overdue: 37,
    debit_status: 'Failed Debit (05)',
    reminder_status: 'Sent 2d ago',
    guardian_name: 'Suresh Mehta',
    guardian_phone: '+91 98765 43212',
    guardian_email: 'suresh.mehta@example.com',
    recovery_logs: [
      { date: '2026-10-20', type: 'SMS & WhatsApp Reminder', note: 'Second overdue reminder delivered to parent.' },
      { date: '2026-10-16', type: 'eNACH Debit Failure', note: 'Autopay debit rejected by bank: Insufficient funds (05).' },
    ],
  },
  {
    id: 'ovd-2',
    student_name: 'Aditya Joshi',
    account_reference: 'DPS-2026-133',
    student_id: 'stu-9',
    class_name: 'Grade 9-A',
    due_date: '2026-10-05',
    outstanding_minor: 2800000,
    days_overdue: 17,
    debit_status: 'Failed Debit (05)',
    reminder_status: 'Pending Reminder',
    guardian_name: 'Sanjay Joshi',
    guardian_phone: '+91 98765 43218',
    guardian_email: 'sanjay.joshi@example.com',
    recovery_logs: [
      { date: '2026-10-18', type: 'eNACH Debit Failure', note: 'Debit failed due to insufficient balance.' },
    ],
  },
  {
    id: 'ovd-3',
    student_name: 'Kartik Saxena',
    account_reference: 'DPS-2026-061',
    student_id: 'stu-11',
    class_name: 'Grade 11-Commerce',
    due_date: '2026-08-10',
    outstanding_minor: 6200000,
    days_overdue: 73,
    debit_status: 'No Mandate Registered',
    reminder_status: 'Escalated to Accounts',
    guardian_name: 'Manoj Saxena',
    guardian_phone: '+91 98765 43220',
    guardian_email: 'manoj.saxena@example.com',
    recovery_logs: [
      { date: '2026-10-12', type: 'Staff Call Follow-up', note: 'Parent promised to clear dues by end of month.' },
      { date: '2026-09-01', type: 'Formal Letter Notice', note: 'Overdue notice sent to registered address.' },
    ],
  },
  {
    id: 'ovd-4',
    student_name: 'Shruti Banerjee',
    account_reference: 'DPS-2026-074',
    student_id: 'stu-12',
    class_name: 'Grade 10-B',
    due_date: '2026-07-15',
    outstanding_minor: 5500000,
    days_overdue: 99,
    debit_status: 'No Mandate Registered',
    reminder_status: 'Final Notice Issued',
    guardian_name: 'Anirban Banerjee',
    guardian_phone: '+91 98765 43221',
    guardian_email: 'anirban.banerjee@example.com',
    recovery_logs: [
      { date: '2026-10-10', type: 'Administrative Escalation', note: 'Fee concession review requested by parent.' },
    ],
  },
  {
    id: 'ovd-5',
    student_name: 'Harsh Vardhan',
    account_reference: 'DPS-2026-098',
    student_id: 'stu-13',
    class_name: 'Grade 8-C',
    due_date: '2026-10-01',
    outstanding_minor: 3400000,
    days_overdue: 21,
    debit_status: 'Active Mandate',
    reminder_status: 'Retry Scheduled (25 Oct)',
    guardian_name: 'Ravi Vardhan',
    guardian_phone: '+91 98765 43222',
    guardian_email: 'ravi.vardhan@example.com',
    recovery_logs: [
      { date: '2026-10-15', type: 'Automated Retry Notice', note: 'Parent notified of upcoming secondary retry.' },
    ],
  },
];

const DEMO_INSTITUTION_SETTINGS = {
  general: {
    displayName: 'Delhi Public School (Demo)',
    legalName: 'Delhi Public School Educational Society',
    contactEmail: 'accounts@dps-demo.invalid',
    contactPhone: '+91 11 2345 6789',
    address: 'Mathura Road, Near Zoo, New Delhi 110003',
    timezone: 'Asia/Kolkata (IST +05:30)',
    currency: 'INR (₹)',
  },
  branches: [
    { code: 'DEL-MAIN', name: 'Delhi Main Campus (Mathura Road)', city: 'New Delhi', state: 'Delhi', isDefault: true, activeStudents: 240 },
    { code: 'DEL-SOUTH', name: 'Delhi South Campus (RK Puram)', city: 'New Delhi', state: 'Delhi', isDefault: false, activeStudents: 102 },
  ],
  payments: {
    allowedMethods: {
      enachAutopay: true,
      upiInstant: true,
      netbanking: true,
      creditDebitCard: true,
      directBankTransfer: true,
    },
    receiptPreferences: {
      prefix: 'DPS-REC-2026-',
      startingNumber: 1001,
      headerNote: 'Official Fee Collection Receipt. Thank you for your payment.',
      footerNote: 'This is a computer generated document and does not require a physical signature.',
      termsAndConditions: 'Fee once paid is strictly governed by the institution fee and refund regulations.',
    },
    settlementAccount: {
      bankName: 'HDFC Bank Ltd.',
      maskedAccountNumber: '•••• •••• •••• 4092',
      ifscCode: 'HDFC0001234',
      accountType: 'Current Account (Institutional)',
      payoutCycle: 'T+1 Working Day (NPCI Cleared)',
      status: 'Verified via Penny Drop',
    },
  },
  notifications: {
    paymentConfirmations: { email: true, sms: true, whatsapp: true },
    upcomingInstalmentReminders: { enabled: true, daysBeforeDue: [7, 3, 1] },
    overdueReminders: { enabled: true, frequency: 'Weekly' },
    failedDebitNotifications: { immediateEmail: true, immediateSms: true, alertFinanceTeam: true },
  },
  staffPermissions: {
    institutionRoles: [
      { role: 'Institution Owner', count: 1, description: 'Unrestricted administration across all campuses and financial ledgers' },
      { role: 'Finance & Fee Manager (Admin)', count: 1, description: 'Instalment customization, collections, waivers, and reconciliations' },
      { role: 'Accountant', count: 1, description: 'Fee recording, offline payment verification, and receipt issuance' },
      { role: 'Collection Staff', count: 1, description: 'Follow-ups, reminder dispatch, and recovery note logging' },
      { role: 'Auditor (Read-only)', count: 1, description: 'Read-only access to records, settlements, and export reports' },
    ],
    branchIsolation: 'Enforced (Staff restricted to assigned campuses; Owner and Auditor multi-branch)',
  },
  securityAccount: {
    currentUser: 'rakeshanimator143@gmail.com',
    role: 'Institution Owner',
    mfaEnabled: true,
    sessionTimeoutMinutes: 60,
    ipRestrictionsEnabled: false,
    auditLogRetentionDays: 365,
  },
  enachPreferences: {
    mandateProvider: 'NPCI National Automated Clearing House / Sandbox eNACH Rail',
    maxMandateAmountMinor: 10000000,
    presentationWindow: 'T-0 Morning (08:30 AM IST)',
    retryStrategy: 'Maximum 2 retries with 3-day buffer interval',
    sendWhatsAppRegistrationLink: true,
  },
};

const DEMO_SCHEDULES = [
  {
    id: 'sch-1',
    account_reference: 'DPS-2026-089',
    payer_id: 'g-1',
    status: 'active',
  },
  {
    id: 'sch-2',
    account_reference: 'DPS-2026-104',
    payer_id: 'g-2',
    status: 'active',
  },
  {
    id: 'sch-3',
    account_reference: 'DPS-2026-141',
    payer_id: 'g-3',
    status: 'active',
  },
];

async function handle(req: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  const path = route.join('/');
  const method = req.method;

  // 1. Auth routes
  if (path === 'auth/login' && method === 'POST') {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const email = body.email || DEMO_USER.email;
    const session = {
      ...DEMO_SESSION,
      user: { ...DEMO_USER, email },
    };

    const res = NextResponse.json(session, { status: 200 });
    res.cookies.set('jodo_session', 'demo-session-token', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60,
    });
    return res;
  }

  if (path === 'auth/me') {
    const cookie = req.cookies.get('jodo_session')?.value;
    if (!cookie) {
      if (
        process.env.JODO_READONLY_PREVIEW === 'true' ||
        process.env.REFERENCE_READONLY_PREVIEW === 'true' ||
        process.env.DEPLOYMENT_MODE === 'demo'
      ) {
        const res = NextResponse.json(DEMO_SESSION);
        res.cookies.set('jodo_session', 'demo-session-token', {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 8 * 60 * 60,
        });
        return res;
      }
      return NextResponse.json({ message: 'Sign in to the owner console' }, { status: 401 });
    }
    return NextResponse.json(DEMO_SESSION);
  }

  if (path === 'auth/logout' || path === 'auth/logout-all') {
    const res = NextResponse.json({ ok: true });
    res.cookies.set('jodo_session', '', { path: '/', maxAge: 0 });
    return res;
  }

  if (path === 'admin/fees/dashboard') {
    return NextResponse.json(DEMO_DASHBOARD);
  }

  if (path === 'admin/fees/settings/payment-form') {
    if (method === 'POST') return NextResponse.json({ ok: true });
    return NextResponse.json({
      fields: [
        { key: 'student_name', label: 'Student Full Name', visible: true, required: true, editable: false, order: 1 },
        { key: 'student_reference', label: 'Enrollment / Student ID', visible: true, required: true, editable: false, order: 2 },
        { key: 'payer_name', label: 'Parent / Payer Name', visible: true, required: true, editable: true, order: 3 },
        { key: 'payer_email', label: 'Billing Email Address', visible: true, required: true, editable: true, order: 4 },
        { key: 'payer_phone', label: 'Mobile Number for OTP', visible: true, required: true, editable: true, order: 5 },
        { key: 'bank_account_mask', label: 'Bank Account Number', visible: true, required: true, editable: true, order: 6 },
        { key: 'ifsc_code', label: 'Bank IFSC Code', visible: true, required: true, editable: true, order: 7 },
      ],
      components: [
        { code: 'tuition', label: 'Tuition Fee (Quarterly)', visible: true, required: true, selectable: false, fixed: true },
        { code: 'library', label: 'Library & Digital Resources', visible: true, required: false, selectable: true, fixed: true },
        { code: 'lab', label: 'Laboratory & Practical Fee', visible: true, required: false, selectable: true, fixed: true },
        { code: 'transport', label: 'Campus Transport Facility', visible: true, required: false, selectable: true, fixed: false },
        { code: 'exam', label: 'Board / Examination Fee', visible: true, required: true, selectable: false, fixed: true },
      ],
      rules: {
        allow_full_payment: true,
        allow_partial_payment: true,
        allow_advance_payment: true,
        min_partial_amount_minor: 100000,
        max_partial_amount_minor: 50000000,
        require_down_payment: false,
        enable_enach: true,
        allow_payer_contact_editing: true,
        terms_text:
          'I hereby authorize recurring eNACH debits for educational institution fee installments as per the assigned schedule. Registration activates recurring collection and money is not deducted until scheduled due dates.',
      },
      instructions:
        'Please review and verify your payer contact details before registering your recurring eNACH mandate.',
    });
  }

  if (path === 'admin/fees/settings/receipt-email') {
    if (method === 'POST') return NextResponse.json({ ok: true });
    return NextResponse.json({
      receipt_config: {
        institution_name: 'Delhi Public School (Demo)',
        institution_address: '123 Education Boulevard, Knowledge City, Bangalore',
        contact_email: 'accounts@institution.edu',
        contact_phone: '+91 1800-123-4567',
        receipt_heading: 'OFFICIAL FEE RECEIPT',
        receipt_prefix: 'REC',
        header_note: 'Thank you for your payment. This is an official computer-generated receipt.',
        footer_note: 'For fee inquiries, please contact the institution accounts office.',
        signatory_title: 'Authorized Finance Officer',
        terms_and_conditions:
          'Fee once paid is subject to the institution refund policy. Retain this receipt for tax and academic records.',
      },
      email_config: {
        sender_name: 'Delhi Public School Finance Desk',
        subject_line: 'Payment Receipt: {{receipt_number}} for {{student_name}}',
        greeting_text: 'Dear {{parent_name}},',
        body_template:
          'We have received your payment of {{amount}} towards {{student_name}} (Course: {{course}}) on {{date}}.\n\nReceipt Number: {{receipt_number}}\nTransaction Reference: {{transaction_id}}\nRemaining Outstanding Balance: {{outstanding_balance}}\n\nThank you for choosing {{institution_name}}.',
      },
    });
  }

  if (path === 'admin/academic/students' && method === 'POST') {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const studentReference =
      body.studentReference ||
      body.student_reference ||
      `DPS-2026-${String(DEMO_STUDENTS.length + 100).padStart(3, '0')}`;
    const id = 'stu-' + (DEMO_STUDENTS.length + 1);
    const newStudent = {
      id,
      full_name: body.fullName || body.full_name || 'New Student',
      student_reference: studentReference,
      status: body.status || 'enrolled',
      institute: 'Delhi Public School (Demo)',
      group_name: body.groupName || body.group_name || 'Grade 10-A',
      course: body.course || 'CBSE Secondary',
      grade: body.grade || '10',
      academic_year: body.academicYear || body.academic_year || '2026-27',
      campus: body.campus || 'Delhi Main Campus',
      email: body.email || 'student@example.com',
      phone: body.phone || '+91 98765 00000',
      guardian_name: body.guardianName || body.guardian_name || 'Guardian',
      guardian_email: body.guardianEmail || body.guardian_email || 'guardian@example.com',
      guardian_phone: body.guardianPhone || body.guardian_phone || '+91 98765 11111',
      enach_status: 'pending',
      net_payable_minor: '12000000',
      paid_minor: '0',
      outstanding_minor: '12000000',
    };
    DEMO_STUDENTS.unshift(newStudent);
    DEMO_ACADEMIC_OVERVIEW.students.unshift({
      id: newStudent.id,
      student_reference: newStudent.student_reference,
      full_name: newStudent.full_name,
      date_of_birth: '2010-01-01',
      status: 'active',
      branch_code: 'DEL-MAIN',
      branch_name: 'Delhi Main Campus',
      academic_year: newStudent.academic_year,
    });
    return NextResponse.json({ ok: true, ...newStudent });
  }

  if (path.startsWith('admin/fees/students/')) {
    const rest = path.slice('admin/fees/students/'.length);
    const parts = rest.split('/');
    const studentId = parts[0] || 'stu-1';
    const action = parts[1];

    const defaultStudent = DEMO_STUDENTS[0] || {
      id: 'stu-1',
      full_name: 'Aarav Sharma',
      student_reference: 'DPS-2026-089',
      status: 'enrolled',
      institute: 'Delhi Public School (Demo)',
      group_name: 'Grade 10-A',
      course: 'CBSE Secondary',
      grade: '10',
      academic_year: '2026-27',
      enach_status: 'active',
      net_payable_minor: '12000000',
      paid_minor: '6000000',
      outstanding_minor: '6000000',
    };
    const student =
      DEMO_STUDENTS.find((s) => s.id === studentId || s.student_reference === studentId) ||
      defaultStudent;

    if (action === 'payments' && method === 'POST') {
      let body: any = {};
      try {
        body = await req.json();
      } catch {}
      const amountMinor = Number(body.amountMinor || 2000000);

      const currentPaid = Number(student.paid_minor || 0);
      const currentNet = Number(student.net_payable_minor || 12000000);
      const newPaid = currentPaid + amountMinor;
      student.paid_minor = String(newPaid);
      student.outstanding_minor = String(Math.max(0, currentNet - newPaid));

      const paymentId = 'PAY-' + Math.floor(1000 + Math.random() * 9000);
      const receiptId = 'REC-' + Math.floor(1000 + Math.random() * 9000);
      const mode = body.directPayment?.mode ? body.directPayment.mode.toUpperCase() : 'DIRECT';

      const paymentRecord = {
        id: paymentId,
        amount_minor: String(amountMinor),
        recorded_at: new Date().toISOString(),
        provider_reference:
          body.providerReference || `${mode}-${Date.now().toString().slice(-6)}`,
        status: `Direct (${mode})`,
      };

      if (!STUDENT_CUSTOM_PAYMENTS[student.id]) STUDENT_CUSTOM_PAYMENTS[student.id] = [];
      STUDENT_CUSTOM_PAYMENTS[student.id]!.unshift(paymentRecord);

      const receiptRecord = {
        id: receiptId,
        receipt_number: `DPS-REC-2026-${String(1000 + (STUDENT_CUSTOM_PAYMENTS[student.id]?.length || 0))}`,
        issued_at: new Date().toLocaleDateString('en-CA'),
      };
      if (!STUDENT_CUSTOM_RECEIPTS[student.id]) STUDENT_CUSTOM_RECEIPTS[student.id] = [];
      STUDENT_CUSTOM_RECEIPTS[student.id]!.unshift(receiptRecord);

      return NextResponse.json({
        ok: true,
        paymentId,
        receiptId,
        message: 'Payment recorded and receipt issued successfully',
      });
    }

    if (action === 'records') {
      const section = req.nextUrl.searchParams.get('section') || 'overview';

      let rows: Record<string, string | number>[] = [];
      if (section === 'installments') {
        const paidMinorNum = Number(student.paid_minor || 0);
        rows = [
          {
            id: 'inst-1',
            sequence: 1,
            due_date: '2026-07-10',
            amount_minor: '4000000',
            adjustment_amount_minor: '0',
            paid_amount_minor: String(Math.min(4000000, paidMinorNum)),
            remaining_minor: String(Math.max(0, 4000000 - Math.min(4000000, paidMinorNum))),
            status: paidMinorNum >= 4000000 ? 'settled' : paidMinorNum > 0 ? 'partial' : 'pending',
          },
          {
            id: 'inst-2',
            sequence: 2,
            due_date: '2026-10-25',
            amount_minor: '4000000',
            adjustment_amount_minor: '0',
            paid_amount_minor: String(Math.min(4000000, Math.max(0, paidMinorNum - 4000000))),
            remaining_minor: String(
              Math.max(0, 4000000 - Math.min(4000000, Math.max(0, paidMinorNum - 4000000))),
            ),
            status: paidMinorNum >= 8000000 ? 'settled' : paidMinorNum > 4000000 ? 'partial' : 'pending',
          },
          {
            id: 'inst-3',
            sequence: 3,
            due_date: '2027-01-15',
            amount_minor: '4000000',
            adjustment_amount_minor: '0',
            paid_amount_minor: String(Math.min(4000000, Math.max(0, paidMinorNum - 8000000))),
            remaining_minor: String(
              Math.max(0, 4000000 - Math.min(4000000, Math.max(0, paidMinorNum - 8000000))),
            ),
            status: paidMinorNum >= 12000000 ? 'settled' : paidMinorNum > 8000000 ? 'partial' : 'pending',
          },
        ];
      } else if (section === 'master') {
        rows = [
          { id: 'm-1', sequence: 1, due_date: '2026-07-10', amount_minor: '4000000' },
          { id: 'm-2', sequence: 2, due_date: '2026-10-25', amount_minor: '4000000' },
          { id: 'm-3', sequence: 3, due_date: '2027-01-15', amount_minor: '4000000' },
        ];
      } else if (section === 'components') {
        rows = [
          { id: 'comp-1', label: 'Tuition Fee', code: 'TUIT', amount_minor: '8000000', account_reference: student.student_reference },
          { id: 'comp-2', label: 'Development Fee', code: 'DEV', amount_minor: '2000000', account_reference: student.student_reference },
          { id: 'comp-3', label: 'Activity & Lab Fee', code: 'ACT', amount_minor: '2000000', account_reference: student.student_reference },
        ];
      } else if (section === 'payments') {
        const custom = STUDENT_CUSTOM_PAYMENTS[student.id] || [];
        const basePayments = Number(student.paid_minor || 0) > 0 ? [
          { id: 'PAY-8821', amount_minor: '2000000', recorded_at: new Date(Date.now() - 86400000 * 3).toISOString(), provider_reference: 'UPI-9398238581', status: 'Direct (UPI)' },
        ] : [];
        rows = [...custom, ...basePayments];
      } else if (section === 'mandates') {
        rows = [
          { id: 'mndt-1', provider_reference: 'MNDT-2026-0994', rail: 'eNACH (NPCI)', status: 'active', last_event_at: '2026-06-15', provider: 'sandbox_enach' },
        ];
      } else if (section === 'receipts') {
        const custom = STUDENT_CUSTOM_RECEIPTS[student.id] || [];
        rows = [
          ...custom,
          { id: 'rec-1', receipt_number: 'DPS-REC-2026-00412', issued_at: '2026-07-08' },
        ];
      } else if (section === 'bank') {
        rows = [
          { id: 'bank-1', provider_reference: 'HDFC-N89210948', recorded_at: '2026-07-08', amount_minor: '4000000', status: 'verified', evidence_note: 'IMPS verified' },
        ];
      } else if (section === 'activity') {
        rows = [
          { id: 'act-1', recorded_at: new Date().toISOString(), action: 'Student profile verified', performed_by: 'Owner Console', status: 'verified' },
          { id: 'act-2', recorded_at: new Date(Date.now() - 86400000).toISOString(), action: 'Fee structure assigned (CBSE Annual)', performed_by: 'Academic Office', status: 'active' },
          { id: 'act-3', recorded_at: new Date(Date.now() - 172800000).toISOString(), action: 'Enrollment registration completed', performed_by: 'Administrator', status: 'completed' },
        ];
      }

      return NextResponse.json({
        total: rows.length,
        rows,
        pageSize: 20,
        page: 1,
      });
    }

    return NextResponse.json({
      id: studentId,
      full_name: student.full_name,
      student_reference: student.student_reference,
      status: student.status || 'enrolled',
      institute: student.institute || 'Delhi Public School (Demo)',
      group_name: student.group_name || 'Grade 10-A',
      course: student.course || 'CBSE Secondary',
      grade: student.grade || '10',
      academic_year: student.academic_year || '2026-27',
      campus: (student as any).campus || 'Delhi Main Campus',
      email: (student as any).email || 'student@example.com',
      phone: (student as any).phone || '+91 98765 43210',
      guardian_name: (student as any).guardian_name || 'Rajesh Sharma',
      guardian_email: (student as any).guardian_email || 'rajesh.sharma@example.com',
      guardian_phone: (student as any).guardian_phone || '+91 98765 43210',
      enach_status: student.enach_status || 'active',
      summary: {
        net_payable_minor: student.net_payable_minor || '12000000',
        paid_minor: student.paid_minor || '6000000',
        outstanding_minor: student.outstanding_minor || '6000000',
      },
      balances: [
        {
          schedule_id: 'sch-' + student.id,
          account_reference: student.student_reference,
          net_payable_minor: student.net_payable_minor || '12000000',
          paid_minor: student.paid_minor || '6000000',
          outstanding_minor: student.outstanding_minor || '6000000',
        },
      ],
    });
  }

  if (path === 'admin/academic/students' || path === 'admin/fees/students') {
    return NextResponse.json({
      rows: DEMO_STUDENTS,
      total: DEMO_STUDENTS.length,
      page: 1,
      pageSize: 20,
    });
  }

  if (path === 'admin/academic/guardians') {
    return NextResponse.json(DEMO_ACADEMIC_OVERVIEW.guardians);
  }

  // 3. Groups / Classes catalogue
  if (path === 'admin/academic/overview') {
    return NextResponse.json(DEMO_ACADEMIC_OVERVIEW);
  }

  // 4. Institutions & Users
  if (path === 'admin/tenant/overview') {
    return NextResponse.json(DEMO_TENANT_OVERVIEW);
  }

  // 5. Flex / eNACH routes (12 Production Sandbox Modules)
  const enachRes = await handleEnachRoute(req, path, method, DEMO_STUDENTS);
  if (enachRes) {
    return enachRes;
  }

  if (path === 'admin/fees/mandate-setups') {
    return NextResponse.json(DEMO_SETUPS);
  }

  if (path === 'admin/enach/filters') {
    return NextResponse.json({ branches: [], plans: [] });
  }

  // -------------------------------------------------------------
  // Module 1: Dedicated Payments
  // -------------------------------------------------------------
  if (path === 'admin/fees/payments' && method === 'GET') {
    const search = (req.nextUrl.searchParams.get('search') || '').toLowerCase().trim();
    const status = req.nextUrl.searchParams.get('status') || '';
    const mode = req.nextUrl.searchParams.get('mode') || '';

    let filtered = [...DEMO_PAYMENTS_LIST];
    if (search) {
      filtered = filtered.filter(
        (p) =>
          p.id.toLowerCase().includes(search) ||
          p.student_name.toLowerCase().includes(search) ||
          p.account_reference.toLowerCase().includes(search) ||
          p.payer_name.toLowerCase().includes(search) ||
          p.provider_reference.toLowerCase().includes(search) ||
          p.receipt_number.toLowerCase().includes(search),
      );
    }
    if (status) {
      filtered = filtered.filter((p) => p.status === status);
    }
    if (mode) {
      filtered = filtered.filter((p) => p.payment_mode.toLowerCase().includes(mode.toLowerCase()));
    }

    const totalCollected = DEMO_PAYMENTS_LIST.filter((p) => p.status === 'settled').reduce(
      (sum, p) => sum + p.amount_minor,
      0,
    );
    const todayCollected = DEMO_PAYMENTS_LIST.filter(
      (p) => p.status === 'settled' && p.recorded_at.startsWith('2026-10-22'),
    ).reduce((sum, p) => sum + p.amount_minor, 0);
    const successfulCount = DEMO_PAYMENTS_LIST.filter((p) => p.status === 'settled').length;
    const pendingCount = DEMO_PAYMENTS_LIST.filter((p) => p.status === 'processing').length;
    const failedCount = DEMO_PAYMENTS_LIST.filter((p) => p.status === 'failed').length;
    const refundedAmount = DEMO_PAYMENTS_LIST.reduce((sum, p) => sum + (p.refunded_amount_minor || 0), 0);

    return NextResponse.json({
      rows: filtered,
      total: filtered.length,
      kpis: {
        total_collected_minor: totalCollected,
        today_collections_minor: todayCollected,
        successful_count: successfulCount,
        pending_count: pendingCount,
        failed_count: failedCount,
        refunded_amount_minor: refundedAmount,
      },
    });
  }

  // -------------------------------------------------------------
  // Module 2: Dedicated Settlements
  // -------------------------------------------------------------
  if (path === 'admin/fees/settlements' && method === 'GET') {
    const status = req.nextUrl.searchParams.get('status') || '';
    let filtered = [...DEMO_SETTLEMENTS_DETAILED];
    if (status) {
      filtered = filtered.filter((s) => s.status === status);
    }

    const totalSettled = DEMO_SETTLEMENTS_DETAILED.filter((s) => s.status === 'settled').reduce(
      (sum, s) => sum + s.amount_minor,
      0,
    );
    const pendingSettlement = DEMO_SETTLEMENTS_DETAILED.filter((s) => s.status === 'processing').reduce(
      (sum, s) => sum + s.amount_minor,
      0,
    );
    const successfulCount = DEMO_SETTLEMENTS_DETAILED.filter((s) => s.status === 'settled').length;
    const failedCount = DEMO_SETTLEMENTS_DETAILED.filter((s) => s.status === 'failed').length;

    return NextResponse.json({
      rows: filtered,
      total: filtered.length,
      kpis: {
        total_settled_minor: totalSettled,
        pending_settlement_minor: pendingSettlement,
        successful_settlements_count: successfulCount,
        failed_settlements_count: failedCount,
      },
      reconciliation: {
        matched_batches: successfulCount,
        pending_batches: pendingSettlement > 0 ? 1 : 0,
        unreconciled_cases: 0,
        status: 'Reconciled & Matched',
      },
    });
  }

  // -------------------------------------------------------------
  // Module 3: Cashflow Analytics
  // -------------------------------------------------------------
  if (path === 'admin/fees/cashflow' && method === 'GET') {
    return NextResponse.json({
      kpis: {
        expected_today_minor: 85000000,
        expected_this_week_minor: 240000000,
        expected_this_month_minor: 950000000,
        actual_collections_minor: 710000000,
        outstanding_amount_minor: 240000000,
        upcoming_enach_minor: 180000000,
        overdue_balance_minor: 45000000,
        failed_debit_balance_minor: 2500000,
        realization_rate_pct: 74.7,
      },
      trends: [
        { month: 'May 2026', expected_minor: 750000000, collected_minor: 710000000, rate: 94.6 },
        { month: 'Jun 2026', expected_minor: 800000000, collected_minor: 770000000, rate: 96.2 },
        { month: 'Jul 2026', expected_minor: 850000000, collected_minor: 810000000, rate: 95.2 },
        { month: 'Aug 2026', expected_minor: 900000000, collected_minor: 860000000, rate: 95.5 },
        { month: 'Sep 2026', expected_minor: 950000000, collected_minor: 910000000, rate: 95.7 },
        { month: 'Oct 2026 (MTD)', expected_minor: 950000000, collected_minor: 710000000, rate: 74.7 },
      ],
      feeCategories: [
        { category: 'Tuition Fee', collected_minor: 482800000, share_pct: 68 },
        { category: 'Development & Infrastructure', collected_minor: 113600000, share_pct: 16 },
        { category: 'Activity, Sports & Practical Lab', collected_minor: 56800000, share_pct: 8 },
        { category: 'Campus Transportation', collected_minor: 35500000, share_pct: 5 },
        { category: 'Library & Digital Subscriptions', collected_minor: 21300000, share_pct: 3 },
      ],
      branchCollections: [
        { branch: 'Delhi Main Campus (DEL-MAIN)', collected_minor: 411800000, share_pct: 58, students: 240 },
        { branch: 'Delhi South Campus (DEL-SOUTH)', collected_minor: 227200000, share_pct: 32, students: 102 },
        { branch: 'Bangalore South Campus (Demo)', collected_minor: 71000000, share_pct: 10, students: 45 },
      ],
      upcomingInstalments: [
        { id: 'inst-up-1', student_ref: 'DPS-2026-089', student_name: 'Aarav Sharma', due_date: '2026-10-25', sequence: 2, amount_minor: 3000000, mandate_status: 'Active (NPCI)' },
        { id: 'inst-up-2', student_ref: 'DPS-2026-104', student_name: 'Diya Patel', due_date: '2026-10-28', sequence: 2, amount_minor: 4500000, mandate_status: 'Active (NPCI)' },
        { id: 'inst-up-3', student_ref: 'DPS-2026-055', student_name: 'Kavya Reddy', due_date: '2026-10-30', sequence: 1, amount_minor: 3500000, mandate_status: 'Active (NPCI)' },
        { id: 'inst-up-4', student_ref: 'DPS-2026-077', student_name: 'Vivaan Malhotra', due_date: '2026-11-05', sequence: 2, amount_minor: 4000000, mandate_status: 'Active (NPCI)' },
        { id: 'inst-up-5', student_ref: 'DPS-2026-092', student_name: 'Ishan Verma', due_date: '2026-11-10', sequence: 2, amount_minor: 3000000, mandate_status: 'Direct Bank' },
      ],
      recentPayments: DEMO_PAYMENTS_LIST.slice(0, 5),
      forecast: {
        projectedMonthEndMinor: 915000000,
        expectedRealizationPct: 96.3,
        scheduledDebitsCount: 124,
        confidenceLevel: 'High (Automated eNACH Rails)',
      },
    });
  }

  // -------------------------------------------------------------
  // Module 4: Overdue & Fee Recovery
  // -------------------------------------------------------------
  if (path === 'admin/fees/overdue' && method === 'GET') {
    const bucket = req.nextUrl.searchParams.get('bucket') || '';
    const search = (req.nextUrl.searchParams.get('search') || '').toLowerCase().trim();

    let filtered = [...DEMO_OVERDUE_RECORDS];
    if (bucket === '1-30') filtered = filtered.filter((r) => r.days_overdue >= 1 && r.days_overdue <= 30);
    else if (bucket === '31-60') filtered = filtered.filter((r) => r.days_overdue >= 31 && r.days_overdue <= 60);
    else if (bucket === '61-90') filtered = filtered.filter((r) => r.days_overdue >= 61 && r.days_overdue <= 90);
    else if (bucket === '90+') filtered = filtered.filter((r) => r.days_overdue > 90);

    if (search) {
      filtered = filtered.filter(
        (r) =>
          r.student_name.toLowerCase().includes(search) ||
          r.account_reference.toLowerCase().includes(search) ||
          r.class_name.toLowerCase().includes(search) ||
          r.guardian_name.toLowerCase().includes(search),
      );
    }

    return NextResponse.json({
      rows: filtered,
      total: filtered.length,
      kpis: {
        total_overdue_minor: 45000000,
        students_with_dues: 48,
        overdue_instalments: 62,
        failed_debits: 7,
        recovered_amount_minor: 12800000,
      },
      agingBuckets: {
        b1_30: { label: '1–30 Days', amount_minor: 14200000, student_count: 18 },
        b31_60: { label: '31–60 Days', amount_minor: 16500000, student_count: 15 },
        b61_90: { label: '61–90 Days', amount_minor: 8800000, student_count: 9 },
        b90_plus: { label: '90+ Days', amount_minor: 5500000, student_count: 6 },
      },
    });
  }

  if (path === 'admin/fees/overdue/reminder' && method === 'POST') {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    const record = DEMO_OVERDUE_RECORDS.find((r) => r.id === body.overdueId || r.account_reference === body.accountReference);
    if (record) {
      record.reminder_status = 'Sent just now';
      record.recovery_logs.unshift({
        date: new Date().toLocaleDateString('en-CA'),
        type: `${body.channel || 'SMS & WhatsApp'} Reminder Notice`,
        note: `Authorized reminder notice dispatched to parent (${record.guardian_name}). Delivery confirmed.`,
      });
    }
    return NextResponse.json({
      ok: true,
      message: `Authorized fee overdue reminder dispatched successfully to ${record?.guardian_name || 'parent'}!`,
    });
  }

  // -------------------------------------------------------------
  // Module 5: Comprehensive Reports Workspace
  // -------------------------------------------------------------
  if (path === 'admin/fees/reports' && method === 'GET') {
    const reportType = req.nextUrl.searchParams.get('type') || 'payment';

    if (reportType === 'payment') {
      return NextResponse.json({
        report: 'payment',
        title: 'Fee Payment Ledger Report',
        description: 'Complete audit of received payments, gateway references, receipt numbers, and settlement statuses.',
        summary: {
          totalVolumeMinor: 62000000,
          recordCount: DEMO_PAYMENTS_LIST.length,
          settledCount: DEMO_PAYMENTS_LIST.filter((p) => p.status === 'settled').length,
          avgTicketMinor: 3100000,
        },
        columns: ['Payment ID', 'Student / ID', 'Payer Name', 'Category', 'Mode', 'Reference', 'Date', 'Amount (₹)', 'Status'],
        rows: DEMO_PAYMENTS_LIST.map((p) => ({
          id: p.id,
          col1: p.id,
          col2: `${p.student_name} (${p.account_reference})`,
          col3: p.payer_name,
          col4: p.fee_category,
          col5: p.payment_mode,
          col6: p.provider_reference,
          col7: new Date(p.recorded_at).toLocaleDateString('en-IN'),
          col8: (p.amount_minor / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
          col9: p.status,
          raw_amount_minor: p.amount_minor,
        })),
      });
    }

    if (reportType === 'collection') {
      const cats = [
        { name: 'Tuition Fee', code: 'TUIT', collectedMinor: 482800000, expectedMinor: 520000000, rate: 92.8 },
        { name: 'Development & Infrastructure', code: 'DEV', collectedMinor: 113600000, expectedMinor: 130000000, rate: 87.3 },
        { name: 'Practical & Science Laboratory', code: 'LAB', collectedMinor: 56800000, expectedMinor: 65000000, rate: 87.4 },
        { name: 'Campus Transport Facility', code: 'TRAN', collectedMinor: 35500000, expectedMinor: 40000000, rate: 88.75 },
        { name: 'Activity, Sports & Club', code: 'ACT', collectedMinor: 21300000, expectedMinor: 25000000, rate: 85.2 },
      ];
      return NextResponse.json({
        report: 'collection',
        title: 'Fee Category Collection Summary Report',
        description: 'Collection velocity and realization percentages segregated by institute fee heads.',
        summary: {
          totalCollectedMinor: 710000000,
          totalExpectedMinor: 780000000,
          overallRealizationPct: 91.0,
          categoriesCount: cats.length,
        },
        columns: ['Category Code', 'Fee Category Name', 'Expected (₹)', 'Collected (₹)', 'Variance / Dues (₹)', 'Realization %'],
        rows: cats.map((c) => ({
          id: c.code,
          col1: c.code,
          col2: c.name,
          col3: (c.expectedMinor / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
          col4: (c.collectedMinor / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
          col5: ((c.expectedMinor - c.collectedMinor) / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
          col6: `${c.rate}%`,
          raw_amount_minor: c.collectedMinor,
        })),
      });
    }

    if (reportType === 'settlement') {
      return NextResponse.json({
        report: 'settlement',
        title: 'Bank Settlements & Payouts Report',
        description: 'Audit report of batch payouts deposited into the primary institutional bank account.',
        summary: {
          totalSettledMinor: 58400000,
          batchesCount: DEMO_SETTLEMENTS_DETAILED.length,
          totalPaymentsBundled: DEMO_SETTLEMENTS_DETAILED.reduce((s, b) => s + b.payment_count, 0),
          netCreditsMinor: 58400000,
        },
        columns: ['Settlement Batch', 'Provider Rail', 'Settled Date', 'Bank Account', 'Bank UTR', 'Payments', 'Amount (₹)', 'Status'],
        rows: DEMO_SETTLEMENTS_DETAILED.map((s) => ({
          id: s.id,
          col1: s.provider_reference,
          col2: s.provider,
          col3: new Date(s.settled_at).toLocaleDateString('en-IN'),
          col4: s.masked_bank_account,
          col5: s.bank_utr,
          col6: `${s.payment_count} payments`,
          col7: (s.amount_minor / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
          col8: s.status,
          raw_amount_minor: s.amount_minor,
        })),
      });
    }

    if (reportType === 'overdue') {
      return NextResponse.json({
        report: 'overdue',
        title: 'Fee Overdue & Aging Analysis Report',
        description: 'Delinquent student fee instalments segregated by chronological aging buckets.',
        summary: {
          totalOverdueMinor: 45000000,
          overdueStudentsCount: DEMO_OVERDUE_RECORDS.length,
          avgDaysOverdue: 49,
          criticalAccounts: DEMO_OVERDUE_RECORDS.filter((r) => r.days_overdue > 60).length,
        },
        columns: ['Student Name', 'Student Ref', 'Class / Grade', 'Due Date', 'Days Overdue', 'Outstanding (₹)', 'Debit Status', 'Reminder Status'],
        rows: DEMO_OVERDUE_RECORDS.map((r) => ({
          id: r.id,
          col1: r.student_name,
          col2: r.account_reference,
          col3: r.class_name,
          col4: r.due_date,
          col5: `${r.days_overdue} days`,
          col6: (r.outstanding_minor / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
          col7: r.debit_status,
          col8: r.reminder_status,
          raw_amount_minor: r.outstanding_minor,
        })),
      });
    }

    const reportTitles: Record<string, string> = {
      outstanding: 'Outstanding Student Fees Report',
      cashflow: 'Monthly Cashflow Realization Report',
      instalment: 'Instalment Milestone Report',
      enach: 'eNACH Mandate Registration Report',
      failed_debit: 'Failed Debit & Recovery Report',
      student_summary: 'Comprehensive Student Fee Summary Report',
    };

    return NextResponse.json({
      report: reportType,
      title: reportTitles[reportType] || 'Institution Financial Report',
      description: 'Accurate institution-scoped financial and operational audit records.',
      summary: {
        totalVolumeMinor: 62000000,
        recordCount: DEMO_STUDENTS.length,
        collectionRatePct: 74.7,
        activeCampuses: 2,
      },
      columns: ['Student ID', 'Student Full Name', 'Class / Grade', 'Net Payable (₹)', 'Paid (₹)', 'Outstanding (₹)', 'Mandate Status', 'Enrolled Status'],
      rows: DEMO_STUDENTS.map((s) => ({
        id: s.id,
        col1: s.student_reference,
        col2: s.full_name,
        col3: s.group_name || 'Standard Grade',
        col4: (Number(s.net_payable_minor || 12000000) / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
        col5: (Number(s.paid_minor || 6000000) / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
        col6: (Number(s.outstanding_minor || 6000000) / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
        col7: s.enach_status === 'active' ? 'Active Mandate' : 'Pending Registration',
        col8: s.status,
        raw_amount_minor: Number(s.outstanding_minor || 0),
      })),
    });
  }

  // -------------------------------------------------------------
  // Module 6: Institution Profile & Branches
  // -------------------------------------------------------------
  if (path === 'admin/tenant/profile') {
    if (method === 'POST') {
      let body: any = {};
      try {
        body = await req.json();
      } catch {}
      if (body.display_name) DEMO_TENANT_OVERVIEW.tenant.display_name = body.display_name;
      if (body.legal_name) DEMO_TENANT_OVERVIEW.tenant.legal_name = body.legal_name;
      if (body.official_email) DEMO_INSTITUTION_SETTINGS.general.contactEmail = body.official_email;
      if (body.official_phone) DEMO_INSTITUTION_SETTINGS.general.contactPhone = body.official_phone;
      if (body.registered_address) DEMO_INSTITUTION_SETTINGS.general.address = body.registered_address;
      return NextResponse.json({ ok: true, message: 'Institution profile saved successfully' });
    }
    return NextResponse.json({
      tenant: DEMO_TENANT_OVERVIEW.tenant,
      institutionType: 'CBSE Affiliated Senior Secondary School (K-12)',
      registrationDetails: {
        societyRegistration: 'TRUST-DEL-2026-901',
        pan: 'AAATD1234F',
        gstin: '07AAATD1234F1Z5',
        incorporationDate: '1982-04-12',
      },
      contacts: {
        email: DEMO_INSTITUTION_SETTINGS.general.contactEmail,
        phone: DEMO_INSTITUTION_SETTINGS.general.contactPhone,
        address: DEMO_INSTITUTION_SETTINGS.general.address,
        timezone: DEMO_INSTITUTION_SETTINGS.general.timezone,
      },
      bankSettlement: DEMO_INSTITUTION_SETTINGS.payments.settlementAccount,
      onboardingStatus: 'Completed & Active',
    });
  }

  if (path === 'admin/tenant/branches') {
    if (method === 'POST') {
      let body: any = {};
      try {
        body = await req.json();
      } catch {}
      const newBranch = {
        id: 'br-' + Date.now(),
        legal_entity_id: 'ent-1',
        legal_entity_name: DEMO_TENANT_OVERVIEW.tenant.legal_name || 'DPS Educational Society',
        code: body.code || 'DEL-NEW',
        name: body.name || 'New Campus',
        city: body.city || 'New Delhi',
        state: body.state || 'Delhi',
        status: 'active',
      };
      DEMO_TENANT_OVERVIEW.branches.push(newBranch);
      return NextResponse.json({ ok: true, branch: newBranch, message: 'Campus branch registered successfully' });
    }
    return NextResponse.json(DEMO_TENANT_OVERVIEW.branches);
  }

  // -------------------------------------------------------------
  // Module 7: Institution Staff & Users
  // -------------------------------------------------------------
  if (path === 'admin/tenant/members') {
    if (method === 'POST') {
      let body: any = {};
      try {
        body = await req.json();
      } catch {}
      const newMember = {
        id: 'mem-' + Date.now(),
        user_id: 'usr-' + Date.now(),
        name: body.name || 'New Staff Member',
        email: body.email,
        role_key: body.role_key || 'support',
        status: 'active',
        branch_id: body.branch_id || 'br-1',
        assigned_branch: body.branch_id === 'br-2' ? 'Delhi South Campus' : 'Delhi Main Campus',
        last_login: 'Invited just now',
      };
      (DEMO_TENANT_OVERVIEW.members as any).push(newMember);
      return NextResponse.json({ ok: true, member: newMember, message: 'Staff member added and invitation dispatched' });
    }
    const membersWithNames = DEMO_TENANT_OVERVIEW.members.map((m: any, idx) => ({
      ...m,
      name: m.name || (idx === 0 ? 'Rakesh V (Institution Owner)' : idx === 1 ? 'Rajeshwari Sharma' : 'Amit Sen'),
      assigned_branch: m.branch_id === 'br-1' ? 'Delhi Main Campus' : m.branch_id === 'br-2' ? 'Delhi South Campus' : 'All Campuses',
      last_login: m.last_login || (idx === 0 ? 'Today 10:14 AM' : idx === 1 ? 'Today 09:30 AM' : 'Yesterday 04:15 PM'),
    }));
    return NextResponse.json({
      members: membersWithNames,
      kpis: {
        totalStaff: membersWithNames.length,
        activeStaff: membersWithNames.filter((m: any) => m.status === 'active').length,
        inactiveStaff: membersWithNames.filter((m: any) => m.status === 'inactive').length,
        pendingInvitations: membersWithNames.filter((m: any) => m.status === 'pending').length,
      },
    });
  }

  if (path.startsWith('admin/tenant/members/') && path.endsWith('/toggle') && method === 'POST') {
    const memberId = path.replace('admin/tenant/members/', '').replace('/toggle', '');
    const member = (DEMO_TENANT_OVERVIEW.members as any[]).find((m) => m.id === memberId);
    if (member) {
      member.status = member.status === 'active' ? 'inactive' : 'active';
    }
    return NextResponse.json({ ok: true, status: member?.status || 'active', message: `Staff status updated to ${member?.status}` });
  }

  // -------------------------------------------------------------
  // Module 8: Institution Settings (7 Sections)
  // -------------------------------------------------------------
  if (path === 'admin/fees/settings/institution') {
    if (method === 'POST') {
      let body: any = {};
      try {
        body = await req.json();
      } catch {}
      if (body.general) Object.assign(DEMO_INSTITUTION_SETTINGS.general, body.general);
      if (body.payments) Object.assign(DEMO_INSTITUTION_SETTINGS.payments, body.payments);
      if (body.notifications) Object.assign(DEMO_INSTITUTION_SETTINGS.notifications, body.notifications);
      if (body.securityAccount) Object.assign(DEMO_INSTITUTION_SETTINGS.securityAccount, body.securityAccount);
      if (body.enachPreferences) Object.assign(DEMO_INSTITUTION_SETTINGS.enachPreferences, body.enachPreferences);
      return NextResponse.json({ ok: true, message: 'Institution settings updated and verified successfully' });
    }
    return NextResponse.json(DEMO_INSTITUTION_SETTINGS);
  }

  // Backward compatibility: admin/fees/records fallback
  if (path.startsWith('admin/fees/records/') || path === 'admin/fees/records') {
    const kind = req.nextUrl.searchParams.get('kind') || path.replace('admin/fees/records/', '') || 'installments';
    let rows: any[] = [];
    if (kind === 'payments') {
      rows = DEMO_PAYMENTS_LIST;
    } else if (kind === 'settlements') {
      rows = DEMO_SETTLEMENTS_DETAILED;
    } else if (kind === 'overdue') {
      rows = DEMO_OVERDUE_RECORDS;
    } else {
      rows = [
        {
          id: 'inst-1',
          account_reference: 'DPS-2026-089',
          sequence: 1,
          due_date: '2026-10-15',
          amount_minor: '3000000',
          paid_amount_minor: '3000000',
          remaining_minor: '0',
          status: 'paid',
        },
      ];
    }
    return NextResponse.json({
      rows,
      total: rows.length,
      page: 1,
      pageSize: 20,
    });
  }

  if (path === 'admin/fees/overview') {
    return NextResponse.json({
      activeSchedules: 184,
      totalExpectedMinor: '85000000',
      totalCollectedMinor: '62000000',
      totalRemainingMinor: '23000000',
      reconciliationCases: 1,
    });
  }

  if (path === 'admin/fee-plans/overview') {
    return NextResponse.json({
      plans: [
        {
          id: 'plan-1',
          plan_key: 'cbse_annual_2026',
          version: 1,
          name: 'Standard CBSE Annual 2026-27',
          status: 'effective',
          total_minor: '12000000',
          component_count: 3,
          installment_count: 4,
          created_by: 'institution_owner',
        },
        {
          id: 'plan-2',
          plan_key: 'cbse_semi_annual_2026',
          version: 1,
          name: 'CBSE Semi-Annual Flex Plan',
          status: 'effective',
          total_minor: '12000000',
          component_count: 3,
          installment_count: 2,
          created_by: 'institution_owner',
        },
        {
          id: 'plan-3',
          plan_key: 'cbse_quarterly_2026',
          version: 1,
          name: 'CBSE 10-Month Autopay Structure',
          status: 'effective',
          total_minor: '12000000',
          component_count: 3,
          installment_count: 10,
          created_by: 'institution_owner',
        },
      ],
      assignments: [
        {
          id: 'asgn-1',
          student_id: 'stu-1',
          student_name: 'Aarav Sharma',
          plan_id: 'plan-1',
          plan_name: 'Standard CBSE Annual 2026-27',
          status: 'active',
          assigned_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        },
        {
          id: 'asgn-2',
          student_id: 'stu-2',
          student_name: 'Ananya Verma',
          plan_id: 'plan-1',
          plan_name: 'Standard CBSE Annual 2026-27',
          status: 'active',
          assigned_at: new Date(Date.now() - 25 * 86400000).toISOString(),
        },
      ],
      adjustments: [
        {
          id: 'adj-1',
          student_name: 'Aarav Sharma',
          type: 'scholarship',
          amount_minor: '1000000',
          status: 'approved',
          reason: 'Academic Merit 10%',
          requested_by: 'staff',
        },
      ],
      credits: [],
      changes: [],
      ageing: [
        { bucket: 'Current (Not due)', obligations: 142, outstanding_minor: '18500000' },
        { bucket: '1-30 days overdue', obligations: 8, outstanding_minor: '2800000' },
        { bucket: '31-60 days overdue', obligations: 3, outstanding_minor: '1200000' },
        { bucket: '>60 days overdue', obligations: 1, outstanding_minor: '500000' },
      ],
    });
  }

  if (path === 'admin/payers') {
    return NextResponse.json([
      { id: 'payer-1', name: 'Rajesh Sharma', phone: '+91 98765 43210', email: 'rajesh.s@example.com', student_name: 'Aarav Sharma' },
      { id: 'payer-2', name: 'Pooja Verma', phone: '+91 98111 22334', email: 'pooja.v@example.com', student_name: 'Ananya Verma' },
      { id: 'payer-3', name: 'Vikram Rakesh', phone: '+91 98222 33445', email: 'vikram.r@example.com', student_name: 'V Rakesh' },
    ]);
  }

  if (path === 'admin/fees/schedules') {
    return NextResponse.json([
      { id: 'sched-1', student_id: 'stu-1', student_name: 'Aarav Sharma', plan_name: 'Standard CBSE Annual', total_minor: 12000000, paid_minor: 8000000, remaining_minor: 4000000, status: 'active' },
      { id: 'sched-2', student_id: 'stu-2', student_name: 'Ananya Verma', plan_name: 'Standard CBSE Annual', total_minor: 12000000, paid_minor: 12000000, remaining_minor: 0, status: 'completed' },
      { id: 'sched-3', student_id: 'stu-3', student_name: 'V Rakesh', plan_name: 'CBSE Semi-Annual Flex Plan', total_minor: 8000000, paid_minor: 4000000, remaining_minor: 4000000, status: 'active' },
    ]);
  }

  if (path === 'admin/fee-plans' && method === 'POST') {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    return NextResponse.json({
      ok: true,
      message: 'Fee-plan draft created. Validate it before requesting approval.',
      plan: {
        id: 'plan-' + Date.now(),
        plan_key: body.planKey || 'custom_plan',
        version: 1,
        name: body.name || 'Custom Plan',
        status: 'draft',
        total_minor: '12000000',
        component_count: Array.isArray(body.components) ? body.components.length : 1,
        installment_count: Array.isArray(body.installments) ? body.installments.length : 1,
        created_by: 'institution_owner',
      },
    });
  }

  if (path.startsWith('admin/fee-plans/') && path.endsWith('/validate') && method === 'POST') {
    return NextResponse.json({ ok: true, valid: true, message: 'Fee plan successfully validated.' });
  }

  if (path.startsWith('admin/fee-plans/') && path.endsWith('/request-approval') && method === 'POST') {
    return NextResponse.json({ ok: true, status: 'approval_requested', message: 'Approval requested.' });
  }

  if (path.startsWith('admin/fee-plans/') && path.endsWith('/approve') && method === 'POST') {
    return NextResponse.json({ ok: true, status: 'approved', message: 'Fee plan approved.' });
  }

  if (path.startsWith('admin/fee-plans/') && path.endsWith('/effective') && method === 'POST') {
    return NextResponse.json({ ok: true, status: 'effective', message: 'Fee plan marked as effective.' });
  }

  if (path.startsWith('admin/fee-plans/') && path.endsWith('/assign') && method === 'POST') {
    return NextResponse.json({ ok: true, assigned: true, message: 'Fee plan assigned to student.' });
  }

  if (path === 'admin/fee-plans/adjustments' && method === 'POST') {
    return NextResponse.json({ ok: true, message: 'Adjustment request created.' });
  }

  if (path === 'admin/fee-plans/credits' && method === 'POST') {
    return NextResponse.json({ ok: true, message: 'Credit record created.' });
  }

  if (path === 'admin/fee-plans/changes' && method === 'POST') {
    return NextResponse.json({ ok: true, message: 'Receivable change request created.' });
  }

  if (path === 'admin/fee-plans') {
    return NextResponse.json([
      {
        id: 'plan-1',
        name: 'Standard CBSE Annual 2026-27',
        code: 'CBSE-2026-STD',
        status: 'active',
        version: 1,
        academic_year: '2026-27',
        components: [
          { code: 'TUIT', name: 'Tuition Fee', amount_minor: '8000000' },
          { code: 'DEV', name: 'Development Fee', amount_minor: '2000000' },
          { code: 'ACT', name: 'Activity Fee', amount_minor: '1000000' },
        ],
      },
    ]);
  }

  if (path === 'admin/overview') {
    return NextResponse.json({
      stats: {
        students: 342,
        mandates: 128,
        collections_minor: '62000000',
        enquiries: 14,
        leads: 38,
      },
    });
  }

  if (path === 'admin/leads') {
    return NextResponse.json([
      {
        id: 'lead-1',
        name: 'Sunil Kumar',
        email: 'sunil.k@example.com',
        phone: '+91 98765 43210',
        institute: 'DPS Junior Campus',
        stage: 'contacted',
        created_at: new Date().toISOString(),
      },
    ]);
  }

  if (path === 'admin/tenant/notifications') {
    return NextResponse.json([]);
  }

  if (path === 'admin/fees/settings/payment-form') {
    return NextResponse.json({
      fields: [],
      components: [],
      rules: {
        allow_full_payment: true,
        allow_partial_payment: true,
        allow_advance_payment: true,
        min_partial_amount_minor: 100000,
        max_partial_amount_minor: 50000000,
        require_down_payment: false,
        enable_enach: true,
        allow_payer_contact_editing: true,
        terms_text: 'Standard institute terms and conditions apply.',
      },
      instructions: 'Pay online securely using your enrollment reference.',
    });
  }

  if (path === 'admin/fees/settings/receipt-email') {
    return NextResponse.json({
      receipt_config: {
        institution_name: 'Delhi Public School (Demo)',
        institution_address: 'Mathura Road, New Delhi 110003',
        contact_email: 'accounts@dps-demo.invalid',
        contact_phone: '+91 11 2345 6789',
        receipt_heading: 'OFFICIAL FEE RECEIPT',
        receipt_prefix: 'DPS-REC-',
        header_note: 'Thank you for your fee payment.',
        footer_note: 'This is a computer generated receipt.',
        signatory_title: 'Accounts Officer',
        terms_and_conditions: 'Fee once paid is subject to school rules.',
      },
      email_config: {
        sender_name: 'Delhi Public School Fee Office',
        subject_line: 'Fee Payment Confirmation - Delhi Public School',
        greeting_text: 'Dear Parent,',
        body_template: 'We have received your payment. Receipt is attached.',
      },
    });
  }

  if (path.startsWith('admin/fees/receipts/')) {
    const receiptId = path.replace('admin/fees/receipts/', '');
    return NextResponse.json({
      receipt_number: receiptId === 'rec-2' ? 'DPS-REC-2026-00891' : 'DPS-REC-2026-00412',
      issued_at: new Date().toLocaleDateString('en-IN'),
      snapshot: {
        studentName: 'Aarav Sharma',
        instituteName: 'Delhi Public School (Demo)',
        accountReference: 'DPS-2026-089',
        amountMinor: '2000000',
        providerReference: 'UPI-884920194',
        receiptConfig: {
          header_note: 'Thank you for your fee payment.',
          footer_note: 'This is a computer generated receipt.',
          terms_and_conditions: 'Fee once paid is subject to school rules.',
        },
        directPayment: {
          mode: 'UPI',
        },
      },
    });
  }

  if (path === 'provider/payments/status') {
    return NextResponse.json({
      autopayMode: 'sandbox',
      sandboxSimulationAllowed: true,
    });
  }

  if (path.startsWith('admin/fees/sandbox/')) {
    return NextResponse.json({
      ok: true,
      status: 'succeeded',
      accepted: true,
    });
  }

  if (path.includes('/payer-link')) {
    const rawToken = 'demo-access-token-12345';
    return NextResponse.json({
      path: '/payer/' + rawToken + '/',
      expiresHours: 24,
      paymentPolicy: {
        mode: 'flexible',
        allowCustomAmount: true,
        allowComponentSelection: true,
        minAmountMinor: 100000,
      },
    });
  }

  if (path.includes('/assign') && method === 'POST') {
    return NextResponse.json({
      ok: true,
      scheduleId: 'sch-assigned-1',
    });
  }

  if (path.includes('/flex')) {
    if (method === 'POST') {
      return NextResponse.json({
        ok: true,
        version: 2,
        message: 'Flex schedule updated successfully',
      });
    }
    return NextResponse.json({
      id: 'sch-flex-1',
      account_reference: 'DPS-2026-089',
      version: 1,
      installments: [
        {
          id: 'inst-1',
          due_date: '2026-10-25',
          amount_minor: 4000000,
          adjustment_amount_minor: 0,
          editable: true,
        },
        {
          id: 'inst-2',
          due_date: '2027-01-15',
          amount_minor: 4000000,
          adjustment_amount_minor: 0,
          editable: true,
        },
      ],
    });
  }

  if (path === 'admin/fees/payments' && method === 'POST') {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    const amountMinor = Number(body.amountMinor || 2000000);
    const student = DEMO_STUDENTS[0]!;
    student.paid_minor = String(Number(student.paid_minor || 0) + amountMinor);
    student.outstanding_minor = String(
      Math.max(0, Number(student.net_payable_minor || 12000000) - Number(student.paid_minor)),
    );
    const paymentId = 'PAY-' + Math.floor(1000 + Math.random() * 9000);
    const receiptId = 'REC-' + Math.floor(1000 + Math.random() * 9000);
    if (!STUDENT_CUSTOM_PAYMENTS[student.id]) STUDENT_CUSTOM_PAYMENTS[student.id] = [];
    STUDENT_CUSTOM_PAYMENTS[student.id]!.unshift({
      id: paymentId,
      amount_minor: String(amountMinor),
      recorded_at: new Date().toISOString(),
      provider_reference: body.providerReference || `DIR-${Date.now().toString().slice(-6)}`,
      status: 'Direct (Offline)',
    });
    return NextResponse.json({
      ok: true,
      id: paymentId,
      paymentId,
      receiptId,
      message: 'Payment recorded and balance updated',
    });
  }

  // -------------------------------------------------------------
  // Student / Parent Portal Endpoints
  // -------------------------------------------------------------
  if (path === 'portal/login' && method === 'POST') {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    const studentRef = body.studentReference || 'DPS-2026-089';
    return NextResponse.json({
      ok: true,
      token: 'portal-auth-jwt-' + Buffer.from(studentRef).toString('base64'),
    });
  }

  if (path === 'portal/me') {
    return NextResponse.json({
      student: {
        id: 'stu-portal-1',
        studentReference: 'DPS-2026-089',
        fullName: 'V Rakesh',
        email: 'rakesh.student@example.com',
        phone: '+91 98765 43210',
        status: 'active',
        course: 'Senior Secondary Science',
        grade: 'Grade 11-A',
        groupName: 'Class 11 Science - Sec A',
        academicYear: '2026-2027',
        campus: 'Main Campus',
      },
      institution: {
        id: 'inst-1',
        name: 'Delhi Public School, R.K. Puram',
      },
      payer: {
        name: 'Guardian / Linked Payer',
        email: 'payer@example.com',
        phone: '+91 98765 43210',
      },
      summary: {
        netPayableMinor: 12000000,
        paidMinor: 4000000,
        outstandingMinor: 8000000,
      },
      feeComponents: [
        { id: 'fc-1', label: 'Tuition Fee', code: 'TUIT', amountMinor: 8000000 },
        { id: 'fc-2', label: 'Development & Lab Fee', code: 'DEV', amountMinor: 2500000 },
        { id: 'fc-3', label: 'Activity & Sports Fee', code: 'ACT', amountMinor: 1500000 },
      ],
      installments: [
        {
          id: 'inst-1',
          sequence: 1,
          dueDate: '2026-07-10',
          amountMinor: 4000000,
          adjustmentAmountMinor: 0,
          paidAmountMinor: 4000000,
          remainingMinor: 0,
          status: 'paid',
        },
        {
          id: 'inst-2',
          sequence: 2,
          dueDate: '2026-10-25',
          amountMinor: 4000000,
          adjustmentAmountMinor: 0,
          paidAmountMinor: 0,
          remainingMinor: 4000000,
          status: 'pending',
        },
        {
          id: 'inst-3',
          sequence: 3,
          dueDate: '2027-01-15',
          amountMinor: 4000000,
          adjustmentAmountMinor: 0,
          paidAmountMinor: 0,
          remainingMinor: 4000000,
          status: 'pending',
        },
      ],
      masterSchedule: [
        {
          id: 'ms-1',
          sequence: 1,
          dueDate: '2026-07-10',
          amountMinor: 4000000,
          adjustmentAmountMinor: 0,
          paidAmountMinor: 4000000,
          remainingMinor: 0,
          status: 'paid',
        },
        {
          id: 'ms-2',
          sequence: 2,
          dueDate: '2026-10-25',
          amountMinor: 4000000,
          adjustmentAmountMinor: 0,
          paidAmountMinor: 0,
          remainingMinor: 4000000,
          status: 'pending',
        },
        {
          id: 'ms-3',
          sequence: 3,
          dueDate: '2027-01-15',
          amountMinor: 4000000,
          adjustmentAmountMinor: 0,
          paidAmountMinor: 0,
          remainingMinor: 4000000,
          status: 'pending',
        },
      ],
      enach: {
        mandateId: 'mndt-sandbox-1',
        mandateReference: 'ENACH-MNDT-2026-8819',
        provider: 'sandbox_enach',
        status: 'active',
        upcomingDebit: {
          amountMinor: 4000000,
          scheduledDate: '2026-10-25',
        },
      },
      transactions: [
        {
          id: 'pay-rec-1',
          transactionId: 'TXN-2026-0708-9921',
          amountMinor: 4000000,
          refundedAmountMinor: 0,
          recordedAt: '2026-07-08T10:30:00Z',
          status: 'settled',
          receiptNumber: 'DPS-REC-2026-00412',
          mode: 'eNACH Auto-debit',
        },
      ],
    });
  }

  if (path === 'portal/form-config') {
    return NextResponse.json({
      instructions:
        'Review assigned fee schedules, register eNACH auto-debit, or simulate instant sandbox collections.',
      rules: {
        terms_text:
          'Authorize Sandbox eNACH recurring debits for the current remaining installment balances.',
        enable_enach: true,
        allow_payer_contact_editing: true,
        allowFullPayment: true,
        allowPartialPayment: true,
        allowAdvance: true,
      },
      fields: [
        {
          key: 'payerName',
          label: 'Payer Full Name',
          visible: true,
          required: true,
          editable: true,
          order: 1,
        },
        {
          key: 'payerEmail',
          label: 'Email Address',
          visible: true,
          required: true,
          editable: true,
          order: 2,
        },
        {
          key: 'payerPhone',
          label: 'Mobile Phone',
          visible: true,
          required: true,
          editable: true,
          order: 3,
        },
      ],
      components: [],
    });
  }

  if (path === 'portal/enach/register' && method === 'POST') {
    return NextResponse.json({
      ok: true,
      message: 'eNACH Recurring Mandate Active (Sandbox Mode)',
      mandateId: 'mndt-sandbox-' + Date.now(),
    });
  }

  if (path === 'portal/enach/simulate-debit' && method === 'POST') {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    if (body.outcome === 'failed') {
      return NextResponse.json({
        ok: true,
        message: 'Sandbox debit simulation failed as requested (insufficient funds simulation).',
      });
    }
    return NextResponse.json({
      ok: true,
      message: 'Sandbox debit simulated successfully',
      paymentComplete: {
        transactionId: 'TXN-SANDBOX-' + Date.now(),
        receiptNumber: 'DPS-REC-2026-' + Math.floor(10000 + Math.random() * 90000),
        amountMinor: 4000000,
        paymentDate: new Date().toISOString(),
        outstandingMinor: 4000000,
      },
    });
  }

  if (path.startsWith('portal/receipts/')) {
    const rcpNum = path.split('/').pop() || 'DPS-REC-2026-00412';
    return NextResponse.json({
      receipt_number: rcpNum,
      institution_name: 'Delhi Public School, R.K. Puram',
      recorded_at: new Date().toISOString(),
      transaction_id: 'TXN-SANDBOX-' + rcpNum,
      payment_mode: 'Sandbox eNACH',
      amount_minor: 4000000,
      snapshot: {
        studentName: 'V Rakesh',
        accountReference: 'DPS-2026-089',
        instituteName: 'Delhi Public School, R.K. Puram',
        amountMinor: 4000000,
        receiptConfig: {
          heading: 'Official Payment Receipt',
          header_note: 'Verified electronic acknowledgement of fee collection.',
          footer_note: 'This is a computer generated receipt. Retain for tax & record purposes.',
          support_info: 'accounts@dpsrkpuram.example.edu | +91 11 2617 1234',
          terms:
            'Payments once confirmed are credited to the student ledger immediately. Subject to bank clearance.',
        },
      },
    });
  }

  if (path === 'portal/logout' && method === 'POST') {
    return NextResponse.json({ ok: true });
  }

  // Fallback for any other admin or public request in demo mode
  return NextResponse.json({ ok: true, rows: [], total: 0 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
