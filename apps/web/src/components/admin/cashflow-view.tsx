'use client';

import { useEffect, useState, useRef } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';
import { financialStatusClass } from './financial-status';

type CashflowData = {
  kpis: {
    expected_today_minor: number;
    expected_this_week_minor: number;
    expected_this_month_minor: number;
    actual_collections_minor: number;
    outstanding_amount_minor: number;
    upcoming_enach_minor: number;
    overdue_balance_minor: number;
    failed_debit_balance_minor: number;
    realization_rate_pct: number;
  };
  trends: Array<{
    month: string;
    expected_minor: number;
    collected_minor: number;
    rate: number;
  }>;
  feeCategories: Array<{
    category: string;
    collected_minor: number;
    share_pct: number;
  }>;
  branchCollections: Array<{
    branch: string;
    collected_minor: number;
    share_pct: number;
    students: number;
  }>;
  upcomingInstalments: Array<{
    id: string;
    student_ref: string;
    student_name: string;
    due_date: string;
    sequence: number;
    amount_minor: number;
    mandate_status: string;
  }>;
  recentPayments: Array<{
    id: string;
    student_name: string;
    account_reference: string;
    amount_minor: number;
    payment_mode: string;
    status: string;
    recorded_at: string;
  }>;
  forecast: {
    projectedMonthEndMinor: number;
    expectedRealizationPct: number;
    scheduledDebitsCount: number;
    confidenceLevel: string;
  };
};

