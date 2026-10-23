'use client';

import React, { useState, useId } from 'react';
import Link from 'next/link';
import { SuccessModal, SuccessPopupDetail } from './admin/success-modal';

export type PayerPortalData = {
  collectionMode: string;
  providerConnected: boolean;
  autopayProviderConnected: boolean;
  payer: {
    id: string;
    displayName: string;
    accountReference: string;
    email?: string;
    phone?: string;
    studentName?: string;
  };
  schedule: {
    id: string;
    status: string;
  };
  summary: {
    net_payable_minor: string | number;
    paid_minor: string | number;
    outstanding_minor: string | number;
  };
  paymentPolicy?: {
    mode: string;
    allowCustomAmount: boolean;
    allowComponentSelection: boolean;
    minAmountMinor?: number;
    componentSelectionBlockedReason?: string;
  };
  installments: Array<{
    id: string;
    sequence: number;
    due_date: string;
    amount_minor: number;
    paid_amount_minor: number;
    remaining_minor: number;
    status: string;
  }>;
  components?: Array<{
    code: string;
    label: string;
    remainingMinor: number;
  }>;
  payments: Array<{
    id: string;
    amount_minor: number;
    recorded_at: string;
    receipt_number?: string;
    status: string;
  }>;
  refunds?: Array<{
    id: string;
    amount_minor: number;
    reason: string;
    created_at: string;
  }>;
  mandates?: Array<{
    id: string;
    status: string;
    rail: string;
    umrn?: string;
    bank_name?: string;
    account_mask?: string;
    created_at?: string;
  }>;
};

