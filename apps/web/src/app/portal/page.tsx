'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type PortalStudent = {
  id: string;
  student_reference: string;
  full_name: string;
  email?: string;
  phone?: string;
  status: string;
  institution_name: string;
  course?: string;
  grade?: string;
  group_name?: string;
  academic_year?: string;
  campus?: string;
  payer_name?: string;
  payer_email?: string;
  payer_phone?: string;
};

type FeeSummary = {
  net_payable_minor: string | number;
  paid_minor: string | number;
  outstanding_minor: string | number;
};

type FeeComponent = {
  id: string;
  label: string;
  code: string;
  amount_minor: string | number;
};

type Installment = {
  id: string;
  sequence: number;
  due_date: string;
  amount_minor: string | number;
  adjustment_amount_minor: string | number;
  paid_amount_minor: string | number;
  remaining_minor: string | number;
  status: string;
};

type Mandate = {
  id: string;
  provider: string;
  provider_reference: string;
  status: string;
  rail: string;
  bank_name?: string;
  account_mask?: string;
  max_amount_minor?: number;
  last_event_at?: string;
};

type PaymentRecord = {
  id: string;
  provider_reference: string;
  amount_minor: string | number;
  refunded_amount_minor: string | number;
  recorded_at: string;
  status: string;
  receipt_number?: string;
  payment_method?: string;
};

type FormFieldConfig = {
  key: string;
  label: string;
  visible: boolean;
  required: boolean;
  editable: boolean;
  order: number;
};

type FormConfig = {
  fields: FormFieldConfig[];
  components: Array<{
    code: string;
    label: string;
    visible: boolean;
    required: boolean;
    selectable: boolean;
    fixed: boolean;
  }>;
  rules: {
    allowFullPayment: boolean;
    allowPartialPayment: boolean;
    allowAdvance: boolean;
    minPartialAmountMinor: number;
    maxPartialAmountMinor: number;
    requireDownPayment: boolean;
    enableEnach: boolean;
    allowPayerEditing: boolean;
  };
  instructions: {
    bannerText: string;
    termsText: string;
  };
};

type PaymentCompleteData = {
  paymentId: string;
  receiptNumber: string;
  transactionId: string;
  amountMinor: number;
  date: string;
  installmentRemainingMinor: number;
  netOutstandingMinor: number;
};

const formatMoney = (minor: string | number | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    Number(minor || 0) / 100,
  );

