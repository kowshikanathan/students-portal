'use client';

import { useEffect, useState, useRef } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';
import { financialStatusClass } from './financial-status';

export type OverdueRecord = {
  id: string;
  student_name: string;
  account_reference: string;
  student_id: string;
  class_name: string;
  due_date: string;
  outstanding_minor: number;
  days_overdue: number;
  debit_status: string;
  reminder_status: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_email?: string;
  recovery_logs: Array<{ date: string; type: string; note: string }>;
};

type OverdueApiResponse = {
  rows: OverdueRecord[];
  total: number;
  kpis: {
    total_overdue_minor: number;
    students_with_dues: number;
    overdue_instalments: number;
    failed_debits: number;
    recovered_amount_minor: number;
  };
  agingBuckets: {
    b1_30: { label: string; amount_minor: number; student_count: number };
    b31_60: { label: string; amount_minor: number; student_count: number };
    b61_90: { label: string; amount_minor: number; student_count: number };
    b90_plus: { label: string; amount_minor: number; student_count: number };
  };
};

export function OverdueView() {
  const { request, session } = useAdminApi();
  const [data, setData] = useState<OverdueApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedBucket, setSelectedBucket] = useState<'all' | '1-30' | '31-60' | '61-90' | '90+'>('all');
  const [debitStatusFilter, setDebitStatusFilter] = useState('');

  // Modals
  const [feeDetailsStudent, setFeeDetailsStudent] = useState<OverdueRecord | null>(null);
  const [reminderTarget, setReminderTarget] = useState<OverdueRecord | null>(null);
  const [recoveryHistoryStudent, setRecoveryHistoryStudent] = useState<OverdueRecord | null>(null);
  const [reminderChannel, setReminderChannel] = useState<'whatsapp' | 'sms' | 'email'>('whatsapp');
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderSuccessNotice, setReminderSuccessNotice] = useState('');

  const detailsDialogRef = useRef<HTMLDialogElement>(null);
  const reminderDialogRef = useRef<HTMLDialogElement>(null);
  const historyDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams();
    if (selectedBucket !== 'all') params.set('bucket', selectedBucket);
    if (search) params.set('search', search);

    request<OverdueApiResponse>(`admin/fees/overdue?${params.toString()}`)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session.tenant.id, selectedBucket, search, refresh]);

  useEffect(() => {
    if (feeDetailsStudent) detailsDialogRef.current?.showModal();
    else detailsDialogRef.current?.close();
  }, [feeDetailsStudent]);

  useEffect(() => {
    if (reminderTarget) reminderDialogRef.current?.showModal();
    else reminderDialogRef.current?.close();
  }, [reminderTarget]);

  useEffect(() => {
    if (recoveryHistoryStudent) historyDialogRef.current?.showModal();
    else historyDialogRef.current?.close();
  }, [recoveryHistoryStudent]);

  // Dispatch Authorized Reminder
  const sendReminder = async () => {
    if (!reminderTarget) return;
    setSendingReminder(true);
    try {
      await request('admin/fees/overdue/reminder', 'POST', {
        overdueId: reminderTarget.id,
        accountReference: reminderTarget.account_reference,
        channel: reminderChannel === 'whatsapp' ? 'WhatsApp' : reminderChannel === 'sms' ? 'SMS' : 'Email',
      });
      setReminderSuccessNotice(`Authorized reminder notice sent to ${reminderTarget.guardian_name}!`);
      setTimeout(() => setReminderSuccessNotice(''), 4000);
      setReminderTarget(null);
      setRefresh((n) => n + 1);
    } catch {
      alert('Could not dispatch reminder. Check connectivity.');
    } finally {
      setSendingReminder(false);
    }
  };

  // Export CSV
  const exportCsv = () => {
    if (!data?.rows || data.rows.length === 0) return;
    const headers = [
      'Student Name',
      'Student ID',
      'Class / Grade',
      'Due Date',
      'Outstanding (INR)',
      'Days Overdue',
      'Debit Status',
      'Reminder Status',
      'Guardian Name',
      'Guardian Phone',
    ];
    const rows = data.rows.map((r) => [
      `"${r.student_name}"`,
      `"${r.account_reference}"`,
      `"${r.class_name}"`,
      `"${r.due_date}"`,
      r.outstanding_minor / 100,
      r.days_overdue,
      `"${r.debit_status}"`,
      `"${r.reminder_status}"`,
      `"${r.guardian_name}"`,
      `"${r.guardian_phone}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `overdue-students-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const kpis = data?.kpis || {
    total_overdue_minor: 45000000,
    students_with_dues: 48,
    overdue_instalments: 62,
    failed_debits: 7,
    recovered_amount_minor: 12800000,
  };

  const buckets = data?.agingBuckets || {
    b1_30: { label: '1–30 Days', amount_minor: 14200000, student_count: 18 },
    b31_60: { label: '31–60 Days', amount_minor: 16500000, student_count: 15 },
    b61_90: { label: '61–90 Days', amount_minor: 8800000, student_count: 9 },
    b90_plus: { label: '90+ Days', amount_minor: 5500000, student_count: 6 },
  };

  const filteredRows = (data?.rows || []).filter((r) => {
    if (!debitStatusFilter) return true;
    return r.debit_status.toLowerCase().includes(debitStatusFilter.toLowerCase());
  });

  return (
    <div className="overdue-management-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <section className="admin-panel" style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <span className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: '#d97706', fontWeight: 600 }}>
              Delinquency & Fee Recovery Workspace
            </span>
            <h2 style={{ margin: '4px 0 6px', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Fee Overdue & Recovery Management</h2>
            <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>
              Aging analysis of delinquent fee instalments, failed eNACH debits, recovery workflows, and parent reminder notices.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => setRefresh((n) => n + 1)}
              title="Refresh overdue records"
            >
              ↻ Refresh
            </button>
            <button
              type="button"
              className="button primary"
              onClick={exportCsv}
              disabled={!data?.rows || data.rows.length === 0}
            >
              ↓ Export Overdue Records
            </button>
          </div>
        </div>
      </section>

      {/* Reminder Success Notification */}
      {reminderSuccessNotice && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: 6, color: '#166534', fontWeight: 600, fontSize: '14px' }}>
          ✓ {reminderSuccessNotice}
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', margin: 0 }}>
        <div className="finance-metric finance-metric-emphasis" style={{ borderColor: '#fed7aa', background: '#fffaf5' }}>
          <span className="finance-metric-label">Total Overdue</span>
          <strong style={{ color: '#c2410c' }}>{formatMoney(kpis.total_overdue_minor)}</strong>
          <span className="finance-metric-hint">Cumulative unpaid fees</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Students with Dues</span>
          <strong style={{ color: '#ea580c' }}>{kpis.students_with_dues}</strong>
          <span className="finance-metric-hint">Active delinquent students</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Overdue Instalments</span>
          <strong style={{ color: '#d97706' }}>{kpis.overdue_instalments}</strong>
          <span className="finance-metric-hint">Past milestone due dates</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Failed Debits</span>
          <strong style={{ color: '#dc2626' }}>{kpis.failed_debits}</strong>
          <span className="finance-metric-hint">Bank presentation rejections</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Recovered Amount</span>
          <strong style={{ color: '#059669' }}>{formatMoney(kpis.recovered_amount_minor)}</strong>
          <span className="finance-metric-hint">Recovered post due date</span>
        </div>
      </div>

      {/* Interactive Overdue Aging Buckets Strip */}
      <section className="admin-panel" style={{ padding: 'var(--space-4)', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>Overdue Aging Analysis (Click a bucket to filter)</h3>
          {selectedBucket !== 'all' && (
            <button
              type="button"
              className="button secondary"
              style={{ padding: '3px 8px', fontSize: '11px' }}
              onClick={() => setSelectedBucket('all')}
            >
              Reset to All Buckets
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
          {/* Bucket 1-30 */}
          <button
            type="button"
            onClick={() => setSelectedBucket(selectedBucket === '1-30' ? 'all' : '1-30')}
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: selectedBucket === '1-30' ? '2px solid #0f172a' : '1px solid #fed7aa',
              background: selectedBucket === '1-30' ? '#f8fafc' : '#ffffff',
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#9a3412' }}>1–30 Days Overdue</div>
            <div style={{ fontSize: '18px', fontWeight: 700, margin: '4px 0 2px', color: '#0f172a' }}>
              {formatMoney(buckets.b1_30.amount_minor)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{buckets.b1_30.student_count} students</div>
          </button>

          {/* Bucket 31-60 */}
          <button
            type="button"
            onClick={() => setSelectedBucket(selectedBucket === '31-60' ? 'all' : '31-60')}
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: selectedBucket === '31-60' ? '2px solid #0f172a' : '1px solid #fed7aa',
              background: selectedBucket === '31-60' ? '#f8fafc' : '#ffffff',
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#ea580c' }}>31–60 Days Overdue</div>
            <div style={{ fontSize: '18px', fontWeight: 700, margin: '4px 0 2px', color: '#0f172a' }}>
              {formatMoney(buckets.b31_60.amount_minor)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{buckets.b31_60.student_count} students</div>
          </button>

          {/* Bucket 61-90 */}
          <button
            type="button"
            onClick={() => setSelectedBucket(selectedBucket === '61-90' ? 'all' : '61-90')}
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: selectedBucket === '61-90' ? '2px solid #0f172a' : '1px solid #fdba74',
              background: selectedBucket === '61-90' ? '#f8fafc' : '#ffffff',
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#c2410c' }}>61–90 Days Overdue</div>
            <div style={{ fontSize: '18px', fontWeight: 700, margin: '4px 0 2px', color: '#0f172a' }}>
              {formatMoney(buckets.b61_90.amount_minor)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{buckets.b61_90.student_count} students</div>
          </button>

          {/* Bucket 90+ */}
          <button
            type="button"
            onClick={() => setSelectedBucket(selectedBucket === '90+' ? 'all' : '90+')}
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: selectedBucket === '90+' ? '2px solid #0f172a' : '1px solid #fca5a5',
              background: selectedBucket === '90+' ? '#f8fafc' : '#ffffff',
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#dc2626' }}>90+ Days Critical</div>
            <div style={{ fontSize: '18px', fontWeight: 700, margin: '4px 0 2px', color: '#991b1b' }}>
              {formatMoney(buckets.b90_plus.amount_minor)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{buckets.b90_plus.student_count} students</div>
          </button>
        </div>
      </section>

      {/* Search and Filters Toolbar */}
      <section className="admin-panel" style={{ padding: 'var(--space-3) var(--space-4)', margin: 0 }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flex: 1, minWidth: 280 }}>
            <input
              type="search"
              placeholder="Search student name, ID, class, or parent name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, maxWidth: 380 }}
            />
            <select
              value={debitStatusFilter}
              onChange={(e) => setDebitStatusFilter(e.target.value)}
              style={{ minWidth: 170 }}
            >
              <option value="">All Debit Statuses</option>
              <option value="Active Mandate">Active Mandate</option>
              <option value="Failed Debit">Failed Debit Attempt</option>
              <option value="No Mandate">No Mandate Registered</option>
            </select>
          </div>
          {(search || debitStatusFilter || selectedBucket !== 'all') && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setSearch('');
                setDebitStatusFilter('');
                setSelectedBucket('all');
              }}
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              Clear All Filters
            </button>
          )}
        </div>
      </section>

      {/* Overdue Records Table */}
      <section className="admin-panel" style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p>Loading delinquent student records…</p>
          </div>
        ) : error ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <p style={{ color: '#dc2626' }}>Could not load overdue records.</p>
            <button type="button" className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
              Retry
            </button>
          </div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h3>No overdue records found</h3>
            <p className="small">There are no records matching your current filter parameters.</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--surface-border)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Student Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Student ID</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Class / Grade</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Due Date</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Outstanding</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Days Overdue</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Debit Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Reminder Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const severityBg =
                    row.days_overdue > 90
                      ? '#fef2f2'
                      : row.days_overdue > 60
                        ? '#fff7ed'
                        : row.days_overdue > 30
                          ? '#fefce8'
                          : '#f0fdf4';
                  const severityColor =
                    row.days_overdue > 90
                      ? '#991b1b'
                      : row.days_overdue > 60
                        ? '#c2410c'
                        : row.days_overdue > 30
                          ? '#854d0e'
                          : '#166534';

                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{row.student_name}</div>
                        <div className="small" style={{ color: 'var(--text-muted)' }}>Guardian: {row.guardian_name}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-muted)' }}>
                        {row.account_reference}
                      </td>
                      <td style={{ padding: '12px 16px' }}>{row.class_name}</td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                        {new Date(row.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#991b1b' }}>
                        {formatMoney(row.outstanding_minor)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '12px',
                            fontWeight: 700,
                            background: severityBg,
                            color: severityColor,
                          }}
                        >
                          {row.days_overdue} days
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#f1f5f9',
                            color: '#334155',
                          }}
                        >
                          {row.debit_status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        {row.reminder_status}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="button primary"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => setReminderTarget(row)}
                            title="Send Authorized Payment Reminder"
                          >
                            Send Reminder
                          </button>
                          <button
                            type="button"
                            className="button secondary"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => setFeeDetailsStudent(row)}
                            title="View Student Fee Schedule"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            className="button secondary"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => setRecoveryHistoryStudent(row)}
                            title="View Recovery Audit Trail"
                          >
                            History
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal: Send Authorized Reminder */}
      <dialog
        className="finance-dialog"
        ref={reminderDialogRef}
        onCancel={() => setReminderTarget(null)}
        style={{ maxWidth: 540 }}
      >
        {reminderTarget && (
          <div style={{ padding: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Send Authorized Fee Reminder</h3>
              <button
                type="button"
                className="button secondary"
                onClick={() => setReminderTarget(null)}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: 'var(--space-3)', borderRadius: 6, marginBottom: 'var(--space-4)', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Recipient:</span>
                <strong>{reminderTarget.guardian_name} ({reminderTarget.guardian_phone})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Student Reference:</span>
                <strong>{reminderTarget.student_name} · {reminderTarget.account_reference}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Overdue Balance:</span>
                <strong style={{ color: '#991b1b', fontSize: '15px' }}>{formatMoney(reminderTarget.outstanding_minor)}</strong>
              </div>
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Select Delivery Channel:
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  onClick={() => setReminderChannel('whatsapp')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: 6,
                    border: reminderChannel === 'whatsapp' ? '2px solid #059669' : '1px solid #cbd5e1',
                    background: reminderChannel === 'whatsapp' ? '#f0fdf4' : '#ffffff',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  WhatsApp Notification
                </button>
                <button
                  type="button"
                  onClick={() => setReminderChannel('sms')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: 6,
                    border: reminderChannel === 'sms' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                    background: reminderChannel === 'sms' ? '#f0f9ff' : '#ffffff',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  SMS Notice
                </button>
                <button
                  type="button"
                  onClick={() => setReminderChannel('email')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: 6,
                    border: reminderChannel === 'email' ? '2px solid #0f172a' : '1px solid #cbd5e1',
                    background: reminderChannel === 'email' ? '#f8fafc' : '#ffffff',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Email Statement
                </button>
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '12px', marginBottom: 'var(--space-4)', fontSize: '13px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 600 }}>
                Message Preview:
              </div>
              <p style={{ margin: 0, fontStyle: 'italic', color: '#334155' }}>
                &ldquo;Dear {reminderTarget.guardian_name}, this is a gentle reminder from {session.tenant.name} regarding the fee instalment for {reminderTarget.student_name} ({reminderTarget.class_name}). The outstanding amount of {formatMoney(reminderTarget.outstanding_minor)} was due on {new Date(reminderTarget.due_date).toLocaleDateString('en-IN')}. Please pay online via the student portal or clear the registered autopay mandate. Thank you.&rdquo;
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setReminderTarget(null)}
                disabled={sendingReminder}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button primary"
                onClick={sendReminder}
                disabled={sendingReminder}
              >
                {sendingReminder ? 'Dispatching…' : 'Confirm & Send Reminder'}
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* Modal: Student Fee Details */}
      <dialog
        className="finance-dialog"
        ref={detailsDialogRef}
        onCancel={() => setFeeDetailsStudent(null)}
        style={{ maxWidth: 520 }}
      >
        {feeDetailsStudent && (
          <div style={{ padding: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Student Fee Details</h3>
              <button
                type="button"
                className="button secondary"
                onClick={() => setFeeDetailsStudent(null)}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: 'var(--space-4)', borderRadius: 6, marginBottom: 'var(--space-4)', fontSize: '13px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Student Full Name</span>
                  <div style={{ fontWeight: 600 }}>{feeDetailsStudent.student_name}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Student Reference</span>
                  <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{feeDetailsStudent.account_reference}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Enrolled Class</span>
                  <div>{feeDetailsStudent.class_name}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Due Date</span>
                  <div>{new Date(feeDetailsStudent.due_date).toLocaleDateString('en-IN')}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Outstanding Dues</span>
                  <div style={{ fontWeight: 700, color: '#991b1b', fontSize: '15px' }}>
                    {formatMoney(feeDetailsStudent.outstanding_minor)}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Days Delinquent</span>
                  <div>
                    <span style={{ fontWeight: 700, color: '#c2410c' }}>{feeDetailsStudent.days_overdue} days</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  const s = feeDetailsStudent;
                  setFeeDetailsStudent(null);
                  setReminderTarget(s);
                }}
              >
                Proceed to Send Reminder
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* Modal: Recovery Audit History */}
      <dialog
        className="finance-dialog"
        ref={historyDialogRef}
        onCancel={() => setRecoveryHistoryStudent(null)}
        style={{ maxWidth: 520 }}
      >
        {recoveryHistoryStudent && (
          <div style={{ padding: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Fee Recovery History</h3>
                <p className="small" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>
                  {recoveryHistoryStudent.student_name} ({recoveryHistoryStudent.account_reference})
                </p>
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => setRecoveryHistoryStudent(null)}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', margin: 'var(--space-4) 0' }}>
              {recoveryHistoryStudent.recovery_logs.map((log, idx) => (
                <div key={idx} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <strong style={{ color: '#0f172a' }}>{log.type}</strong>
                    <span className="small" style={{ color: 'var(--text-muted)' }}>{log.date}</span>
                  </div>
                  <p style={{ margin: 0, color: '#475569' }}>{log.note}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="button secondary" onClick={() => setRecoveryHistoryStudent(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
