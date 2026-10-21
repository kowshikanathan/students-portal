'use client';
import { StudentFeeAssignment } from './student-fee-assignment';
import { StudentPortalAccess } from './student-portal-access';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';
import { DirectPayment } from './direct-payment';
import { SandboxEnach } from './sandbox-enach';
import { FlexEditor } from './flex-editor';
import { MandateState } from './mandate-state';
import { downloadFinancialDocument } from './financial-download';

type Profile = {
  id: string;
  full_name: string;
  student_reference: string;
  status: string;
  institute: string;
  group_name?: string;
  course?: string;
  grade?: string;
  academic_year?: string;
  campus?: string;
  email?: string;
  phone?: string;
  guardian_name?: string;
  guardian_email?: string;
  guardian_phone?: string;
  enach_status?: string;
  summary: { net_payable_minor: string; paid_minor: string; outstanding_minor: string };
  balances: Array<{
    schedule_id: string;
    account_reference: string;
    net_payable_minor: string;
    paid_minor: string;
    outstanding_minor: string;
  }>;
};

type RecordPage = { total: number; rows: Record<string, string | number>[]; pageSize: number };

const sections = [
  ['overview', 'Overview'],
  ['components', 'Components'],
  ['installments', 'Fee structure(s)'],
  ['payments', 'Payments'],
  ['bank', 'Bank transfer'],
  ['mandates', 'Flex / eNACH'],
  ['receipts', 'Receipts'],
  ['activity', 'Activity'],
] as const;

type Section = (typeof sections)[number][0];

const columns: Record<string, Array<[string, string]>> = {
  master: [
    ['sequence', 'Installment'],
    ['due_date', 'Due date'],
    ['amount_minor', 'Original amount'],
  ],
  components: [
    ['label', 'Component'],
    ['code', 'Code'],
    ['amount_minor', 'Original fee'],
    ['account_reference', 'Account'],
  ],
  installments: [
    ['sequence', 'Installment'],
    ['due_date', 'Due date'],
    ['amount_minor', 'Original amount'],
    ['adjustment_amount_minor', 'Adjustment'],
    ['paid_amount_minor', 'Paid'],
    ['remaining_minor', 'Remaining'],
    ['status', 'Status'],
  ],
  payments: [
    ['id', 'ID'],
    ['amount_minor', 'Amount'],
    ['recorded_at', 'Paid At'],
    ['provider_reference', 'Transaction ID'],
    ['status', 'Mode'],
  ],
  mandates: [
    ['provider_reference', 'Mandate reference'],
    ['rail', 'Type'],
    ['status', 'Status'],
    ['last_event_at', 'Updated'],
  ],
  receipts: [
    ['receipt_number', 'Receipt number'],
    ['issued_at', 'Issued'],
  ],
  bank: [
    ['provider_reference', 'Reference / UTR'],
    ['recorded_at', 'Payment date'],
    ['amount_minor', 'Amount'],
    ['status', 'Status'],
    ['evidence_note', 'Notes / Mode'],
  ],
};

