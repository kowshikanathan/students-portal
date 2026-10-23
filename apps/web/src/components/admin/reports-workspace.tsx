'use client';

import { useEffect, useState } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';

export type ReportType =
  | 'payment'
  | 'collection'
  | 'settlement'
  | 'outstanding'
  | 'overdue'
  | 'cashflow'
  | 'instalment'
  | 'enach'
  | 'failed_debit'
  | 'student_summary';

type ReportMeta = {
  id: ReportType;
  title: string;
  badge: string;
  description: string;
};

const REPORT_CATALOGUE: ReportMeta[] = [
  { id: 'payment', title: 'Payment Report', badge: 'Collections', description: 'Transaction ledger across eNACH, UPI, Cards, and Netbanking with receipt numbers.' },
  { id: 'collection', title: 'Fee Collection Report', badge: 'Category Ledgers', description: 'Realized collections categorized by fee heads (Tuition, Development, Transport, Lab).' },
  { id: 'settlement', title: 'Settlement Report', badge: 'Banking & Payouts', description: 'Gateway batch payouts deposited into the primary settlement bank account with UTR numbers.' },
  { id: 'outstanding', title: 'Outstanding Report', badge: 'Balances', description: 'Uncollected balances per enrolled student and assigned fee plan schedules.' },
  { id: 'overdue', title: 'Overdue Report', badge: 'Delinquency', description: 'Overdue instalments chronologically bucketed by aging severity (1-30d, 31-60d, 61-90d, 90d+).' },
  { id: 'cashflow', title: 'Cashflow Report', badge: 'Analytics', description: 'Monthly projected inflows, realization velocity rates, and campus liquidity.' },
  { id: 'instalment', title: 'Instalment Report', badge: 'Milestones', description: 'Instalment milestone schedules across quarterly and term-based timelines.' },
  { id: 'enach', title: 'eNACH Mandate Report', badge: 'Autopay Rails', description: 'NPCI mandate registration states, active autopay mandates, and suspension audits.' },
  { id: 'failed_debit', title: 'Failed Debit Report', badge: 'Exceptions', description: 'Rejected autopay debit presentations with bank failure codes and retry statuses.' },
  { id: 'student_summary', title: 'Student Fee Summary', badge: 'Consolidated', description: 'Comprehensive student financial statements with net payable, paid, and outstanding balances.' },
];

type ReportResponse = {
  report: string;
  title: string;
  description: string;
  summary: Record<string, number | string>;
  columns: string[];
  rows: Array<Record<string, any>>;
};