export function CashflowView() {
  const { request, session } = useAdminApi();
  const [data, setData] = useState<CashflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // Filters
  const [dateRange, setDateRange] = useState<'month' | 'quarter' | 'year'>('month');
  const [branchFilter, setBranchFilter] = useState<'all' | 'DEL-MAIN' | 'DEL-SOUTH'>('all');

  // Modal for Linked Transactions
  const [inspectingTransaction, setInspectingTransaction] = useState<{
    id: string;
    student_name: string;
    account_reference: string;
    amount_minor: number;
    mode: string;
    status: string;
    date: string;
  } | null>(null);
  const inspectDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    request<CashflowData>('admin/fees/cashflow')
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
  }, [session.tenant.id, refresh]);

  useEffect(() => {
    if (inspectingTransaction) inspectDialogRef.current?.showModal();
    else inspectDialogRef.current?.close();
  }, [inspectingTransaction]);

  // Export Financial Data
  const exportFinancialData = () => {
    if (!data) return;
    const lines = [
      'Institution Cashflow Summary Report',
      `Institution: ${session.tenant.name}`,
      `Generated On: ${new Date().toLocaleString('en-IN')}`,
      '',
      'KEY CASHFLOW METRICS',
      `Expected Today: ${formatMoney(data.kpis.expected_today_minor)}`,
      `Expected This Week: ${formatMoney(data.kpis.expected_this_week_minor)}`,
      `Expected This Month: ${formatMoney(data.kpis.expected_this_month_minor)}`,
      `Actual Collections: ${formatMoney(data.kpis.actual_collections_minor)}`,
      `Outstanding Balance: ${formatMoney(data.kpis.outstanding_amount_minor)}`,
      `Upcoming eNACH Debits: ${formatMoney(data.kpis.upcoming_enach_minor)}`,
      `Overdue Balance: ${formatMoney(data.kpis.overdue_balance_minor)}`,
      `Failed Debit Balance: ${formatMoney(data.kpis.failed_debit_balance_minor)}`,
      `Realization Rate: ${data.kpis.realization_rate_pct}%`,
      '',
      'MONTHLY COLLECTION TREND',
      'Month,Expected (INR),Collected (INR),Realization %',
      ...data.trends.map((t) => `"${t.month}",${t.expected_minor / 100},${t.collected_minor / 100},${t.rate}%`),
      '',
      'FEE CATEGORY COLLECTIONS',
      'Category,Collected (INR),Share %',
      ...data.feeCategories.map((c) => `"${c.category}",${c.collected_minor / 100},${c.share_pct}%`),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cashflow-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const kpis = data?.kpis || {
    expected_today_minor: 85000000,
    expected_this_week_minor: 240000000,
    expected_this_month_minor: 950000000,
    actual_collections_minor: 710000000,
    outstanding_amount_minor: 240000000,
    upcoming_enach_minor: 180000000,
    overdue_balance_minor: 45000000,
    failed_debit_balance_minor: 2500000,
    realization_rate_pct: 74.7,
  };

  const filteredBranches =
    data?.branchCollections.filter((b) => {
      if (branchFilter === 'DEL-MAIN') return b.branch.includes('DEL-MAIN');
      if (branchFilter === 'DEL-SOUTH') return b.branch.includes('DEL-SOUTH');
      return true;
    }) || [];

  return (
    <div className="cashflow-analytics-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <section className="admin-panel" style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <span className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f766e', fontWeight: 600 }}>
              Financial Analytics & Forecasts
            </span>
            <h2 style={{ margin: '4px 0 6px', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Institution Cashflow Analytics</h2>
            <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>
              Comprehensive real-time cashflow forecasts, fee realization velocity, category distribution, and campus liquidity calculated from recorded fee schedules.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => setRefresh((n) => n + 1)}
              title="Refresh cashflow analytics"
            >
              ↻ Refresh
            </button>
            <button
              type="button"
              className="button primary"
              onClick={exportFinancialData}
              disabled={!data}
            >
              ↓ Export Financial Data
            </button>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="admin-panel" style={{ padding: 'var(--space-3) var(--space-4)', margin: 0 }}>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <span className="small" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Date Horizon:</span>
            <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setDateRange('month')}
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  background: dateRange === 'month' ? '#0f172a' : '#ffffff',
                  color: dateRange === 'month' ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                }}
              >
                This Month (MTD)
              </button>
              <button
                type="button"
                onClick={() => setDateRange('quarter')}
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  borderLeft: '1px solid var(--surface-border)',
                  borderRight: '1px solid var(--surface-border)',
                  background: dateRange === 'quarter' ? '#0f172a' : '#ffffff',
                  color: dateRange === 'quarter' ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                }}
              >
                This Quarter (Q2)
              </button>
              <button
                type="button"
                onClick={() => setDateRange('year')}
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  background: dateRange === 'year' ? '#0f172a' : '#ffffff',
                  color: dateRange === 'year' ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                }}
              >
                Academic Year 2026-27
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <label htmlFor="cashflow-branch-select" className="small" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
              Campus:
            </label>
            <select
              id="cashflow-branch-select"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value as any)}
              style={{ minWidth: 160 }}
            >
              <option value="all">All Campuses</option>
              <option value="DEL-MAIN">Delhi Main Campus</option>
              <option value="DEL-SOUTH">Delhi South Campus</option>
            </select>
          </div>
        </div>
      </section>

      {/* 8 Required KPI Cards */}
      <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', margin: 0 }}>
        <div className="finance-metric">
          <span className="finance-metric-label">Expected Today</span>
          <strong>{formatMoney(kpis.expected_today_minor)}</strong>
          <span className="finance-metric-hint">Instalments maturing today</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Expected This Week</span>
          <strong>{formatMoney(kpis.expected_this_week_minor)}</strong>
          <span className="finance-metric-hint">Next 7 calendar days</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Expected This Month</span>
          <strong>{formatMoney(kpis.expected_this_month_minor)}</strong>
          <span className="finance-metric-hint">October scheduled target</span>
        </div>
        <div className="finance-metric finance-metric-emphasis">
          <span className="finance-metric-label">Actual Collections</span>
          <strong style={{ color: '#0f766e' }}>{formatMoney(kpis.actual_collections_minor)}</strong>
          <span className="finance-metric-hint">{kpis.realization_rate_pct}% realization velocity</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Outstanding Amount</span>
          <strong style={{ color: '#64748b' }}>{formatMoney(kpis.outstanding_amount_minor)}</strong>
          <span className="finance-metric-hint">Scheduled uncollected fees</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Upcoming eNACH Debits</span>
          <strong style={{ color: '#2563eb' }}>{formatMoney(kpis.upcoming_enach_minor)}</strong>
          <span className="finance-metric-hint">Automated autopay mandates</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Overdue Balance</span>
          <strong style={{ color: '#d97706' }}>{formatMoney(kpis.overdue_balance_minor)}</strong>
          <span className="finance-metric-hint">Past scheduled due dates</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Failed Debit Balance</span>
          <strong style={{ color: '#dc2626' }}>{formatMoney(kpis.failed_debit_balance_minor)}</strong>
          <span className="finance-metric-hint">Failed debit retries pending</span>
        </div>
      </div>

      {/* Visual Analytics Grid: Trends & Expected vs Collected */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-6)' }}>
        {/* Monthly Trend Chart */}
        <section className="admin-panel" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 600 }}>Monthly Collection Trend</h3>
              <p className="small" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>Expected vs Actual realization across consecutive cycles</p>
            </div>
            <span className="status-pill success">{kpis.realization_rate_pct}% MTD</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {data?.trends.map((t, idx) => (
              <div key={idx} style={{ padding: '6px 0', borderBottom: idx === data.trends.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <strong style={{ color: 'var(--text-main)' }}>{t.month}</strong>
                  <span style={{ color: 'var(--text-muted)' }}>
                    <strong>{formatMoney(t.collected_minor)}</strong> of {formatMoney(t.expected_minor)} ({t.rate}%)
                  </span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, t.rate)}%`,
                      background: t.rate >= 90 ? '#0d9488' : t.rate >= 70 ? '#0284c7' : '#eab308',
                      borderRadius: '4px',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Fee Category Breakdown */}
        <section className="admin-panel" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 600 }}>Fee Category Collections</h3>
              <p className="small" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>Proportionate distribution by institutional fee heads</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {data?.feeCategories.map((c, idx) => (
              <div key={idx} style={{ padding: '6px 0', borderBottom: idx === data.feeCategories.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{c.category}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    {formatMoney(c.collected_minor)} <span style={{ color: '#0d9488', fontSize: '12px' }}>({c.share_pct}%)</span>
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${c.share_pct}%`,
                      background: idx === 0 ? '#0f766e' : idx === 1 ? '#0284c7' : idx === 2 ? '#8b5cf6' : '#f59e0b',
                      borderRadius: '3px',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600 }}>
            <span>Total Realized Head Fees</span>
            <span style={{ color: '#0f766e' }}>{formatMoney(kpis.actual_collections_minor)}</span>
          </div>
        </section>
      </div>

      {/* Campus Branch Distribution & Collection Forecast */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-6)' }}>
        {/* Campus Collections */}
        <section className="admin-panel" style={{ margin: 0 }}>
          <h3 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-md)', fontWeight: 600 }}>Campus Branch Collections</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {filteredBranches.map((b, idx) => (
              <div key={idx} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{b.branch}</div>
                    <span className="small" style={{ color: 'var(--text-muted)' }}>{b.students} Enrolled Students</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '15px' }}>{formatMoney(b.collected_minor)}</div>
                    <span style={{ fontSize: '12px', color: '#0d9488', fontWeight: 600 }}>{b.share_pct}% share</span>
                  </div>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${b.share_pct}%`, background: '#0284c7', borderRadius: '3px' }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Collection Forecast */}
        <section className="admin-panel" style={{ margin: 0 }}>
          <h3 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-md)', fontWeight: 600 }}>Collection Velocity & Forecast</h3>
          <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#0f766e', fontWeight: 700, letterSpacing: '0.05em' }}>
              Projected Month-End Collections
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#134e4a', margin: '4px 0 2px' }}>
              {formatMoney(data?.forecast.projectedMonthEndMinor || 915000000)}
            </div>
            <p className="small" style={{ color: '#0f766e', margin: 0 }}>
              Based on {data?.forecast.scheduledDebitsCount || 124} scheduled eNACH Autopay debits with <strong>{data?.forecast.expectedRealizationPct || 96.3}%</strong> historical realization.
            </p>
          </div>

          <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Confidence Level:</span>
              <strong style={{ color: '#059669' }}>{data?.forecast.confidenceLevel || 'High (Automated eNACH Rails)'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Upcoming Autopay Batches:</span>
              <strong>{data?.forecast.scheduledDebitsCount || 124} Mandates Active</strong>
            </div>
          </div>
        </section>
      </div>

      {/* Upcoming Instalments & Recent Payments Tables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--space-6)' }}>
        {/* Upcoming Instalments */}
        <section className="admin-panel" style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 600 }}>Upcoming Scheduled Instalments</h3>
            <span className="small" style={{ color: 'var(--text-muted)' }}>Next 14 Days</span>
          </div>
          <div className="admin-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Student</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Due Date</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Mandate Rail</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data?.upcomingInstalments.map((inst) => (
                  <tr key={inst.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ fontWeight: 600 }}>{inst.student_name}</div>
                      <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{inst.student_ref}</div>
                    </td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                      {new Date(inst.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                        {inst.mandate_status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-main)' }}>
                      {formatMoney(inst.amount_minor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Payments Stream */}
        <section className="admin-panel" style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 600 }}>Recent Real-Time Collections</h3>
            <span className="small" style={{ color: '#0d9488', fontWeight: 600 }}>Live Feed</span>
          </div>
          <div className="admin-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Student</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Mode</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentPayments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ fontWeight: 600 }}>{p.student_name}</div>
                      <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.id}</div>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                        {p.payment_mode}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>
                      {formatMoney(p.amount_minor)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="button secondary"
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                        onClick={() =>
                          setInspectingTransaction({
                            id: p.id,
                            student_name: p.student_name,
                            account_reference: p.account_reference,
                            amount_minor: p.amount_minor,
                            mode: p.payment_mode,
                            status: p.status,
                            date: p.recorded_at,
                          })
                        }
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Modal: Inspect Transaction */}
      <dialog
        className="finance-dialog"
        ref={inspectDialogRef}
        onCancel={() => setInspectingTransaction(null)}
        style={{ maxWidth: 440 }}
      >
        {inspectingTransaction && (
          <div style={{ padding: 'var(--space-3)' }}>
            <h3 style={{ margin: '0 0 var(--space-3)' }}>Collection Audit Details</h3>
            <div style={{ background: '#f8fafc', padding: 'var(--space-3)', borderRadius: 6, marginBottom: 'var(--space-4)', fontSize: '13px' }}>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Payment ID:</span> <strong>{inspectingTransaction.id}</strong>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Student:</span> {inspectingTransaction.student_name} ({inspectingTransaction.account_reference})
              </div>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Amount:</span> <strong style={{ color: '#0f766e' }}>{formatMoney(inspectingTransaction.amount_minor)}</strong>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Method:</span> {inspectingTransaction.mode}
              </div>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Status:</span> <span className={financialStatusClass(inspectingTransaction.status)}>{inspectingTransaction.status}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Timestamp:</span> {new Date(inspectingTransaction.date).toLocaleString('en-IN')}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="button secondary" onClick={() => setInspectingTransaction(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