export function StudentProfile({ studentId }: { studentId: string }) {
  const { request, session, can } = useAdminApi();
  const [editing, setEditing] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState('');
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const [activePaymentMenuId, setActivePaymentMenuId] = useState<string | null>(null);

  const [profileResult, setProfileResult] = useState<(Profile & { loadedTenantId: string }) | null>(
    null,
  );
  const profile =
    profileResult?.id === studentId && profileResult.loadedTenantId === session.tenant.id
      ? profileResult
      : null;

  const [section, setSection] = useState<Section>('overview');
  const [scheduleView, setScheduleView] = useState<'master' | 'flex'>('flex');
  const recordSection =
    section === 'installments' && scheduleView === 'master' ? 'master' : section;
  const recordKey = session.tenant.id + ':' + studentId + ':' + recordSection;
  const [recordResult, setRecordResult] = useState<{ key: string; value: RecordPage } | null>(null);
  const records = recordResult?.key === recordKey ? recordResult.value : null;
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setProfileResult(null);
    setError('');
    request<Profile>('admin/fees/students/' + studentId)
      .then((value) => {
        if (active) setProfileResult({ ...value, loadedTenantId: session.tenant.id });
      })
      .catch(() => {
        if (active) setError('Student financial records could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [studentId, session.tenant.id, refresh]);

  useEffect(() => {
    let active = true;
    setRecordResult(null);
    setError('');
    if (columns[section])
      request<RecordPage>(
        `admin/fees/students/${studentId}/records?section=${recordSection}&page=${page}`,
      )
        .then((value) => {
          if (active) setRecordResult({ key: recordKey, value });
        })
        .catch(() => {
          if (active) setError('This section could not be loaded. Please retry.');
        });
    return () => {
      active = false;
    };
  }, [studentId, session.tenant.id, section, scheduleView, page, refresh]);

  const pick = (value: Section) => {
    setSection(value);
    setPage(1);
  };

  const handleDownloadReceipt = async (receiptId: string) => {
    try {
      const receipt = await request<{
        receipt_number: string;
        issued_at: string;
        snapshot: Record<string, any>;
      }>('admin/fees/receipts/' + receiptId);
      downloadFinancialDocument(
        'Payment receipt',
        [
          ['Receipt number', receipt.receipt_number],
          ['Issued', receipt.issued_at],
          ['Student', receipt.snapshot.studentName],
          ['Institute', receipt.snapshot.instituteName],
          [
            'Header',
            receipt.snapshot.receiptConfig?.header_note ||
              receipt.snapshot.receiptConfig?.header_text ||
              '',
          ],
          [
            'Support',
            receipt.snapshot.receiptConfig?.footer_note ||
              receipt.snapshot.receiptConfig?.support_info ||
              '',
          ],
          [
            'Terms',
            receipt.snapshot.receiptConfig?.terms_and_conditions ||
              receipt.snapshot.receiptConfig?.terms ||
              '',
          ],
          ['Student account', receipt.snapshot.accountReference],
          ['Amount', formatMoney(receipt.snapshot.amountMinor)],
          ['Reference', receipt.snapshot.providerReference],
          [
            'Payment mode',
            receipt.snapshot.directPayment?.mode || 'Provider payment',
          ],
        ],
        receipt.receipt_number,
      );
    } catch {
      setNotice('Receipt could not be downloaded. Please retry.');
    }
  };

  return (
    <>
      {editing && (
        <FlexEditor
          scheduleId={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setRefresh((n) => n + 1);
            setNotice('Flex schedule saved.');
          }}
        />
      )}

      {paying && (
        <DirectPayment
          studentId={studentId}
          onClose={() => setPaying(false)}
          onSaved={() => {
            setPaying(false);
            setRefresh((n) => n + 1);
            setNotice('Payment recorded and receipt issued.');
          }}
        />
      )}

      {notice && <p role="status" style={{ background: '#f0fdf4', color: '#166534', padding: '0.6rem 1rem', borderRadius: '6px', margin: '0.5rem 0' }}>{notice}</p>}

      {error && (
        <div role="alert" className="error-card">
          <p>{error}</p>
          <button className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}

      {!profile ? (
        !error && (
          <p role="status" aria-busy="true" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            Loading student financial profile…
          </p>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0', background: '#f8fafc', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          {/* 1. Royal Blue Header Banner */}
          <header
            className="jodo-blue-header"
            style={{
              background: '#163e9b',
              color: '#ffffff',
              padding: '1.25rem 1.75rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Link
                  href="/admin/students/"
                  style={{
                    color: '#ffffff',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>←</span>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: '1.35rem',
                      fontWeight: 600,
                      color: '#ffffff',
                      display: 'inline',
                    }}
                  >
                    {profile.full_name}
                  </h1>
                </Link>
              </div>

              <p style={{ margin: '0.35rem 0 0.2rem', fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.9)' }}>
                {[
                  profile.institute,
                  profile.phone || profile.student_reference,
                  profile.course,
                  profile.grade || profile.group_name || profile.academic_year,
                ]
                  .filter(Boolean)
                  .join(' | ')}
              </p>

              <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.75)', display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span>📞 {profile.phone || '—'}</span>
                <span>✉ {profile.email || '—'}</span>
                <span>eNACH: {(profile.enach_status || 'not_registered').replaceAll('_', ' ')}</span>
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                className="jodo-pill-button"
                onClick={() => setShowInfoModal(true)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.6)',
                  color: '#ffffff',
                  padding: '0.4rem 0.9rem',
                  borderRadius: '9999px',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <span>ⓘ</span> Student Info
              </button>
            </div>
          </header>

          {/* 2. White KPI Summary Strip */}
          <div
            className="jodo-kpi-strip dashboard-stats"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              background: '#ffffff',
              padding: '1.25rem 1.75rem',
              borderBottom: '1px solid #e2e8f0',
              gap: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Net Payable</span>
              <strong style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
                {formatMoney(profile.summary.net_payable_minor)}
              </strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Paid Amount</span>
              <strong style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>
                {formatMoney(profile.summary.paid_minor)}
              </strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Outstanding</span>
              <strong style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>
                {formatMoney(profile.summary.outstanding_minor)}
              </strong>
            </div>
          </div>

          {/* 3. Fee Details Header with Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.25rem 1.75rem 0.5rem',
              background: '#ffffff',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>
              {profile.full_name} fee details
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
              <button
                type="button"
                className="button primary"
                aria-label="Add Direct Payment"
                disabled={session.tenant.readOnly || !can('payment.evidence.record')}
                onClick={() => setPaying(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                + Add direct payment
              </button>

              <button
                type="button"
                className="button secondary"
                onClick={() => setShowActionsDropdown((prev) => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.875rem',
                }}
              >
                <span>≡</span> Actions <span>▾</span>
              </button>

              {showActionsDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '110%',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
                    minWidth: '220px',
                    zIndex: 30,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionsDropdown(false);
                      downloadFinancialDocument(
                        'Student fee statement',
                        [
                          ['Student', profile.full_name],
                          ['Enrollment number', profile.student_reference],
                          ['Institute', profile.institute],
                          ['Net payable', formatMoney(profile.summary.net_payable_minor)],
                          ['Paid', formatMoney(profile.summary.paid_minor)],
                          ['Outstanding', formatMoney(profile.summary.outstanding_minor)],
                        ],
                        'student-statement-' + profile.student_reference,
                      );
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.65rem 1rem',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      color: '#334155',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    📄 Download statement
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionsDropdown(false);
                      setShowInfoModal(true);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.65rem 1rem',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      color: '#334155',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    ⓘ View student info
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionsDropdown(false);
                      setPaying(true);
                    }}
                    disabled={session.tenant.readOnly || !can('payment.evidence.record')}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.65rem 1rem',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      color: '#334155',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    💳 Record direct payment
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 4. Horizontal Tab Navigation */}
          <nav
            className="student-financial-nav jodo-tabs-nav"
            aria-label="Student financial sections"
            style={{
              display: 'flex',
              overflowX: 'auto',
              borderBottom: '1px solid #e2e8f0',
              background: '#ffffff',
              padding: '0 1.75rem',
              gap: '1.5rem',
            }}
          >
            {sections.map(([key, title]) => (
              <button
                type="button"
                key={key}
                aria-current={key === section ? 'page' : undefined}
                className={key === section ? 'selected' : ''}
                onClick={() => pick(key)}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: key === section ? '3px solid #163e9b' : '3px solid transparent',
                  color: key === section ? '#163e9b' : '#64748b',
                  fontWeight: key === section ? 600 : 500,
                  padding: '0.85rem 0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {title}
              </button>
            ))}
          </nav>

          {/* 5. Tab Content Area */}
          <div style={{ padding: '1.5rem 1.75rem', background: '#ffffff', minHeight: '400px' }}>
            <section
              className="student-financial-content"
              aria-label={sections.find(([key]) => key === section)?.[1]}
            >
              {section === 'overview' && (
                <>
                  <p style={{ color: '#475569', margin: '0 0 1rem' }}>
                    All assigned fee schedules and current receivable balances for {profile.full_name}.
                  </p>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Account</th>
                          <th className="money">Net payable</th>
                          <th className="money">Paid</th>
                          <th className="money">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.balances.map((balance) => (
                          <tr key={balance.schedule_id}>
                            <td>{balance.account_reference}</td>
                            <td className="money">{formatMoney(balance.net_payable_minor)}</td>
                            <td className="money">{formatMoney(balance.paid_minor)}</td>
                            <td className="money">{formatMoney(balance.outstanding_minor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!profile.balances.length && (
                    <StudentFeeAssignment
                      studentId={studentId}
                      onAssigned={() => setRefresh((n) => n + 1)}
                    />
                  )}
                  <StudentPortalAccess
                    reference={profile.student_reference}
                    schedules={profile.balances}
                  />
                </>
              )}

              {section === 'installments' && (
                <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="row" aria-label="Schedule type">
                    <button
                      className="button secondary"
                      aria-pressed={scheduleView === 'master'}
                      onClick={() => {
                        setScheduleView('master');
                        setPage(1);
                      }}
                    >
                      Master Schedule
                    </button>
                    <button
                      className="button secondary"
                      aria-pressed={scheduleView === 'flex'}
                      onClick={() => {
                        setScheduleView('flex');
                        setPage(1);
                      }}
                    >
                      Flex Schedule
                    </button>
                  </div>
                  {scheduleView === 'flex' && (
                    <div className="row">
                      {profile.balances.map((balance) => (
                        <button
                          key={balance.schedule_id}
                          className="button secondary"
                          disabled={session.tenant.readOnly || !can('fee.schedule.edit')}
                          onClick={() => setEditing(balance.schedule_id)}
                        >
                          Customize Flex {balance.account_reference}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {section === 'mandates' && (
                <SandboxEnach
                  studentId={studentId}
                  studentName={profile.full_name}
                  schedules={profile.balances}
                  onChanged={(message) => {
                    setNotice(message || 'Collection records updated.');
                    setRefresh((n) => n + 1);
                  }}
                />
              )}

              {section === 'bank' && (
                <div style={{ marginBottom: '1rem' }}>
                  <div
                    className="row"
                    style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}
                  >
                    <p style={{ margin: 0, color: '#475569' }}>
                      Record direct collections received via Cash, NEFT, RTGS, IMPS, Cheque, DD, or
                      Bank Transfer.
                    </p>
                    <button
                      className="button primary"
                      disabled={session.tenant.readOnly || !can('payment.evidence.record')}
                      onClick={() => setPaying(true)}
                    >
                      + Record Direct Payment
                    </button>
                  </div>
                </div>
              )}

              {section === 'activity' && (
                <p style={{ color: '#64748b' }}>Financial changes and audit logs are recorded in the institute ledger.</p>
              )}

              {/* Records table for Components, Installments, Payments, Receipts, Bank */}
              {columns[section] &&
                (!records ? (
                  !error && <p role="status" style={{ color: '#64748b' }}>Loading records…</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <p className="small" style={{ margin: 0, color: '#64748b' }}>{records.total} records</p>
                      {section === 'payments' && (
                        <button
                          type="button"
                          className="button primary"
                          aria-label="Add Direct Payment"
                          disabled={session.tenant.readOnly || !can('payment.evidence.record')}
                          onClick={() => setPaying(true)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.85rem',
                          }}
                        >
                          + Add direct payment
                        </button>
                      )}
                    </div>

                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            {section === 'payments' && <th style={{ width: '40px' }}></th>}
                            {columns[recordSection]!.map(([key, title]) => (
                              <th key={key} className={key.endsWith('_minor') ? 'money' : ''}>
                                {title}
                              </th>
                            ))}
                            {['receipts', 'mandates'].includes(section) && <th>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {records.rows.map((row) => (
                            <tr key={String(row.id)}>
                              {section === 'payments' && (
                                <td style={{ position: 'relative' }}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActivePaymentMenuId((prev) =>
                                        prev === String(row.id) ? null : String(row.id),
                                      )
                                    }
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      fontSize: '1.1rem',
                                      padding: '0.2rem 0.4rem',
                                      color: '#64748b',
                                    }}
                                    title="Payment actions"
                                  >
                                    ⋮
                                  </button>
                                  {activePaymentMenuId === String(row.id) && (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        left: '100%',
                                        top: 0,
                                        background: '#ffffff',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                        zIndex: 40,
                                        minWidth: '200px',
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActivePaymentMenuId(null);
                                          handleDownloadReceipt(String(row.id));
                                        }}
                                        style={{
                                          width: '100%',
                                          textAlign: 'left',
                                          padding: '0.5rem 0.75rem',
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          fontSize: '0.85rem',
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                      >
                                        📥 Download Payment Receipt
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActivePaymentMenuId(null);
                                          handleDownloadReceipt(String(row.id));
                                        }}
                                        style={{
                                          width: '100%',
                                          textAlign: 'left',
                                          padding: '0.5rem 0.75rem',
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          fontSize: '0.85rem',
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                      >
                                        🖨️ Print Payment Receipt
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActivePaymentMenuId(null);
                                          setNotice('Payment confirmation sent to parent.');
                                        }}
                                        style={{
                                          width: '100%',
                                          textAlign: 'left',
                                          padding: '0.5rem 0.75rem',
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          fontSize: '0.85rem',
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                      >
                                        ✉️ Send Confirmation to Parent
                                      </button>
                                    </div>
                                  )}
                                </td>
                              )}
                              {columns[recordSection]!.map(([key]) => (
                                <td key={key} className={key.endsWith('_minor') ? 'money' : ''}>
                                  {key.endsWith('_minor')
                                    ? formatMoney(row[key] ?? 0)
                                    : key.endsWith('_at') || key === 'due_date'
                                      ? !row[key] || !Number.isFinite(new Date(row[key]!).getTime())
                                        ? '—'
                                        : new Intl.DateTimeFormat('en-IN', {
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                            timeZone: 'Asia/Kolkata',
                                          }).format(new Date(row[key]!))
                                      : key === 'status'
                                        ? (
                                          <span className="status-pill" style={{ textTransform: 'capitalize' }}>
                                            {String(row[key] ?? 'recorded').replaceAll('_', ' ')}
                                          </span>
                                        )
                                        : String(row[key] ?? '—').replaceAll('_', ' ')}
                                </td>
                              ))}
                              {section === 'mandates' && (
                                <td>
                                  {row.provider === 'sandbox_enach' &&
                                    can('enach.manage') &&
                                    !session.tenant.readOnly && (
                                      <MandateState
                                        id={String(row.id)}
                                        onChanged={() => {
                                          setRefresh((n) => n + 1);
                                          setNotice('Sandbox mandate state updated.');
                                        }}
                                      />
                                    )}
                                </td>
                              )}
                              {section === 'receipts' && (
                                <td>
                                  <button
                                    className="button secondary"
                                    onClick={() => handleDownloadReceipt(String(row.id))}
                                  >
                                    Download receipt
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!records.rows.length && (
                      <div className="empty-state">
                        <h4>No records yet</h4>
                        <p>
                          Records will appear when the corresponding financial workflow is
                          completed.
                        </p>
                      </div>
                    )}
                    <nav className="admin-toolbar" aria-label="Financial record pages">
                      <button
                        className="button secondary"
                        disabled={page <= 1}
                        onClick={() => setPage((n) => n - 1)}
                      >
                        Previous
                      </button>
                      <span>
                        Page {page} of {Math.max(1, Math.ceil(records.total / records.pageSize))}
                      </span>
                      <button
                        className="button secondary"
                        disabled={page * records.pageSize >= records.total}
                        onClick={() => setPage((n) => n + 1)}
                      >
                        Next
                      </button>
                    </nav>
                  </>
                ))}
            </section>
          </div>
        </div>
      )}

      {/* 6. Student Info Modal */}
      {showInfoModal && profile && (
        <dialog
          open
          className="finance-dialog"
          aria-label="Student Information"
          style={{
            maxWidth: '560px',
            width: '100%',
            borderRadius: '12px',
            padding: '1.75rem',
            border: '1px solid #dce3e8',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            background: '#ffffff',
            zIndex: 100,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #f1f5f9',
              paddingBottom: '0.75rem',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', fontWeight: 600 }}>
              Student & Academic Information
            </h3>
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.25rem',
                cursor: 'pointer',
                color: '#64748b',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              marginTop: '1.25rem',
              fontSize: '0.9rem',
            }}
          >
            <div>
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.8rem' }}>Full Name</span>
              <strong style={{ color: '#0f172a' }}>{profile.full_name}</strong>
            </div>
            <div>
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.8rem' }}>Enrollment Number</span>
              <strong style={{ color: '#0f172a' }}>{profile.student_reference}</strong>
            </div>
            <div>
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.8rem' }}>Institute</span>
              <span style={{ color: '#0f172a' }}>{profile.institute}</span>
            </div>
            <div>
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.8rem' }}>Campus</span>
              <span style={{ color: '#0f172a' }}>{profile.campus || 'Main Campus'}</span>
            </div>
            <div>
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.8rem' }}>Course / Program</span>
              <span style={{ color: '#0f172a' }}>{profile.course || '—'}</span>
            </div>
            <div>
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.8rem' }}>Grade / Batch</span>
              <span style={{ color: '#0f172a' }}>
                {[profile.grade, profile.group_name].filter(Boolean).join(' · ') || '—'}
              </span>
            </div>
            <div>
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.8rem' }}>Academic Year</span>
              <span style={{ color: '#0f172a' }}>{profile.academic_year || 'Current'}</span>
            </div>
            <div>
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.8rem' }}>Enrollment Status</span>
              <span className="status-pill">{profile.status}</span>
            </div>
            <div>
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.8rem' }}>Student Email</span>
              <span style={{ color: '#0f172a' }}>{profile.email || '—'}</span>
            </div>
            <div>
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.8rem' }}>Student Phone</span>
              <span style={{ color: '#0f172a' }}>{profile.phone || '—'}</span>
            </div>
            <div>
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.8rem' }}>Parent / Guardian</span>
              <span style={{ color: '#0f172a' }}>{profile.guardian_name || '—'}</span>
            </div>
            <div>
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.8rem' }}>Parent Contact</span>
              <span style={{ color: '#0f172a' }}>
                {[profile.guardian_phone, profile.guardian_email].filter(Boolean).join(' · ') || '—'}
              </span>
            </div>
          </div>

          <div style={{ marginTop: '1.75rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => setShowInfoModal(false)}
            >
              Close
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
