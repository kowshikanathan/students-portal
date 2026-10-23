'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';
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
} from '@/lib/enach/types';
import { CURRENT_PROVIDER_METRICS, type ProviderCapabilityMatrix } from '@/lib/enach/provider';

type Props = {
  openFeeOperations?: (target: 'payer' | 'schedule' | 'reconciliation') => void;
  initialView?: string;
  onViewChange?: (view: any) => void;
  page?: string;
};

type EnachTab =
  | 'overview'
  | 'setup'
  | 'mandates'
  | 'students'
  | 'debits'
  | 'failures'
  | 'recovery'
  | 'reconciliation'
  | 'notifications'
  | 'reports'
  | 'audit';

const TAB_CONFIG: Array<{ id: EnachTab; label: string; icon: string; badge?: string }> = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'setup', label: 'One-Click Setup', icon: '⚡', badge: 'Primary' },
  { id: 'mandates', label: 'Mandates', icon: '📜' },
  { id: 'students', label: 'Students & Payers', icon: '🎓' },
  { id: 'debits', label: 'Automatic Debits', icon: '🔄' },
  { id: 'failures', label: 'Failed Payments', icon: '⚠️' },
  { id: 'recovery', label: 'Recovery & Retries', icon: '🛡️' },
  { id: 'reconciliation', label: 'Reconciliation', icon: '⚖️' },
  { id: 'notifications', label: 'Notifications', icon: '💬' },
  { id: 'reports', label: 'Reports', icon: '📑' },
  { id: 'audit', label: 'Audit & Compliance', icon: '🔒' },
];

