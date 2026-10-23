'use client';

import { StudentFeeAssignment } from './student-fee-assignment';
import { StudentPortalAccess } from './student-portal-access';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';
import { DirectPayment } from './direct-payment';
import { SandboxEnach } from './sandbox-enach';
import { FlexEditor } from './flex-editor';
import { MandateState } from './mandate-state';
import { downloadFinancialDocument } from './financial-download';
import { financialStatusClass } from './financial-status';

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

type FeeComponent = {
  id: string;
  label: string;
  code: string;
  amount_minor: string;
  account_reference: string;
};

const FEE_PRESETS = [
  { label: 'Custom Fee', code: 'OTHER', defaultAmount: '5000' },
  { label: 'Tuition Fee', code: 'TUIT', defaultAmount: '80000' },
  { label: 'Transport & Bus Facility', code: 'TRNP', defaultAmount: '15000' },
  { label: 'Hostel & Accommodation', code: 'HSTL', defaultAmount: '35000' },
  { label: 'Laboratory & Practical Fee', code: 'LAB', defaultAmount: '10000' },
  { label: 'Examination & Assessment', code: 'EXAM', defaultAmount: '5000' },
  { label: 'Library & Digital Content', code: 'LIB', defaultAmount: '3500' },
  { label: 'Sports & Physical Education', code: 'SPRT', defaultAmount: '4500' },
  { label: 'Annual Development Fee', code: 'DEV', defaultAmount: '20000' },
  { label: 'Activity & Cultural Club Fee', code: 'ACT', defaultAmount: '6000' },
];

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
  activity: [
    ['recorded_at', 'Date & Time'],
    ['action', 'Event / Action'],
    ['performed_by', 'Performed by'],
    ['status', 'Status'],
  ],
};

const sectionMeta: Record<Section, { title: string; icon: string; desc: string }> = {
  overview: {
    title: 'Overview',
    icon: '📊',
    desc: 'Balances summary, parent portal access credentials & fee structure',
  },
  components: {
    title: 'Components',
    icon: '🧩',
    desc: 'Tuition, development, transport, activity & lab fees catalog',
  },
  installments: {
    title: 'Fee structure(s)',
    icon: '📅',
    desc: 'Master annual schedule, customized flex terms & due dates',
  },
  payments: {
    title: 'Payments',
    icon: '💳',
    desc: 'Transaction receipts, direct collections & payment history',
  },
  bank: {
    title: 'Bank transfer',
    icon: '🏦',
    desc: 'Verified NEFT, RTGS, IMPS, cash, and cheque payments',
  },
  mandates: {
    title: 'Flex / eNACH',
    icon: '🔄',
    desc: 'NPCI eNACH autopay mandates & recurring debit simulation',
  },
  receipts: {
    title: 'Receipts',
    icon: '🧾',
    desc: 'Official fee receipts & tax compliance documents',
  },
  activity: {
    title: 'Activity',
    icon: '📋',
    desc: 'Institute audit log & ledger change history',
  },
};