const formatINR = (minorOrMajor: number | string, isMinor: boolean = true) => {
  const num = Number(minorOrMajor || 0);
  const val = isMinor ? num / 100 : num;
  return '₹' + val.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export function PayerPortalView({
  data: initialData,
  token,
}: {
  data: PayerPortalData;
  token: string;
}) {
  const [data, setData] = useState<PayerPortalData>(initialData);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Installment accordion state (default open installment 2)
  const [openInstallmentId, setOpenInstallmentId] = useState<string>('inst-2');

  // Installment tab states (for installment 2 and others)
  // tab options: 'full' | 'custom' | 'heads'
  const [activeTabByInst, setActiveTabByInst] = useState<Record<string, 'full' | 'custom' | 'heads'>>({
    'inst-2': 'full',
    'inst-3': 'full',
  });

  // Custom amount inputs
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});

  // Fee head selections per installment
  const [headInputs, setHeadInputs] = useState<Record<string, Record<string, string>>>({});

  // eNACH Workspace State
  const [enachTab, setEnachTab] = useState<'send_link' | 'enter_details' | 'active_status'>('send_link');
  const [enachLinkRecipient, setEnachLinkRecipient] = useState<'student' | 'guardian'>('student');
  const [enachLinkPhone, setEnachLinkPhone] = useState<string>(data.payer.phone || '+91 98765 43210');
  const [enachLinkEmail, setEnachLinkEmail] = useState<string>(data.payer.email || 'payer@example.com');
  const [enachLinkStatus, setEnachLinkStatus] = useState<'idle' | 'sent'>('idle');

  // Direct Bank Details Form State
  const [bankHolderName, setBankHolderName] = useState<string>(data.payer.displayName || 'Rajesh Sharma');
  const [selectedBank, setSelectedBank] = useState<string>('HDFC Bank');
  const [accountNumber, setAccountNumber] = useState<string>('50100234891244');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState<string>('50100234891244');
  const [ifscCode, setIfscCode] = useState<string>('HDFC0001234');
  const [accountType, setAccountType] = useState<'savings' | 'current'>('savings');
  const [authMode, setAuthMode] = useState<'netbanking' | 'debit_card' | 'aadhaar'>('netbanking');
  const [consentChecked, setConsentChecked] = useState<boolean>(true);
  const [bankError, setBankError] = useState<string>('');

  // Active Mandate state
  const hasActiveMandate = data.mandates?.some((m) => m.status === 'active');
  const [mandateActive, setMandateActive] = useState<boolean>(hasActiveMandate || false);
  const [mandateDetails, setMandateDetails] = useState({
    umrn: 'UMRN-NACH-2026-089412',
    bank: 'HDFC Bank',
    accountMask: '•••• 1244',
    authDate: '23/10/2026, 1:18:28 pm',
    status: 'Active',
  });

  // Selected Receipt Modal state
  const [viewReceipt, setViewReceipt] = useState<any | null>(null);

  // Reusable Success Modal Configuration
  const [successModal, setSuccessModal] = useState<{
    isOpen: boolean;
    badge?: string;
    title: string;
    subtitle?: string;
    details?: SuccessPopupDetail[];
    note?: string;
    primaryAction?: { label: string; onClick: () => void };
  }>({
    isOpen: false,
    title: '',
  });

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  // Fee Heads definition from user's snippet
  const headsList = [
    { code: 'TUIT', label: 'Tuition fee', remainingMajor: 50000 },
    { code: 'DEV', label: 'Development fee', remainingMajor: 20000 },
    { code: 'ACT', label: 'Activity & lab fee', remainingMajor: 10000 },
  ];

  // Helper for computing installment fee-head sum
  const getHeadsSum = (instId: string) => {
    const inputs = headInputs[instId] || {};
    return Object.values(inputs).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  };

  // Send eNACH Approval Link Handler
  const handleSendEnachLink = () => {
    setEnachLinkStatus('sent');
    triggerToast('eNACH setup link dispatched to student/payer');

    setSuccessModal({
      isOpen: true,
      badge: 'eNACH LINK SENT TO USER',
      title: 'eNACH Setup Link Dispatched Successfully',
      subtitle: 'A secure tokenized authorization link has been sent to the student and payer to approve and submit their bank details.',
      details: [
        { label: 'Recipient Name', value: enachLinkRecipient === 'student' ? 'V Rakesh (Student)' : `${data.payer.displayName} (Guardian)` },
        { label: 'Phone / WhatsApp', value: enachLinkPhone },
        { label: 'Email Address', value: enachLinkEmail },
        { label: 'Authorization Link', value: `https://dodo.finance/mandate/auth/${token}?sec=npci-v1` },
        { label: 'Status', value: 'Pending Student / Payer Submission' },
        { label: 'Validity Period', value: '48 Hours (Auto-refreshed on demand)' },
      ],
      note: 'The student or payer will complete 2-factor authentication via NetBanking, Debit Card, or Aadhaar OTP. Once submitted, mandate activates automatically.',
      primaryAction: {
        label: 'Awesome, Done ✓',
        onClick: () => setSuccessModal((prev) => ({ ...prev, isOpen: false })),
      },
    });
  };

  // Direct Bank Submission Handler
  const handleDirectBankSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accountNumber !== confirmAccountNumber) {
      setBankError('Account numbers do not match. Please re-enter.');
      return;
    }
    if (!consentChecked) {
      setBankError('Please agree to the NPCI standing mandate authorization.');
      return;
    }
    setBankError('');

    const mask = '•••• ' + accountNumber.slice(-4);
    const newUmrn = 'UMRN-NACH-2026-' + Math.floor(100000 + Math.random() * 900000);
    const nowStr = new Date().toLocaleString('en-IN');

    setMandateDetails({
      umrn: newUmrn,
      bank: selectedBank,
      accountMask: mask,
      authDate: nowStr,
      status: 'Active',
    });
    setMandateActive(true);
    triggerToast('eNACH Mandate Registered Successfully');

    setSuccessModal({
      isOpen: true,
      badge: 'eNACH MANDATE ACTIVATED',
      title: 'eNACH Mandate Activated Successfully',
      subtitle: 'Standing instructions have been submitted and confirmed by NPCI sponsor clearing.',
      details: [
        { label: 'Mandate UMRN', value: newUmrn },
        { label: 'Bank Name', value: selectedBank },
        { label: 'Account Holder', value: bankHolderName },
        { label: 'Account Mask', value: mask },
        { label: 'Authentication Mode', value: authMode === 'netbanking' ? 'NetBanking eSign' : authMode === 'debit_card' ? 'Debit Card OTP' : 'Aadhaar eSign' },
        { label: 'Max Mandate Limit', value: '₹40,000.00 / installment' },
        { label: 'Next Scheduled Debit', value: '25/10/2026 (Installment #2)' },
        { label: 'Mandate Status', value: 'Active / Verified' },
      ],
      note: 'Due installments will be scheduled automatically with 2-day advance SMS/WhatsApp reminder.',
      primaryAction: {
        label: 'Awesome, Done ✓',
        onClick: () => setSuccessModal((prev) => ({ ...prev, isOpen: false })),
      },
    });
  };

  // Payment Simulation Handler
  const handlePay = (instSeq: number, amountStr: string, mode: string) => {
    triggerToast(`Redirecting to secure payment provider · ${amountStr}`);

    setTimeout(() => {
      setSuccessModal({
        isOpen: true,
        badge: 'PAYMENT SUCCESSFUL',
        title: 'Payment Completed Successfully',
        subtitle: `Electronic payment of ${amountStr} for Installment #${instSeq} was recorded and settled.`,
        details: [
          { label: 'Amount Paid', value: amountStr },
          { label: 'Installment', value: `#${instSeq} (Academic Fee)` },
          { label: 'Payment Mode', value: mode },
          { label: 'Transaction Reference', value: 'TXN-' + Math.random().toString(36).substring(2, 10).toUpperCase() },
          { label: 'Receipt Number', value: `DPS-REC-2026-004${12 + instSeq}` },
          { label: 'Settlement Status', value: 'Settled & Verified' },
        ],
        note: 'Official stamped tax receipt has been generated. Credited to student ledger.',
        primaryAction: {
          label: 'View Stamped Receipt ✓',
          onClick: () => {
            setSuccessModal((prev) => ({ ...prev, isOpen: false }));
            setViewReceipt({
              receipt_number: `DPS-REC-2026-004${12 + instSeq}`,
              date: new Date().toLocaleDateString('en-IN'),
              amount: amountStr,
              student: data.payer.studentName || 'V Rakesh',
              payer: data.payer.displayName,
              ref: data.payer.accountReference,
              installment: `Installment #${instSeq}`,
            });
          },
        },
      });
    }, 600);
  };

  return (
    <div
      className="payer-portal-dashboard"
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 85% 10%, rgba(185, 243, 229, 0.45) 0%, rgba(210, 244, 156, 0.18) 35%, rgba(243, 250, 247, 0) 70%), #f3faf7',
        color: '#073533',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '24px 20px 80px',
      }}
    >
      {/* Universal Success Popup Modal */}
      <SuccessModal
        isOpen={successModal.isOpen}
        onClose={() => setSuccessModal((prev) => ({ ...prev, isOpen: false }))}
        title={successModal.title}
        badge={successModal.badge}
        subtitle={successModal.subtitle}
        details={successModal.details}
        note={successModal.note}
        primaryAction={successModal.primaryAction}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '28px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#063331',
            color: '#ffffff',
            padding: '12px 24px',
            borderRadius: '9999px',
            fontSize: '13.5px',
            fontWeight: 600,
            boxShadow: '0 12px 30px -4px rgba(6, 45, 42, 0.4)',
            zIndex: 10002,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            animation: 'fadeInOverlay 0.2s ease-out both',
          }}
        >
          <span style={{ color: '#42c2a8', fontSize: '16px' }}>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Official Receipt Modal View */}
      {viewReceipt && (
        <>
          <div
            className="dashboard-success-backdrop"
            onClick={() => setViewReceipt(null)}
            style={{ zIndex: 10000 }}
          />
          <div
            className="dashboard-success-modal"
            style={{
              zIndex: 10001,
              maxWidth: '560px',
              padding: '28px 32px',
              textAlign: 'left',
              alignItems: 'stretch',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#075e47', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  OFFICIAL ELECTRONIC RECEIPT
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '2px 0 0', color: '#073533' }}>
                  Delhi Public School, R.K. Puram
                </h3>
              </div>
              <button
                type="button"
                className="dashboard-success-close"
                onClick={() => setViewReceipt(null)}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: '#f7fbf9',
                borderRadius: '16px',
                border: '1px solid rgba(7, 53, 51, 0.08)',
                padding: '18px',
                marginBottom: '18px',
                display: 'grid',
                gap: '8px',
                fontSize: '13px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6c8f89' }}>Receipt Number</span>
                <strong style={{ color: '#073533' }}>{viewReceipt.receipt_number}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6c8f89' }}>Student Name</span>
                <strong style={{ color: '#073533' }}>{viewReceipt.student}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6c8f89' }}>Account Reference</span>
                <strong style={{ color: '#073533' }}>{viewReceipt.ref}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6c8f89' }}>Payment For</span>
                <strong style={{ color: '#073533' }}>{viewReceipt.installment}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6c8f89' }}>Date &amp; Time</span>
                <strong style={{ color: '#073533' }}>{viewReceipt.date}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(7, 53, 51, 0.12)', paddingTop: '8px', marginTop: '4px' }}>
                <span style={{ color: '#073533', fontWeight: 700, fontSize: '14px' }}>Amount Paid</span>
                <strong style={{ color: '#075e47', fontSize: '18px' }}>{viewReceipt.amount}</strong>
              </div>
            </div>

            <p style={{ fontSize: '11.5px', color: '#6c8f89', textAlign: 'center', margin: '0 0 18px', lineHeight: 1.4 }}>
              Verified electronic acknowledgement. Computer generated receipt. Retain for personal record and tax deduction purposes.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                className="button secondary"
                style={{ borderRadius: '9999px', padding: '10px 22px', fontSize: '13.5px', fontWeight: 600 }}
                onClick={() => {
                  window.print();
                }}
              >
                🖨️ Print Receipt
              </button>
              <button
                type="button"
                className="button primary"
                style={{ borderRadius: '9999px', padding: '10px 24px', fontSize: '13.5px', fontWeight: 600 }}
                onClick={() => setViewReceipt(null)}
              >
                Done ✓
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main Container */}
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        {/* Header */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 0 28px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, fontSize: '22px', color: '#073533' }}>
            <span
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: '#063331',
                display: 'grid',
                placeItems: 'center',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(6, 51, 49, 0.25)',
              }}
            >
              ◆
            </span>
            <span>Dodo<span style={{ color: '#42c2a8' }}>.</span></span>
          </div>

          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: '9999px',
              background: '#e2f4ed',
              color: '#075e47',
              border: '1px solid rgba(7, 53, 51, 0.08)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#075e47' }} />
            Sandbox account: simulated collections
          </span>
        </header>

        {/* Hero Section */}
        <div style={{ marginBottom: '24px' }}>
          <p
            style={{
              fontSize: '12.5px',
              fontWeight: 700,
              color: '#075e47',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              margin: '0 0 6px',
            }}
          >
            Fee account · {data.payer.accountReference || 'DPS-2026-089'} · Student: {data.payer.studentName || 'V Rakesh'}
          </p>
          <h1
            style={{
              fontSize: '34px',
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#073533',
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            Hello, {
              data.payer.displayName &&
              data.payer.displayName.trim().toLowerCase() !== 'guardian' &&
              !data.payer.displayName.trim().toLowerCase().startsWith('guardian') &&
              !data.payer.displayName.trim().toLowerCase().includes('hii')
                ? data.payer.displayName.trim()
                : (data.payer.studentName ? `${data.payer.studentName}` : 'Rajesh Sharma')
            }
          </h1>
          <p style={{ color: '#587973', fontSize: '15px', margin: '0 0 12px', lineHeight: 1.5 }}>
            Review your installments, payments and receipts from one protected view.
          </p>
          <p
            style={{
              fontSize: '13px',
              color: '#416660',
              background: '#eafbf4',
              border: '1px solid #a3ebce',
              padding: '8px 14px',
              borderRadius: '12px',
              display: 'inline-block',
              margin: 0,
            }}
          >
            Payment link mode: <strong style={{ color: '#073533' }}>Flexible collection</strong> · Custom and fee-head options are enforced by the server.
          </p>
        </div>

        {/* Summary Stats (3 Columns) */}
        <section
          aria-label="Summary"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: '14px',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              border: '1px solid rgba(7, 53, 51, 0.08)',
              borderRadius: '20px',
              padding: '18px 22px',
              boxShadow: '0 8px 24px -4px rgba(6, 45, 42, 0.05)',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6c8f89', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Schedule total
            </span>
            <strong style={{ display: 'block', fontSize: '26px', color: '#073533', marginTop: '6px', fontVariantNumeric: 'tabular-nums' }}>
              {formatINR(data.summary.net_payable_minor)}
            </strong>
          </div>

          <div
            style={{
              background: '#ffffff',
              border: '1px solid rgba(7, 53, 51, 0.08)',
              borderRadius: '20px',
              padding: '18px 22px',
              boxShadow: '0 8px 24px -4px rgba(6, 45, 42, 0.05)',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6c8f89', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Recorded paid
            </span>
            <strong style={{ display: 'block', fontSize: '26px', color: '#075e47', marginTop: '6px', fontVariantNumeric: 'tabular-nums' }}>
              {formatINR(data.summary.paid_minor)}
            </strong>
          </div>

          <div
            style={{
              background: '#ffffff',
              border: '1px solid rgba(7, 53, 51, 0.08)',
              borderRadius: '20px',
              padding: '18px 22px',
              boxShadow: '0 8px 24px -4px rgba(6, 45, 42, 0.05)',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6c8f89', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Outstanding
            </span>
            <strong style={{ display: 'block', fontSize: '26px', color: '#b45309', marginTop: '6px', fontVariantNumeric: 'tabular-nums' }}>
              {formatINR(data.summary.outstanding_minor)}
            </strong>
          </div>
        </section>

        {/* Visual Progress Bar */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              height: '10px',
              borderRadius: '9999px',
              background: 'rgba(7, 53, 51, 0.08)',
              overflow: 'hidden',
              margin: '4px 0 8px',
            }}
          >
            <div
              style={{
                width: '33.33%',
                height: '100%',
                borderRadius: '9999px',
                background: 'linear-gradient(90deg, #42c2a8 0%, #075e47 100%)',
                boxShadow: '0 2px 6px rgba(7, 94, 71, 0.25)',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#587973', fontWeight: 500 }}>
            <span>₹40,000.00 recorded paid (33.3%)</span>
            <span>₹80,000.00 outstanding (66.7%)</span>
          </div>
        </div>

        {/* Next Installment Due Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #063331 0%, #0e4c43 100%)',
            color: '#ffffff',
            borderRadius: '24px',
            padding: '24px 28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '24px',
            boxShadow: '0 16px 36px -6px rgba(6, 51, 49, 0.3)',
          }}
        >
          <div>
            <span style={{ opacity: 0.85, fontSize: '13px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Next installment · due 25/10/2026
            </span>
            <strong style={{ fontSize: '30px', fontVariantNumeric: 'tabular-nums', display: 'block', marginTop: '4px', letterSpacing: '-0.02em' }}>
              ₹40,000.00
            </strong>
          </div>
          <button
            type="button"
            className="button"
            style={{
              background: '#ffffff',
              color: '#063331',
              borderRadius: '9999px',
              padding: '12px 28px',
              fontSize: '14.5px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.15)',
              transition: 'all 0.2s ease',
            }}
            onClick={() => handlePay(2, '₹40,000.00', 'Full Balance')}
          >
            Pay now →
          </button>
        </div>

        {/* Installment Plan Card */}
        <section
          style={{
            background: '#ffffff',
            border: '1px solid rgba(7, 53, 51, 0.08)',
            borderRadius: '26px',
            padding: '26px 28px',
            marginBottom: '24px',
            boxShadow: '0 10px 30px -4px rgba(6, 45, 42, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: 0 }}>
              Installment plan
            </h2>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: '9999px',
                background: '#eafbf4',
                color: '#075e47',
                border: '1px solid #a3ebce',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Active Schedule
            </span>
          </div>
          <p style={{ color: '#6c8f89', margin: '0 0 18px', fontSize: '13.5px' }}>
            Upcoming and completed fees. Open an installment to choose how much to pay.
          </p>

          {/* Installment 1 (Paid) */}
          <div
            style={{
              border: '1px solid rgba(7, 53, 51, 0.08)',
              borderRadius: '16px',
              marginBottom: '12px',
              overflow: 'hidden',
              background: '#fbfdfc',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 1.2fr 1fr 1fr auto',
                gap: '12px',
                alignItems: 'center',
                padding: '14px 18px',
                fontSize: '13.5px',
              }}
            >
              <span
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#e2f4ed',
                  color: '#075e47',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                1
              </span>
              <div>
                <span style={{ fontSize: '11.5px', color: '#6c8f89', display: 'block' }}>Due date</span>
                <span style={{ fontWeight: 600, color: '#073533' }}>10/07/2026</span>
              </div>
              <div>
                <span style={{ fontSize: '11.5px', color: '#6c8f89', display: 'block' }}>Amount</span>
                <span style={{ fontWeight: 600, color: '#073533' }}>₹40,000.00</span>
              </div>
              <div>
                <span style={{ fontSize: '11.5px', color: '#6c8f89', display: 'block' }}>Paid</span>
                <span style={{ fontWeight: 600, color: '#075e47' }}>₹40,000.00</span>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  background: '#eafbf4',
                  color: '#075e47',
                  border: '1px solid #a3ebce',
                }}
              >
                ✓ Paid
              </span>
            </div>
          </div>

          {/* Dynamic Pending Installments (Installment 2 & 3) */}
          {[
            { id: 'inst-2', seq: 2, due: '25/10/2026', amt: '₹40,000.00', paid: '₹0.00', maxVal: 40000 },
            { id: 'inst-3', seq: 3, due: '25/11/2026', amt: '₹40,000.00', paid: '₹0.00', maxVal: 40000 },
          ].map((inst) => {
            const isOpen = openInstallmentId === inst.id;
            const currentTab = activeTabByInst[inst.id] || 'full';
            const customVal = customAmounts[inst.id] || '';
            const customNum = parseFloat(customVal) || 0;
            const headsSum = getHeadsSum(inst.id);

            return (
              <div
                key={inst.id}
                style={{
                  border: isOpen ? '1.5px solid #42c2a8' : '1px solid rgba(7, 53, 51, 0.1)',
                  borderRadius: '16px',
                  marginBottom: '12px',
                  overflow: 'hidden',
                  background: '#ffffff',
                  boxShadow: isOpen ? '0 8px 24px -4px rgba(66, 194, 168, 0.15)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Accordion Summary Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1.2fr 1fr 1fr auto',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '16px 18px',
                    cursor: 'pointer',
                    background: isOpen ? '#f7fbf9' : '#ffffff',
                  }}
                  onClick={() => setOpenInstallmentId(isOpen ? '' : inst.id)}
                >
                  <span
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: isOpen ? '#063331' : '#f0faf6',
                      color: isOpen ? '#ffffff' : '#073533',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 700,
                      fontSize: '13px',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {inst.seq}
                  </span>
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#6c8f89', display: 'block' }}>Due date</span>
                    <span style={{ fontWeight: 600, color: '#073533' }}>{inst.due}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#6c8f89', display: 'block' }}>Amount</span>
                    <span style={{ fontWeight: 600, color: '#073533' }}>{inst.amt}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#6c8f89', display: 'block' }}>Paid</span>
                    <span style={{ fontWeight: 600, color: '#6c8f89' }}>{inst.paid}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: '9999px',
                        background: '#fffbeb',
                        color: '#92400e',
                        border: '1px solid #fde68a',
                      }}
                    >
                      Pending
                    </span>
                    <span style={{ color: '#6c8f89', fontSize: '13px', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
                      ▼
                    </span>
                  </div>
                </div>

                {/* Collapsible Payment Workspace */}
                {isOpen && (
                  <div
                    style={{
                      padding: '16px 20px 22px',
                      borderTop: '1px solid rgba(7, 53, 51, 0.08)',
                      background: '#f7fbf9',
                    }}
                  >
                    {/* Payment Mode Tabs */}
                    <div
                      style={{
                        display: 'flex',
                        gap: '6px',
                        margin: '0 0 16px',
                        background: '#eaf4f0',
                        padding: '4px',
                        borderRadius: '9999px',
                        maxWidth: '440px',
                      }}
                    >
                      {(['full', 'custom', 'heads'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          style={{
                            flex: 1,
                            height: '36px',
                            border: 0,
                            borderRadius: '9999px',
                            background: currentTab === tab ? '#ffffff' : 'transparent',
                            color: currentTab === tab ? '#063331' : '#587973',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '13px',
                            boxShadow: currentTab === tab ? '0 2px 8px rgba(6, 45, 42, 0.08)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                          onClick={() =>
                            setActiveTabByInst((prev) => ({
                              ...prev,
                              [inst.id]: tab,
                            }))
                          }
                        >
                          {tab === 'full' ? 'Pay in full' : tab === 'custom' ? 'Custom amount' : 'By fee head'}
                        </button>
                      ))}
                    </div>

                    {/* Tab 1: Pay in Full */}
                    {currentTab === 'full' && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '12px',
                          flexWrap: 'wrap',
                          background: '#ffffff',
                          padding: '16px 20px',
                          borderRadius: '16px',
                          border: '1px solid rgba(7, 53, 51, 0.08)',
                        }}
                      >
                        <div>
                          <span style={{ fontSize: '12px', color: '#6c8f89', display: 'block' }}>You pay</span>
                          <strong style={{ fontSize: '22px', color: '#073533', fontVariantNumeric: 'tabular-nums' }}>
                            {inst.amt}
                          </strong>
                        </div>
                        <button
                          type="button"
                          className="button primary"
                          style={{
                            borderRadius: '9999px',
                            padding: '10px 26px',
                            fontWeight: 600,
                            fontSize: '14px',
                            boxShadow: '0 4px 14px rgba(6, 51, 49, 0.2)',
                          }}
                          onClick={() => handlePay(inst.seq, inst.amt, 'Full Installment')}
                        >
                          Pay {inst.amt}
                        </button>
                      </div>
                    )}

                    {/* Tab 2: Custom Amount */}
                    {currentTab === 'custom' && (
                      <div
                        style={{
                          background: '#ffffff',
                          padding: '18px 20px',
                          borderRadius: '16px',
                          border: '1px solid rgba(7, 53, 51, 0.08)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                          <div>
                            <strong style={{ fontSize: '14px', color: '#073533' }}>Custom payment amount</strong>
                            <span style={{ fontSize: '12.5px', color: '#6c8f89', display: 'block' }}>
                              Up to {inst.amt} for this installment
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              border: customNum > inst.maxVal ? '1px solid #dc2626' : '1px solid rgba(7, 53, 51, 0.16)',
                              borderRadius: '12px',
                              background: '#ffffff',
                              padding: '0 12px',
                              height: '42px',
                              width: '180px',
                              boxShadow: '0 1px 4px rgba(6, 45, 42, 0.05)',
                            }}
                          >
                            <span style={{ color: '#6c8f89', fontWeight: 600 }}>₹</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={customVal}
                              onChange={(e) =>
                                setCustomAmounts((prev) => ({
                                  ...prev,
                                  [inst.id]: e.target.value,
                                }))
                              }
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#073533',
                                width: '100%',
                                outline: 'none',
                                textAlign: 'right',
                                fontSize: '15px',
                                fontWeight: 600,
                              }}
                            />
                          </div>
                        </div>

                        {customNum > inst.maxVal && (
                          <p style={{ color: '#dc2626', fontSize: '12.5px', margin: '0 0 10px', fontWeight: 500 }}>
                            Amount cannot exceed {inst.amt} for this installment.
                          </p>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                          <button
                            type="button"
                            className="button primary"
                            disabled={customNum <= 0 || customNum > inst.maxVal}
                            style={{
                              borderRadius: '9999px',
                              padding: '10px 24px',
                              fontWeight: 600,
                              fontSize: '13.5px',
                              opacity: customNum <= 0 || customNum > inst.maxVal ? 0.45 : 1,
                              cursor: customNum <= 0 || customNum > inst.maxVal ? 'not-allowed' : 'pointer',
                            }}
                            onClick={() => handlePay(inst.seq, formatINR(customNum, false), 'Custom Amount')}
                          >
                            Pay custom amount ({formatINR(customNum, false)})
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Tab 3: By Fee Head */}
                    {currentTab === 'heads' && (
                      <div
                        style={{
                          background: '#ffffff',
                          padding: '18px 20px',
                          borderRadius: '16px',
                          border: '1px solid rgba(7, 53, 51, 0.08)',
                        }}
                      >
                        <p style={{ color: '#6c8f89', fontSize: '13px', margin: '0 0 14px' }}>
                          Enter amounts against one or more fee heads. Combined amount cannot exceed {inst.amt}.
                        </p>

                        <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
                          {headsList.map((h) => {
                            const val = headInputs[inst.id]?.[h.code] || '';
                            return (
                              <div
                                key={h.code}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '10px 0',
                                  borderBottom: '1px solid rgba(7, 53, 51, 0.06)',
                                }}
                              >
                                <div>
                                  <strong style={{ fontSize: '13.5px', color: '#073533' }}>{h.label}</strong>
                                  <span style={{ fontSize: '12px', color: '#6c8f89', display: 'block' }}>
                                    {formatINR(h.remainingMajor, false)} remaining
                                  </span>
                                </div>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    border: '1px solid rgba(7, 53, 51, 0.16)',
                                    borderRadius: '10px',
                                    background: '#ffffff',
                                    padding: '0 10px',
                                    height: '38px',
                                    width: '160px',
                                  }}
                                >
                                  <span style={{ color: '#6c8f89', fontSize: '13px' }}>₹</span>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={val}
                                    onChange={(e) => {
                                      const raw = parseFloat(e.target.value) || 0;
                                      const safe = raw > h.remainingMajor ? String(h.remainingMajor) : e.target.value;
                                      setHeadInputs((prev) => ({
                                        ...prev,
                                        [inst.id]: {
                                          ...(prev[inst.id] || {}),
                                          [h.code]: safe,
                                        },
                                      }));
                                    }}
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#073533',
                                      width: '100%',
                                      outline: 'none',
                                      textAlign: 'right',
                                      fontSize: '13.5px',
                                      fontWeight: 600,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {headsSum > inst.maxVal && (
                          <p style={{ color: '#dc2626', fontSize: '12.5px', margin: '0 0 10px', fontWeight: 500 }}>
                            Total cannot exceed {inst.amt} for this installment.
                          </p>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                          <div>
                            <span style={{ fontSize: '12px', color: '#6c8f89', display: 'block' }}>Selected total</span>
                            <strong style={{ fontSize: '18px', color: '#073533', fontVariantNumeric: 'tabular-nums' }}>
                              {formatINR(headsSum, false)}
                            </strong>
                          </div>
                          <button
                            type="button"
                            className="button primary"
                            disabled={headsSum <= 0 || headsSum > inst.maxVal}
                            style={{
                              borderRadius: '9999px',
                              padding: '10px 24px',
                              fontWeight: 600,
                              fontSize: '13.5px',
                              opacity: headsSum <= 0 || headsSum > inst.maxVal ? 0.45 : 1,
                              cursor: headsSum <= 0 || headsSum > inst.maxVal ? 'not-allowed' : 'pointer',
                            }}
                            onClick={() => handlePay(inst.seq, formatINR(headsSum, false), 'Selected Fee Heads')}
                          >
                            Pay selected fee heads
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* ============================================================== */}
        {/* Flex / eNACH Mandate Card (Informative Status Overview)        */}
        {/* ============================================================== */}
        <section
          style={{
            background: '#ffffff',
            border: '1px solid rgba(7, 53, 51, 0.08)',
            borderRadius: '26px',
            padding: '26px 28px',
            marginBottom: '24px',
            boxShadow: '0 10px 30px -4px rgba(6, 45, 42, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#d6f4ec',
                  color: '#064840',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '14px',
                }}
              >
                ⚡
              </span>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: 0 }}>
                Flex / eNACH mandate
              </h2>
            </div>

            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: '9999px',
                background: '#eafbf4',
                color: '#075e47',
                border: '1px solid #a3ebce',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Active
            </span>
          </div>

          <p style={{ color: '#587973', margin: '0 0 18px', fontSize: '13.5px', lineHeight: 1.5 }}>
            Automatic collection is active through <strong style={{ color: '#073533' }}>eNACH</strong>. Due installments can be submitted automatically to the configured provider. Final payment status is recorded only after verified provider confirmation.
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 20px',
              border: '1px solid rgba(7, 53, 51, 0.08)',
              borderRadius: '16px',
              background: '#fbfdfc',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <b style={{ display: 'block', fontSize: '14.5px', color: '#073533' }}>
                eNACH · NPCI Standing Mandate
              </b>
              <small style={{ color: '#6c8f89', fontSize: '12px' }}>
                Started 23/10/2026, 1:18:28 pm · UMRN: <span style={{ fontFamily: 'monospace', color: '#073533', fontWeight: 600 }}>UMRN-NACH-2026-089412</span> · Bank: HDFC Bank (•••• 1244)
              </small>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: '9999px',
                background: '#eafbf4',
                color: '#075e47',
                border: '1px solid #a3ebce',
              }}
            >
              ✓ Active
            </span>
          </div>
        </section>

        {/* Payment History Card */}
        <section
          style={{
            background: '#ffffff',
            border: '1px solid rgba(7, 53, 51, 0.08)',
            borderRadius: '26px',
            padding: '26px 28px',
            marginBottom: '24px',
            boxShadow: '0 10px 30px -4px rgba(6, 45, 42, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: 0 }}>
              Payment history
            </h2>
            <span style={{ fontSize: '12px', color: '#6c8f89', fontWeight: 500 }}>
              1 settled transaction
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 0',
              borderTop: '1px solid rgba(7, 53, 51, 0.06)',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <strong style={{ fontSize: '18px', color: '#073533', fontVariantNumeric: 'tabular-nums' }}>
                ₹40,000.00
              </strong>
              <span style={{ display: 'block', fontSize: '12.5px', color: '#6c8f89', marginTop: '3px' }}>
                Recorded 08/07/2026, 4:00 pm · settled
              </span>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '11.5px', color: '#6c8f89', display: 'block' }}>Receipt</span>
              <strong style={{ fontSize: '13.5px', color: '#073533' }}>DPS-REC-2026-00412</strong>
              {' · '}
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#075e47',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
                onClick={() =>
                  setViewReceipt({
                    receipt_number: 'DPS-REC-2026-00412',
                    date: '08/07/2026, 4:00 pm',
                    amount: '₹40,000.00',
                    student: data.payer.studentName || 'V Rakesh',
                    payer: data.payer.displayName,
                    ref: data.payer.accountReference,
                    installment: 'Installment #1 (Tuition & Academic Fees)',
                  })
                }
              >
                View / print
              </button>
            </div>
          </div>
        </section>

        {/* Security Note Alert Card */}
        <div
          style={{
            background: '#eafbf4',
            border: '1px solid #a3ebce',
            color: '#075e47',
            borderRadius: '20px',
            padding: '18px 22px',
            fontSize: '13.5px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontSize: '18px', flexShrink: 0 }}>🔒</span>
          <div>
            <strong style={{ display: 'block', color: '#064840', marginBottom: '2px', fontWeight: 700 }}>
              Security note
            </strong>
            Payment actions redirect to the approved hosted provider. This portal never asks for bank credentials, PINs or OTPs.
          </div>
        </div>
      </div>
    </div>
  );
}