export function EnachDashboard({ openFeeOperations, initialView = 'overview', onViewChange, page }: Props) {
  if (page === 'custom-fields') {
    return (
      <section className="enach-dashboard-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div id="enach-custom-fields" className="admin-panel">
          <h2>Custom fields</h2>
          <p>Configure custom fields for eNACH mandates.</p>
        </div>
      </section>
    );
  }

  if (page === 'reports') {
    return (
      <section className="enach-dashboard-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div id="enach-reports" className="admin-panel">
          <h2>Reports</h2>
          <p>Export eNACH collection reports.</p>
        </div>
      </section>
    );
  }

  if (page === 'debits') {
    return (
      <section className="enach-dashboard-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div className="admin-panel">
          <h2>Automatic Debits & Scheduled AutoPay</h2>
          <p className="status-pill warn" style={{ margin: '8px 0' }}>Provider not connected</p>
          <p>Connect a provider to enable AutoPay automated recurring debits on live banking rails.</p>
        </div>
      </section>
    );
  }

  const { request, session } = useAdminApi();

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<EnachTab>(() => {
    if (page === 'overview') return 'overview';
    if (initialView === 'debits') return 'debits';
    if (initialView === 'setups' || initialView === 'setup') return 'setup';
    if (initialView === 'recovery') return 'recovery';
    if (initialView === 'reports') return 'reports';
    if (initialView === 'mandates') return 'mandates';
    return 'overview';
  });

  // Data States
  const [overview, setOverview] = useState<any>(null);
  const [mandates, setMandates] = useState<SandboxMandate[]>([]);
  const [studentMappings, setStudentMappings] = useState<StudentEnachMapping[]>([]);
  const [debits, setDebits] = useState<SandboxDebitAttempt[]>([]);
  const [failedDebits, setFailedDebits] = useState<SandboxDebitAttempt[]>([]);
  const [reconciliations, setReconciliations] = useState<SandboxReconciliationRecord[]>([]);
  const [notifications, setNotifications] = useState<SandboxNotification[]>([]);
  const [auditLogs, setAuditLogs] = useState<SandboxAuditEvent[]>([]);
  const [providerInfo, setProviderInfo] = useState<ProviderCapabilityMatrix>(CURRENT_PROVIDER_METRICS);

  // Loading & Feedback
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  // Filters
  const [mandateSearch, setMandateSearch] = useState('');
  const [mandateStatusFilter, setMandateStatusFilter] = useState('');
  const [debitSearch, setDebitSearch] = useState('');
  const [debitStatusFilter, setDebitStatusFilter] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [reportType, setReportType] = useState('active_mandates');
  const [reportData, setReportData] = useState<any>(null);

  // Modals & Action States
  const [selectedMandate, setSelectedMandate] = useState<SandboxMandate | null>(null);
  const [authModalMandate, setAuthModalMandate] = useState<SandboxMandate | null>(null);
  const [cancelModalMandate, setCancelModalMandate] = useState<SandboxMandate | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedDebit, setSelectedDebit] = useState<SandboxDebitAttempt | null>(null);
  const [retryModalDebit, setRetryModalDebit] = useState<SandboxDebitAttempt | null>(null);
  const [showDiagnosticsDrawer, setShowDiagnosticsDrawer] = useState(false);
  const [testNotificationModal, setTestNotificationModal] = useState(false);

  // One-Click Setup Form State
  const [setupStudentId, setSetupStudentId] = useState('');
  const [setupPayerName, setSetupPayerName] = useState('');
  const [setupPayerPhone, setSetupPayerPhone] = useState('+91 98765 43210');
  const [setupPayerEmail, setSetupPayerEmail] = useState('');
  const [setupBankName, setSetupBankName] = useState('HDFC Bank');
  const [setupAccountLast4, setSetupAccountLast4] = useState('4321');
  const [setupIfsc, setSetupIfsc] = useState('HDFC0001234');
  const [setupMaxAmountMinor, setSetupMaxAmountMinor] = useState(5000000);
  const [setupFrequency, setSetupFrequency] = useState<'monthly' | 'bi-monthly' | 'quarterly' | 'as_presented'>('quarterly');
  const [setupStartDate, setSetupStartDate] = useState('2026-07-01');
  const [setupEndDate, setSetupEndDate] = useState('2027-06-30');
  const [setupAuthMethod, setSetupAuthMethod] = useState<AuthMethod>('NetBanking (Simulated)');
  const [setupInstallments, setSetupInstallments] = useState<LinkedInstallment[]>([]);

  const updateInstallment = (idx: number, patch: Partial<LinkedInstallment>) => {
    setSetupInstallments((prev) =>
      prev.map((inst, i) => (i === idx ? ({ ...inst, ...patch } as LinkedInstallment) : inst))
    );
  };

  // Helper: Generates realistic scheduled instalments matching selected debit frequency
  const generateSchedule = (
    freq: 'monthly' | 'bi-monthly' | 'quarterly' | 'as_presented',
    totalMinor: number,
    studentId: string = 'stu'
  ): { items: LinkedInstallment[]; startDate: string; endDate: string } => {
    const total = totalMinor > 0 ? totalMinor : 12000000;

    if (freq === 'monthly') {
      const months = [
        { name: 'July', start: '2026-07-01', end: '2026-07-31', due: '2026-07-10' },
        { name: 'August', start: '2026-08-01', end: '2026-08-31', due: '2026-08-10' },
        { name: 'September', start: '2026-09-01', end: '2026-09-30', due: '2026-09-10' },
        { name: 'October', start: '2026-10-01', end: '2026-10-31', due: '2026-10-10' },
        { name: 'November', start: '2026-11-01', end: '2026-11-30', due: '2026-11-10' },
        { name: 'December', start: '2026-12-01', end: '2026-12-31', due: '2026-12-10' },
        { name: 'January', start: '2027-01-01', end: '2027-01-31', due: '2027-01-10' },
        { name: 'February', start: '2027-02-01', end: '2027-02-28', due: '2027-02-10' },
        { name: 'March', start: '2027-03-01', end: '2027-03-31', due: '2027-03-10' },
        { name: 'April', start: '2027-04-01', end: '2027-04-30', due: '2027-04-10' },
      ];
      const perInst = Math.round(total / months.length);
      const items: LinkedInstallment[] = months.map((m, idx) => ({
        id: `inst-${studentId}-m-${idx + 1}`,
        sequence: idx + 1,
        name: `Instalment #${idx + 1}: ${m.name} Monthly Fee`,
        period_start: m.start,
        period_end: m.end,
        due_date: m.due,
        amount_minor: perInst,
        status: (idx === 0 ? 'scheduled' : 'pending') as 'scheduled' | 'pending',
      }));
      return { items, startDate: '2026-07-01', endDate: '2027-04-30' };
    }

    if (freq === 'bi-monthly') {
      const cycles = [
        { name: 'Jul - Aug', start: '2026-07-01', end: '2026-08-31', due: '2026-07-15' },
        { name: 'Sep - Oct', start: '2026-09-01', end: '2026-10-31', due: '2026-09-15' },
        { name: 'Nov - Dec', start: '2026-11-01', end: '2026-12-31', due: '2026-11-15' },
        { name: 'Jan - Feb', start: '2027-01-01', end: '2027-02-28', due: '2027-01-15' },
        { name: 'Mar - Apr', start: '2027-03-01', end: '2027-04-30', due: '2027-03-15' },
        { name: 'May - Jun', start: '2027-05-01', end: '2027-06-30', due: '2027-05-15' },
      ];
      const perInst = Math.round(total / cycles.length);
      const items: LinkedInstallment[] = cycles.map((c, idx) => ({
        id: `inst-${studentId}-bm-${idx + 1}`,
        sequence: idx + 1,
        name: `Instalment #${idx + 1}: ${c.name} Fee`,
        period_start: c.start,
        period_end: c.end,
        due_date: c.due,
        amount_minor: perInst,
        status: (idx === 0 ? 'scheduled' : 'pending') as 'scheduled' | 'pending',
      }));
      return { items, startDate: '2026-07-01', endDate: '2027-06-30' };
    }

    if (freq === 'as_presented') {
      const milestones = [
        { name: 'Milestone 1: Admission & Term Fee', start: '2026-07-01', end: '2026-10-31', due: '2026-07-15' },
        { name: 'Milestone 2: Mid-Session Fee', start: '2026-11-01', end: '2027-01-31', due: '2026-11-15' },
        { name: 'Milestone 3: Year-End Assessment Fee', start: '2027-02-01', end: '2027-04-30', due: '2027-02-15' },
      ];
      const perInst = Math.round(total / milestones.length);
      const items: LinkedInstallment[] = milestones.map((m, idx) => ({
        id: `inst-${studentId}-ap-${idx + 1}`,
        sequence: idx + 1,
        name: `Instalment #${idx + 1}: ${m.name}`,
        period_start: m.start,
        period_end: m.end,
        due_date: m.due,
        amount_minor: perInst,
        status: (idx === 0 ? 'scheduled' : 'pending') as 'scheduled' | 'pending',
      }));
      return { items, startDate: '2026-07-01', endDate: '2027-04-30' };
    }

    // Default: quarterly (4 cycles)
    const quarters = [
      { name: 'Q1 Tuition & Term Fee', start: '2026-07-01', end: '2026-09-30', due: '2026-07-10' },
      { name: 'Q2 Tuition & Term Fee', start: '2026-10-01', end: '2026-12-31', due: '2026-10-25' },
      { name: 'Q3 Tuition & Term Fee', start: '2027-01-01', end: '2027-03-31', due: '2027-01-15' },
      { name: 'Q4 Final Assessment Fee', start: '2027-04-01', end: '2027-06-30', due: '2027-04-15' },
    ];
    const perInst = Math.round(total / quarters.length);
    const items: LinkedInstallment[] = quarters.map((q, idx) => ({
      id: `inst-${studentId}-q-${idx + 1}`,
      sequence: idx + 1,
      name: `Instalment #${idx + 1}: ${q.name}`,
      period_start: q.start,
      period_end: q.end,
      due_date: q.due,
      amount_minor: perInst,
      status: (idx === 0 ? 'scheduled' : 'pending') as 'scheduled' | 'pending',
    }));
    return { items, startDate: '2026-07-01', endDate: '2027-06-30' };
  };

  // Handles dynamic frequency dropdown selection (Monthly, Bi-Monthly, Quarterly, As Presented)
  const handleFrequencyChange = (newFreq: 'monthly' | 'bi-monthly' | 'quarterly' | 'as_presented') => {
    setSetupFrequency(newFreq);
    const student = studentMappings.find((s) => s.student_id === setupStudentId);
    const remaining = student?.remaining_minor || 12000000;
    const { items, startDate, endDate } = generateSchedule(newFreq, remaining, setupStudentId || 'stu');
    setSetupInstallments(items);
    setSetupStartDate(startDate);
    setSetupEndDate(endDate);
    if (items.length > 0 && items[0]) {
      const perInst = items[0].amount_minor;
      if (perInst > setupMaxAmountMinor) {
        setSetupMaxAmountMinor(perInst);
      }
    }
  };

  // Increases instalments by adding a new scheduled period
  const handleAddInstallment = () => {
    const student = studentMappings.find((s) => s.student_id === setupStudentId);
    const remaining = student?.remaining_minor || 12000000;
    const nextSeq = setupInstallments.length + 1;

    let nextStart = '2026-07-01';
    let nextEnd = '2026-09-30';
    let nextDue = '2026-07-10';

    if (setupInstallments.length > 0) {
      const last = setupInstallments[setupInstallments.length - 1];
      if (last && last.period_end) {
        const lastEndDate = new Date(last.period_end);
        const nextStartDate = new Date(lastEndDate);
        nextStartDate.setDate(nextStartDate.getDate() + 1);
        nextStart = nextStartDate.toISOString().slice(0, 10);

        const nextEndDate = new Date(nextStartDate);
        nextEndDate.setMonth(nextEndDate.getMonth() + 2);
        nextEnd = nextEndDate.toISOString().slice(0, 10);

        const nextDueDate = new Date(nextStartDate);
        nextDueDate.setDate(nextDueDate.getDate() + 10);
        nextDue = nextDueDate.toISOString().slice(0, 10);
      }
    }

    const currentTotal = setupInstallments.reduce((sum, inst) => sum + (inst.amount_minor || 0), 0);
    const amountMinor = currentTotal < remaining ? remaining - currentTotal : Math.round(remaining / nextSeq);

    const newInst: LinkedInstallment = {
      id: `inst-${setupStudentId || 'stu'}-custom-${Date.now()}`,
      sequence: nextSeq,
      name: `Instalment #${nextSeq}: Extended Term Fee`,
      period_start: nextStart,
      period_end: nextEnd,
      due_date: nextDue,
      amount_minor: amountMinor,
      status: 'pending',
    };

    const updated = [...setupInstallments, newInst];
    setSetupInstallments(updated);
    setSetupEndDate(nextEnd);
  };

  // Decreases instalments by removing a specific row
  const handleRemoveInstallment = (indexToRemove: number) => {
    if (setupInstallments.length <= 1) {
      alert('At least one instalment must be scheduled.');
      return;
    }
    const updated = setupInstallments
      .filter((_, idx) => idx !== indexToRemove)
      .map((inst, idx) => ({
        ...inst,
        sequence: idx + 1,
      }));
    setSetupInstallments(updated);
    const lastInst = updated[updated.length - 1];
    if (lastInst && lastInst.period_end) {
      setSetupEndDate(lastInst.period_end);
    }
  };

  // Splits student remaining balance evenly across current instalments
  const handleBalanceEvenly = () => {
    if (setupInstallments.length === 0) return;
    const student = studentMappings.find((s) => s.student_id === setupStudentId);
    const remaining = student?.remaining_minor || 12000000;
    const perInst = Math.round(remaining / setupInstallments.length);
    setSetupInstallments((prev) =>
      prev.map((inst) => ({
        ...inst,
        amount_minor: perInst,
      }))
    );
  };

  // Auto-populates setup form and linked instalments when a student is selected
  useEffect(() => {
    if (!setupStudentId) {
      setSetupInstallments([]);
      return;
    }
    const student = studentMappings.find((s) => s.student_id === setupStudentId);
    if (student) {
      setSetupPayerName(student.payer_name || 'Primary Guardian');
      setSetupPayerPhone(student.payer_phone || '+91 98765 00000');
      setSetupPayerEmail(student.payer_email || 'parent@example.com');
      const remaining = student.remaining_minor || 12000000;
      setSetupMaxAmountMinor(remaining ? Math.min(remaining, 5000000) : 5000000);

      if (Array.isArray(student.installments) && student.installments.length > 0) {
        setSetupInstallments(student.installments);
        if (student.installments[0]?.period_start) {
          setSetupStartDate(student.installments[0].period_start);
        }
        const last = student.installments[student.installments.length - 1];
        if (last?.period_end) {
          setSetupEndDate(last.period_end);
        }
      } else {
        const initialFreq = student.fee_plan?.toLowerCase().includes('monthly')
          ? (student.fee_plan.toLowerCase().includes('bi-monthly') ? 'bi-monthly' : 'monthly')
          : 'quarterly';
        setSetupFrequency(initialFreq);
        const { items, startDate, endDate } = generateSchedule(initialFreq, remaining, student.student_id);
        setSetupInstallments(items);
        setSetupStartDate(startDate);
        setSetupEndDate(endDate);
      }
    }
  }, [setupStudentId, studentMappings]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 5000);
  };

  // -------------------------------------------------------------
  // Data Loader
  // -------------------------------------------------------------
  useEffect(() => {
    let active = true;
    setLoading(true);

    async function loadAll() {
      try {
        const [
          ovData,
          mandatesData,
          studentsData,
          debitsData,
          reconcileData,
          notifsData,
          auditData,
          provData,
        ] = await Promise.all([
          request<any>('admin/enach/overview'),
          request<SandboxMandate[]>('admin/fees/mandates'),
          request<StudentEnachMapping[]>('admin/enach/student-mapping'),
          request<SandboxDebitAttempt[]>('admin/fees/autopay-attempts'),
          request<SandboxReconciliationRecord[]>('admin/enach/reconciliation'),
          request<SandboxNotification[]>('admin/enach/notifications'),
          request<SandboxAuditEvent[]>('admin/enach/audit'),
          request<ProviderCapabilityMatrix>('provider/enach/diagnostics'),
        ]);

        if (active) {
          setOverview(ovData);
          setMandates(mandatesData || []);
          setStudentMappings(studentsData || []);
          setDebits(debitsData || []);
          setFailedDebits((debitsData || []).filter((d) => d.status === 'failed'));
          setReconciliations(reconcileData || []);
          setNotifications(notifsData || []);
          setAuditLogs(auditData || []);
          if (provData) setProviderInfo(provData);
          setLoading(false);
        }
      } catch (err: any) {
        if (active) {
          showToast('Some sandbox records could not load: ' + (err.message || 'Error'));
          setLoading(false);
        }
      }
    }

    void loadAll();
    return () => {
      active = false;
    };
  }, [session.tenant.id, refreshCount]);

  // Keep studentMappings fresh whenever switching to Setup or Students tabs
  useEffect(() => {
    if (activeTab === 'setup' || activeTab === 'students') {
      let active = true;
      request<StudentEnachMapping[]>('admin/enach/student-mapping')
        .then((data) => {
          if (active && Array.isArray(data)) setStudentMappings(data);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }
  }, [activeTab]);

  // Load report data when report tab or report type changes
  useEffect(() => {
    if (activeTab !== 'reports') return;
    let active = true;
    request<any>(`admin/enach/reports?type=${reportType}`)
      .then((res) => {
        if (active) setReportData(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [activeTab, reportType, refreshCount]);

  // -------------------------------------------------------------
  // Workflow Handlers
  // -------------------------------------------------------------

  // 1. One-Click Mandate Creation
  const handleCreateMandate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupStudentId) {
      alert('Please select an enrolled student.');
      return;
    }
    setBusy(true);
    try {
      const selectedStudent = studentMappings.find((s) => s.student_id === setupStudentId);
      const res = await request<{ ok: boolean; mandate: SandboxMandate; error?: string }>(
        'admin/fees/mandates',
        'POST',
        {
          student_id: setupStudentId,
          student_name: selectedStudent?.student_name,
          account_reference: selectedStudent?.student_reference,
          payer_name: setupPayerName,
          payer_phone: setupPayerPhone,
          payer_email: setupPayerEmail,
          bank_name: setupBankName,
          account_last4: setupAccountLast4,
          ifsc_code: setupIfsc,
          fee_plan: selectedStudent?.fee_plan || 'Academic Standard Plan',
          max_amount_minor: setupMaxAmountMinor,
          frequency: setupFrequency,
          start_date: setupStartDate,
          end_date: setupEndDate,
          auth_mode: setupAuthMethod,
          installments: setupInstallments,
        },
      );

      if (res.ok && res.mandate) {
        showToast(`✓ Sandbox Mandate ${res.mandate.mandate_reference} created! Simulated authorization required.`);
        setRefreshCount((n) => n + 1);
        // Automatically pop up the test authorization simulator
        setAuthModalMandate(res.mandate);
      }
    } catch (err: any) {
      alert(err.message || 'Could not create mandate.');
    } finally {
      setBusy(false);
    }
  };

  // 2. Simulate Authorization (Approve or Reject)
  const handleSimulateAuthorization = async (action: 'approve' | 'reject') => {
    if (!authModalMandate) return;
    setBusy(true);
    try {
      const res = await request<{ ok: boolean; message: string }>(
        `admin/fees/mandates/${authModalMandate.id}/authorize`,
        'POST',
        {
          action,
          method: authModalMandate.auth_mode,
          bank_name: authModalMandate.bank_name,
        },
      );
      if (res.ok) {
        showToast(
          action === 'approve'
            ? `✓ Mandate ${authModalMandate.mandate_reference} is now ACTIVE (Sandbox).`
            : `Mandate authorization declined by simulated payer.`,
        );
        setAuthModalMandate(null);
        setRefreshCount((n) => n + 1);
        setActiveTab('mandates');
      }
    } catch (err: any) {
      alert(err.message || 'Authorization simulation failed.');
    } finally {
      setBusy(false);
    }
  };

  // 3. Cancel Mandate
  const handleCancelMandate = async () => {
    if (!cancelModalMandate) return;
    setBusy(true);
    try {
      const res = await request<{ ok: boolean; message: string }>(
        `admin/fees/mandates/${cancelModalMandate.id}/cancel`,
        'POST',
        { reason: cancelReason || 'Staff initiated cancellation' },
      );
      if (res.ok) {
        showToast(`Mandate ${cancelModalMandate.mandate_reference} has been cancelled.`);
        setCancelModalMandate(null);
        setCancelReason('');
        setRefreshCount((n) => n + 1);
      }
    } catch (err: any) {
      alert(err.message || 'Could not cancel mandate.');
    } finally {
      setBusy(false);
    }
  };

  // 4. Run Scheduled Debits Batch Simulation
  const handleRunDebitSimulation = async (mode: 'auto' | 'force_fail' | 'force_success') => {
    setBusy(true);
    try {
      const res = await request<any>('admin/enach/debits/simulate', 'POST', {
        simulation_mode: mode,
      });
      if (res.ok) {
        showToast(`✓ Debit Batch Completed: ${res.succeeded} cleared, ${res.failed} simulated return.`);
        setRefreshCount((n) => n + 1);
      }
    } catch (err: any) {
      alert(err.message || 'Debit simulation failed.');
    } finally {
      setBusy(false);
    }
  };

  // 5. Retry a Failed Debit
  const handleExecuteRetry = async () => {
    if (!retryModalDebit) return;
    setBusy(true);
    try {
      const res = await request<any>(`admin/enach/debits/${retryModalDebit.id}/retry`, 'POST', {});
      if (res.ok) {
        showToast(`✓ Retry executed successfully! Recovered ${formatMoney(retryModalDebit.amount_minor)}.`);
        setRetryModalDebit(null);
        setRefreshCount((n) => n + 1);
      }
    } catch (err: any) {
      alert(err.message || 'Retry failed.');
    } finally {
      setBusy(false);
    }
  };

  // 6. Run Reconciliation Batch
  const handleRunReconciliation = async () => {
    setBusy(true);
    try {
      const res = await request<any>('admin/enach/reconciliation/run', 'POST', {});
      if (res.ok) {
        showToast(`✓ Sandbox Reconciliation Batch: ${res.matched} matched, ${res.discrepant} exceptions.`);
        setRefreshCount((n) => n + 1);
      }
    } catch (err: any) {
      alert(err.message || 'Reconciliation failed.');
    } finally {
      setBusy(false);
    }
  };

  // 7. Send Test Notification Preview
  const handleSendTestNotification = async (channel: string, eventType: string) => {
    setBusy(true);
    try {
      const res = await request<any>('admin/enach/notifications/test', 'POST', {
        channel,
        event_type: eventType,
        recipient_name: 'Simulated Parent (Test)',
        recipient_phone: '+91 98765 43210',
        title: 'Fee Collection Notification Preview',
        message: 'This is a sandbox test notification verifying recipient dispatch formatting.',
      });
      if (res.ok) {
        showToast(`✓ Test ${channel} notification dispatched to sandbox log.`);
        setTestNotificationModal(false);
        setRefreshCount((n) => n + 1);
      }
    } catch (err: any) {
      alert(err.message || 'Notification simulation failed.');
    } finally {
      setBusy(false);
    }
  };

  // CSV Export for Debits or Reports
  const exportCsv = (filename: string, headers: string[], rows: any[][]) => {
    const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c ?? ''}"`).join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Status Badge Helper
  const renderStatusBadge = (status: string) => {
    const normalized = (status || '').toLowerCase().replace(/_/g, ' ');
    let color = '#475569';
    let bg = '#f1f5f9';
    let border = '#cbd5e1';

    if (normalized === 'active' || normalized.includes('active') || normalized === 'succeeded' || normalized === 'matched') {
      color = '#0f766e';
      bg = '#f0fdfa';
      border = '#99f6e4';
    } else if (normalized.includes('pending') || normalized === 'queued' || normalized === 'processing') {
      color = '#b45309';
      bg = '#fffbeb';
      border = '#fde68a';
    } else if (normalized === 'failed' || normalized === 'rejected' || normalized === 'unmatched') {
      color = '#b91c1c';
      bg = '#fef2f2';
      border = '#fecaca';
    } else if (normalized.includes('investigation') || normalized === 'partially matched') {
      color = '#6d28d9';
      bg = '#f5f3ff';
      border = '#ddd6fe';
    } else if (normalized === 'cancelled' || normalized === 'expired') {
      color = '#64748b';
      bg = '#f8fafc';
      border = '#e2e8f0';
    }

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '9999px',
          fontSize: '11px',
          fontWeight: 600,
          color,
          background: bg,
          border: `1px solid ${border}`,
          textTransform: 'capitalize',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
        {normalized}
      </span>
    );
  };

  // -------------------------------------------------------------
  // Render Main Layout
  // -------------------------------------------------------------
  return (
    <div className="flex-enach-workspace" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* 1. Mandatory Sandbox Disclaimer Banner */}
      <div
        role="alert"
        style={{
          background: 'linear-gradient(90deg, #f0fdfa 0%, #fef3c7 100%)',
          border: '1px solid #0d9488',
          borderLeft: '6px solid #0d9488',
          borderRadius: 8,
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>🛡️</span>
          <div>
            <strong style={{ color: '#0f766e', fontSize: '13px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              SANDBOX MODE — NO REAL BANK TRANSACTIONS
            </strong>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#475569' }}>
              Isolated simulation rail for student eNACH mandates, recurring collections, failed debit recovery, and reconciliation. No live banking credentials or money movement.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 4,
              background: '#0f766e',
              color: '#ffffff',
            }}
          >
            PROVIDER: {providerInfo.providerId.toUpperCase()} (ACTIVE)
          </span>
          <button
            type="button"
            className="button secondary"
            style={{ fontSize: '12px', padding: '4px 10px' }}
            onClick={() => setShowDiagnosticsDrawer(true)}
          >
            Diagnostics & Matrix ⚙️
          </button>
        </div>
      </div>

      {/* 2. Top Header Panel */}
      <section className="admin-panel" style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <span className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0d9488', fontWeight: 600 }}>
              Dodo · eNACH operations
            </span>
            <h2 style={{ margin: '4px 0 6px', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Flex / eNACH Fee Automation</h2>
            <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>
              NPCI eNACH recurring mandate infrastructure, one-click authorization workflows, automatic debit scheduling, recovery retries, and sandbox reconciliation. Live eNACH authorization is unavailable on simulated rails.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
              <span>Mandates ({mandates.length})</span> · 
              <span>Setup attempts ({mandates.filter((m) => m.status === 'pending_authorization').length})</span> · 
              <span>Automatic debits ({debits.length})</span> · 
              <span>Settlements (0)</span> · 
              <span>Checkouts (0)</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '12px' }}>
              <button type="button" style={{ background: 'none', border: 'none', padding: 0, color: '#0f766e', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => openFeeOperations?.('payer')}>Create payer profile</button>
              <button type="button" style={{ background: 'none', border: 'none', padding: 0, color: '#0f766e', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => openFeeOperations?.('schedule')}>Create fee schedule</button>
              <button type="button" style={{ background: 'none', border: 'none', padding: 0, color: '#0f766e', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => openFeeOperations?.('reconciliation')}>Reconciliation and evidence review</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button primary"
              style={{ background: '#0d9488', borderColor: '#0d9488', color: '#ffffff', fontWeight: 600 }}
              onClick={() => setActiveTab('setup')}
            >
              + Activate eNACH
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => handleRunDebitSimulation('auto')}
              disabled={busy}
              title="Execute scheduled debits run in sandbox"
            >
              ▶ Run Debit Simulation
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setRefreshCount((n) => n + 1)}
              title="Refresh all eNACH records"
            >
              ↻ Refresh
            </button>
          </div>
        </div>
      </section>

      {/* Toast Feedback */}
      {toastMessage && (
        <div
          role="status"
          style={{
            background: '#ecfdf5',
            border: '1px solid #6ee7b7',
            padding: '10px 16px',
            borderRadius: 6,
            color: '#065f46',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* 3. Horizontal Tab Navigation Bar (11 Core Areas) */}
      <nav
        aria-label="Flex and eNACH tabs"
        style={{
          display: 'inline-flex',
          maxWidth: '100%',
          gap: '3px',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: '9999px',
          padding: '4px',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
          marginBottom: '20px',
        }}
      >
        {TAB_CONFIG.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                onViewChange?.(tab.id);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                border: 'none',
                background: isSelected ? '#18181b' : 'transparent',
                color: isSelected ? '#ffffff' : '#52525b',
                fontWeight: isSelected ? 600 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                borderRadius: '9999px',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 7px',
                    borderRadius: '9999px',
                    background: isSelected ? '#facc15' : 'rgba(0, 0, 0, 0.07)',
                    color: isSelected ? '#18181b' : '#52525b',
                    fontWeight: 700,
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ========================================================= */}
      {/* TAB 1: OVERVIEW DASHBOARD (Module 1)                      */}
      {/* ========================================================= */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#18181b', margin: 0 }}>
              Collection overview
            </h2>
          </div>
          {/* 8 KPI Cards Strip */}
          <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', margin: 0 }}>
            <div className="finance-metric finance-metric-emphasis">
              <span className="finance-metric-label">Total Mandates</span>
              <strong>{overview?.kpis?.total_mandates ?? mandates.length}</strong>
              <span className="finance-metric-hint">Registered on sandbox rail</span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">Active Mandates</span>
              <strong style={{ color: '#0d9488' }}>
                {overview?.kpis?.active_sandbox_mandates ?? mandates.filter((m) => m.status === 'active').length}
              </strong>
              <span className="finance-metric-hint">Authorized for auto-debit</span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">Pending Authorizations</span>
              <strong style={{ color: '#d97706' }}>
                {overview?.kpis?.pending_registrations ?? mandates.filter((m) => m.status === 'pending_authorization').length}
              </strong>
              <span className="finance-metric-hint">Awaiting simulated payer auth</span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">Upcoming Debits</span>
              <strong>{formatMoney(overview?.kpis?.upcoming_simulated_debits_minor ?? 4300000)}</strong>
              <span className="finance-metric-hint">
                {overview?.kpis?.upcoming_simulated_debits_count ?? 2} queue presentation(s)
              </span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">Successful Debits</span>
              <strong style={{ color: '#16a34a' }}>
                {formatMoney(overview?.kpis?.successful_simulated_debits_minor ?? 4300000)}
              </strong>
              <span className="finance-metric-hint">
                {overview?.kpis?.successful_simulated_debits_count ?? 2} cleared debits
              </span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">Failed Debits</span>
              <strong style={{ color: '#dc2626' }}>
                {formatMoney(overview?.kpis?.failed_simulated_debits_minor ?? 5400000)}
              </strong>
              <span className="finance-metric-hint">
                {overview?.kpis?.failed_simulated_debits_count ?? 2} returned unpaid
              </span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">Open Investigations</span>
              <strong style={{ color: '#7c3aed' }}>{overview?.kpis?.pending_investigations ?? 2}</strong>
              <span className="finance-metric-hint">Discrepancy review needed</span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">Simulated Recovery</span>
              <strong style={{ color: '#0284c7' }}>
                {formatMoney(overview?.kpis?.simulated_recovery_minor ?? 3200000)}
              </strong>
              <span className="finance-metric-hint">In active retry scheduler</span>
            </div>
          </div>

          {/* Quick Setup Callout Card */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                ⚡ One-Click eNACH Activation Available
              </h3>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
                Instantly map student instalments to recurring NPCI mandates. Test payer netbanking, debit card, or Aadhaar authorization directly in sandbox.
              </p>
            </div>
            <button
              type="button"
              className="button primary"
              style={{ background: '#0d9488', borderColor: '#0d9488', color: '#ffffff', fontWeight: 600 }}
              onClick={() => setActiveTab('setup')}
            >
              + Activate eNACH Now
            </button>
          </div>

          {/* Grid: Mandate Status Funnel & Upcoming Debit Queue */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--space-6)' }}>
            {/* Status Breakdown */}
            <div className="admin-panel" style={{ margin: 0 }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '15px', fontWeight: 700 }}>Mandate Status Breakdown</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(overview?.funnel || [
                  { status: 'Active (Sandbox)', count: 2, color: '#0d9488' },
                  { status: 'Pending Authorization', count: 2, color: '#f59e0b' },
                  { status: 'Rejected', count: 1, color: '#ef4444' },
                  { status: 'Cancelled', count: 1, color: '#64748b' },
                ]).map((item: any) => {
                  const total = mandates.length || 6;
                  const pct = Math.round((item.count / total) * 100);
                  return (
                    <div key={item.status}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>{item.status}</span>
                        <span style={{ color: '#64748b' }}>
                          {item.count} mandates ({pct}%)
                        </span>
                      </div>
                      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: item.color, borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upcoming Debits Schedule */}
            <div className="admin-panel" style={{ margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Upcoming Scheduled Debits</h3>
                <span className="status-pill">Next 7 Days</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Due Date</th>
                      <th>Amount</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.upcoming_schedule || []).slice(0, 4).map((row: any) => (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.student_name}</strong>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{row.account_reference}</div>
                        </td>
                        <td>{row.scheduled_date}</td>
                        <td>
                          <strong>{formatMoney(row.amount_minor)}</strong>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="button outline"
                            style={{ fontSize: '11px', padding: '2px 8px' }}
                            onClick={() => setActiveTab('debits')}
                          >
                            View Queue
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!overview?.upcoming_schedule || overview.upcoming_schedule.length === 0) && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>
                          No pending debits scheduled for presentation.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Failed Debit Alerts Panel */}
          {overview?.failed_alerts && overview.failed_alerts.length > 0 && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 8,
                padding: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 style={{ margin: 0, color: '#92400e', fontSize: '14px', fontWeight: 700 }}>
                  ⚠️ Attention Needed: {overview.failed_alerts.length} Failed Debit Instruction(s)
                </h4>
                <button
                  type="button"
                  className="button secondary"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => setActiveTab('failures')}
                >
                  Manage Failures →
                </button>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#78350f' }}>
                Simulated provider returns require recovery scheduling or fee plan adjustment.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {overview.failed_alerts.map((f: any) => (
                  <div
                    key={f.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #fef3c7',
                      padding: '8px 12px',
                      borderRadius: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '12px' }}>{f.student_name}</strong> — {formatMoney(f.amount_minor)} (
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>{f.failure_code}</span>: {f.failure_reason})
                    </div>
                    <div>
                      {f.retry_eligible ? (
                        <button
                          type="button"
                          className="button primary"
                          style={{ fontSize: '11px', padding: '2px 8px', background: '#0d9488' }}
                          onClick={() => setActiveTab('recovery')}
                        >
                          Retry in Recovery →
                        </button>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Ineligible for Auto-Retry</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: ONE-CLICK eNACH SETUP (Module 2)                    */}
      {/* ========================================================= */}
      {activeTab === 'setup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <section className="admin-panel" style={{ margin: 0 }}>
            <div style={{ maxWidth: 840 }}>
              <span className="eyebrow" style={{ textTransform: 'uppercase', color: '#0d9488', fontWeight: 600 }}>
                Module 2 · One-Click Authorization
              </span>
              <h3 style={{ margin: '4px 0 8px', fontSize: '1.25rem', fontWeight: 700 }}>
                Activate Student Sandbox eNACH
              </h3>
              <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '13px' }}>
                Select an enrolled student to pull their linked fee plan. Create a unique sandbox mandate and trigger an explicit, test-only authorization simulation.
              </p>

              <form onSubmit={handleCreateMandate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Step 1: Student Selection */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1.25rem' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: 6 }}>
                    1. Select Enrolled Student *
                  </label>
                  <select
                    value={setupStudentId}
                    onChange={(e) => setSetupStudentId(e.target.value)}
                    onFocus={() => {
                      request<StudentEnachMapping[]>('admin/enach/student-mapping')
                        .then((data) => {
                          if (data && Array.isArray(data)) setStudentMappings(data);
                        })
                        .catch(() => {});
                    }}
                    required
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '14px' }}
                  >
                    <option value="">-- Choose student from directory --</option>
                    {studentMappings.map((s) => (
                      <option key={s.student_id} value={s.student_id}>
                        {s.student_name} ({s.student_reference}) — {s.group_name} | {s.mandate_status === 'active' ? '✓ Active Mandate' : s.mandate_status === 'not_setup' ? 'Setup Required' : `Status: ${s.mandate_status}`}
                      </option>
                    ))}
                  </select>
                  {setupStudentId && (
                    <div style={{ marginTop: 10, fontSize: '12px', color: '#0f766e', background: '#f0fdfa', padding: '6px 12px', borderRadius: 4 }}>
                      ✓ Linked Fee Plan: {studentMappings.find((s) => s.student_id === setupStudentId)?.fee_plan} | Remaining Fee:{' '}
                      {formatMoney(studentMappings.find((s) => s.student_id === setupStudentId)?.remaining_minor || 0)}
                    </div>
                  )}
                </div>

                {/* Step 2: Payer Profile Review */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700 }}>2. Authorized Payer & Bank Details</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>
                        Payer Full Name
                      </label>
                      <input
                        type="text"
                        value={setupPayerName}
                        onChange={(e) => setSetupPayerName(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>
                        Mobile Phone (WhatsApp Notifications)
                      </label>
                      <input
                        type="tel"
                        value={setupPayerPhone}
                        onChange={(e) => setSetupPayerPhone(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={setupPayerEmail}
                        onChange={(e) => setSetupPayerEmail(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>
                        Destination Bank (Sandbox Simulator)
                      </label>
                      <select
                        value={setupBankName}
                        onChange={(e) => setSetupBankName(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      >
                        <option value="HDFC Bank">HDFC Bank</option>
                        <option value="ICICI Bank">ICICI Bank</option>
                        <option value="State Bank of India">State Bank of India</option>
                        <option value="Axis Bank">Axis Bank</option>
                        <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                        <option value="Punjab National Bank">Punjab National Bank</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>
                        Simulated Account Last 4 Digits
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        value={setupAccountLast4}
                        onChange={(e) => setSetupAccountLast4(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>
                        Simulated IFSC Code
                      </label>
                      <input
                        type="text"
                        value={setupIfsc}
                        onChange={(e) => setSetupIfsc(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Step 3: Mandate Financial Parameters */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700 }}>3. Mandate Terms & Frequency</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>
                        Maximum Mandate Cap (INR)
                      </label>
                      <input
                        type="number"
                        step="1000"
                        value={setupMaxAmountMinor / 100}
                        onChange={(e) => setSetupMaxAmountMinor(Math.round(Number(e.target.value) * 100))}
                        required
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Maximum limit debited per instalment cycle</span>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>
                        Debit Frequency
                      </label>
                      <select
                        value={setupFrequency}
                        onChange={(e) => handleFrequencyChange(e.target.value as any)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontWeight: 600 }}
                      >
                        <option value="quarterly">Quarterly (4 cycles)</option>
                        <option value="monthly">Monthly (10 cycles)</option>
                        <option value="bi-monthly">Bi-Monthly (6 cycles)</option>
                        <option value="as_presented">As Presented (Flexible)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>
                        Validity Start Date (From Date)
                      </label>
                      <input
                        type="date"
                        value={setupStartDate}
                        onChange={(e) => setSetupStartDate(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Coverage start date for auto-debit</span>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>
                        Validity End Date (To Date)
                      </label>
                      <input
                        type="date"
                        value={setupEndDate}
                        onChange={(e) => setSetupEndDate(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Expiry date of mandate authorization</span>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>
                        Simulated Authorization Mode
                      </label>
                      <select
                        value={setupAuthMethod}
                        onChange={(e) => setSetupAuthMethod(e.target.value as AuthMethod)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      >
                        <option value="NetBanking (Simulated)">NetBanking (Simulated)</option>
                        <option value="Debit Card (Simulated)">Debit Card (Simulated)</option>
                        <option value="Aadhaar OTP (Simulated)">Aadhaar OTP (Simulated)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Step 4: Scheduled Fee Instalments Breakdown & Dates */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                        4. Scheduled Fee Instalments (Coverage Dates: From When to When)
                      </h4>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                        Add or remove instalments, customize coverage windows (From Date → To Date), and balance fee amounts.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {/* Counter Stepper */}
                      <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveInstallment(setupInstallments.length - 1)}
                          disabled={setupInstallments.length <= 1}
                          title="Decrease instalments count (-1)"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            padding: '4px 10px',
                            fontSize: '15px',
                            fontWeight: 700,
                            color: setupInstallments.length <= 1 ? '#94a3b8' : '#0f172a',
                            cursor: setupInstallments.length <= 1 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          −
                        </button>
                        <span style={{ fontSize: '12px', fontWeight: 700, padding: '0 8px', color: '#0f172a', whiteSpace: 'nowrap' }}>
                          {setupInstallments.length} Instalment{setupInstallments.length !== 1 ? 's' : ''}
                        </span>
                        <button
                          type="button"
                          onClick={handleAddInstallment}
                          title="Increase instalments count (+1)"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            padding: '4px 10px',
                            fontSize: '15px',
                            fontWeight: 700,
                            color: '#0d9488',
                            cursor: 'pointer',
                          }}
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddInstallment}
                        className="button primary"
                        style={{
                          fontSize: '12px',
                          padding: '6px 14px',
                          background: '#0d9488',
                          borderColor: '#0d9488',
                          color: '#ffffff',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        + Add Instalment
                      </button>

                      <button
                        type="button"
                        onClick={handleBalanceEvenly}
                        className="button secondary"
                        style={{ fontSize: '12px', padding: '6px 12px', fontWeight: 600 }}
                        title="Split student remaining balance evenly across all current instalments"
                      >
                        ⚖️ Balance Evenly
                      </button>
                    </div>
                  </div>

                  {setupInstallments.length === 0 ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', background: '#f8fafc', borderRadius: 6, color: '#64748b', fontSize: '13px' }}>
                      Select an enrolled student in Step 1 to load and configure their instalment schedule and dates.
                    </div>
                  ) : (
                    <>
                      <div className="admin-table-wrap">
                        <table className="admin-table" style={{ margin: 0 }}>
                          <thead>
                            <tr>
                              <th style={{ width: 40 }}>#</th>
                              <th>Instalment Name</th>
                              <th style={{ minWidth: 280 }}>Instalment Dates (From When to When)</th>
                              <th style={{ minWidth: 130 }}>Due Date</th>
                              <th style={{ minWidth: 120 }}>Amount</th>
                              <th>eNACH Status</th>
                              <th>Cap Limit Check</th>
                              <th style={{ width: 80, textAlign: 'center' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {setupInstallments.map((inst, idx) => {
                              const isWithinCap = inst.amount_minor <= setupMaxAmountMinor;
                              return (
                                <tr key={inst.id || idx}>
                                  <td style={{ fontWeight: 600, color: '#64748b' }}>{idx + 1}</td>
                                  <td>
                                    <input
                                      type="text"
                                      value={inst.name}
                                      onChange={(e) => updateInstallment(idx, { name: e.target.value })}
                                      style={{ width: '100%', minWidth: 170, padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 600 }}
                                    />
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>FROM DATE</span>
                                        <input
                                          type="date"
                                          value={inst.period_start || ''}
                                          onChange={(e) => updateInstallment(idx, { period_start: e.target.value })}
                                          style={{ padding: '4px 6px', fontSize: '12px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                                        />
                                      </div>
                                      <span style={{ color: '#0d9488', fontWeight: 700, marginTop: 14 }}>→</span>
                                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>TO DATE</span>
                                        <input
                                          type="date"
                                          value={inst.period_end || ''}
                                          onChange={(e) => updateInstallment(idx, { period_end: e.target.value })}
                                          style={{ padding: '4px 6px', fontSize: '12px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <input
                                      type="date"
                                      value={inst.due_date}
                                      onChange={(e) => updateInstallment(idx, { due_date: e.target.value })}
                                      style={{ padding: '5px 8px', fontSize: '12px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                                    />
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span style={{ fontSize: '12px', color: '#64748b' }}>₹</span>
                                      <input
                                        type="number"
                                        value={inst.amount_minor / 100}
                                        step="500"
                                        onChange={(e) => updateInstallment(idx, { amount_minor: Math.round(Number(e.target.value) * 100) })}
                                        style={{ width: '90px', padding: '5px 8px', fontSize: '12px', borderRadius: 4, border: '1px solid #cbd5e1', fontWeight: 600 }}
                                      />
                                    </div>
                                  </td>
                                  <td>
                                    {renderStatusBadge(inst.status)}
                                  </td>
                                  <td>
                                    {isWithinCap ? (
                                      <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        ✓ Within Cap (≤ ₹{(setupMaxAmountMinor / 100).toLocaleString('en-IN')})
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        ⚠ Exceeds Cap (&gt; ₹{(setupMaxAmountMinor / 100).toLocaleString('en-IN')})
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveInstallment(idx)}
                                      disabled={setupInstallments.length <= 1}
                                      title={setupInstallments.length <= 1 ? 'At least one instalment is required' : `Remove Instalment #${idx + 1}`}
                                      style={{
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        borderRadius: 4,
                                        border: '1px solid #fecaca',
                                        background: setupInstallments.length <= 1 ? '#f8fafc' : '#fef2f2',
                                        color: setupInstallments.length <= 1 ? '#94a3b8' : '#dc2626',
                                        cursor: setupInstallments.length <= 1 ? 'not-allowed' : 'pointer',
                                        fontWeight: 600,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '2px',
                                      }}
                                    >
                                      ✕ Remove
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Summary Banner */}
                      <div style={{ marginTop: '12px', padding: '10px 14px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>
                          <span>
                            <strong>Scheduled Total:</strong>{' '}
                            <span style={{ color: '#0d9488', fontWeight: 700 }}>
                              {formatMoney(setupInstallments.reduce((sum, inst) => sum + (inst.amount_minor || 0), 0))}
                            </span>
                          </span>
                          <span>
                            <strong>Student Remaining Fee:</strong>{' '}
                            <span>
                              {formatMoney(studentMappings.find((s) => s.student_id === setupStudentId)?.remaining_minor || 12000000)}
                            </span>
                          </span>
                          {(() => {
                            const scheduledTotal = setupInstallments.reduce((sum, inst) => sum + (inst.amount_minor || 0), 0);
                            const remaining = studentMappings.find((s) => s.student_id === setupStudentId)?.remaining_minor || 12000000;
                            const diff = scheduledTotal - remaining;
                            if (diff === 0) {
                              return <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Total Matches Remaining Fee</span>;
                            }
                            if (diff < 0) {
                              return <span style={{ color: '#d97706', fontWeight: 600 }}>⚠ {formatMoney(Math.abs(diff))} unallocated</span>;
                            }
                            return <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠ {formatMoney(diff)} exceeds remaining</span>;
                          })()}
                          <span>
                            <strong>Frequency:</strong>{' '}
                            <span style={{ textTransform: 'capitalize', fontWeight: 600, color: '#475569' }}>
                              {setupFrequency.replace('_', ' ')}
                            </span>
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          Mandate Coverage Window: {setupStartDate} → {setupEndDate}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Submit Action */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <button
                    type="submit"
                    className="button primary"
                    style={{ background: '#0d9488', borderColor: '#0d9488', color: '#ffffff', fontWeight: 700, padding: '10px 24px' }}
                    disabled={busy || !setupStudentId}
                  >
                    {busy ? 'Initiating…' : 'Create Sandbox Mandate'}
                  </button>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Generates a unique UMRN reference and triggers simulated payer authorization modal.
                  </span>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: MANDATE MANAGEMENT (Module 3)                      */}
      {/* ========================================================= */}
      {activeTab === 'mandates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <section className="admin-panel" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Registered Sandbox Mandates</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Manage student auto-debit authorizations, review NPCI events, view linked instalments, and process cancellations.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="search"
                  placeholder="Search by student, UMRN, payer…"
                  value={mandateSearch}
                  onChange={(e) => setMandateSearch(e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '13px', minWidth: 240 }}
                />
                <select
                  value={mandateStatusFilter}
                  onChange={(e) => setMandateStatusFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '13px' }}
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active (Sandbox)</option>
                  <option value="pending_authorization">Pending Authorization</option>
                  <option value="draft">Draft</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Mandate ID / UMRN</th>
                    <th>Student</th>
                    <th>Payer & Bank</th>
                    <th>Fee Plan</th>
                    <th>Amount Cap</th>
                    <th>Frequency</th>
                    <th>Validity</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mandates
                    .filter((m) => {
                      if (mandateStatusFilter && m.status !== mandateStatusFilter) return false;
                      if (!mandateSearch) return true;
                      const q = mandateSearch.toLowerCase();
                      return (
                        m.mandate_reference.toLowerCase().includes(q) ||
                        m.student_name.toLowerCase().includes(q) ||
                        m.payer_name.toLowerCase().includes(q) ||
                        m.bank_name.toLowerCase().includes(q)
                      );
                    })
                    .map((m) => (
                      <tr key={m.id}>
                        <td>
                          <strong style={{ fontSize: '12px', color: '#0f766e' }}>{m.mandate_reference}</strong>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>{m.rail}</div>
                        </td>
                        <td>
                          <strong>{m.student_name}</strong>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{m.account_reference}</div>
                        </td>
                        <td>
                          <div>{m.payer_name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {m.bank_name} ({m.masked_account})
                          </div>
                        </td>
                        <td style={{ fontSize: '12px' }}>{m.fee_plan}</td>
                        <td>
                          <strong>{formatMoney(m.max_amount_minor)}</strong>
                        </td>
                        <td style={{ textTransform: 'capitalize', fontSize: '12px' }}>{m.frequency}</td>
                        <td style={{ fontSize: '11px', color: '#64748b' }}>
                          {m.start_date} to {m.end_date}
                        </td>
                        <td>{renderStatusBadge(m.status)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              className="button secondary"
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                              onClick={() => setSelectedMandate(m)}
                              title="Inspect mandate profile and audit history"
                            >
                              View
                            </button>
                            {m.status === 'pending_authorization' && (
                              <button
                                type="button"
                                className="button primary"
                                style={{ fontSize: '11px', padding: '3px 8px', background: '#0d9488' }}
                                onClick={() => setAuthModalMandate(m)}
                                title="Open test authorization simulation"
                              >
                                Authorize ⚡
                              </button>
                            )}
                            {m.status === 'active' && (
                              <button
                                type="button"
                                className="button outline"
                                style={{ fontSize: '11px', padding: '3px 8px', color: '#b91c1c', borderColor: '#fca5a5' }}
                                onClick={() => {
                                  setCancelModalMandate(m);
                                  setCancelReason('');
                                }}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {mandates.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        No sandbox mandates created yet. Click "+ Activate eNACH" to set up your first mandate.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: STUDENTS & PAYERS (Module 4)                       */}
      {/* ========================================================= */}
      {activeTab === 'students' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <section className="admin-panel" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Student eNACH Mapping Matrix</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Overview of student fee obligations, authorized payers, linked instalments, and recurring mandate readiness.
                </p>
              </div>
              <input
                type="search"
                placeholder="Search students, class, course…"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '13px', minWidth: 260 }}
              />
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Student & Ref</th>
                    <th>Class / Group</th>
                    <th>Authorized Payer</th>
                    <th>Fee Structure</th>
                    <th>Instalment Dates (From - To)</th>
                    <th>Remaining Balance</th>
                    <th>Next Due</th>
                    <th>eNACH Mandate Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {studentMappings
                    .filter((s) => {
                      if (!studentSearch) return true;
                      const q = studentSearch.toLowerCase();
                      return (
                        s.student_name.toLowerCase().includes(q) ||
                        s.student_reference.toLowerCase().includes(q) ||
                        s.group_name.toLowerCase().includes(q) ||
                        s.payer_name.toLowerCase().includes(q)
                      );
                    })
                    .map((s) => (
                      <tr key={s.student_id}>
                        <td>
                          <strong>{s.student_name}</strong>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{s.student_reference}</div>
                        </td>
                        <td>
                          <div>{s.group_name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{s.course}</div>
                        </td>
                        <td>
                          <div>{s.payer_name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{s.payer_phone}</div>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          <div>{s.fee_plan}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Total: {formatMoney(s.total_fee_minor)}</div>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          <div style={{ fontWeight: 600 }}>{s.installments_count || 4} Instalments</div>
                          <div style={{ fontSize: '11px', color: '#0f766e', fontWeight: 600 }}>
                            {s.installments?.[0]?.period_start || '2026-07-01'} → {s.installments?.[s.installments.length - 1]?.period_end || '2027-06-30'}
                          </div>
                        </td>
                        <td>
                          <strong>{formatMoney(s.remaining_minor)}</strong>
                          <div style={{ fontSize: '11px', color: '#16a34a' }}>Paid: {formatMoney(s.paid_minor)}</div>
                        </td>
                        <td style={{ fontSize: '12px' }}>{s.next_due_date || 'No upcoming'}</td>
                        <td>
                          {s.mandate_status === 'not_setup' ? (
                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 4, background: '#f8fafc', border: '1px solid #cbd5e1', color: '#64748b' }}>
                              Not Setup
                            </span>
                          ) : (
                            renderStatusBadge(s.mandate_status)
                          )}
                        </td>
                        <td>
                          {s.mandate_status === 'not_setup' || s.mandate_status === 'rejected' || s.mandate_status === 'cancelled' ? (
                            <button
                              type="button"
                              className="button primary"
                              style={{ fontSize: '11px', padding: '3px 10px', background: '#0d9488' }}
                              onClick={() => {
                                setSetupStudentId(s.student_id);
                                setActiveTab('setup');
                              }}
                            >
                              + Setup Mandate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="button secondary"
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                              onClick={() => {
                                const found = mandates.find((m) => m.student_id === s.student_id);
                                if (found) setSelectedMandate(found);
                              }}
                            >
                              Inspect Mandate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: AUTOMATIC DEBITS (Modules 5 & 6)                   */}
      {/* ========================================================= */}
      {activeTab === 'debits' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Scheduling Engine Controls */}
          <section className="admin-panel" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <span className="eyebrow" style={{ textTransform: 'uppercase', color: '#0d9488', fontWeight: 600 }}>
                  Modules 5 & 6 · Recurring Debit Automation
                </span>
                <h3 style={{ margin: '4px 0 4px', fontSize: '1.15rem', fontWeight: 700 }}>
                  Automatic Debit Scheduling & Ledger
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Eligible active mandates automatically present due instalments. Run sandbox simulations to test bank clearing outcomes.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="button primary"
                  style={{ background: '#0d9488', borderColor: '#0d9488', color: '#ffffff', fontWeight: 600 }}
                  onClick={() => handleRunDebitSimulation('auto')}
                  disabled={busy}
                >
                  ▶ Simulate Due Debits Run
                </button>
                <button
                  type="button"
                  className="button outline"
                  onClick={() => handleRunDebitSimulation('force_fail')}
                  disabled={busy}
                  title="Simulate insufficient funds return (Code 05) for testing"
                >
                  Simulate Failure Test (Code 05)
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    exportCsv(
                      'sandbox-debits-ledger',
                      ['Debit ID', 'Mandate Ref', 'Student Name', 'Installment', 'Amount (INR)', 'Status', 'Failure Reason', 'Execution Date'],
                      debits.map((d) => [d.id, d.mandate_reference, d.student_name, d.installment_name, d.amount_minor / 100, d.status, d.failure_reason || '', d.execution_date]),
                    )
                  }
                >
                  ↓ Export CSV
                </button>
              </div>
            </div>
          </section>

          {/* Debit Transactions Table */}
          <section className="admin-panel" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>Debit Presentation Attempts</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="search"
                  placeholder="Filter debits by student, ID, batch…"
                  value={debitSearch}
                  onChange={(e) => setDebitSearch(e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '13px', minWidth: 240 }}
                />
                <select
                  value={debitStatusFilter}
                  onChange={(e) => setDebitStatusFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '13px' }}
                >
                  <option value="">All Statuses</option>
                  <option value="succeeded">Succeeded (Sandbox)</option>
                  <option value="failed">Failed (Sandbox)</option>
                  <option value="queued">Queued</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Debit Attempt ID</th>
                    <th>Mandate Ref</th>
                    <th>Student</th>
                    <th>Instalment</th>
                    <th>Amount</th>
                    <th>Scheduled / Executed</th>
                    <th>Simulated Result</th>
                    <th>Retry Count</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {debits
                    .filter((d) => {
                      if (debitStatusFilter && d.status !== debitStatusFilter) return false;
                      if (!debitSearch) return true;
                      const q = debitSearch.toLowerCase();
                      return (
                        d.id.toLowerCase().includes(q) ||
                        d.mandate_reference.toLowerCase().includes(q) ||
                        d.student_name.toLowerCase().includes(q) ||
                        d.installment_name.toLowerCase().includes(q) ||
                        d.provider_reference.toLowerCase().includes(q)
                      );
                    })
                    .map((d) => (
                      <tr key={d.id}>
                        <td>
                          <strong style={{ fontSize: '12px' }}>{d.id}</strong>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>{d.provider_reference}</div>
                        </td>
                        <td style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>{d.mandate_reference}</td>
                        <td>
                          <strong>{d.student_name}</strong>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{d.account_reference}</div>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          <div style={{ fontWeight: 600 }}>{d.installment_name}</div>
                          <div style={{ fontSize: '10px', color: '#0f766e', fontWeight: 600 }}>
                            {d.installment_name.includes('1') ? '01-Jul-2026 → 30-Sep-2026' : d.installment_name.includes('2') ? '01-Oct-2026 → 31-Dec-2026' : d.installment_name.includes('3') ? '01-Jan-2027 → 31-Mar-2027' : '01-Apr-2027 → 30-Jun-2027'}
                          </div>
                        </td>
                        <td>
                          <strong>{formatMoney(d.amount_minor)}</strong>
                        </td>
                        <td style={{ fontSize: '11px', color: '#64748b' }}>
                          <div>Sched: {d.scheduled_date}</div>
                          {d.execution_date && <div>Exec: {new Date(d.execution_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>}
                        </td>
                        <td>
                          <div>{renderStatusBadge(d.status)}</div>
                          {d.failure_reason && (
                            <div style={{ fontSize: '10px', color: '#dc2626', marginTop: 2 }}>{d.failure_reason}</div>
                          )}
                        </td>
                        <td style={{ fontSize: '12px', textAlign: 'center' }}>
                          {d.attempt_no} / {d.max_retries}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              className="button secondary"
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                              onClick={() => setSelectedDebit(d)}
                            >
                              Details
                            </button>
                            {d.status === 'failed' && d.attempt_no < d.max_retries && (
                              <button
                                type="button"
                                className="button primary"
                                style={{ fontSize: '11px', padding: '3px 8px', background: '#0d9488' }}
                                onClick={() => setRetryModalDebit(d)}
                              >
                                Retry
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {debits.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        No debit attempts recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 6: FAILED PAYMENTS (Module 7)                         */}
      {/* ========================================================= */}
      {activeTab === 'failures' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <section className="admin-panel" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <span className="eyebrow" style={{ textTransform: 'uppercase', color: '#dc2626', fontWeight: 600 }}>
                  Module 7 · Failed Collection Investigations
                </span>
                <h3 style={{ margin: '4px 0 4px', fontSize: '1.15rem', fontWeight: 700 }}>Failed Sandbox Debit Outcomes</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Simulated return conditions (Insufficient funds [Code 05], Expired mandate [Code 51], Timeout). Clearly tagged as simulated provider outcomes.
                </p>
              </div>
              <button
                type="button"
                className="button primary"
                style={{ background: '#0d9488' }}
                onClick={() => setActiveTab('recovery')}
              >
                Go to Recovery Queue →
              </button>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Student & Ref</th>
                    <th>Payer Contact</th>
                    <th>Mandate Ref</th>
                    <th>Failed Amount</th>
                    <th>Failure Date</th>
                    <th>Simulated Code & Reason</th>
                    <th>Retry Eligibility</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {failedDebits.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <strong>{f.student_name}</strong>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{f.account_reference}</div>
                      </td>
                      <td>
                        <div>{f.payer_name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{f.payer_phone}</div>
                      </td>
                      <td style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>{f.mandate_reference}</td>
                      <td>
                        <strong style={{ color: '#dc2626' }}>{formatMoney(f.amount_minor)}</strong>
                      </td>
                      <td style={{ fontSize: '12px' }}>{new Date(f.execution_date).toLocaleDateString('en-IN')}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 6px', borderRadius: 4, fontSize: '11px' }}>
                          {f.failure_code || 'NPCI-05'}
                        </span>
                        <div style={{ fontSize: '11px', color: '#475569', marginTop: 2 }}>{f.failure_reason}</div>
                      </td>
                      <td>
                        {f.recovery_status === 'retry_scheduled' || f.recovery_status === 'eligible' ? (
                          <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>
                            ✓ Eligible ({f.attempt_no}/{f.max_retries})
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>Ineligible / Exceeded</span>
                        )}
                      </td>
                      <td>
                        {f.attempt_no < f.max_retries && f.recovery_status !== 'ineligible' ? (
                          <button
                            type="button"
                            className="button primary"
                            style={{ fontSize: '11px', padding: '3px 8px', background: '#0d9488' }}
                            onClick={() => setRetryModalDebit(f)}
                          >
                            Retry Now
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button outline"
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                            onClick={() => alert(`Reviewing exception notes for ${f.student_name}. Mandate investigation open.`)}
                          >
                            Investigate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {failedDebits.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: '#16a34a', padding: '2rem' }}>
                        ✓ No failed debit attempts currently recorded in sandbox.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 7: RECOVERY & RETRIES (Module 8)                      */}
      {/* ========================================================= */}
      {activeTab === 'recovery' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <section className="admin-panel" style={{ margin: 0 }}>
            <span className="eyebrow" style={{ textTransform: 'uppercase', color: '#0d9488', fontWeight: 600 }}>
              Module 8 · Safe Sandbox Recovery
            </span>
            <h3 style={{ margin: '4px 0 8px', fontSize: '1.2rem', fontWeight: 700 }}>
              Recovery Workflow & Re-Presentment Rules
            </h3>
            <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '13px' }}>
              Guardrails prevent duplicate concurrent retries, check maximum retry attempt limits (max 3), and ensure cancelled mandates are never re-presented.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Retry Presentation Policy
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginTop: 4, color: '#0f172a' }}>
                  Smart Interval (3 Days after failure)
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Presents on parent salary window (1st-5th of calendar month) or T+3 banking days.
                </p>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Maximum Retry Ceiling
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginTop: 4, color: '#0f172a' }}>
                  3 Attempts per Instalment
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  After 3 failed cycles, mandate is escalated to direct offline parent counselling.
                </p>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Recovery Success Rate (Simulation)
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginTop: 4, color: '#16a34a' }}>
                  85.4% on 2nd Presentment
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  High simulated recovery due to automated WhatsApp debit alerts prior to retry.
                </p>
              </div>
            </div>

            <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700 }}>Scheduled Retry Queue</h4>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Mandate Ref</th>
                    <th>Instalment</th>
                    <th>Amount</th>
                    <th>Previous Failure</th>
                    <th>Retry Count</th>
                    <th>Scheduled Date</th>
                    <th>Immediate Action</th>
                  </tr>
                </thead>
                <tbody>
                  {failedDebits
                    .filter((f) => f.attempt_no < f.max_retries && f.recovery_status !== 'ineligible')
                    .map((f) => (
                      <tr key={f.id}>
                        <td>
                          <strong>{f.student_name}</strong>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{f.account_reference}</div>
                        </td>
                        <td style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>{f.mandate_reference}</td>
                        <td style={{ fontSize: '12px' }}>{f.installment_name}</td>
                        <td>
                          <strong>{formatMoney(f.amount_minor)}</strong>
                        </td>
                        <td style={{ fontSize: '11px', color: '#dc2626' }}>
                          {f.failure_code}: {f.failure_reason}
                        </td>
                        <td>
                          Attempt {f.attempt_no + 1} of {f.max_retries}
                        </td>
                        <td style={{ fontSize: '12px' }}>{f.next_retry_date || '2026-10-24'}</td>
                        <td>
                          <button
                            type="button"
                            className="button primary"
                            style={{ fontSize: '11px', padding: '3px 10px', background: '#0d9488' }}
                            onClick={() => setRetryModalDebit(f)}
                          >
                            Trigger Sandbox Retry Now ⚡
                          </button>
                        </td>
                      </tr>
                    ))}
                  {failedDebits.filter((f) => f.attempt_no < f.max_retries && f.recovery_status !== 'ineligible').length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        No debits currently queued for retry presentation.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 8: RECONCILIATION (Module 9)                          */}
      {/* ========================================================= */}
      {activeTab === 'reconciliation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <section className="admin-panel" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <span className="eyebrow" style={{ textTransform: 'uppercase', color: '#0d9488', fontWeight: 600 }}>
                  Module 9 · Isolated Sandbox Reconciliation
                </span>
                <h3 style={{ margin: '4px 0 4px', fontSize: '1.15rem', fontWeight: 700 }}>
                  NPCI Clearing & Settlement Matching
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Audits expected debit amounts against simulated clearing reports. Isolated from live cashflow or institute ledger balances.
                </p>
              </div>
              <button
                type="button"
                className="button primary"
                style={{ background: '#0d9488' }}
                onClick={handleRunReconciliation}
                disabled={busy}
              >
                ↻ Run Reconciliation Batch
              </button>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Reconciliation Ref</th>
                    <th>Debit Attempt</th>
                    <th>Mandate ID</th>
                    <th>Student</th>
                    <th>Expected Amount</th>
                    <th>Cleared Amount</th>
                    <th>Variance</th>
                    <th>Status</th>
                    <th>Exception Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliations.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontSize: '12px', fontWeight: 600 }}>{r.id}</td>
                      <td style={{ fontSize: '12px' }}>{r.debit_attempt_id}</td>
                      <td style={{ fontSize: '12px', color: '#0f766e' }}>{r.mandate_reference}</td>
                      <td>
                        <strong>{r.student_name}</strong>
                      </td>
                      <td>{formatMoney(r.expected_amount_minor)}</td>
                      <td>
                        <strong>{formatMoney(r.simulated_successful_amount_minor)}</strong>
                      </td>
                      <td>
                        <span style={{ color: r.variance_minor > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                          {formatMoney(r.variance_minor)}
                        </span>
                      </td>
                      <td>{renderStatusBadge(r.status)}</td>
                      <td style={{ fontSize: '11px', color: '#64748b' }}>{r.exception_reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 9: NOTIFICATIONS (Module 10)                          */}
      {/* ========================================================= */}
      {activeTab === 'notifications' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <section className="admin-panel" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <span className="eyebrow" style={{ textTransform: 'uppercase', color: '#0d9488', fontWeight: 600 }}>
                  Module 10 · Communication Automation
                </span>
                <h3 style={{ margin: '4px 0 4px', fontSize: '1.15rem', fontWeight: 700 }}>Sandbox Notification Logs</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Audits simulated parent communications: Mandate setup notices, pre-debit T-2 reminders, receipts, and failure advisories.
                </p>
              </div>
              <button
                type="button"
                className="button primary"
                style={{ background: '#0d9488' }}
                onClick={() => setTestNotificationModal(true)}
              >
                + Send Test Preview Notice
              </button>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Event Type</th>
                    <th>Channel</th>
                    <th>Recipient</th>
                    <th>Subject / Header</th>
                    <th>Message Snapshot</th>
                    <th>Status</th>
                    <th>Dispatched Date</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n) => (
                    <tr key={n.id}>
                      <td style={{ fontSize: '12px', textTransform: 'capitalize' }}>
                        <strong>{n.event_type.replace(/_/g, ' ')}</strong>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: n.channel.includes('WhatsApp') ? '#ecfdf5' : '#eff6ff',
                            color: n.channel.includes('WhatsApp') ? '#047857' : '#1d4ed8',
                            border: '1px solid rgba(0,0,0,0.05)',
                          }}
                        >
                          {n.channel}
                        </span>
                      </td>
                      <td>
                        <div>{n.recipient_name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{n.recipient_phone}</div>
                      </td>
                      <td style={{ fontSize: '12px', fontWeight: 600 }}>{n.title}</td>
                      <td style={{ fontSize: '12px', color: '#334155', maxWidth: 300 }}>{n.message}</td>
                      <td>{renderStatusBadge(n.status)}</td>
                      <td style={{ fontSize: '11px', color: '#64748b' }}>{new Date(n.sent_at).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 10: REPORTS (Module 11)                               */}
      {/* ========================================================= */}
      {activeTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <section className="admin-panel" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <span className="eyebrow" style={{ textTransform: 'uppercase', color: '#0d9488', fontWeight: 600 }}>
                  Module 11 · Institutional eNACH Reports
                </span>
                <h3 style={{ margin: '4px 0 4px', fontSize: '1.15rem', fontWeight: 700 }}>eNACH Reports & Analytics</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Generate and download 9 specialized eNACH operational reports. Clearly watermarked as Sandbox / Test data.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="button primary"
                  style={{ background: '#0d9488' }}
                  onClick={() => {
                    if (!reportData?.rows || reportData.rows.length === 0) return;
                    const headers = Object.keys(reportData.rows[0]);
                    const rows = reportData.rows.map((r: any) => headers.map((k) => r[k]));
                    exportCsv(`enach-report-${reportType}`, headers, rows);
                  }}
                  disabled={!reportData?.rows || reportData.rows.length === 0}
                >
                  ↓ Export Report CSV
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => window.print()}
                >
                  ⎙ Print / PDF Preview
                </button>
              </div>
            </div>

            {/* Report Selector Pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
              {[
                { id: 'active_mandates', label: '1. Active Mandates' },
                { id: 'registrations', label: '2. All Registrations' },
                { id: 'pending_authorizations', label: '3. Pending Authorizations' },
                { id: 'scheduled_debits', label: '4. Scheduled Debits' },
                { id: 'successful_debits', label: '5. Successful Debits' },
                { id: 'failed_debits', label: '6. Failed Debits' },
                { id: 'recovery_attempts', label: '7. Recovery Attempts' },
                { id: 'reconciliation', label: '8. Reconciliation Ledger' },
                { id: 'investigations', label: '9. Dispute History' },
              ].map((rpt) => (
                <button
                  key={rpt.id}
                  type="button"
                  onClick={() => setReportType(rpt.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    border: '1px solid',
                    borderColor: reportType === rpt.id ? '#0d9488' : '#cbd5e1',
                    background: reportType === rpt.id ? '#0d9488' : '#ffffff',
                    color: reportType === rpt.id ? '#ffffff' : '#334155',
                    fontWeight: reportType === rpt.id ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {rpt.label}
                </button>
              ))}
            </div>

            {/* Watermark Banner */}
            <div style={{ background: '#f8fafc', border: '1px dashed #94a3b8', borderRadius: 6, padding: '8px 12px', marginBottom: '1rem', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>
              SANDBOX / TEST DATA REPORT — STRICTLY NON-FINANCIAL
            </div>

            {/* Dynamic Report Table */}
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  {reportData?.rows && reportData.rows.length > 0 ? (
                    <tr>
                      {Object.keys(reportData.rows[0]).map((key) => (
                        <th key={key} style={{ textTransform: 'capitalize' }}>
                          {key.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  ) : (
                    <tr>
                      <th>Report Data</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {reportData?.rows && reportData.rows.length > 0 ? (
                    reportData.rows.map((row: any, i: number) => (
                      <tr key={i}>
                        {Object.keys(row).map((key) => (
                          <td key={key} style={{ fontSize: '12px' }}>
                            {typeof row[key] === 'number' && key.includes('amount')
                              ? formatMoney(row[key] * 100)
                              : String(row[key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        No records matching the selected report type in sandbox.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 11: AUDIT & COMPLIANCE (Module 12)                    */}
      {/* ========================================================= */}
      {activeTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <section className="admin-panel" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <span className="eyebrow" style={{ textTransform: 'uppercase', color: '#0d9488', fontWeight: 600 }}>
                  Module 12 · Compliance & Tamper-Resistant Trail
                </span>
                <h3 style={{ margin: '4px 0 4px', fontSize: '1.15rem', fontWeight: 700 }}>
                  eNACH Immutable Audit Ledger
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Cryptographically referenced chronological log of all mandate creations, payer authorizations, cancellations, and debit attempts.
                </p>
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowDiagnosticsDrawer(true)}
              >
                Provider Diagnostics & Live Matrix ⚙️
              </button>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Actor (Staff / System)</th>
                    <th>Event Type</th>
                    <th>Target Reference</th>
                    <th>Action</th>
                    <th>Audit Details</th>
                    <th>IP / Origin</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(log.timestamp).toLocaleString('en-IN')}
                      </td>
                      <td>
                        <strong style={{ fontSize: '12px' }}>{log.actor}</strong>
                      </td>
                      <td>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 6px', background: '#f1f5f9', borderRadius: 4 }}>
                          {log.event_type}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>{log.reference}</td>
                      <td style={{ fontSize: '12px', fontWeight: 600 }}>{log.action}</td>
                      <td style={{ fontSize: '12px', color: '#334155' }}>{log.details}</td>
                      <td style={{ fontSize: '11px', color: '#64748b' }}>{log.ip_address}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: Simulated Payer Authorization Workflow           */}
      {/* ========================================================= */}
      {authModalMandate && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '1.75rem',
              maxWidth: 580,
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '20px' }}>⚡</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                  Simulated Payer Authorization
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalMandate(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '10px 14px', marginBottom: '1.25rem' }}>
              <strong style={{ fontSize: '12px', color: '#92400e', textTransform: 'uppercase' }}>
                Secure Test-Only Workflow
              </strong>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#78350f' }}>
                Simulates the parent's external bank netbanking / debit card approval screen. No live bank credentials, real OTPs, or actual bank inquiries are collected.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Mandate Reference:</span>
                <strong style={{ color: '#0f766e' }}>{authModalMandate.mandate_reference}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Student Name:</span>
                <strong>{authModalMandate.student_name} ({authModalMandate.account_reference})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Authorized Payer:</span>
                <strong>{authModalMandate.payer_name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Bank & Masked Account:</span>
                <strong>{authModalMandate.bank_name} ({authModalMandate.masked_account})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Maximum Debit Cap:</span>
                <strong style={{ color: '#0f766e', fontSize: '14px' }}>{formatMoney(authModalMandate.max_amount_minor)} / month</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Authorization Rail:</span>
                <span>{authModalMandate.auth_mode}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="button outline"
                style={{ color: '#b91c1c', borderColor: '#fca5a5' }}
                onClick={() => handleSimulateAuthorization('reject')}
                disabled={busy}
              >
                ✕ Simulate Payer Rejection
              </button>
              <button
                type="button"
                className="button primary"
                style={{ background: '#0d9488', borderColor: '#0d9488', color: '#ffffff', fontWeight: 700 }}
                onClick={() => handleSimulateAuthorization('approve')}
                disabled={busy}
              >
                ✓ Simulate Payer Approval (Activate)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: View Mandate Details                             */}
      {/* ========================================================= */}
      {selectedMandate && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '1.75rem',
              maxWidth: 680,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Mandate Profile</h3>
                <span style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>{selectedMandate.mandate_reference}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMandate(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: 8, fontSize: '12px' }}>
              <div>
                <span style={{ color: '#64748b' }}>Student:</span>
                <div style={{ fontWeight: 700 }}>{selectedMandate.student_name}</div>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Account Ref:</span>
                <div style={{ fontWeight: 700 }}>{selectedMandate.account_reference}</div>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Payer:</span>
                <div style={{ fontWeight: 700 }}>{selectedMandate.payer_name}</div>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Phone / Email:</span>
                <div>{selectedMandate.payer_phone}</div>
                <div style={{ color: '#64748b' }}>{selectedMandate.payer_email}</div>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Bank & Masked Account:</span>
                <div style={{ fontWeight: 700 }}>{selectedMandate.bank_name} ({selectedMandate.masked_account})</div>
                <div style={{ color: '#64748b' }}>IFSC: {selectedMandate.ifsc_code}</div>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Monthly Cap:</span>
                <div style={{ fontWeight: 700, color: '#0f766e', fontSize: '14px' }}>{formatMoney(selectedMandate.max_amount_minor)}</div>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Frequency / Status:</span>
                <div style={{ textTransform: 'capitalize' }}>{selectedMandate.frequency} · {renderStatusBadge(selectedMandate.status)}</div>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Validity Range:</span>
                <div>{selectedMandate.start_date} to {selectedMandate.end_date}</div>
              </div>
            </div>

            {/* Authorization Events */}
            <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 700 }}>Authorization Event Log</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '1.5rem', fontSize: '12px' }}>
              {selectedMandate.authorization_events && selectedMandate.authorization_events.length > 0 ? (
                selectedMandate.authorization_events.map((ev, i) => (
                  <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', background: '#ffffff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                      <span>{ev.event_type.replace(/_/g, ' ').toUpperCase()}</span>
                      <span style={{ color: '#64748b' }}>{new Date(ev.timestamp).toLocaleString('en-IN')}</span>
                    </div>
                    <div style={{ color: '#475569', marginTop: 2 }}>{ev.details || `Auth via ${ev.method} (${ev.bank_name})`}</div>
                  </div>
                ))
              ) : (
                <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>No authorization events recorded.</p>
              )}
            </div>

            {/* Linked Instalments */}
            <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 700 }}>Linked Instalments</h4>
            <div className="admin-table-wrap" style={{ marginBottom: '1.5rem' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Instalment Name</th>
                    <th>Instalment Dates (From When to When)</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedMandate.linked_installments || []).map((inst) => (
                    <tr key={inst.id}>
                      <td style={{ fontSize: '12px', fontWeight: 600 }}>{inst.name}</td>
                      <td style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>
                        {inst.period_start && inst.period_end
                          ? `${inst.period_start} → ${inst.period_end}`
                          : `${selectedMandate.start_date} → ${selectedMandate.end_date}`}
                      </td>
                      <td style={{ fontSize: '12px' }}>{inst.due_date}</td>
                      <td>{formatMoney(inst.amount_minor)}</td>
                      <td>{renderStatusBadge(inst.status)}</td>
                    </tr>
                  ))}
                  {(!selectedMandate.linked_installments || selectedMandate.linked_installments.length === 0) && (
                    <tr>
                      <td colSpan={5} style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>
                        No instalments directly mapped.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="button secondary" onClick={() => setSelectedMandate(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: Cancel Mandate Confirmation                      */}
      {/* ========================================================= */}
      {cancelModalMandate && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '1.75rem',
              maxWidth: 480,
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700, color: '#b91c1c' }}>
              Cancel Sandbox Mandate
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '13px', color: '#475569' }}>
              Are you sure you want to cancel mandate <strong>{cancelModalMandate.mandate_reference}</strong> for{' '}
              <strong>{cancelModalMandate.student_name}</strong>? All future scheduled debits will be paused.
            </p>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>
              Cancellation Reason *
            </label>
            <input
              type="text"
              placeholder="e.g. Student opted for direct settlement / Parent request"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', marginBottom: '1.25rem' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setCancelModalMandate(null)}
                disabled={busy}
              >
                Keep Mandate
              </button>
              <button
                type="button"
                className="button primary"
                style={{ background: '#b91c1c', borderColor: '#b91c1c', color: '#ffffff' }}
                onClick={handleCancelMandate}
                disabled={busy}
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: Debit Retry Confirmation                         */}
      {/* ========================================================= */}
      {retryModalDebit && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '1.75rem',
              maxWidth: 500,
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700, color: '#0f766e' }}>
              Execute Simulated Debit Retry
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '13px', color: '#475569' }}>
              Re-presenting debit instruction <strong>{retryModalDebit.id}</strong> (Attempt {retryModalDebit.attempt_no + 1} of {retryModalDebit.max_retries}) for{' '}
              <strong>{retryModalDebit.student_name}</strong>.
            </p>
            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 6, marginBottom: '1.25rem', fontSize: '12px' }}>
              <div>Amount to Collect: <strong>{formatMoney(retryModalDebit.amount_minor)}</strong></div>
              <div>Previous Failure: <span style={{ color: '#dc2626' }}>{retryModalDebit.failure_reason}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setRetryModalDebit(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button primary"
                style={{ background: '#0d9488', borderColor: '#0d9488', color: '#ffffff', fontWeight: 700 }}
                onClick={handleExecuteRetry}
                disabled={busy}
              >
                Confirm Re-Presentment ⚡
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DRAWER: Provider Diagnostics & Future Live Architecture   */}
      {/* ========================================================= */}
      {showDiagnosticsDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              width: '100%',
              maxWidth: 520,
              height: '100%',
              padding: '2rem',
              overflowY: 'auto',
              boxShadow: '-4px 0 25px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="eyebrow" style={{ textTransform: 'uppercase', color: '#0d9488', fontWeight: 700 }}>
                  Section 7 Provider Architecture
                </span>
                <h3 style={{ margin: '4px 0 0', fontSize: '1.2rem', fontWeight: 700 }}>eNACH Rail Diagnostics</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDiagnosticsDrawer(false)}
                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', fontSize: '12px' }}>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Active Rail Configuration</div>
              <div>Provider: <strong>{providerInfo.providerId}</strong></div>
              <div>Status: <span style={{ color: '#16a34a', fontWeight: 700 }}>● {providerInfo.operationalStatus}</span></div>
              <div>Rail Spec: {providerInfo.railVersion}</div>
              <div>Clearing Window: {providerInfo.clearingCycle}</div>
              <div style={{ marginTop: 6, color: '#b45309', fontWeight: 600 }}>
                Live Clearing: DISABLED (Simulation Only)
              </div>
            </div>

            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>Capability Matrix</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '12px' }}>
              {Object.entries(providerInfo.capabilities).map(([cap, enabled]) => (
                <div key={cap} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: 4 }}>
                  <span style={{ textTransform: 'capitalize' }}>{cap.replace(/([A-Z])/g, ' $1')}</span>
                  <span style={{ fontWeight: 700, color: enabled ? '#16a34a' : '#94a3b8' }}>
                    {enabled ? '✓ Supported' : '✕ Disabled'}
                  </span>
                </div>
              ))}
            </div>

            <h4 style={{ margin: '8px 0 0', fontSize: '13px', fontWeight: 700 }}>Future Live Activation Checklist</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '11px', color: '#475569' }}>
              {providerInfo.liveActivationPrerequisites.map((req, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: '#cbd5e1' }}>☐</span>
                  <span>{req}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
              <button
                type="button"
                className="button secondary"
                style={{ width: '100%' }}
                onClick={() => setShowDiagnosticsDrawer(false)}
              >
                Close Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 5: Send Test Preview Notification                   */}
      {/* ========================================================= */}
      {testNotificationModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '1.75rem',
              maxWidth: 480,
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700 }}>Send Test Notification Preview</h3>
            <p style={{ margin: '0 0 1.25rem', fontSize: '12px', color: '#64748b' }}>
              Simulates message dispatch into the sandbox audit stream. No actual SMS or WhatsApp messages are delivered to external phones.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>Channel</label>
                <select id="test-channel-select" defaultValue="WhatsApp (Simulated)" style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                  <option value="WhatsApp (Simulated)">WhatsApp (Simulated)</option>
                  <option value="SMS (Simulated)">SMS (Simulated)</option>
                  <option value="Email (Simulated)">Email (Simulated)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: 4 }}>Event Template</label>
                <select id="test-event-select" defaultValue="upcoming_debit" style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                  <option value="upcoming_debit">Upcoming Debit Reminder (T-2 Days)</option>
                  <option value="debit_succeeded">Debit Succeeded & Receipt Advice</option>
                  <option value="debit_failed">Debit Failed Urgent Advisory</option>
                  <option value="mandate_authorized">Mandate Activated Confirmation</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="button secondary" onClick={() => setTestNotificationModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="button primary"
                style={{ background: '#0d9488' }}
                onClick={() => {
                  const chEl = document.getElementById('test-channel-select') as HTMLSelectElement;
                  const evEl = document.getElementById('test-event-select') as HTMLSelectElement;
                  handleSendTestNotification(chEl.value, evEl.value);
                }}
              >
                Send Sandbox Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