const formatDate = (iso: string | undefined) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export default function StudentPortalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Login input fields
  const [loginReference, setLoginReference] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');

  // Portal State
  const [activeTab, setActiveTab] = useState<'home' | 'plans' | 'transactions' | 'support'>('home');
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [scheduleView, setScheduleView] = useState<'flex' | 'master'>('flex');
  const [student, setStudent] = useState<PortalStudent | null>(null);
  const [tenant, setTenant] = useState<{ id: string; name: string } | null>(null);
  const [summary, setSummary] = useState<FeeSummary>({
    net_payable_minor: 0,
    paid_minor: 0,
    outstanding_minor: 0,
  });
  const [components, setComponents] = useState<FeeComponent[]>([]);
  const [masterSchedule, setMasterSchedule] = useState<Installment[]>([]);
  const [flexSchedule, setFlexSchedule] = useState<Installment[]>([]);
  const [upcomingInstallment, setUpcomingInstallment] = useState<Installment | null>(null);
  const [upcomingDebit, setUpcomingDebit] = useState<{
    amount_minor: number;
    scheduled_date?: string;
  } | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null);

  // eNACH Registration Form State
  const [payerName, setPayerName] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [bankName, setBankName] = useState('State Bank of India');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('SBIN0001234');
  const [accountType, setAccountType] = useState('savings');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [enachRegistering, setEnachRegistering] = useState(false);
  const [enachSuccessMessage, setEnachSuccessMessage] = useState('');
  const [enachError, setEnachError] = useState('');

  // Sandbox Debit Simulator State
  const [simulatingDebit, setSimulatingDebit] = useState(false);
  const [debitMessage, setDebitMessage] = useState('');
  const [paymentComplete, setPaymentComplete] = useState<PaymentCompleteData | null>(null);

  // Active Receipt Modal
  const [viewingReceipt, setViewingReceipt] = useState<any | null>(null);

  // Load token from sessionStorage on mount
  useEffect(() => {
    const savedToken =
      typeof window !== 'undefined' ? sessionStorage.getItem('portal_token') : null;
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  // Fetch portal data when token changes
  const fetchPortalData = async (authToken: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/portal/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          sessionStorage.removeItem('portal_token');
          setToken(null);
        }
        throw new Error('Failed to load profile');
      }
      const data = await res.json();
      setStudent({
        ...data.student,
        student_reference: data.student.studentReference,
        full_name: data.student.fullName,
        institution_name: data.institution.name,
        academic_year: data.student.academicYear,
        group_name: data.student.groupName,
      });
      setTenant(data.institution);
      setSummary({
        net_payable_minor: data.summary.netPayableMinor,
        paid_minor: data.summary.paidMinor,
        outstanding_minor: data.summary.outstandingMinor,
      });
      setComponents(data.feeComponents.map((c: any) => ({ ...c, amount_minor: c.amountMinor })));
      const installments = data.installments.map((i: any) => ({
        ...i,
        due_date: i.dueDate,
        amount_minor: i.amountMinor,
        paid_amount_minor: i.paidAmountMinor,
        remaining_minor: i.remainingMinor,
      }));
      setMasterSchedule(data.masterSchedule || []);
      setFlexSchedule(installments);
      setUpcomingInstallment(installments.find((i: any) => Number(i.remaining_minor) > 0) || null);
      setUpcomingDebit(
        data.enach.upcomingDebit
          ? {
              amount_minor: data.enach.upcomingDebit.amountMinor,
              scheduled_date: data.enach.upcomingDebit.scheduledDate,
            }
          : null,
      );
      setMandate(
        data.enach.mandateId
          ? {
              id: data.enach.mandateId,
              provider: data.enach.provider,
              provider_reference: data.enach.mandateReference,
              status: data.enach.status,
              rail: 'enach',
            }
          : null,
      );
      setPayments(
        data.transactions.map((p: any) => ({
          ...p,
          amount_minor: p.amountMinor,
          recorded_at: p.recordedAt,
          receipt_number: p.receiptNumber,
          payment_method: p.mode,
          provider_reference: p.transactionId,
        })),
      );
      setPayerName(data.payer.name || '');
      setPayerEmail(data.payer.email || '');
      setPayerPhone(data.payer.phone || '');

      // Also fetch form config
      const cfgRes = await fetch('/api/v1/portal/form-config', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        setFormConfig({
          ...cfgData,
          instructions: {
            bannerText: cfgData.instructions,
            termsText:
              cfgData.rules.terms_text ||
              'Authorize Sandbox eNACH recurring debits for the current remaining installment balances.',
          },
          rules: {
            enableEnach: cfgData.rules.enable_enach,
            allowPayerEditing: cfgData.rules.allow_payer_contact_editing,
          },
        });
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      void fetchPortalData(token);
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentReference: loginReference.trim(),
          identifier: loginIdentifier.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Authentication failed. Please verify your details.');
      }
      sessionStorage.setItem('portal_token', data.token);
      setToken(data.token);
    } catch (err: any) {
      setLoginError(
        err.message || 'Login failed. Please verify your Enrollment ID and phone/email.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('/api/v1/portal/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    sessionStorage.removeItem('portal_token');
    setToken(null);
    setStudent(null);
    setMandate(null);
    setPaymentComplete(null);
    setActiveTab('home');
  };

  const handleRegisterEnach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setEnachError('');
    setEnachSuccessMessage('');
    if (!acceptedTerms) {
      setEnachError('Please accept the recurring eNACH mandate authorization terms.');
      return;
    }
    setEnachRegistering(true);
    try {
      const res = await fetch('/api/v1/portal/enach/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          payerName,
          payerEmail,
          payerPhone,
          bankName,
          accountNumber,
          ifsc: ifscCode,
          accountType,
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to register eNACH mandate.');
      }
      setEnachSuccessMessage(data.message || 'eNACH Registration Successful · Mandate Active');
      await fetchPortalData(token);
    } catch (err: any) {
      setEnachError(err.message || 'eNACH registration could not be completed.');
    } finally {
      setEnachRegistering(false);
    }
  };

  const handleSimulateDebit = async (outcome: 'success' | 'failed') => {
    if (!token) return;
    setDebitMessage('');
    setSimulatingDebit(true);
    try {
      const res = await fetch('/api/v1/portal/enach/simulate-debit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ outcome: outcome === 'success' ? 'successful' : outcome }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Debit simulation failed');
      }
      if (outcome === 'failed') {
        setDebitMessage(data.message || 'Simulated debit failed as requested.');
      } else if (data.paymentComplete) {
        const p = data.paymentComplete;
        setPaymentComplete({
          paymentId: p.transactionId,
          receiptNumber: p.receiptNumber,
          transactionId: p.transactionId,
          amountMinor: p.amountMinor,
          date: p.paymentDate,
          installmentRemainingMinor: 0,
          netOutstandingMinor: p.outstandingMinor,
        });
      }
      await fetchPortalData(token);
    } catch (err: any) {
      setDebitMessage(err.message || 'Debit could not be processed.');
    } finally {
      setSimulatingDebit(false);
    }
  };

  const openReceipt = async (receiptNumber: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/v1/portal/receipts/${encodeURIComponent(receiptNumber)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const snap = data.snapshot || {};
        setViewingReceipt({
          ...data,
          receiptNumber: data.receipt_number,
          institutionName: snap.instituteName || data.institution_name,
          receiptConfig: snap.receiptConfig || {},
          studentName: snap.studentName,
          studentReference: snap.accountReference,
          paymentDate: data.recorded_at,
          transactionId: data.transaction_id,
          paymentMethod: data.payment_mode || 'eNACH',
          amountMinor: data.amount_minor,
        });
      }
    } catch {}
  };

  const printDocument = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  // -------------------------------------------------------------
  // Unauthenticated: Student / Parent Login Form
  // -------------------------------------------------------------
  if (!token) {
    return (
      <main
        id="main"
        className="portal-container"
        style={{ maxWidth: '480px', margin: '4rem auto', padding: '1rem' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Dodo</span>
          </Link>
          <p className="eyebrow" style={{ marginTop: '0.5rem', letterSpacing: '0.05em' }}>
            STUDENT & PARENT ACCESS
          </p>
          <h1 style={{ fontSize: '1.75rem', marginTop: '0.25rem' }}>Student / Parent Portal</h1>
          <p style={{ color: '#526173', fontSize: '0.95rem' }}>
            Sign in with your enrollment ID and the secure access code issued by your institution to
            view fee schedules, receipts, and eNACH status.
          </p>
        </div>

        <div
          className="admin-panel"
          style={{ padding: '2rem', border: '1px solid #dce3e8', borderRadius: '8px' }}
        >
          {loginError && (
            <div
              role="alert"
              style={{
                background: '#fdf2f2',
                border: '1px solid #f8b4b4',
                color: '#9b1c1c',
                padding: '0.75rem',
                borderRadius: '4px',
                marginBottom: '1.25rem',
              }}
            >
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="admin-form">
            <label className="field" style={{ display: 'block', marginBottom: '1rem' }}>
              <span>Enrollment / Student ID *</span>
              <input
                type="text"
                required
                placeholder="e.g. STU-2026-001"
                value={loginReference}
                onChange={(e) => setLoginReference(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                autoFocus
              />
            </label>

            <label className="field" style={{ display: 'block', marginBottom: '1.5rem' }}>
              <span>Institution-issued Access Code *</span>
              <input
                type="text"
                required
                placeholder="Secure code from your payer portal link"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
              />
            </label>

            <button
              type="submit"
              className="button primary"
              disabled={loading}
              style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
            >
              {loading ? 'Authenticating…' : 'Access Student Portal'}
            </button>
          </form>

          <div
            style={{
              marginTop: '1.5rem',
              textAlign: 'center',
              fontSize: '0.875rem',
              color: '#6b7280',
            }}
          >
            Need help? Contact your institution finance desk.
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <Link href="/" style={{ color: '#526173', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Back to Public Home
          </Link>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // Authenticated Portal View
  // -------------------------------------------------------------
  return (
    <div className="student-portal-shell" style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Top Portal Navigation Header */}
      <header
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '0.75rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              color: '#0f172a',
              fontWeight: 'bold',
              fontSize: '1.25rem',
            }}
          >
            Dodo{' '}
            <span style={{ color: '#0369a1', fontSize: '0.875rem', fontWeight: 'normal' }}>
              · Student & Parent Portal
            </span>
          </Link>
          {student && (
            <span
              style={{
                background: '#f1f5f9',
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.85rem',
                color: '#334155',
              }}
            >
              {student.full_name} ({student.student_reference}) · {student.institution_name}
            </span>
          )}
        </div>

        {/* Portal Tabs Navigation */}
        <nav style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className={`button ${activeTab === 'home' ? 'primary' : 'secondary'}`}
            style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
            onClick={() => {
              setActiveTab('home');
              setPaymentComplete(null);
            }}
          >
            Home
          </button>
          <button
            className={`button ${activeTab === 'plans' ? 'primary' : 'secondary'}`}
            style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
            onClick={() => {
              setActiveTab('plans');
              setPaymentComplete(null);
            }}
          >
            Plans & Payments
          </button>
          <button
            className={`button ${activeTab === 'transactions' ? 'primary' : 'secondary'}`}
            style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
            onClick={() => {
              setActiveTab('transactions');
              setPaymentComplete(null);
            }}
          >
            Transactions
          </button>
          <button
            className={`button ${activeTab === 'support' ? 'primary' : 'secondary'}`}
            style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
            onClick={() => {
              setActiveTab('support');
              setPaymentComplete(null);
            }}
          >
            Support
          </button>
          <button
            className="button outline"
            style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem', marginLeft: '0.5rem' }}
            onClick={handleLogout}
          >
            Logout
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main id="main" style={{ maxWidth: '1100px', margin: '2rem auto', padding: '0 1.5rem' }}>
        {loading && !student && (
          <p role="status" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            Loading student financial records…
          </p>
        )}

        {/* -------------------------------------------------------------
            PAYMENT COMPLETE SCREEN (After Verified Money Collection)
        ------------------------------------------------------------- */}
        {paymentComplete && (
          <section
            className="admin-panel"
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #bbf7d0',
              padding: '2rem',
              marginBottom: '2rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '56px',
                  height: '56px',
                  background: '#dcfce7',
                  color: '#15803d',
                  borderRadius: '50%',
                  fontSize: '1.75rem',
                  marginBottom: '0.75rem',
                }}
              >
                ✓
              </div>
              <h2 style={{ color: '#166534', margin: 0, fontSize: '1.75rem' }}>Payment Complete</h2>
              <p style={{ color: '#15803d', marginTop: '0.25rem' }}>
                Your payment has been successfully debited and verified by the institution ledger.
              </p>
            </div>

            <div
              style={{
                background: '#f8fafc',
                borderRadius: '8px',
                padding: '1.5rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                  Student Name
                </span>
                <strong style={{ fontSize: '1rem', color: '#1e293b' }}>{student?.full_name}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                  Course / Grade
                </span>
                <strong style={{ fontSize: '1rem', color: '#1e293b' }}>
                  {student?.course || 'General'} · {student?.grade || 'Standard'}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                  Receipt Number
                </span>
                <strong style={{ fontSize: '1rem', color: '#0369a1' }}>
                  {paymentComplete.receiptNumber}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                  Transaction Reference
                </span>
                <strong style={{ fontSize: '0.95rem', color: '#1e293b', wordBreak: 'break-all' }}>
                  {paymentComplete.transactionId}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                  Payment Date
                </span>
                <strong style={{ fontSize: '1rem', color: '#1e293b' }}>
                  {formatDate(paymentComplete.date)}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                  Amount Paid
                </span>
                <strong style={{ fontSize: '1.25rem', color: '#166534' }}>
                  {formatMoney(paymentComplete.amountMinor)}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                  Remaining Balance
                </span>
                <strong style={{ fontSize: '1.1rem', color: '#1e293b' }}>
                  {formatMoney(paymentComplete.netOutstandingMinor)}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                  Payment Method
                </span>
                <strong style={{ fontSize: '1rem', color: '#1e293b' }}>eNACH Debit</strong>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                className="button primary"
                onClick={() => openReceipt(paymentComplete.receiptNumber)}
              >
                View Receipt
              </button>
              <button
                className="button secondary"
                onClick={() => openReceipt(paymentComplete.receiptNumber)}
              >
                Download Receipt
              </button>
              <button className="button outline" onClick={printDocument}>
                Print Receipt
              </button>
              <button
                className="button outline"
                onClick={() => {
                  setPaymentComplete(null);
                  setActiveTab('home');
                }}
              >
                Return to Portal Home
              </button>
            </div>
          </section>
        )}

        {/* -------------------------------------------------------------
            TAB 1: HOME
        ------------------------------------------------------------- */}
        {activeTab === 'home' && !paymentComplete && (
          <button
            className="button primary"
            onClick={() => {
              setOnboardingStep(1);
              setActiveTab('plans');
            }}
          >
            Setup New Payment Plan
          </button>
        )}
        {activeTab === 'home' && !paymentComplete && student && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Greeting & Student Details */}
            <div
              className="admin-panel"
              style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <h1 style={{ fontSize: '1.5rem', margin: 0 }}>
                    Welcome, {student.payer_name || student.full_name}
                  </h1>
                  <p style={{ color: '#64748b', marginTop: '0.25rem' }}>
                    Fee dashboard for {student.full_name} at{' '}
                    <strong>{student.institution_name}</strong>
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      background: student.status === 'active' ? '#dcfce7' : '#f1f5f9',
                      color: student.status === 'active' ? '#15803d' : '#475569',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                    }}
                  >
                    Status: {student.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginTop: '1.25rem',
                  paddingTop: '1.25rem',
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                    Enrollment ID
                  </span>
                  <strong>{student.student_reference}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                    Course / Program
                  </span>
                  <strong>{student.course || '—'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                    Grade / Class
                  </span>
                  <strong>{student.grade || '—'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                    Academic Year
                  </span>
                  <strong>{student.academic_year || '—'}</strong>
                </div>
              </div>
            </div>

            {/* Financial Overview Metrics */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1.5rem',
              }}
            >
              <div
                className="admin-panel"
                style={{
                  background: '#ffffff',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  borderLeft: '4px solid #0284c7',
                }}
              >
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: '#64748b',
                    fontWeight: 600,
                    letterSpacing: '0.025em',
                  }}
                >
                  NET PAYABLE
                </span>
                <h3 style={{ fontSize: '1.75rem', margin: '0.5rem 0', color: '#0f172a' }}>
                  {formatMoney(summary.net_payable_minor)}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Total fee components after approved concessions
                </p>
              </div>

              <div
                className="admin-panel"
                style={{
                  background: '#ffffff',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  borderLeft: '4px solid #16a34a',
                }}
              >
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: '#64748b',
                    fontWeight: 600,
                    letterSpacing: '0.025em',
                  }}
                >
                  TOTAL PAID
                </span>
                <h3 style={{ fontSize: '1.75rem', margin: '0.5rem 0', color: '#15803d' }}>
                  {formatMoney(summary.paid_minor)}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Confirmed collections & cleared installments
                </p>
              </div>

              <div
                className="admin-panel"
                style={{
                  background: '#ffffff',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  borderLeft: `4px solid ${Number(summary.outstanding_minor) > 0 ? '#ea580c' : '#15803d'}`,
                }}
              >
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: '#64748b',
                    fontWeight: 600,
                    letterSpacing: '0.025em',
                  }}
                >
                  OUTSTANDING BALANCE
                </span>
                <h3
                  style={{
                    fontSize: '1.75rem',
                    margin: '0.5rem 0',
                    color: Number(summary.outstanding_minor) > 0 ? '#ea580c' : '#15803d',
                  }}
                >
                  {formatMoney(summary.outstanding_minor)}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  {Number(summary.outstanding_minor) === 0
                    ? 'All fees settled'
                    : 'Remaining balance across schedule'}
                </p>
              </div>
            </div>

            {/* Upcoming Installment & eNACH Status Card */}
            <div
              className="admin-panel"
              style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Collection & Installment Status</h3>
                <span
                  style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.85rem',
                    background: mandate?.status === 'active' ? '#dcfce7' : '#fef3c7',
                    color: mandate?.status === 'active' ? '#166534' : '#92400e',
                    fontWeight: 500,
                  }}
                >
                  {mandate?.status === 'active'
                    ? 'eNACH Mandate: Active (Auto-Debit Enabled)'
                    : 'eNACH Mandate: Not Registered'}
                </span>
              </div>

              {upcomingInstallment ? (
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '1rem',
                    borderRadius: '6px',
                    marginBottom: '1rem',
                  }}
                >
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>
                    Next Installment: <strong>Installment #{upcomingInstallment.sequence}</strong> ·
                    Due on <strong>{formatDate(upcomingInstallment.due_date)}</strong>
                  </p>
                  <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>
                    Remaining collectible amount:{' '}
                    <strong>{formatMoney(upcomingInstallment.remaining_minor)}</strong>
                  </p>
                </div>
              ) : (
                <p style={{ color: '#64748b', marginBottom: '1rem' }}>
                  No upcoming scheduled installments. All current installments are settled.
                </p>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="button primary" onClick={() => setActiveTab('plans')}>
                  View / Continue Plan
                </button>
                {mandate?.status !== 'active' && (
                  <button className="button secondary" onClick={() => setActiveTab('plans')}>
                    Register eNACH
                  </button>
                )}
                <button className="button outline" onClick={() => setActiveTab('transactions')}>
                  View Receipts & Transactions
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            TAB 2: PLANS & PAYMENTS
        ------------------------------------------------------------- */}
        {activeTab === 'plans' && !paymentComplete && student && (
          <section className="admin-panel" aria-label="New payment plan setup">
            <p className="eyebrow">SETUP NEW PAYMENT PLAN - STEP {onboardingStep} OF 4</p>
            {onboardingStep === 1 && (
              <>
                <h2>Select Institute</h2>
                <label className="field">
                  Institute
                  <select value={tenant?.id || ''} onChange={() => {}}>
                    <option value={tenant?.id}>{tenant?.name}</option>
                  </select>
                </label>
                <p>
                  Your institution-issued access code identifies the institute authorized to share
                  your records.
                </p>
              </>
            )}
            {onboardingStep === 2 && (
              <>
                <h2>Institute &amp; Student Information</h2>
                <label className="field">
                  Linked Student
                  <select value={student.id} onChange={() => {}}>
                    <option value={student.id}>
                      {student.full_name} - {student.student_reference}
                    </option>
                  </select>
                </label>
                <p>
                  {student.institution_name} / {student.course} / {student.grade}
                </p>
                <p>
                  To add another linked student, request an access link from their institution.
                  Existing student and payer records are reused.
                </p>
              </>
            )}
            {onboardingStep === 3 && (
              <>
                <h2>Confirm Student Details</h2>
                <p>
                  {student.full_name} / {student.student_reference}
                </p>
                <p>
                  {student.campus} / {student.academic_year}
                </p>
                <p>
                  Review your assigned Flex schedule below before completing the payer details form.
                </p>
              </>
            )}
            {onboardingStep === 4 && (
              <>
                <h2>Payer/User Details Form</h2>
                <p>
                  Review your prefilled contact details and authorize Sandbox eNACH below. Mandate
                  activation does not confirm a payment.
                </p>
              </>
            )}
            <div className="row">
              {onboardingStep > 1 && (
                <button
                  className="button secondary"
                  onClick={() => setOnboardingStep((n) => n - 1)}
                >
                  Back
                </button>
              )}
              {onboardingStep < 4 && (
                <button className="button primary" onClick={() => setOnboardingStep((n) => n + 1)}>
                  {onboardingStep === 3 ? 'Confirm & Continue' : 'Continue'}
                </button>
              )}
            </div>
          </section>
        )}
        {activeTab === 'plans' && !paymentComplete && student && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Header info */}
            <div
              className="admin-panel"
              style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem' }}
            >
              <div className="admin-toolbar" style={{ margin: 0 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Plans & Fee Breakdown</h2>
                  <p style={{ color: '#64748b', margin: '0.25rem 0 0 0' }}>
                    {student.full_name} · {student.course || 'General'} (
                    {student.grade || 'Standard'}) · {student.institution_name}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Outstanding</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#ea580c' }}>
                    {formatMoney(summary.outstanding_minor)}
                  </div>
                </div>
              </div>
            </div>

            {/* Fee Components Breakdown */}
            <section
              className="admin-panel"
              style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem' }}
            >
              <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Configured Fee Components</h3>
              {components.length === 0 ? (
                <p style={{ color: '#64748b' }}>
                  No individual fee heads configured for this schedule.
                </p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Component Description</th>
                        <th className="money">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {components.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.code}</strong>
                          </td>
                          <td>{c.label}</td>
                          <td className="money">{formatMoney(c.amount_minor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Payment Schedule (Flex vs Master) */}
            <section
              className="admin-panel"
              style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}
              >
                <h3 style={{ margin: 0 }}>Installment Schedule</h3>
                <div className="row" style={{ gap: '0.5rem' }}>
                  <button
                    className={`button ${scheduleView === 'flex' ? 'primary' : 'secondary'}`}
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
                    onClick={() => setScheduleView('flex')}
                  >
                    Student Flex Schedule
                  </button>
                  <button
                    className={`button ${scheduleView === 'master' ? 'primary' : 'secondary'}`}
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
                    onClick={() => setScheduleView('master')}
                  >
                    Master Template
                  </button>
                </div>
              </div>

              {(scheduleView === 'flex' ? flexSchedule : masterSchedule).length === 0 ? (
                <p style={{ color: '#64748b' }}>No schedule installments available.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Installment</th>
                        <th>Due Date</th>
                        <th className="money">Original Fee</th>
                        <th className="money">Adjustment</th>
                        <th className="money">Paid</th>
                        <th className="money">Remaining</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scheduleView === 'flex' ? flexSchedule : masterSchedule).map((inst) => (
                        <tr key={inst.id}>
                          <td>
                            <strong>#{inst.sequence}</strong>
                          </td>
                          <td>{formatDate(inst.due_date)}</td>
                          <td className="money">{formatMoney(inst.amount_minor)}</td>
                          <td className="money">{formatMoney(inst.adjustment_amount_minor)}</td>
                          <td className="money">{formatMoney(inst.paid_amount_minor)}</td>
                          <td className="money" style={{ fontWeight: 600 }}>
                            {formatMoney(inst.remaining_minor)}
                          </td>
                          <td>
                            <span
                              style={{
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                background:
                                  inst.status === 'paid'
                                    ? '#dcfce7'
                                    : inst.status === 'scheduled'
                                      ? '#eff6ff'
                                      : '#f1f5f9',
                                color:
                                  inst.status === 'paid'
                                    ? '#15803d'
                                    : inst.status === 'scheduled'
                                      ? '#1d4ed8'
                                      : '#475569',
                              }}
                            >
                              {inst.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* -------------------------------------------------------------
                STUDENT-FILLED PAYER FORM & eNACH REGISTRATION / SIMULATOR
            ------------------------------------------------------------- */}
            <section
              className="admin-panel"
              style={{
                background: '#ffffff',
                borderRadius: '8px',
                padding: '1.5rem',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ marginBottom: '1.25rem' }}>
                <p className="eyebrow" style={{ color: '#0369a1', margin: 0 }}>
                  RECURRING PAYMENTS
                </p>
                <h3 style={{ margin: '0.25rem 0' }}>Register & Manage eNACH Mandate</h3>
                <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
                  {formConfig?.instructions.bannerText ||
                    'Review and confirm your payer details to authorize automated bank debits for future fee installments.'}
                </p>
              </div>

              {mandate?.status === 'active' ? (
                /* Mandate is Active */
                <div>
                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '8px',
                      padding: '1.25rem',
                      marginBottom: '1.5rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        color: '#166534',
                        fontWeight: 600,
                        marginBottom: '0.5rem',
                      }}
                    >
                      <span style={{ fontSize: '1.25rem' }}>✓</span>
                      <span>eNACH Registration Successful · Mandate Active</span>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '0.75rem',
                        fontSize: '0.9rem',
                        color: '#1e293b',
                      }}
                    >
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: '0.8rem' }}>
                          Mandate Reference:
                        </span>
                        <strong>{mandate.provider_reference}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: '0.8rem' }}>
                          Mandate Status:
                        </span>
                        <span style={{ color: '#15803d', fontWeight: 'bold' }}>ACTIVE</span>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: '0.8rem' }}>
                          Bank / Account:
                        </span>
                        <strong>
                          {mandate.bank_name || 'Configured Bank'} ({mandate.account_mask || '••••'}
                          )
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: '0.8rem' }}>
                          Next Scheduled Debit:
                        </span>
                        <strong>
                          {upcomingDebit ? formatMoney(upcomingDebit.amount_minor) : 'None pending'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Sandbox Debit Simulator */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px dashed #cbd5e1',
                      borderRadius: '8px',
                      padding: '1.25rem',
                    }}
                  >
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#334155' }}>
                      Sandbox eNACH Debit Simulator (Testing & Verification)
                    </h4>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                      Simulate recurring debit processing. In accordance with zero-balance
                      prevention rules, if remaining balance is zero or fully paid, debits will be
                      prevented automatically.
                    </p>

                    {debitMessage && (
                      <div
                        role="status"
                        style={{
                          padding: '0.75rem',
                          borderRadius: '4px',
                          background: '#fef3c7',
                          color: '#92400e',
                          marginBottom: '1rem',
                          fontSize: '0.9rem',
                        }}
                      >
                        {debitMessage}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        className="button primary"
                        disabled={simulatingDebit || Number(summary.outstanding_minor) <= 0}
                        onClick={() => handleSimulateDebit('success')}
                      >
                        {simulatingDebit ? 'Processing Debit…' : 'Simulate Successful eNACH Debit'}
                      </button>
                      <button
                        className="button outline"
                        disabled={simulatingDebit || Number(summary.outstanding_minor) <= 0}
                        onClick={() => handleSimulateDebit('failed')}
                      >
                        Simulate Failed eNACH Debit (Insufficient Funds)
                      </button>
                    </div>

                    {Number(summary.outstanding_minor) <= 0 && (
                      <p
                        style={{
                          color: '#15803d',
                          fontSize: '0.85rem',
                          marginTop: '0.75rem',
                          margin: 0,
                        }}
                      >
                        ✓ Zero collectible balance on this schedule. Debit attempts are blocked.
                      </p>
                    )}
                  </div>
                </div>
              ) : /* Student-Filled Payer Form */
              onboardingStep === 4 ? (
                <form onSubmit={handleRegisterEnach} className="admin-form">
                  {enachError && (
                    <div
                      role="alert"
                      style={{
                        background: '#fdf2f2',
                        border: '1px solid #f8b4b4',
                        color: '#9b1c1c',
                        padding: '0.75rem',
                        borderRadius: '4px',
                        marginBottom: '1rem',
                      }}
                    >
                      {enachError}
                    </div>
                  )}
                  {enachSuccessMessage && (
                    <div
                      role="status"
                      style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        color: '#166534',
                        padding: '0.75rem',
                        borderRadius: '4px',
                        marginBottom: '1rem',
                      }}
                    >
                      {enachSuccessMessage}
                    </div>
                  )}

                  {formConfig?.rules.enableEnach === false && (
                    <p role="status">Your institution has disabled new eNACH registrations.</p>
                  )}
                  <h4 style={{ marginBottom: '0.75rem' }}>1. Payer Contact Details</h4>
                  <div className="row">
                    {(formConfig?.fields || [])
                      .filter((f) => f.visible)
                      .sort((a, b) => a.order - b.order)
                      .map((field) => {
                        const value =
                          field.key === 'payer_name'
                            ? payerName
                            : field.key === 'payer_email'
                              ? payerEmail
                              : field.key === 'payer_phone'
                                ? payerPhone
                                : field.key === 'student_name'
                                  ? student.full_name
                                  : field.key === 'course'
                                    ? student.course || ''
                                    : student.grade || '';
                        const editable =
                          field.editable &&
                          field.key.startsWith('payer_') &&
                          formConfig?.rules.allowPayerEditing !== false;
                        return (
                          <label className="field" key={field.key}>
                            {field.label}
                            {field.required ? ' *' : ''}
                            <input
                              type={
                                field.key === 'payer_email'
                                  ? 'email'
                                  : field.key === 'payer_phone'
                                    ? 'tel'
                                    : 'text'
                              }
                              value={value}
                              required={field.required}
                              readOnly={!editable}
                              onChange={(e) => {
                                if (field.key === 'payer_name') setPayerName(e.target.value);
                                if (field.key === 'payer_email') setPayerEmail(e.target.value);
                                if (field.key === 'payer_phone') setPayerPhone(e.target.value);
                              }}
                            />
                          </label>
                        );
                      })}
                  </div>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.75rem' }}>
                    2. Bank & Account Details for eNACH Mandate
                  </h4>
                  <div className="row">
                    <label className="field">
                      Select Bank *
                      <select value={bankName} onChange={(e) => setBankName(e.target.value)}>
                        <option value="State Bank of India">State Bank of India</option>
                        <option value="HDFC Bank">HDFC Bank</option>
                        <option value="ICICI Bank">ICICI Bank</option>
                        <option value="Axis Bank">Axis Bank</option>
                        <option value="Punjab National Bank">Punjab National Bank</option>
                        <option value="Bank of Baroda">Bank of Baroda</option>
                        <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                        <option value="Canara Bank">Canara Bank</option>
                      </select>
                    </label>
                    <label className="field">
                      Account Number *
                      <input
                        type="text"
                        required
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="e.g. 10023456789"
                      />
                    </label>
                    <label className="field">
                      IFSC Code *
                      <input
                        type="text"
                        required
                        value={ifscCode}
                        onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                        placeholder="e.g. SBIN0001234"
                      />
                    </label>
                    <label className="field">
                      Account Type *
                      <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                        <option value="savings">Savings Account</option>
                        <option value="current">Current Account</option>
                      </select>
                    </label>
                  </div>

                  <div style={{ marginTop: '1.25rem' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        style={{ marginTop: '0.25rem' }}
                      />
                      <span style={{ fontSize: '0.875rem', color: '#475569' }}>
                        {formConfig?.instructions.termsText ||
                          'I authorize recurring eNACH debits for educational institution fee installments as per the assigned schedule. I understand that registration activates recurring collections and money is not deducted until scheduled due dates.'}
                      </span>
                    </label>
                  </div>

                  <div style={{ marginTop: '1.5rem' }}>
                    <button
                      type="submit"
                      className="button primary"
                      disabled={
                        enachRegistering ||
                        !acceptedTerms ||
                        formConfig?.rules.enableEnach === false
                      }
                      style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}
                    >
                      {enachRegistering ? 'Registering eNACH Mandate…' : 'Register eNACH'}
                    </button>
                  </div>
                </form>
              ) : (
                <p>
                  Complete the institute and student confirmation steps above to register eNACH.
                </p>
              )}
            </section>
          </div>
        )}

        {/* -------------------------------------------------------------
            TAB 3: TRANSACTIONS & RECEIPTS
        ------------------------------------------------------------- */}
        {activeTab === 'transactions' && !paymentComplete && student && (
          <section
            className="admin-panel"
            style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem' }}
          >
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ margin: 0 }}>Payment Transactions & Receipts</h2>
              <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
                Complete ledger of direct payments (Cash, NEFT, RTGS, IMPS, Cheque, DD, Bank
                Transfer) and recurring eNACH debits.
              </p>
            </div>

            {payments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                <p>No payment transactions recorded yet.</p>
              </div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Payment Date</th>
                      <th>Transaction ID / Reference</th>
                      <th>Method</th>
                      <th className="money">Amount</th>
                      <th>Status</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>{formatDate(p.recorded_at)}</td>
                        <td>
                          <strong>{p.provider_reference}</strong>
                        </td>
                        <td>
                          <span
                            style={{
                              background: '#f1f5f9',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                            }}
                          >
                            {p.payment_method ||
                              (p.provider_reference.startsWith('CASH') ? 'Cash' : 'Bank / eNACH')}
                          </span>
                        </td>
                        <td className="money" style={{ fontWeight: 600 }}>
                          {formatMoney(p.amount_minor)}
                        </td>
                        <td>
                          <span
                            style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              background: p.status === 'confirmed' ? '#dcfce7' : '#eff6ff',
                              color: p.status === 'confirmed' ? '#15803d' : '#1d4ed8',
                            }}
                          >
                            {p.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {p.receipt_number ? (
                            <button
                              className="button secondary"
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                              onClick={() => openReceipt(p.receipt_number!)}
                            >
                              Download Receipt
                            </button>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Issued</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* -------------------------------------------------------------
            TAB 4: SUPPORT
        ------------------------------------------------------------- */}
        {activeTab === 'support' && !paymentComplete && student && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <section
              className="admin-panel"
              style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem' }}
            >
              <h2 style={{ margin: '0 0 0.5rem 0' }}>Institution Support & Helpdesk</h2>
              <p style={{ color: '#64748b', fontSize: '0.95rem', margin: '0 0 1.5rem 0' }}>
                Contact the student finance desk for assistance with fee plans, scholarship
                adjustments, or eNACH mandate updates.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '1.5rem',
                }}
              >
                <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#0f172a' }}>Institution Desk</h4>
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.9rem' }}>
                    <strong>{student.institution_name}</strong>
                  </p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                    Campus: {student.campus || 'Main Campus'}
                  </p>
                </div>

                <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#0f172a' }}>Finance Helpdesk</h4>
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.9rem' }}>
                    Email:{' '}
                    <strong>
                      accounts@{student.institution_name.toLowerCase().replace(/[^a-z0-9]/g, '')}
                      .edu
                    </strong>
                  </p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                    Helpline: +91 1800-123-4567 (Toll-Free)
                  </p>
                </div>

                <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#0f172a' }}>Operational Hours</h4>
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.9rem' }}>Monday – Saturday</p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                    9:00 AM – 5:00 PM IST
                  </p>
                </div>
              </div>
            </section>

            <section
              className="admin-panel"
              style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem' }}
            >
              <h3 style={{ margin: '0 0 1rem 0' }}>Frequently Asked Questions</h3>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  fontSize: '0.9rem',
                }}
              >
                <div>
                  <strong>Does registering eNACH immediately deduct money?</strong>
                  <p style={{ color: '#64748b', margin: '0.25rem 0 0 0' }}>
                    No. Mandate registration merely authorizes automated recurring debits on
                    scheduled installment due dates. Money is debited only when an installment
                    becomes due.
                  </p>
                </div>
                <div>
                  <strong>
                    What happens if I pay an installment directly through Cash or Bank Transfer?
                  </strong>
                  <p style={{ color: '#64748b', margin: '0.25rem 0 0 0' }}>
                    When a direct payment is recorded by the institution, future eNACH debits are
                    automatically recalculated and reduced in real time. If the balance reaches
                    zero, debits are completely prevented.
                  </p>
                </div>
                <div>
                  <strong>Where can I access my official tax and fee receipts?</strong>
                  <p style={{ color: '#64748b', margin: '0.25rem 0 0 0' }}>
                    Every confirmed payment generates an official receipt accessible in the
                    Transactions tab. You can view, download, or print official receipts anytime.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* -------------------------------------------------------------
          RECEIPT MODAL (VIEW / PRINT)
      ------------------------------------------------------------- */}
      {viewingReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Payment receipt"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
        >
          <div
            className="portal-receipt"
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              maxWidth: '650px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '2rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '2px solid #e2e8f0',
                paddingBottom: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>
                  {viewingReceipt.receiptConfig?.receipt_heading ||
                    viewingReceipt.receiptConfig?.heading ||
                    'OFFICIAL FEE RECEIPT'}
                </h2>
                <p style={{ margin: '0.25rem 0 0 0', fontWeight: 'bold', color: '#334155' }}>
                  {viewingReceipt.institutionName}
                </p>
                {viewingReceipt.receiptConfig?.institution_address && (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                    {viewingReceipt.receiptConfig.institution_address}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Receipt Number</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#0369a1' }}>
                  {viewingReceipt.receiptNumber}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Date: {formatDate(viewingReceipt.paymentDate)}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                fontSize: '0.9rem',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Student Name</span>
                <div style={{ fontWeight: 600 }}>{viewingReceipt.studentName}</div>
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                  ID: {viewingReceipt.studentReference}
                </div>
              </div>
              <div>
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Course / Grade</span>
                <div style={{ fontWeight: 600 }}>
                  {viewingReceipt.course} · {viewingReceipt.grade}
                </div>
              </div>
              <div>
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Transaction Reference</span>
                <div style={{ fontFamily: 'monospace' }}>{viewingReceipt.transactionId}</div>
              </div>
              <div>
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Payment Method</span>
                <div>{viewingReceipt.paymentMethod}</div>
              </div>
            </div>

            <div
              style={{
                background: '#f8fafc',
                padding: '1rem',
                borderRadius: '6px',
                marginBottom: '1.5rem',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Total Amount Paid</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#166534' }}>
                  {formatMoney(viewingReceipt.amountMinor)}
                </span>
              </div>
            </div>

            {viewingReceipt.receiptConfig?.terms_and_conditions && (
              <p
                style={{
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  borderTop: '1px solid #f1f5f9',
                  paddingTop: '0.75rem',
                  margin: '0 0 1.5rem 0',
                }}
              >
                {viewingReceipt.receiptConfig.terms_and_conditions}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="button primary" onClick={printDocument}>
                Print Receipt
              </button>
              <button className="button secondary" onClick={() => setViewingReceipt(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