export function ReportsWorkspace() {
  const { request, session } = useAdminApi();
  const [selectedReport, setSelectedReport] = useState<ReportType>('payment');
  const [dateRange, setDateRange] = useState<'today' | '7d' | 'month' | 'quarter' | 'year'>('month');
  const [branchFilter, setBranchFilter] = useState<'all' | 'DEL-MAIN' | 'DEL-SOUTH'>('all');
  const [search, setSearch] = useState('');

  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    request<ReportResponse>(`admin/fees/reports?type=${selectedReport}&range=${dateRange}`)
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
  }, [session.tenant.id, selectedReport, dateRange]);

  // Export CSV
  const exportCsv = () => {
    if (!data?.rows || data.rows.length === 0) return;
    const headerRow = data.columns.map((c) => `"${c}"`).join(',');
    const rows = data.rows.map((row) =>
      data.columns.map((_, colIdx) => `"${row[`col${colIdx + 1}`] ?? ''}"`).join(','),
    );
    const csv = [headerRow, ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedReport}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export PDF / Print
  const exportPdf = () => {
    window.print();
  };

  const filteredRows = (data?.rows || []).filter((r) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return Object.values(r).some((val) => String(val).toLowerCase().includes(searchLower));
  });

  const activeMeta = REPORT_CATALOGUE.find((r) => r.id === selectedReport)!;

  return (
    <div className="reports-workspace-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <section className="admin-panel" style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <span className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f766e', fontWeight: 600 }}>
              Financial Intelligence & Auditing
            </span>
            <h2 style={{ margin: '4px 0 6px', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Institution Reports Workspace</h2>
            <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>
              10 organized institutional reports covering fee collections, settlements, delinquency aging, cashflow, and student ledgers.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="button secondary"
              onClick={exportPdf}
              title="Print or save PDF report"
            >
              ⎙ Print / PDF
            </button>
            <button
              type="button"
              className="button primary"
              onClick={exportCsv}
              disabled={!data?.rows || data.rows.length === 0}
            >
              ↓ Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* Main Workspace Layout: 2 Columns (Report Selector on Left, Preview on Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 310px) 1fr', gap: 'var(--space-6)', alignItems: 'start' }}>
        {/* Left Column: 10 Selectable Reports */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', padding: '0 4px 6px' }}>
            Available Reports ({REPORT_CATALOGUE.length})
          </div>
          {REPORT_CATALOGUE.map((item) => {
            const isSelected = item.id === selectedReport;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setSelectedReport(item.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: isSelected ? '2px solid #0f172a' : '1px solid var(--surface-border)',
                  background: isSelected ? '#f8fafc' : '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? 'var(--shadow-card)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '13px', color: isSelected ? '#0f172a' : 'var(--text-main)' }}>
                    {item.title}
                  </strong>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: isSelected ? '#0f172a' : '#f1f5f9',
                      color: isSelected ? '#ffffff' : '#64748b',
                    }}
                  >
                    {item.badge}
                  </span>
                </div>
                <span className="small" style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: '1.4' }}>
                  {item.description}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Column: Live Report Controls & Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Controls Bar: Date Range & Search */}
          <section className="admin-panel" style={{ padding: 'var(--space-4)', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <span className="small" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Range:</span>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as any)}
                  aria-label="Filter report by date range"
                  style={{ minWidth: 150 }}
                >
                  <option value="today">Today</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="month">This Month (October)</option>
                  <option value="quarter">Current Term / Q2</option>
                  <option value="year">Full Academic Year</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <label htmlFor="report-branch-select" className="small" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                  Branch:
                </label>
                <select
                  id="report-branch-select"
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value as any)}
                  style={{ minWidth: 160 }}
                >
                  <option value="all">All Campuses</option>
                  <option value="DEL-MAIN">Delhi Main Campus</option>
                  <option value="DEL-SOUTH">Delhi South Campus</option>
                </select>
              </div>

              <input
                type="search"
                placeholder="Search report table rows..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ minWidth: 200, flex: 1, maxWidth: 300 }}
              />
            </div>
          </section>

          {/* Report Summary KPI Strip */}
          {data?.summary && (
            <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', margin: 0 }}>
              {Object.entries(data.summary).map(([key, value], idx) => {
                const label = key
                  .replace(/([A-Z])/g, ' $1')
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (l) => l.toUpperCase());

                const isMoney = key.toLowerCase().includes('minor') || key.toLowerCase().includes('volume') || key.toLowerCase().includes('collected') || key.toLowerCase().includes('settled') || key.toLowerCase().includes('overdue');
                const displayVal = isMoney ? formatMoney(Number(value)) : String(value);

                return (
                  <div key={idx} className={`finance-metric ${idx === 0 ? 'finance-metric-emphasis' : ''}`}>
                    <span className="finance-metric-label">{label}</span>
                    <strong style={{ fontSize: '20px' }}>{displayVal}</strong>
                    <span className="finance-metric-hint">Calculated metric</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active Report Table Preview */}
          <section className="admin-panel" style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--surface-border)', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                  {activeMeta.title}
                </h3>
                <p className="small" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>
                  {activeMeta.description}
                </p>
              </div>
              <span className="status-pill success">{filteredRows.length} Rows</span>
            </div>

            {loading ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                <p>Generating report preview…</p>
              </div>
            ) : error ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: '#dc2626' }}>
                <p>Could not generate report.</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                <h3>No records match criteria</h3>
                <p className="small">Try selecting another date range or clearing search filters.</p>
              </div>
            ) : (
              <div className="admin-table-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--surface-border)' }}>
                      {data?.columns.map((col, idx) => (
                        <th key={idx} style={{ padding: '12px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, rIdx) => (
                      <tr key={row.id || rIdx} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                        {data?.columns.map((_, colIdx) => {
                          const val = row[`col${colIdx + 1}`];
                          const isStatus = typeof val === 'string' && ['settled', 'paid', 'active', 'failed', 'processing', 'refunded', 'enrolled'].includes(val.toLowerCase());
                          return (
                            <td key={colIdx} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              {isStatus ? (
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    background: val === 'settled' || val === 'paid' || val === 'active' || val === 'enrolled' ? '#f0fdf4' : val === 'failed' ? '#fef2f2' : '#f8fafc',
                                    color: val === 'settled' || val === 'paid' || val === 'active' || val === 'enrolled' ? '#166534' : val === 'failed' ? '#991b1b' : '#334155',
                                  }}
                                >
                                  {val}
                                </span>
                              ) : (
                                <span>{val ?? '—'}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
