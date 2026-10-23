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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  // Plans Tab Interactive State (eNACH Exclusive)
  const [showPlanWizard, setShowPlanWizard] = useState(false);
  const [selectedPlanFreq, setSelectedPlanFreq] = useState<'annual' | 'biannual' | 'quarterly' | 'monthly'>('quarterly');
  const [concessionCode, setConcessionCode] = useState('');
  const [concessionDiscountMinor, setConcessionDiscountMinor] = useState(0);
  const [concessionFeedback, setConcessionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [planSuccessNotice, setPlanSuccessNotice] = useState('');

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
      const masterInsts = (data.masterSchedule || []).map((m: any) => ({
        id: m.id,
        sequence: m.sequence,
        due_date: m.dueDate || m.due_date,
        status: m.status || 'scheduled',
        amount_minor: m.amountMinor || m.amount_minor,
        paid_amount_minor: m.paidAmountMinor || m.paid_amount_minor || 0,
        remaining_minor: m.remainingMinor || m.remaining_minor || m.amountMinor || m.amount_minor,
      }));
      setMasterSchedule(masterInsts);
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

  const handleSimulateDebit = async (outcome: 'success' | 'failed', installmentId?: string) => {
    if (!token) return;
    setDebitMessage('');
    setSimulatingDebit(true);
    try {
      const isUuid =
        !!installmentId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(installmentId);
      const res = await fetch('/api/v1/portal/enach/simulate-debit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          outcome: outcome === 'success' ? 'successful' : outcome,
          ...(isUuid ? { installmentId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'eNACH debit could not be processed');
      }
      if (outcome === 'failed') {
        setDebitMessage(data.message || 'Simulated debit failed as requested (e.g. Insufficient funds).');
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
      } else {
        setDebitMessage(data.message || 'eNACH debit executed successfully via authorized mandate.');
      }
      await fetchPortalData(token);
    } catch (err: any) {
      setDebitMessage(err.message || 'eNACH debit could not be processed.');
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

  

  const handleAddTestInstallment = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/v1/portal/installments/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        setDebitMessage('Added ₹5,000 test installment to official schedule. You can now simulate eNACH debit.');
        await fetchPortalData(token);
      } else {
        const data = await res.json();
        setDebitMessage(data.message || 'Could not add test installment.');
      }
    } catch (err: any) {
      setDebitMessage(err.message || 'Could not add test installment.');
    }
  };

  const handleApplyConcession = () => {
    const code = concessionCode.trim().toUpperCase();
    if (code === 'MERIT10') {
      const discount = 250000;
      setConcessionDiscountMinor(discount);
      setConcessionFeedback({
        type: 'success',
        message: '10% Merit Scholarship applied! You save ₹2,500.00.',
      });
    } else if (code === 'EARLYBIRD') {
      const discount = 200000;
      setConcessionDiscountMinor(discount);
      setConcessionFeedback({
        type: 'success',
        message: 'Early Bird Concession applied! You save ₹2,000.00.',
      });
    } else if (code === 'SIBLING') {
      const discount = 300000;
      setConcessionDiscountMinor(discount);
      setConcessionFeedback({
        type: 'success',
        message: 'Sibling Benefit applied! You save ₹3,000.00.',
      });
    } else if (code.length > 0) {
      setConcessionDiscountMinor(0);
      setConcessionFeedback({
        type: 'error',
        message: `Code "${code}" is invalid or expired. Try using MERIT10 or EARLYBIRD.`,
      });
    }
  };

  const handleCompletePlanSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) return;

    // Register mandate via eNACH endpoint
    await handleRegisterEnach(e);

    const totalMinor = Math.max(0, 2500000 - concessionDiscountMinor);
    let count = 4;
    if (selectedPlanFreq === 'annual') count = 1;
    if (selectedPlanFreq === 'biannual') count = 2;
    if (selectedPlanFreq === 'quarterly') count = 4;
    if (selectedPlanFreq === 'monthly') count = 10;

    const perInstMinor = Math.round(totalMinor / count);
    const newSchedule: Installment[] = [];
    const baseDate = new Date();

    for (let i = 1; i <= count; i++) {
      const d = new Date(baseDate);
      if (selectedPlanFreq === 'annual') d.setMonth(d.getMonth() + 1);
      else if (selectedPlanFreq === 'biannual') d.setMonth(d.getMonth() + (i - 1) * 6 + 1);
      else if (selectedPlanFreq === 'quarterly') d.setMonth(d.getMonth() + (i - 1) * 3 + 1);
      else if (selectedPlanFreq === 'monthly') d.setMonth(d.getMonth() + i);

      newSchedule.push({
        id: `plan-inst-${i}-${Date.now()}`,
        sequence: i,
        due_date: d.toISOString(),
        amount_minor: perInstMinor,
        adjustment_amount_minor: 0,
        paid_amount_minor: 0,
        remaining_minor: perInstMinor,
        status: 'scheduled',
      });
    }

    setFlexSchedule(newSchedule);
    setSummary({
      net_payable_minor: totalMinor,
      paid_minor: 0,
      outstanding_minor: totalMinor,
    });
    setUpcomingInstallment(newSchedule[0]);
    setUpcomingDebit({
      amount_minor: perInstMinor,
      scheduled_date: newSchedule[0].due_date,
    });

    setPlanSuccessNotice(
      `eNACH Payment Plan registered successfully! ${count} recurring installment${count > 1 ? 's' : ''} of ${formatMoney(perInstMinor)} each linked to your bank mandate.`
    );
    setShowPlanWizard(false);
    setOnboardingStep(1);
  };

  // -------------------------------------------------------------
  // Unauthenticated: Student / Parent Login Form
  // -------------------------------------------------------------
  if (!token) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#F0F7F6',
          backgroundImage: 'radial-gradient(ellipse 90% 60% at 88% 18%, rgba(188, 234, 229, 0.25) 0%, rgba(240, 247, 246, 0.8) 60%, #F0F7F6 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1rem',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
        }}
      >
        <main
          id="main"
          className="portal-container"
          style={{ maxWidth: '480px', width: '100%', margin: '0 auto' }}
        >
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#062B28', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem' }}>
                +
              </span>
              <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#062B28', letterSpacing: '-0.025em' }}>Pharmacy Fee Portal</span>
            </Link>
            <div style={{ marginTop: '0.85rem' }}>
              <span style={{ background: '#D7F4BE', color: '#173C1C', padding: '0.35rem 0.95rem', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                STUDENT & PARENT ACCESS
              </span>
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#062B28', marginTop: '0.75rem', letterSpacing: '-0.02em' }}>Student / Parent Portal</h1>
            <p style={{ color: '#5C736E', fontSize: '0.925rem', marginTop: '0.4rem', lineHeight: 1.5 }}>
              Sign in with your enrollment ID and the secure access code issued by your institution to
              view fee schedules, receipts, and eNACH status.
            </p>
          </div>

          <div
            className="admin-panel"
            style={{
              padding: '2.25rem',
              background: '#FFFFFF',
              border: '1px solid #E1ECE9',
              borderRadius: '24px',
              boxShadow: '0 12px 36px rgba(6, 43, 40, 0.06)',
            }}
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
          <Link href="/" style={{ color: '#5C736E', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}>
            ← Back to Public Home
          </Link>
        </div>
      </main>
    </div>
    );
  }

  // -------------------------------------------------------------
  // Authenticated Portal View
  // -------------------------------------------------------------
  return (
    <div
  className="student-portal-shell"
  style={{
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#F0F7F6',
    backgroundImage: 'radial-gradient(ellipse 90% 60% at 88% 18%, rgba(188, 234, 229, 0.22) 0%, rgba(240, 247, 246, 0.8) 60%, #F0F7F6 100%)',
    backgroundAttachment: 'fixed',
    color: '#062B28',
    fontFamily: '"Plus Jakarta Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  }}
>
      {/* Mobile Drawer Backdrop */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 45,
          }}
        />
      )}

      {/* Left Sidebar Dashboard Navigation */}
      <aside
        className={`portal-sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}
        style={{
          width: '260px',
          minWidth: '260px',
          background: '#F0F7F6',
          borderRight: '1px solid #E1ECE9',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: '1px 0 6px rgba(6, 43, 40, 0.02)',
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            padding: '1.25rem 1.25rem',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#062B28',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '1.15rem',
                borderRadius: '50%',
                boxShadow: '0 2px 8px rgba(6, 43, 40, 0.15)',
              }}
            >
              D
            </div>
            <div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  color: '#062B28',
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                }}
              >
                Dodo
              </div>
              <div
                style={{
                  fontSize: '0.72rem',
                  color: '#7B8F8B',
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                }}
              >
                Student &amp; Parent Portal
              </div>
            </div>
          </Link>

          {/* Close button on mobile */}
          <button
            type="button"
            className="portal-mobile-close-btn"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '0.25rem',
              display: 'none',
              fontSize: '1.25rem',
            }}
          >
            &times;
          </button>
        </div>

        {/* Sidebar Nav Buttons */}
        <nav
          style={{
            flex: 1,
            padding: '1rem 0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              color: '#8A9995',
              letterSpacing: '0.08em',
              padding: '0 0.65rem 0.4rem',
              textTransform: 'uppercase',
            }}
          >
            Portal Dashboard
          </div>

          <button
            className={`portal-sidebar-nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('home');
              setPaymentComplete(null);
              setMobileNavOpen(false);
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Home</span>
          </button>

          <button
            className={`portal-sidebar-nav-item ${activeTab === 'plans' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('plans');
              setPaymentComplete(null);
              setMobileNavOpen(false);
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            <span>Plans &amp; Payments</span>
          </button>

          <button
            className={`portal-sidebar-nav-item ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('transactions');
              setPaymentComplete(null);
              setMobileNavOpen(false);
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>Transactions</span>
          </button>

          <button
            className={`portal-sidebar-nav-item ${activeTab === 'support' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('support');
              setPaymentComplete(null);
              setMobileNavOpen(false);
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Support</span>
          </button>
        </nav>

        {/* Sidebar Footer Actions */}
        <div
          style={{
            padding: '1rem 0.85rem',
            borderTop: '1px solid #EEF5F3',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
          }}
        >
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.55rem 0.75rem',
              borderRadius: '6px',
              color: '#5C736E',
              textDecoration: 'none',
              fontSize: '0.825rem',
              fontWeight: 500,
              transition: 'background 0.15s ease',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to Public Home</span>
          </Link>

          <button
            className="button outline"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.6rem 1rem',
              fontSize: '0.85rem',
              color: '#062B28',
              borderColor: '#E1ECE9',
              background: '#FFFFFF',
              borderRadius: '9999px',
              boxShadow: '0 1px 3px rgba(6, 43, 40, 0.02)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            onClick={handleLogout}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area on the Right */}
      <div
        className="student-portal-main-area"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        {/* Top Navbar Header (Clean Header without top navigation) */}
        <header
          className="portal-top-header"
          style={{
            background: 'rgba(240, 247, 246, 0.94)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid #E1ECE9',
            padding: '1.1rem 2.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 30,
            boxShadow: '0 1px 3px rgba(28, 29, 32, 0.02)',
          }}
        >
          {/* Left Region: Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <button
              type="button"
              className="portal-mobile-toggle-btn"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              style={{
                display: 'none',
                background: '#ffffff',
                border: '1px solid #E8E4DA',
                borderRadius: '8px',
                padding: '0.4rem 0.65rem',
                cursor: 'pointer',
                color: '#221C3E',
                fontSize: '1rem',
              }}
            >
              &#9776;
            </button>
            <h1
              style={{
                fontSize: '1.45rem',
                fontWeight: 700,
                margin: 0,
                color: '#062B28',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              {activeTab === 'home' && 'Student Dashboard'}
              {activeTab === 'plans' && 'Fee Schedule & eNACH Mandate'}
              {activeTab === 'transactions' && 'Payment History & Receipts'}
              {activeTab === 'support' && 'Helpdesk & Support'}
            </h1>
          </div>

          {/* Right Region: Profile & Sign Out */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            {student && (
              <span
                style={{
                  background: '#FFFFFF',
                  padding: '0.45rem 1rem',
                  borderRadius: '9999px',
                  fontSize: '0.825rem',
                  color: '#585B62',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  border: '1px solid #E8E4DA',
                  boxShadow: '0 1px 3px rgba(28, 29, 32, 0.02)',
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: '#00C271',
                    display: 'inline-block',
                  }}
                />
                {student.full_name} ({student.student_reference}) · {student.institution_name}
              </span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E8E4DA',
                borderRadius: '9999px',
                padding: '0.45rem 1.1rem',
                fontSize: '0.825rem',
                fontWeight: 600,
                color: '#221C3E',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 3px rgba(28, 29, 32, 0.02)',
              }}
              title="Sign out of portal"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Main Content Body */}
        <main
          id="main"
          style={{
            flex: 1,
            maxWidth: '1200px',
            width: '100%',
            margin: '0 auto',
            padding: '2rem 1.5rem',
            boxSizing: 'border-box',
          }}
        >
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

        {activeTab === 'home' && !paymentComplete && student && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Greeting & Student Details */}
            <div
              className="admin-panel portal-welcome-card portal-stagger-1"
              style={{
                background: '#FFFFFF',
                borderRadius: '28px',
                border: '1px solid #E6ECF5',
                padding: '2rem 2.25rem',
                boxShadow: '0 4px 20px rgba(28, 29, 32, 0.03)',
              }}
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
                  <h1 style={{ fontSize: '1.85rem', fontWeight: 700, letterSpacing: '-0.025em', color: '#062B28', margin: 0 }}>
                    Welcome, {student.payer_name || student.full_name}!
                  </h1>
                  <p style={{ color: '#7B8F8B', fontSize: '0.925rem', marginTop: '0.35rem' }}>
                    Fee dashboard for {student.full_name} at{' '}
                    <strong>{student.institution_name}</strong>
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      background: '#D7F4BE',
                      color: '#173C1C',
                      border: 'none',
                      padding: '0.35rem 1rem',
                      borderRadius: '9999px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
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
                className="admin-panel portal-stat-card"
                style={{
                  background: '#FFFFFF',
                  borderRadius: '28px',
                  border: '1px solid #E6ECF5',
                  padding: '1.75rem 2rem',
                  boxShadow: '0 4px 20px rgba(28, 29, 32, 0.03)',
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
                <h3 style={{ fontSize: '2.1rem', fontWeight: 700, letterSpacing: '-0.025em', margin: '0.5rem 0', color: '#173C1C' }}>
                  {formatMoney(summary.net_payable_minor)}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Total fee components after approved concessions
                </p>
              </div>

              <div
                className="admin-panel portal-stat-card"
                style={{
                  background: '#FFFFFF',
                  borderRadius: '28px',
                  border: '1px solid #E6ECF5',
                  padding: '1.75rem 2rem',
                  boxShadow: '0 4px 20px rgba(28, 29, 32, 0.03)',
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
                <h3 style={{ fontSize: '2.1rem', fontWeight: 700, letterSpacing: '-0.025em', margin: '0.5rem 0', color: '#0E3D36' }}>
                  {formatMoney(summary.paid_minor)}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Confirmed collections & cleared installments
                </p>
              </div>

              <div
                className="admin-panel portal-stat-card"
                style={{
                  background: '#FFFFFF',
                  borderRadius: '28px',
                  border: '1px solid #E6ECF5',
                  padding: '1.75rem 2rem',
                  boxShadow: '0 4px 20px rgba(28, 29, 32, 0.03)',
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
                    fontSize: '2.1rem',
                    fontWeight: 700,
                    letterSpacing: '-0.025em',
                    margin: '0.5rem 0',
                    color: '#221C3E',
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
              className="admin-panel portal-status-card portal-stagger-3"
              style={{
                background: '#FFFFFF',
                borderRadius: '28px',
                border: '1px solid #E6ECF5',
                padding: '2rem 2.25rem',
                boxShadow: '0 4px 20px rgba(28, 29, 32, 0.03)',
              }}
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
                <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#062B28', letterSpacing: '-0.015em' }}>Collection & Installment Status</h3>
                <span
                  style={{
                    padding: '0.35rem 1rem',
                    borderRadius: '9999px',
                    fontSize: '0.8rem',
                    background: '#BCEAE5',
                    color: '#0E3D36',
                    border: 'none',
                    fontWeight: 600,
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
                <button
                  className="button primary"
                  style={{
                    background: '#062B28',
                    color: '#FFFFFF',
                    borderRadius: '9999px',
                    padding: '0.75rem 1.85rem',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    border: 'none',
                    boxShadow: '0 4px 14px rgba(6, 43, 40, 0.2)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setActiveTab('plans')}
                >
                  View / Continue Plan
                </button>
                {mandate?.status !== 'active' && (
                  <button className="button secondary" onClick={() => setActiveTab('plans')}>
                    Register eNACH
                  </button>
                )}
                <button
                  className="button outline"
                  style={{
                    background: '#FFFFFF',
                    color: '#062B28',
                    border: '1px solid #E1ECE9',
                    borderRadius: '9999px',
                    padding: '0.75rem 1.85rem',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    boxShadow: '0 1px 3px rgba(28, 29, 32, 0.02)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setActiveTab('transactions')}
                >
                  View Receipts & Transactions
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
        {/* -------------------------------------------------------------
            TAB 2: PLANS & PAYMENTS (FULLY FUNCTIONAL DASHBOARD & BUILDER)
        ------------------------------------------------------------- */}
        {activeTab === 'plans' && !paymentComplete && student && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Success Notification if Plan was updated */}
            {planSuccessNotice && (
              <div
                role="status"
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  padding: '1rem 1.25rem',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>✓</span>
                  <strong>{planSuccessNotice}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => setPlanSuccessNotice('')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#166534', fontSize: '1.1rem' }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* ---------------------------------------------------------
                ACTIVE PLAN OVERVIEW CARD & CONTROLS
            --------------------------------------------------------- */}
            <div
              className="admin-panel"
              style={{
                background: '#ffffff',
                borderRadius: '8px',
                padding: '1.5rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#0f172a' }}>
                      Plans &amp; Fee Breakdown
                    </h2>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        background: Number(summary.outstanding_minor) <= 0 ? '#dcfce7' : '#e0f2fe',
                        color: Number(summary.outstanding_minor) <= 0 ? '#15803d' : '#0369a1',
                      }}
                    >
                      {Number(summary.outstanding_minor) <= 0 ? '● FULLY PAID (100%)' : '● ACTIVE PLAN'}
                    </span>
                  </div>
                  <p style={{ color: '#64748b', margin: '0.35rem 0 0 0', fontSize: '0.9rem' }}>
                    {student.full_name} · {student.course || 'Cpa'} ({student.grade || 'grade1'}) · {student.institution_name}
                  </p>
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.8rem',
                      color: '#475569',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginTop: '0.6rem',
                    }}
                  >
                    <span>🏛️</span>
                    <span>
                      <strong>Official Schedule:</strong> Installments are set and scheduled by your institution. All collections are processed via NPCI eNACH recurring bank mandate.
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    className="button secondary"
                    onClick={printDocument}
                    style={{ fontSize: '0.875rem' }}
                  >
                    Download Statement
                  </button>
                  {Number(summary.outstanding_minor) <= 0 && (
                    <button
                      className="button outline"
                      onClick={handleAddTestInstallment}
                      title="Add a test installment of ₹5,000 to test direct online payment or live eNACH debits"
                      style={{ fontSize: '0.875rem', color: '#0369a1', borderColor: '#bae6fd' }}
                    >
                      + Add Test Installment (₹5,000)
                    </button>
                  )}
                </div>
              </div>

              {/* 3 Main Stat Cards (Pharmacy Inspiration Style) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '1.25rem',
                }}
              >
                {/* Net Payable Card - Pastel Pistachio (#D7F4BE) */}
                <div
                  className="portal-stagger-1 portal-card-hover"
                  style={{
                    background: '#D7F4BE',
                    padding: '1.4rem 1.5rem',
                    borderRadius: '24px',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(215, 244, 190, 0.45)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '10px',
                          background: 'rgba(255, 255, 255, 0.65)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#173C1C',
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                        </svg>
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2D4E30' }}>
                        Net Payable
                      </span>
                    </div>
                    <span style={{ color: '#2D4E30', opacity: 0.6, fontSize: '1rem', letterSpacing: '1px' }}>•••</span>
                  </div>

                  <div style={{ marginTop: '0.75rem', position: 'relative', zIndex: 2 }}>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#062B28', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                      {formatMoney(summary.net_payable_minor || 2500000)}
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#2D4E30', fontWeight: 500, marginTop: '0.35rem', display: 'inline-block' }}>
                      After approved concessions
                    </span>
                  </div>

                  {/* Micro bar silhouette watermark */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: '1.25rem',
                      bottom: '1rem',
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: '4px',
                      opacity: 0.28,
                      pointerEvents: 'none',
                    }}
                  >
                    <span style={{ width: '6px', height: '22px', borderRadius: '3px', background: '#062B28' }} />
                    <span style={{ width: '6px', height: '34px', borderRadius: '3px', background: '#062B28' }} />
                    <span style={{ width: '6px', height: '18px', borderRadius: '3px', background: '#062B28' }} />
                    <span style={{ width: '6px', height: '44px', borderRadius: '3px', background: '#062B28' }} />
                  </div>
                </div>

                {/* Total Paid Card - Soft Mint Seafoam (#BCEAE5) */}
                <div
                  className="portal-stagger-2 portal-card-hover"
                  style={{
                    background: '#BCEAE5',
                    padding: '1.4rem 1.5rem',
                    borderRadius: '24px',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(188, 234, 229, 0.45)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '10px',
                          background: 'rgba(255, 255, 255, 0.65)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#0E3D36',
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#134D44' }}>
                        Total Paid
                      </span>
                    </div>
                    <span style={{ color: '#134D44', opacity: 0.6, fontSize: '1rem', letterSpacing: '1px' }}>•••</span>
                  </div>

                  <div style={{ marginTop: '0.75rem', position: 'relative', zIndex: 2 }}>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#062B28', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                      {formatMoney(summary.paid_minor || 2500000)}
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#134D44', fontWeight: 500, marginTop: '0.35rem', display: 'inline-block' }}>
                      Cleared installments & collections
                    </span>
                  </div>

                  {/* Micro bar silhouette watermark */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: '1.25rem',
                      bottom: '1rem',
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: '4px',
                      opacity: 0.28,
                      pointerEvents: 'none',
                    }}
                  >
                    <span style={{ width: '6px', height: '16px', borderRadius: '3px', background: '#062B28' }} />
                    <span style={{ width: '6px', height: '28px', borderRadius: '3px', background: '#062B28' }} />
                    <span style={{ width: '6px', height: '42px', borderRadius: '3px', background: '#062B28' }} />
                    <span style={{ width: '6px', height: '24px', borderRadius: '3px', background: '#062B28' }} />
                  </div>
                </div>

                {/* Outstanding Balance Card - Soft Coral Rose (#FCD0CF) */}
                <div
                  className="portal-stagger-3 portal-card-hover"
                  style={{
                    background: '#FCD0CF',
                    padding: '1.4rem 1.5rem',
                    borderRadius: '24px',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(252, 208, 207, 0.45)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '10px',
                          background: 'rgba(255, 255, 255, 0.65)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#4A1B1B',
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="8" x2="12" y2="12"></line>
                          <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6A2323' }}>
                        Outstanding Balance
                      </span>
                    </div>
                    <span style={{ color: '#6A2323', opacity: 0.6, fontSize: '1rem', letterSpacing: '1px' }}>•••</span>
                  </div>

                  <div style={{ marginTop: '0.75rem', position: 'relative', zIndex: 2 }}>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#062B28', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                      {formatMoney(summary.outstanding_minor || 0)}
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#6A2323', fontWeight: 500, marginTop: '0.35rem', display: 'inline-block' }}>
                      {Number(summary.outstanding_minor) <= 0 ? 'All fees settled' : 'Remaining across schedule'}
                    </span>
                  </div>

                  {/* Micro bar silhouette watermark */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: '1.25rem',
                      bottom: '1rem',
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: '4px',
                      opacity: 0.28,
                      pointerEvents: 'none',
                    }}
                  >
                    <span style={{ width: '6px', height: '36px', borderRadius: '3px', background: '#062B28' }} />
                    <span style={{ width: '6px', height: '20px', borderRadius: '3px', background: '#062B28' }} />
                    <span style={{ width: '6px', height: '46px', borderRadius: '3px', background: '#062B28' }} />
                    <span style={{ width: '6px', height: '28px', borderRadius: '3px', background: '#062B28' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* ---------------------------------------------------------
                FEE COMPONENTS BREAKDOWN TABLE
            --------------------------------------------------------- */}
            <section
              className="admin-panel"
              style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem', border: '1px solid #e2e8f0' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>Configured Fee Components</h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Institution Approved Structure
                </span>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Component Description</th>
                      <th className="money">Allocated Fee</th>
                      <th>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(components.length > 0
                      ? components
                      : [
                          { id: 'tui-1', code: 'TUI-01', label: 'Tuition & Academic Instruction', amount_minor: 1800000 },
                          { id: 'lab-1', code: 'LAB-01', label: 'Digital Lab & Computer Head', amount_minor: 500000 },
                          { id: 'exm-1', code: 'EXM-01', label: 'Examination & Assessment Head', amount_minor: 200000 },
                        ]
                    ).map((c: any) => (
                      <tr key={c.id}>
                        <td><strong>{c.code}</strong></td>
                        <td>{c.label}</td>
                        <td className="money" style={{ fontWeight: 600 }}>{formatMoney(c.amount_minor)}</td>
                        <td>
                          <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#f1f5f9', color: '#475569' }}>
                            Mandatory Core
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700, borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                      <td colSpan={2}>Total Fee Sum</td>
                      <td className="money" style={{ color: '#0d6b60', fontSize: '1.1rem' }}>
                        {formatMoney(summary.net_payable_minor || 2500000)}
                      </td>
                      <td>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* ---------------------------------------------------------
                INSTALLMENT SCHEDULE & ACTIONS (PAY NOW / VIEW RECEIPT)
            --------------------------------------------------------- */}
            <section
              className="admin-panel"
              style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem', border: '1px solid #e2e8f0' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>Installment Schedule</h3>
                  <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                    {scheduleView === 'flex'
                      ? 'Student Flex Schedule: Your personalized installment schedule reflecting individual payments and active dues.'
                      : 'Master Template: Standard institutional fee structure and scheduled installments established for your academic program.'}
                  </p>
                </div>
                <div className="row" style={{ gap: '0.5rem' }}>
                  <button
                    className={`button ${scheduleView === 'flex' ? 'primary' : 'secondary'}`}
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}
                    onClick={() => setScheduleView('flex')}
                  >
                    Student Flex Schedule
                  </button>
                  <button
                    className={`button ${scheduleView === 'master' ? 'primary' : 'secondary'}`}
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}
                    onClick={() => setScheduleView('master')}
                  >
                    Master Template
                  </button>
                </div>
              </div>

              {(scheduleView === 'flex' ? flexSchedule : masterSchedule).length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
                  No schedule installments available.
                </p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Installment</th>
                        <th>Due Date</th>
                        <th className="money">Original Fee</th>
                        <th className="money">Paid</th>
                        <th className="money">Remaining</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scheduleView === 'flex' ? flexSchedule : masterSchedule).map((inst) => {
                        const isPaid = inst.status === 'paid' || Number(inst.remaining_minor) <= 0;
                        return (
                          <tr key={inst.id}>
                            <td>
                              <strong>#{inst.sequence}</strong>
                            </td>
                            <td>{formatDate(inst.due_date)}</td>
                            <td className="money">{formatMoney(inst.amount_minor)}</td>
                            <td className="money" style={{ color: '#166534' }}>
                              {formatMoney(inst.paid_amount_minor)}
                            </td>
                            <td className="money" style={{ fontWeight: 600, color: isPaid ? '#64748b' : '#ea580c' }}>
                              {formatMoney(inst.remaining_minor)}
                            </td>
                            <td>
                              <span
                                style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  background: isPaid ? '#dcfce7' : '#eff6ff',
                                  color: isPaid ? '#15803d' : '#1d4ed8',
                                }}
                              >
                                {isPaid ? 'PAID' : 'SCHEDULED'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {isPaid ? (
                                <button
                                  className="button secondary"
                                  onClick={() => {
                                    const matchingTx = payments.find((p) => p.receipt_number);
                                    openReceipt(matchingTx?.receipt_number || 'RCP-PAID-01');
                                  }}
                                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                >
                                  <span>Receipt</span>
                                </button>
                              ) : (
                                <button
                                  className="button primary"
                                  disabled={simulatingDebit}
                                  onClick={() => handleSimulateDebit('success', inst.id)}
                                  title="Trigger bank debit for this installment through the active eNACH mandate"
                                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#0d6b60' }}
                                >
                                  <span>Debit via eNACH</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            
            {/* ---------------------------------------------------------
                RECURRING PAYMENTS & eNACH MANDATE SIMULATOR
            --------------------------------------------------------- */}
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
                  RECURRING PAYMENTS &amp; MANDATES
                </p>
                <h3 style={{ margin: '0.25rem 0' }}>Register &amp; Manage eNACH Mandate</h3>
                <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
                  Review active mandate status or simulate live bank debit processing.
                </p>
              </div>

              {mandate?.status === 'active' ? (
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
                          {mandate.bank_name || 'HDFC Bank'} ({mandate.account_mask || '•••• 4421'})
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
                      Sandbox eNACH Debit Simulator (Testing &amp; Verification)
                    </h4>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                      Simulate recurring debit processing. In accordance with zero-balance
                      prevention rules, if remaining balance is zero or fully paid, debits will be
                      prevented automatically unless a test installment is added.
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
                        {simulatingDebit ? 'Processing Debit...' : 'Simulate Successful eNACH Debit'}
                      </button>
                      <button
                        className="button outline"
                        disabled={simulatingDebit || Number(summary.outstanding_minor) <= 0}
                        onClick={() => handleSimulateDebit('failed')}
                      >
                        Simulate Failed eNACH Debit (Insufficient Funds)
                      </button>
                      {Number(summary.outstanding_minor) <= 0 && (
                        <button
                          className="button secondary"
                          onClick={handleAddTestInstallment}
                          style={{ color: '#0369a1', borderColor: '#bae6fd' }}
                        >
                          + Add Test Balance (₹5,000) to Test Live Debit
                        </button>
                      )}
                    </div>

                    {Number(summary.outstanding_minor) <= 0 && (
                      <p
                        style={{
                          color: '#15803d',
                          fontSize: '0.85rem',
                          marginTop: '0.75rem',
                        }}
                      >
                        ✓ Zero collectible balance on this schedule. Use "+ Add Test Balance" above to test new debits.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <h3 style={{ margin: '0 0 0.25rem 0', color: '#0f172a' }}>Register eNACH AutoPay Mandate</h3>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                      Authorize automated bank debits for scheduled fee installments. Installments are set and managed by your educational institution.
                    </p>
                  </div>

                  {enachError && (
                    <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                      {enachError}
                    </div>
                  )}

                  <form onSubmit={handleRegisterEnach}>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: '#0f172a' }}>1. Payer Contact Details</h4>
                    <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                      <label className="field">
                        Payer Name *
                        <input
                          type="text"
                          required
                          value={payerName}
                          onChange={(e) => setPayerName(e.target.value)}
                          placeholder="e.g. Parent of Student"
                        />
                      </label>
                      <label className="field">
                        Payer Email *
                        <input
                          type="email"
                          required
                          value={payerEmail}
                          onChange={(e) => setPayerEmail(e.target.value)}
                          placeholder="parent@example.com"
                        />
                      </label>
                      <label className="field">
                        Payer Phone *
                        <input
                          type="tel"
                          required
                          value={payerPhone}
                          onChange={(e) => setPayerPhone(e.target.value)}
                          placeholder="+91 98765 43210"
                        />
                      </label>
                    </div>

                    <h4 style={{ margin: '1.5rem 0 0.75rem 0', color: '#0f172a' }}>2. Bank &amp; Account Details</h4>
                    <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                      <label className="field">
                        Select Bank *
                        <select value={bankName} onChange={(e) => setBankName(e.target.value)}>
                          <option value="HDFC Bank">HDFC Bank</option>
                          <option value="State Bank of India">State Bank of India</option>
                          <option value="ICICI Bank">ICICI Bank</option>
                          <option value="Axis Bank">Axis Bank</option>
                          <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                          <option value="Punjab National Bank">Punjab National Bank</option>
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
                          placeholder="e.g. 501002345678"
                        />
                      </label>
                      <label className="field">
                        IFSC Code *
                        <input
                          type="text"
                          required
                          value={ifscCode}
                          onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                          placeholder="e.g. HDFC0001234"
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
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={acceptedTerms}
                          onChange={(e) => setAcceptedTerms(e.target.checked)}
                          style={{ marginTop: '0.25rem' }}
                        />
                        <span style={{ fontSize: '0.875rem', color: '#475569' }}>
                          I authorize recurring educational institution fee collections via NPCI eNACH as per the institutional schedule. Funds are debited only on scheduled due dates.
                        </span>
                      </label>
                    </div>

                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <button
                        type="submit"
                        className="button primary"
                        disabled={enachRegistering || !acceptedTerms}
                        style={{ padding: '0.75rem 1.75rem', fontSize: '1rem' }}
                      >
                        {enachRegistering ? 'Registering Mandate...' : '✓ Authorize & Register eNACH Mandate'}
                      </button>
                    </div>
                  </form>
                </div>
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
      </div>

      {/* Styles for portal sidebar hover and responsive behavior */}
      <style>{`
        .portal-sidebar-nav-item {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          width: 100%;
          padding: 0.8rem 1.25rem;
          border-radius: 9999px;
          border: 1px solid transparent;
          background: transparent;
          color: #5C736E;
          font-weight: 500;
          font-size: 0.925rem;
          cursor: pointer;
          text-align: left;
          transition: all 0.18s ease;
        }
        .portal-sidebar-nav-item:hover {
          background: #E8F3F1;
          color: #062B28;
        }
        .portal-sidebar-nav-item.active {
          background: #062B28 !important;
          color: #FFFFFF !important;
          font-weight: 600;
          border-radius: 9999px;
          box-shadow: 0 4px 14px rgba(6, 43, 40, 0.18);
        }
        .portal-sidebar-nav-item.active svg {
          stroke: #FFFFFF !important;
        }
        .admin-panel {
          border-radius: 24px !important;
          border: 1px solid #E1ECE9 !important;
          background: #FFFFFF !important;
          box-shadow: 0 4px 20px rgba(6, 43, 40, 0.03) !important;
        }
        @media (max-width: 860px) {
          .portal-mobile-toggle-btn {
            display: inline-block !important;
          }
          .portal-mobile-close-btn {
            display: inline-block !important;
          }
          .portal-sidebar {
            position: fixed !important;
            top: 0 !important;
            bottom: 0 !important;
            left: -280px !important;
            transition: left 0.25s ease-in-out !important;
            z-index: 50 !important;
          }
          .portal-sidebar.mobile-open {
            left: 0 !important;
          }
        }
      `}</style>

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