export function StudentProfile({ studentId }: { studentId: string }) {
  const { request, session, can } = useAdminApi();
  const [viewMode, setViewMode] = useState<'tabs' | 'accordion'>('tabs');
  const [editing, setEditing] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState('');
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const [activePaymentMenuId, setActivePaymentMenuId] = useState<string | null>(null);

  // Component Add/Edit Modal State
  const [componentModal, setComponentModal] = useState<{
    open: boolean;
    mode: 'add' | 'edit';
    component?: FeeComponent;
  }>({ open: false, mode: 'add' });

  const [componentForm, setComponentForm] = useState({
    preset: 'Custom Fee',
    label: '',
    code: '',
    amountRupees: '',
    accountReference: '',
  });

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

  // Auto clear notice after 5 seconds
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(''), 5000);
      return () => clearTimeout(t);
    }
  }, [notice]);

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

  // Open Add Component Modal
  const openAddComponent = () => {
    setComponentForm({
      preset: 'Transport & Bus Facility',
      label: 'Transport & Bus Facility',
      code: 'TRNP',
      amountRupees: '15000',
      accountReference: profile?.student_reference || 'DPS-2026',
    });
    setComponentModal({ open: true, mode: 'add' });
  };

  // Open Edit Component Modal
  const openEditComponent = (comp: any) => {
    const rupees = String(Math.round(Number(comp.amount_minor || 0) / 100));
    setComponentForm({
      preset: 'Custom Fee',
      label: String(comp.label || ''),
      code: String(comp.code || ''),
      amountRupees: rupees,
      accountReference: String(comp.account_reference || profile?.student_reference || ''),
    });
    setComponentModal({ open: true, mode: 'edit', component: comp });
  };

  // Handle Preset Change
  const handlePresetSelect = (presetLabel: string) => {
    const found = FEE_PRESETS.find((p) => p.label === presetLabel);
    if (found) {
      if (found.label === 'Custom Fee') {
        setComponentForm((prev) => ({ ...prev, preset: presetLabel }));
      } else {
        setComponentForm((prev) => ({
          ...prev,
          preset: presetLabel,
          label: found.label,
          code: found.code,
          amountRupees: found.defaultAmount,
        }));
      }
    }
  };

  // Save Component (Add or Edit)
  const handleSaveComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!componentForm.label.trim()) {
      alert('Please enter a component name.');
      return;
    }
    const amountVal = parseFloat(componentForm.amountRupees);
    if (isNaN(amountVal) || amountVal < 0) {
      alert('Please enter a valid amount.');
      return;
    }
    const amountMinor = String(Math.round(amountVal * 100));

    try {
      const payload = {
        action: componentModal.mode,
        id: componentModal.component?.id,
        label: componentForm.label.trim(),
        code: (componentForm.code || 'FEE').trim().toUpperCase(),
        amount_minor: amountMinor,
        account_reference: componentForm.accountReference.trim() || profile?.student_reference,
      };

      const res = await request<{
        ok: boolean;
        rows: any[];
        net_payable_minor: string;
        outstanding_minor: string;
        message: string;
      }>('admin/fees/students/' + studentId + '/components', 'POST', payload);

      setComponentModal({ open: false, mode: 'add' });
      setNotice(
        componentModal.mode === 'add'
          ? `Added fee component "${payload.label}" successfully.`
          : `Updated fee component "${payload.label}" successfully.`,
      );

      // Refresh records and summary
      setRefresh((n) => n + 1);
    } catch {
      setNotice('Could not save component. Please retry.');
    }
  };

  // Delete Component
  const handleDeleteComponent = async (id: string, label: string) => {
    if (!window.confirm(`Are you sure you want to remove the fee component "${label}"?`)) {
      return;
    }
    try {
      await request('admin/fees/students/' + studentId + '/components', 'POST', {
        action: 'delete',
        id,
      });
      setNotice(`Fee component "${label}" removed.`);
      setRefresh((n) => n + 1);
    } catch {
      setNotice('Could not delete component. Please retry.');
    }
  };

  const renderRecordsTable = (targetSection: Section) => {
    const sec =
      targetSection === 'installments' && scheduleView === 'master' ? 'master' : targetSection;
    if (!columns[sec]) return null;

    if (!records || recordSection !== sec) {
      return !error ? (
        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#6c8f89' }}>
          <div style={{ display: 'inline-block', width: '20px', height: '20px', border: '2px solid #0f766e', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '8px' }} />
          <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading records…</p>
        </div>
      ) : null;
    }

    const isComponents = targetSection === 'components';

    return (
      <>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-block',
                background: '#eafbf4',
                color: '#075e47',
                border: '1px solid #a3ebce',
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}
            >
              {records.total} {records.total === 1 ? 'record' : 'records'}
            </span>
            {isComponents && (
              <span style={{ fontSize: '0.85rem', color: '#6c8f89' }}>
                Assigned fee schedule catalog
              </span>
            )}
          </div>

          {isComponents && (
            <button
              type="button"
              className="button primary"
              onClick={openAddComponent}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '9999px',
                fontSize: '0.82rem',
                fontWeight: 600,
                background: '#063331',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(6, 45, 42, 0.12)',
              }}
            >
              <span>+</span> Add Fee Component
            </button>
          )}
        </div>

        <div className="admin-table-wrap" style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(7, 53, 51, 0.08)' }}>
          <table className="admin-table">
            <thead>
              <tr style={{ background: '#f7fbf9' }}>
                {targetSection === 'payments' && <th style={{ width: '40px' }}></th>}
                {columns[sec]!.map(([colKey, title]) => (
                  <th
                    key={colKey}
                    className={colKey.endsWith('_minor') ? 'money' : ''}
                    style={{
                      color: '#063331',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(7, 53, 51, 0.08)',
                    }}
                  >
                    {title}
                  </th>
                ))}
                {isComponents && (
                  <th style={{ width: '130px', textAlign: 'right', padding: '12px 16px', color: '#063331', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>
                    Actions
                  </th>
                )}
                {['receipts', 'mandates'].includes(targetSection) && <th style={{ padding: '12px 16px' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {records.rows.map((row, idx) => (
                <tr key={String(row.id || idx)} style={{ transition: 'background 0.15s ease' }}>
                  {targetSection === 'payments' && (
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
                          color: '#6c8f89',
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
                            border: '1px solid rgba(7, 53, 51, 0.12)',
                            borderRadius: '12px',
                            boxShadow: '0 14px 35px -3px rgba(6, 45, 42, 0.12)',
                            zIndex: 40,
                            minWidth: '220px',
                            overflow: 'hidden',
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
                              padding: '0.6rem 0.9rem',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              color: '#063331',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0faf6')}
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
                              padding: '0.6rem 0.9rem',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              color: '#063331',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0faf6')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                          >
                            🖨️ Print Payment Receipt
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActivePaymentMenuId(null);
                              setNotice('Payment confirmation sent to parent via SMS and Email.');
                            }}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '0.6rem 0.9rem',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              color: '#063331',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0faf6')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                          >
                            ✉️ Send Confirmation to Parent
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                  {columns[sec]!.map(([colKey]) => (
                    <td
                      key={colKey}
                      className={colKey.endsWith('_minor') ? 'money' : ''}
                      style={{ padding: '14px 16px', fontSize: '0.88rem' }}
                    >
                      {colKey === 'code' ? (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            background: '#f0faf6',
                            color: '#0f766e',
                            border: '1px solid rgba(15, 118, 110, 0.2)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          {String(row[colKey] || '—')}
                        </span>
                      ) : colKey === 'label' ? (
                        <strong style={{ color: '#063331', fontWeight: 600 }}>
                          {String(row[colKey] || '—')}
                        </strong>
                      ) : colKey.endsWith('_minor') ? (
                        <strong style={{ color: '#063331', fontWeight: 600 }}>
                          {formatMoney(row[colKey] ?? 0)}
                        </strong>
                      ) : colKey.endsWith('_at') || colKey === 'due_date' ? (
                        !row[colKey] || !Number.isFinite(new Date(row[colKey]!).getTime()) ? (
                          '—'
                        ) : (
                          new Intl.DateTimeFormat('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'Asia/Kolkata',
                          }).format(new Date(row[colKey]!))
                        )
                      ) : colKey === 'status' ? (
                        <span className={financialStatusClass(row[colKey])}>
                          {String(row[colKey] ?? 'recorded').replaceAll('_', ' ')}
                        </span>
                      ) : (
                        String(row[colKey] ?? '—').replaceAll('_', ' ')
                      )}
                    </td>
                  ))}

                  {/* Components Row Actions: Edit & Delete */}
                  {isComponents && (
                    <td style={{ textAlign: 'right', padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => openEditComponent(row)}
                        title="Edit fee component"
                        style={{
                          background: '#f0faf6',
                          color: '#063331',
                          border: '1px solid rgba(7, 53, 51, 0.12)',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          marginRight: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>✏️</span> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteComponent(String(row.id), String(row.label))}
                        title="Delete fee component"
                        style={{
                          background: '#fff0f1',
                          color: '#8e1f2b',
                          border: '1px solid #fecdd3',
                          padding: '4px 8px',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                        }}
                      >
                        🗑️
                      </button>
                    </td>
                  )}

                  {targetSection === 'mandates' && (
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
                  {targetSection === 'receipts' && (
                    <td>
                      <button
                        className="button secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', borderRadius: '8px' }}
                        onClick={() => handleDownloadReceipt(String(row.id))}
                      >
                        📥 Download receipt
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isComponents && records.rows.length > 0 && (
          <div
            style={{
              marginTop: '12px',
              padding: '12px 16px',
              background: '#f7fbf9',
              borderRadius: '12px',
              border: '1px solid rgba(7, 53, 51, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '0.85rem', color: '#6c8f89', fontWeight: 500 }}>
              Total Component Sum ({records.rows.length} heads):
            </span>
            <strong style={{ fontSize: '1.05rem', color: '#063331', fontWeight: 700 }}>
              {formatMoney(
                records.rows.reduce(
                  (acc, r) => acc + Number(r.amount_minor || 0),
                  0,
                ),
              )}
            </strong>
          </div>
        )}

        {!records.rows.length && (
          <div className="empty-state" style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
            <h4 style={{ color: '#063331', margin: '0 0 6px' }}>No records yet</h4>
            <p style={{ color: '#6c8f89', margin: 0, fontSize: '0.88rem' }}>
              {isComponents
                ? 'No fee components assigned. Click "+ Add Fee Component" above to add fees.'
                : 'Records will appear when transactions are completed.'}
            </p>
          </div>
        )}

        {records.total > records.pageSize && (
          <nav
            className="admin-toolbar"
            aria-label="Financial record pages"
            style={{ marginTop: '1rem' }}
          >
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
        )}
      </>
    );
  };

  const renderSectionContent = (targetSection: Section) => {
    if (!profile) return null;

    if (targetSection === 'overview') {
      return (
        <div>
          <p style={{ color: '#6c8f89', margin: '0 0 1.25rem', fontSize: '0.9rem' }}>
            All assigned fee schedules and current receivable balances for{' '}
            <strong style={{ color: '#063331' }}>{profile.full_name}</strong>.
          </p>
          <div className="admin-table-wrap" style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(7, 53, 51, 0.08)' }}>
            <table className="admin-table">
              <thead>
                <tr style={{ background: '#f7fbf9' }}>
                  <th style={{ color: '#063331', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', padding: '12px 16px' }}>Account</th>
                  <th className="money" style={{ color: '#063331', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', padding: '12px 16px' }}>Net payable</th>
                  <th className="money" style={{ color: '#063331', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', padding: '12px 16px' }}>Paid</th>
                  <th className="money" style={{ color: '#063331', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', padding: '12px 16px' }}>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {profile.balances.map((balance) => (
                  <tr key={balance.schedule_id}>
                    <td style={{ padding: '14px 16px' }}>
                      <strong style={{ color: '#063331' }}>{balance.account_reference}</strong>
                    </td>
                    <td className="money" style={{ padding: '14px 16px', fontWeight: 600 }}>
                      {formatMoney(balance.net_payable_minor)}
                    </td>
                    <td className="money" style={{ padding: '14px 16px', color: '#16a34a', fontWeight: 600 }}>
                      {formatMoney(balance.paid_minor)}
                    </td>
                    <td className="money" style={{ padding: '14px 16px', color: '#dc2626', fontWeight: 600 }}>
                      {formatMoney(balance.outstanding_minor)}
                    </td>
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
        </div>
      );
    }

    if (targetSection === 'installments') {
      return (
        <div>
          <div
            style={{
              marginBottom: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div className="row" aria-label="Schedule type" style={{ gap: '8px' }}>
              <button
                className={`button ${scheduleView === 'master' ? 'primary' : 'secondary'}`}
                aria-pressed={scheduleView === 'master'}
                style={{ borderRadius: '9999px', padding: '6px 16px' }}
                onClick={() => {
                  setScheduleView('master');
                  setPage(1);
                }}
              >
                Master Schedule
              </button>
              <button
                className={`button ${scheduleView === 'flex' ? 'primary' : 'secondary'}`}
                aria-pressed={scheduleView === 'flex'}
                style={{ borderRadius: '9999px', padding: '6px 16px' }}
                onClick={() => {
                  setScheduleView('flex');
                  setPage(1);
                }}
              >
                Flex Schedule
              </button>
            </div>
            {scheduleView === 'flex' && (
              <div className="row" style={{ alignItems: 'center', gap: '0.5rem' }}>
                {profile.balances.map((balance) => (
                  <button
                    key={balance.schedule_id}
                    className="button secondary"
                    style={{ borderRadius: '9999px', fontSize: '0.85rem' }}
                    disabled={session.tenant.readOnly || !can('fee.schedule.edit')}
                    onClick={() => setEditing(balance.schedule_id)}
                  >
                    ✏️ Customize Flex ({balance.account_reference})
                  </button>
                ))}
              </div>
            )}
          </div>
          {renderRecordsTable('installments')}
        </div>
      );
    }

    if (targetSection === 'mandates') {
      return (
        <div>
          <SandboxEnach
            studentId={studentId}
            studentName={profile.full_name}
            schedules={profile.balances}
            onChanged={(msg) => {
              setNotice(msg || 'Collection records updated.');
              setRefresh((n) => n + 1);
            }}
          />
          <div style={{ marginTop: '1.75rem' }}>
            <h4 style={{ marginBottom: '0.75rem', color: '#063331', fontWeight: 600 }}>Active eNACH Mandates</h4>
            {renderRecordsTable('mandates')}
          </div>
        </div>
      );
    }

    if (targetSection === 'bank') {
      return (
        <div>
          <div
            className="row"
            style={{
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <p style={{ margin: 0, color: '#6c8f89', fontSize: '0.9rem' }}>
              Record direct collections received via Cash, NEFT, RTGS, IMPS, Cheque, DD, or Bank Transfer.
            </p>
            <button
              className="button primary"
              style={{ borderRadius: '9999px', padding: '6px 16px' }}
              disabled={session.tenant.readOnly || !can('payment.evidence.record')}
              onClick={() => setPaying(true)}
            >
              + Record Direct Payment
            </button>
          </div>
          {renderRecordsTable('bank')}
        </div>
      );
    }

    return (
      <div>
        {targetSection === 'payments' && (
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
            <p style={{ margin: 0, color: '#6c8f89', fontSize: '0.9rem' }}>
              Official payment receipts issued and direct payment transactions for this student.
            </p>
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
                padding: '6px 14px',
                borderRadius: '9999px',
                fontSize: '0.85rem',
              }}
            >
              + Add direct payment
            </button>
          </div>
        )}
        {targetSection === 'components' && (
          <p style={{ color: '#6c8f89', margin: '0 0 1rem', fontSize: '0.9rem' }}>
            Breakdown of academic fee components assigned for academic year{' '}
            {profile.academic_year || '2026-27'}. You can customize, edit amounts, or add other fees.
          </p>
        )}
        {targetSection === 'receipts' && (
          <p style={{ color: '#6c8f89', margin: '0 0 1rem', fontSize: '0.9rem' }}>
            Official fee receipts with serial numbers and downloadable payment documentation.
          </p>
        )}
        {targetSection === 'activity' && (
          <p style={{ color: '#6c8f89', margin: '0 0 1rem', fontSize: '0.9rem' }}>
            Audit trail of all administrative and financial activities recorded for {profile.full_name}.
          </p>
        )}
        {renderRecordsTable(targetSection)}
      </div>
    );
  };

  const studentInitials = useMemo(() => {
    if (!profile?.full_name) return 'VR';
    const parts = profile.full_name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }, [profile?.full_name]);

  const collectionPercentage = useMemo(() => {
    if (!profile) return 0;
    const net = Number(profile.summary.net_payable_minor || 0);
    const paid = Number(profile.summary.paid_minor || 0);
    if (net <= 0) return 0;
    return Math.min(100, Math.round((paid / net) * 100));
  }, [profile]);

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

      {notice && (
        <div
          role="status"
          style={{
            background: '#eafbf4',
            color: '#075e47',
            border: '1px solid #a3ebce',
            padding: '10px 16px',
            borderRadius: '12px',
            margin: '0 0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(6, 45, 42, 0.05)',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
        >
          <span>✓ {notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#075e47', fontSize: '1rem' }}
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="error-card" style={{ marginBottom: '16px' }}>
          <p>{error}</p>
          <button className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}

      {!profile ? (
        !error && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6c8f89' }}>
            <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid #0f766e', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '12px' }} />
            <p style={{ margin: 0, fontSize: '0.95rem' }}>Loading student financial profile…</p>
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 1. SaaS Hero Profile Header Card (Dashboard Overview Design System) */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              border: '1px solid rgba(7, 53, 51, 0.08)',
              padding: '24px 28px',
              boxShadow: '0 10px 30px -4px rgba(6, 45, 42, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Top Toolbar: Back Navigation & Top Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <Link
                href="/admin/students/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#f0faf6',
                  color: '#063331',
                  border: '1px solid rgba(7, 53, 51, 0.1)',
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'background 0.15s ease',
                }}
              >
                <span>←</span> Back to Students
              </Link>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowInfoModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#ffffff',
                    color: '#063331',
                    border: '1px solid rgba(7, 53, 51, 0.15)',
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <span>ⓘ</span> Student Info
                </button>

                <button
                  type="button"
                  className="button primary"
                  disabled={session.tenant.readOnly || !can('payment.evidence.record')}
                  onClick={() => setPaying(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#063331',
                    color: '#ffffff',
                    border: 'none',
                    padding: '7px 16px',
                    borderRadius: '9999px',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(6, 45, 42, 0.12)',
                  }}
                >
                  <span>+</span> Add direct payment
                </button>

                <button
                  type="button"
                  onClick={() => setShowActionsDropdown((prev) => !prev)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: '#f0faf6',
                    color: '#063331',
                    border: '1px solid rgba(7, 53, 51, 0.15)',
                    padding: '7px 12px',
                    borderRadius: '9999px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <span>≡</span> Actions <span>▾</span>
                </button>

                {showActionsDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '115%',
                      background: '#ffffff',
                      border: '1px solid rgba(7, 53, 51, 0.12)',
                      borderRadius: '16px',
                      boxShadow: '0 14px 35px -3px rgba(6, 45, 42, 0.12)',
                      minWidth: '220px',
                      zIndex: 50,
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
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        color: '#063331',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0faf6')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <span>📄</span> Download Statement
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
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        color: '#063331',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0faf6')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <span>ⓘ</span> View Student Info
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
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        color: '#063331',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0faf6')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <span>💳</span> Record Direct Payment
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Identity Details */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #0f766e 0%, #063331 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  boxShadow: '0 4px 14px rgba(6, 45, 42, 0.2)',
                  flexShrink: 0,
                }}
              >
                {studentInitials}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: '#063331',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {profile.full_name}
                  </h1>
                  <span
                    style={{
                      background: '#eafbf4',
                      color: '#075e47',
                      border: '1px solid #a3ebce',
                      padding: '2px 10px',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    ● {profile.status || 'Enrolled'}
                  </span>
                  <span
                    style={{
                      background: profile.enach_status === 'active' ? '#eafbf4' : '#fffbeb',
                      color: profile.enach_status === 'active' ? '#075e47' : '#92400e',
                      border: `1px solid ${profile.enach_status === 'active' ? '#a3ebce' : '#fde68a'}`,
                      padding: '2px 10px',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    eNACH: {(profile.enach_status || 'pending').replaceAll('_', ' ')}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    color: '#6c8f89',
                    fontSize: '0.85rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>🏫 {profile.institute}</span>
                  <span>•</span>
                  <span>🎓 {profile.course} · {profile.grade || profile.group_name || 'Grade 10'}</span>
                  <span>•</span>
                  <span>🆔 {profile.student_reference}</span>
                  {profile.phone && (
                    <>
                      <span>•</span>
                      <span>📞 {profile.phone}</span>
                    </>
                  )}
                  {profile.email && (
                    <>
                      <span>•</span>
                      <span>✉️ {profile.email}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Three Pastel Metric Cards (Matching Finance Dashboard Overview Design System) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {/* Card 1: Net Payable (Pastel Aqua/Mint) */}
            <div
              className="dashboard-stat finance-metric stat-pastel-mint"
              style={{
                borderRadius: '24px',
                padding: '22px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(6, 45, 42, 0.04)',
                border: 'none',
              }}
            >
              <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-card-icon-pill" style={{ background: 'rgba(6, 72, 64, 0.1)', color: '#064840', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                  📋
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2b6d63', background: 'rgba(255,255,255,0.6)', padding: '2px 8px', borderRadius: '9999px' }}>
                  AY {profile.academic_year || '2026-27'}
                </span>
              </div>
              <span className="stat-card-label" style={{ color: '#2b6d63', fontSize: '0.85rem', fontWeight: 600 }}>
                Net Payable (Total Fee)
              </span>
              <strong className="stat-card-value" style={{ color: '#064840', fontSize: '1.75rem', fontWeight: 800 }}>
                {formatMoney(profile.summary.net_payable_minor)}
              </strong>
              <div style={{ marginTop: 'auto', paddingTop: '4px', fontSize: '0.78rem', color: '#2b6d63', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>✓</span> Assigned across academic fee schedule
              </div>
            </div>

            {/* Card 2: Paid Amount (Pastel Lime) */}
            <div
              className="dashboard-stat finance-metric stat-pastel-lime"
              style={{
                borderRadius: '24px',
                padding: '22px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(6, 45, 42, 0.04)',
                border: 'none',
              }}
            >
              <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-card-icon-pill" style={{ background: 'rgba(31, 72, 11, 0.1)', color: '#1f480b', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                  💳
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4a6834', background: 'rgba(255,255,255,0.6)', padding: '2px 8px', borderRadius: '9999px' }}>
                  {collectionPercentage}% Collected
                </span>
              </div>
              <span className="stat-card-label" style={{ color: '#4a6834', fontSize: '0.85rem', fontWeight: 600 }}>
                Paid Amount
              </span>
              <strong className="stat-card-value" style={{ color: '#1f480b', fontSize: '1.75rem', fontWeight: 800 }}>
                {formatMoney(profile.summary.paid_minor)}
              </strong>
              <div style={{ marginTop: 'auto', paddingTop: '4px', fontSize: '0.78rem', color: '#4a6834', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>●</span> Verified collections to date
              </div>
            </div>

            {/* Card 3: Outstanding Dues (Pastel Coral) */}
            <div
              className="dashboard-stat finance-metric stat-pastel-coral"
              style={{
                borderRadius: '24px',
                padding: '22px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(6, 45, 42, 0.04)',
                border: 'none',
              }}
            >
              <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-card-icon-pill" style={{ background: 'rgba(97, 26, 33, 0.1)', color: '#611a21', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                  ⏳
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#8a434a', background: 'rgba(255,255,255,0.6)', padding: '2px 8px', borderRadius: '9999px' }}>
                  Balance Due
                </span>
              </div>
              <span className="stat-card-label" style={{ color: '#8a434a', fontSize: '0.85rem', fontWeight: 600 }}>
                Outstanding
              </span>
              <strong className="stat-card-value" style={{ color: '#611a21', fontSize: '1.75rem', fontWeight: 800 }}>
                {formatMoney(profile.summary.outstanding_minor)}
              </strong>
              <div style={{ marginTop: 'auto', paddingTop: '4px', fontSize: '0.78rem', color: '#8a434a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>⚠️</span> Pending recurring debit / installments
              </div>
            </div>
          </div>

          {/* 3. Workflow & Options Tabs Bar (Dashboard Overview Style) */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              border: '1px solid rgba(7, 53, 51, 0.08)',
              boxShadow: '0 10px 30px -4px rgba(6, 45, 42, 0.05)',
              overflow: 'hidden',
            }}
          >
            {/* Nav Switcher Header */}
            <div
              style={{
                padding: '14px 24px',
                borderBottom: '1px solid rgba(7, 53, 51, 0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                background: '#f7fbf9',
              }}
            >
              {/* Segmented Pill Tabs */}
              <nav
                aria-label="Student management sections"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  overflowX: 'auto',
                  maxWidth: '100%',
                  paddingBottom: '2px',
                }}
              >
                {sections.map(([key, label]) => {
                  const isSelected = section === key;
                  const meta = sectionMeta[key];
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => pick(key)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 14px',
                        borderRadius: '9999px',
                        fontSize: '0.84rem',
                        fontWeight: isSelected ? 700 : 500,
                        background: isSelected ? '#063331' : 'transparent',
                        color: isSelected ? '#ffffff' : '#476863',
                        border: isSelected ? 'none' : '1px solid transparent',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: isSelected ? '0 4px 12px rgba(6, 45, 42, 0.15)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = '#eafbf4';
                          e.currentTarget.style.color = '#063331';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#476863';
                        }
                      }}
                    >
                      <span>{meta.icon}</span>
                      <span>{label}</span>
                      {key === 'components' && records && section === 'components' && (
                        <span
                          style={{
                            background: isSelected ? 'rgba(255,255,255,0.2)' : '#eafbf4',
                            color: isSelected ? '#ffffff' : '#075e47',
                            padding: '1px 6px',
                            borderRadius: '9999px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                          }}
                        >
                          {records.total}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* View layout toggle: Tabs vs Accordion */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#ffffff',
                  padding: '3px',
                  borderRadius: '9999px',
                  border: '1px solid rgba(7, 53, 51, 0.1)',
                  gap: '2px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('tabs')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: viewMode === 'tabs' ? '#0f766e' : 'transparent',
                    color: viewMode === 'tabs' ? '#ffffff' : '#6c8f89',
                  }}
                >
                  Horizontal View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('accordion')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: viewMode === 'accordion' ? '#0f766e' : 'transparent',
                    color: viewMode === 'accordion' ? '#ffffff' : '#6c8f89',
                  }}
                >
                  Expandable Cards
                </button>
              </div>
            </div>

            {/* Active Content Body */}
            {viewMode === 'tabs' ? (
              <div style={{ padding: '24px 28px', minHeight: '380px' }}>
                {renderSectionContent(section)}
              </div>
            ) : (
              /* Accordion View Mode */
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sections.map(([key, label]) => {
                  const isSelected = section === key;
                  const meta = sectionMeta[key];
                  return (
                    <div
                      key={key}
                      style={{
                        borderRadius: '16px',
                        border: isSelected ? '1.5px solid #0f766e' : '1px solid rgba(7, 53, 51, 0.08)',
                        overflow: 'hidden',
                        background: '#ffffff',
                        boxShadow: isSelected ? '0 4px 14px rgba(15, 118, 110, 0.08)' : 'none',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => pick(key)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '14px 20px',
                          background: isSelected ? '#f0faf6' : '#ffffff',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '1.25rem' }}>{meta.icon}</span>
                          <div>
                            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#063331', display: 'block' }}>
                              {label}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: '#6c8f89' }}>
                              {meta.desc}
                            </span>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: isSelected ? '#0f766e' : '#6c8f89',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isSelected ? '▲ Expanded' : '▼ View details'}
                        </span>
                      </button>

                      {isSelected && (
                        <div style={{ padding: '20px', borderTop: '1px solid rgba(7, 53, 51, 0.08)' }}>
                          {renderSectionContent(key)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Add / Edit Fee Component Modal */}
      {componentModal.open && (
        <>
          <div
            className="finance-dialog-backdrop"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(6, 45, 42, 0.48)',
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)',
              zIndex: 9998,
            }}
            onClick={() => setComponentModal({ open: false, mode: 'add' })}
          />
          <dialog
            open
            className="finance-dialog"
            aria-label="Fee Component Settings"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              margin: 0,
              zIndex: 9999,
              width: '92%',
              maxWidth: '520px',
              borderRadius: '24px',
              background: '#ffffff',
              border: '1px solid rgba(7, 53, 51, 0.1)',
              boxShadow: '0 25px 50px -12px rgba(6, 45, 42, 0.25)',
              padding: '24px 28px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(7, 53, 51, 0.08)',
                paddingBottom: '12px',
                marginBottom: '16px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#063331', fontWeight: 700 }}>
                {componentModal.mode === 'add' ? 'Add Academic Fee Component' : 'Edit Fee Component'}
              </h3>
              <button
                type="button"
                onClick={() => setComponentModal({ open: false, mode: 'add' })}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: '#6c8f89',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveComponent} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Preset Selector */}
              {componentModal.mode === 'add' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#063331', marginBottom: '4px' }}>
                    Quick Fee Category Preset
                  </label>
                  <select
                    value={componentForm.preset}
                    onChange={(e) => handlePresetSelect(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(7, 53, 51, 0.18)',
                      background: '#f7fbf9',
                      fontSize: '0.88rem',
                      color: '#063331',
                    }}
                  >
                    {FEE_PRESETS.map((p) => (
                      <option key={p.label} value={p.label}>
                        {p.label} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Component Label */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#063331', marginBottom: '4px' }}>
                  Component Name / Fee Head *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Transport & Bus Facility"
                  value={componentForm.label}
                  onChange={(e) => setComponentForm((prev) => ({ ...prev, label: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(7, 53, 51, 0.18)',
                    fontSize: '0.88rem',
                    color: '#063331',
                  }}
                />
              </div>

              {/* Code and Amount Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#063331', marginBottom: '4px' }}>
                    Component Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TRNP"
                    value={componentForm.code}
                    onChange={(e) => setComponentForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(7, 53, 51, 0.18)',
                      fontSize: '0.88rem',
                      fontFamily: 'var(--font-mono, monospace)',
                      color: '#063331',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#063331', marginBottom: '4px' }}>
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 15000"
                    value={componentForm.amountRupees}
                    onChange={(e) => setComponentForm((prev) => ({ ...prev, amountRupees: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(7, 53, 51, 0.18)',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      color: '#063331',
                    }}
                  />
                </div>
              </div>

              {/* Account Reference */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#063331', marginBottom: '4px' }}>
                  Allocation Account Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. test or DPS-2026-089"
                  value={componentForm.accountReference}
                  onChange={(e) => setComponentForm((prev) => ({ ...prev, accountReference: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(7, 53, 51, 0.18)',
                    fontSize: '0.88rem',
                    color: '#063331',
                  }}
                />
              </div>

              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="button secondary"
                  style={{ borderRadius: '9999px', padding: '7px 16px', fontSize: '0.85rem' }}
                  onClick={() => setComponentModal({ open: false, mode: 'add' })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button primary"
                  style={{
                    borderRadius: '9999px',
                    padding: '7px 20px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    background: '#063331',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {componentModal.mode === 'add' ? 'Add Component' : 'Save Changes'}
                </button>
              </div>
            </form>
          </dialog>
        </>
      )}

      {/* 5. Student Info Modal */}
      {showInfoModal && profile && (
        <>
          <div
            className="finance-dialog-backdrop"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(6, 45, 42, 0.48)',
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)',
              zIndex: 9998,
            }}
            onClick={() => setShowInfoModal(false)}
          />
          <dialog
            open
            className="finance-dialog"
            aria-label="Student Information"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              margin: 0,
              zIndex: 9999,
              width: '92%',
              maxWidth: '560px',
              borderRadius: '24px',
              background: '#ffffff',
              border: '1px solid rgba(7, 53, 51, 0.1)',
              boxShadow: '0 25px 50px -12px rgba(6, 45, 42, 0.25)',
              padding: '24px 28px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(7, 53, 51, 0.08)',
                paddingBottom: '12px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#063331', fontWeight: 700 }}>
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
                  color: '#6c8f89',
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
                gap: '14px',
                marginTop: '16px',
                fontSize: '0.88rem',
              }}
            >
              <div>
                <span style={{ display: 'block', color: '#6c8f89', fontSize: '0.78rem', fontWeight: 500 }}>Full Name</span>
                <strong style={{ color: '#063331' }}>{profile.full_name}</strong>
              </div>
              <div>
                <span style={{ display: 'block', color: '#6c8f89', fontSize: '0.78rem', fontWeight: 500 }}>Enrollment Number</span>
                <strong style={{ color: '#063331' }}>{profile.student_reference}</strong>
              </div>
              <div>
                <span style={{ display: 'block', color: '#6c8f89', fontSize: '0.78rem', fontWeight: 500 }}>Institute</span>
                <span style={{ color: '#063331' }}>{profile.institute}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: '#6c8f89', fontSize: '0.78rem', fontWeight: 500 }}>Campus</span>
                <span style={{ color: '#063331' }}>{profile.campus || 'Delhi Main Campus'}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: '#6c8f89', fontSize: '0.78rem', fontWeight: 500 }}>Course / Program</span>
                <span style={{ color: '#063331' }}>{profile.course || '—'}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: '#6c8f89', fontSize: '0.78rem', fontWeight: 500 }}>Grade / Batch</span>
                <span style={{ color: '#063331' }}>
                  {[profile.grade, profile.group_name].filter(Boolean).join(' · ') || '—'}
                </span>
              </div>
              <div>
                <span style={{ display: 'block', color: '#6c8f89', fontSize: '0.78rem', fontWeight: 500 }}>Academic Year</span>
                <span style={{ color: '#063331' }}>{profile.academic_year || 'Current'}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: '#6c8f89', fontSize: '0.78rem', fontWeight: 500 }}>Enrollment Status</span>
                <span className="status-pill">{profile.status}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: '#6c8f89', fontSize: '0.78rem', fontWeight: 500 }}>Student Email</span>
                <span style={{ color: '#063331' }}>{profile.email || '—'}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: '#6c8f89', fontSize: '0.78rem', fontWeight: 500 }}>Student Phone</span>
                <span style={{ color: '#063331' }}>{profile.phone || '—'}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: '#6c8f89', fontSize: '0.78rem', fontWeight: 500 }}>Parent / Guardian</span>
                <span style={{ color: '#063331' }}>{profile.guardian_name || '—'}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: '#6c8f89', fontSize: '0.78rem', fontWeight: 500 }}>Parent Contact</span>
                <span style={{ color: '#063331' }}>
                  {[profile.guardian_phone, profile.guardian_email].filter(Boolean).join(' · ') || '—'}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="button secondary"
                style={{ borderRadius: '9999px', padding: '6px 18px' }}
                onClick={() => setShowInfoModal(false)}
              >
                Close
              </button>
            </div>
          </dialog>
        </>
      )}
    </>
  );
}
