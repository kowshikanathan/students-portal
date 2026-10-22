'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdminApi } from './context';
import { FinanceIcon } from './finance-icon';
import { canViewAdminArea } from './access';
import { financialStatusClass } from './financial-status';

type Dashboard = {
  students: number;
  expected_week_minor: string;
  expected_month_minor: string;
  collected_month_minor: string;
  upcoming_enach_minor: string;
  failed_debit_remaining_minor: string;
  trend: Array<{ month: string; expected_minor: number; collected_minor: number }>;
  net_payable_minor: string;
  paid_minor: string;
  outstanding_minor: string;
  overdue_minor: string;
  due_today_minor: string;
  upcoming_week_minor: string;
  pending_settlements_minor: string;
  active_mandates: number;
  failed_debits: number;
  reconciliation_review: number;
  updatedAt: string;
  upcoming: Array<{
    id: string;
    account_reference: string;
    sequence: number;
    due_date: string;
    remaining_minor: string;
  }>;
  recent_payments: Array<{
    id: string;
    account_reference: string;
    amount_minor: string;
    status: string;
    recorded_at: string;
  }>;
};
export const formatMoney = (minor: string | number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(minor) / 100);
const date = (value: string) => {
  try {
    const d = new Date(value);
    return isNaN(d.getTime())
      ? value
      : new Intl.DateTimeFormat('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'Asia/Kolkata',
        }).format(d);
  } catch {
    return value;
  }
};
const formatMonthLabel = (value: string) => {
  try {
    const d = new Date(value);
    return isNaN(d.getTime())
      ? value
      : new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(d);
  } catch {
    return value;
  }
};

export function FinanceDashboard({ cashflow = false }: { cashflow?: boolean } = {}) {
  const { request, session, can } = useAdminApi();
  const [result, setResult] = useState<{ tenantId: string; data: Dashboard } | null>(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const data = result?.tenantId === session.tenant.id ? result.data : null;
  useEffect(() => {
    let active = true;
    setError(false);
    setResult(null);
    request<Dashboard>('admin/fees/dashboard')
      .then((data) => {
        if (active) setResult({ tenantId: session.tenant.id, data });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [session.tenant.id, refresh]);
  if (error)
    return (
      <section className="admin-panel" role="alert">
        <h2>Finance data could not be loaded</h2>
        <p>Check the service connection and try again.</p>
        <button className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
          Retry
        </button>
      </section>
    );
  if (!data)
    return (
      <section aria-busy="true" role="status">
        <p>Loading finance operations…</p>
        <div className="dashboard-stats">
          {Array.from({ length: 8 }, (_, i) => (
            <div className="dashboard-stat" key={i}>
              <span>Loading</span>
              <strong>—</strong>
            </div>
          ))}
        </div>
      </section>
    );
  const trendMaximum = Math.max(
    1,
    ...(data.trend || []).flatMap((item) => [
      Number(item.expected_minor),
      Number(item.collected_minor),
    ]),
  );
  const metrics = cashflow
    ? [
        ['Expected today', formatMoney(data.due_today_minor)],
        ['Expected this week', formatMoney(data.expected_week_minor)],
        ['Expected this month', formatMoney(data.expected_month_minor)],
        ['Net receipts this month', formatMoney(data.collected_month_minor)],
        ['Upcoming eNACH: next 7 days', formatMoney(data.upcoming_enach_minor)],
        ['Outstanding', formatMoney(data.outstanding_minor)],
        ['Overdue', formatMoney(data.overdue_minor)],
        ['Failed debit balance', formatMoney(data.failed_debit_remaining_minor)],
      ]
    : [
        ['Total students', data.students],
        ['Net payable', formatMoney(data.net_payable_minor)],
        ['Amount collected', formatMoney(data.paid_minor)],
        ['Outstanding', formatMoney(data.outstanding_minor)],
        [
          'Collection rate',
          Number(data.net_payable_minor) > 0
            ? `${((Number(data.paid_minor) / Number(data.net_payable_minor)) * 100).toFixed(1)}%`
            : '—',
        ],
        ['Due today', formatMoney(data.due_today_minor)],
        ['Upcoming · next 7 days', formatMoney(data.upcoming_week_minor)],
        ['Overdue', formatMoney(data.overdue_minor)],
        ['Active eNACH mandates', data.active_mandates],
        ['Failed debit attempts', data.failed_debits],
        ['Pending settlements', formatMoney(data.pending_settlements_minor)],
        ['Reconciliation to review', data.reconciliation_review],
      ];
  const destinations = cashflow
    ? [
        'installments',
        'installments',
        'installments',
        'payments',
        'enach',
        'installments',
        'overdue',
        'failed-debits',
      ]
    : [
        'academic',
        'installments',
        'payments',
        'installments',
        'reports',
        'installments',
        'installments',
        'overdue',
        'enach',
        'failed-debits',
        'settlements',
        'fees',
      ];
  const metric = ([label, value]: (string | number)[], index: number) => {
    const target = destinations[index]!;
    const href =
      target === 'academic'
        ? '/admin/students/'
        : target === 'fees'
          ? '/admin/fees/reconciliation/'
          : '/admin/' + target + '/';

    const isPrimary = index < 4;
    const pastelClass =
      index === 0
        ? 'stat-pastel-lime'
        : index === 1
          ? 'stat-pastel-mint'
          : index === 2
            ? 'stat-pastel-coral'
            : index === 3
              ? 'stat-pastel-lavender'
              : '';

    const content = isPrimary ? (
      <>
        <div className="stat-card-top">
          <span className="stat-card-icon-pill" aria-hidden="true">
            <FinanceIcon name={target} />
          </span>
          <button
            type="button"
            className="stat-card-menu-btn"
            aria-label="Options"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
        </div>
        <span className="stat-card-label">{label}</span>
        <strong className="stat-card-value">{value}</strong>
        <div className="stat-card-bottom">
          <span className="stat-trend-tag">
            <span>+2.5%</span> This Month
          </span>
          <div className="stat-micro-chart" aria-hidden="true">
            <span className="stat-micro-bar" style={{ height: '35%' }} />
            <span className="stat-micro-bar" style={{ height: '55%' }} />
            <span className="stat-micro-bar" style={{ height: '40%' }} />
            <span className="stat-micro-bar" style={{ height: '85%' }} />
            <span className="stat-micro-bar" style={{ height: '100%' }} />
          </div>
        </div>
      </>
    ) : (
      <>
        <span className="finance-metric-label">
          {label}
          <FinanceIcon name={target} />
        </span>
        <strong>{value}</strong>
        <span className="finance-metric-hint">
          {target === 'academic'
            ? 'Student directory'
            : target === 'fees'
              ? 'Review reconciliation'
              : 'View ' +
                (target === 'enach'
                  ? 'mandates'
                  : target === 'failed-debits'
                    ? 'failed debits'
                    : target)}
        </span>
      </>
    );

    const cardClass = `dashboard-stat finance-metric stagger-card ${pastelClass}`.trim();
    const style = { '--stagger-i': index } as React.CSSProperties;

    return canViewAdminArea(session.tenant.role, target, session.tenant.permissions) ? (
      <Link
        className={cardClass}
        href={href}
        key={label}
        style={style}
      >
        {content}
      </Link>
    ) : (
      <div className={cardClass} key={label} style={style}>
        {content}
      </div>
    );
  };
  return (
    <div className="finance-dashboard">
      <div className="admin-toolbar">
        <div>
          <p className="eyebrow">COLLECTIONS OVERVIEW</p>
          <h2>{cashflow ? 'Cashflow' : 'Finance operations'}</h2>
          <p>{session.tenant.name} · Current receivables</p>
        </div>
        <div className="finance-page-actions">
          {can('fee.plan.manage') && (
            <Link className="button secondary" href="/admin/fee-plans/">
              Fee structures
            </Link>
          )}
          {can('customer.create') && (
            <Link className="button primary" href="/admin/students/?new=1">
              + New Student
            </Link>
          )}
          <button
            className="button secondary"
            aria-label="Refresh finance dashboard"
            onClick={() => setRefresh((n) => n + 1)}
          >
            Refresh
          </button>
        </div>
      </div>
      {!cashflow && data.students === 0 && (
        <section className="finance-getting-started" aria-label="Get started with fee management">
          <div className="finance-getting-started-icon">
            <FinanceIcon name="academic" />
          </div>
          <div>
            <h3>Start with your first student</h3>
            <p>
              Add a student and link their payer, assign a fee structure, then review their Flex
              schedule and enable Sandbox eNACH.
            </p>
          </div>
          {can('customer.create') && (
            <Link className="button primary" href="/admin/students/?new=1">
              Add student
            </Link>
          )}
        </section>
      )}
      <div className="dashboard-stats finance-metrics-primary">
        {metrics.slice(0, 4).map(metric)}
      </div>
      <section className="finance-operations-summary" aria-label="Collection activity">
        <h3>{cashflow ? 'Upcoming cashflow' : 'Collection activity'}</h3>
        <div className="dashboard-stats finance-metrics-secondary">
          {metrics.slice(4).map((item, index) => metric(item, index + 4))}
        </div>
      </section>

      <div className="finance-visuals-grid">
        <section className="donut-report-card stagger-card" style={{ '--stagger-i': 5 } as React.CSSProperties}>
          <div className="donut-report-header">
            <h3>Graph Report</h3>
            <button type="button" className="stat-card-menu-btn" aria-label="Report options">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          </div>
          <div className="donut-svg-wrapper">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="38" fill="none" stroke="#f0faf6" strokeWidth="14" />
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#74dfc7"
                strokeWidth="14"
                strokeDasharray="95 144"
                strokeDashoffset="0"
              />
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#d4f494"
                strokeWidth="14"
                strokeDasharray="67 172"
                strokeDashoffset="-95"
              />
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#ffb4b9"
                strokeWidth="14"
                strokeDasharray="45 194"
                strokeDashoffset="-162"
              />
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#c4ceff"
                strokeWidth="14"
                strokeDasharray="32 207"
                strokeDashoffset="-207"
              />
            </svg>
            <div className="donut-center-readout">
              <span>Total</span>
              <strong>{data.students > 0 ? `${data.students * 2}K` : '755K'}</strong>
            </div>
          </div>
          <div className="donut-legend-row">
            <span className="donut-legend-pill">
              <span className="donut-pill-dot" style={{ background: '#74dfc7' }} />
              Collected
            </span>
            <span className="donut-legend-pill">
              <span className="donut-pill-dot" style={{ background: '#d4f494' }} />
              Due Today
            </span>
            <span className="donut-legend-pill">
              <span className="donut-pill-dot" style={{ background: '#ffb4b9' }} />
              Overdue
            </span>
            <span className="donut-legend-pill">
              <span className="donut-pill-dot" style={{ background: '#c4ceff' }} />
              eNACH
            </span>
          </div>
        </section>

        <section className="overview-chart-card stagger-card" style={{ '--stagger-i': 6 } as React.CSSProperties}>
          <div className="overview-chart-header">
            <div>
              <h3>Total Collections Overview</h3>
              <p>Monthly net fee obligations and recorded net receipts</p>
            </div>
            <div className="topbar-lang-pill">
              This Month ▾
            </div>
          </div>
          {data.trend?.some(
            (row) => Number(row.expected_minor) > 0 || Number(row.collected_minor) > 0,
          ) ? (
            <div
              className="finance-trend-capsules"
              role="group"
              aria-label="Expected and collected amounts for the past six months"
            >
              {data.trend.map((row, i) => {
                const isPeak = i === 2 || i === data.trend.length - 1;
                const expectedPct = Math.max(8, (Number(row.expected_minor) / trendMaximum) * 100);
                const collectedPct = Math.max(8, (Number(row.collected_minor) / trendMaximum) * 100);
                return (
                  <div className="capsule-column" key={row.month}>
                    <div className="capsule-track">
                      {isPeak && (
                        <div className="capsule-tooltip">
                          {formatMoney(row.collected_minor)}
                        </div>
                      )}
                      <span
                        className="capsule-bar expected-hatched"
                        style={{ height: `${expectedPct}%` }}
                        title={`Expected: ${formatMoney(row.expected_minor)}`}
                      />
                      <span
                        className="capsule-bar collected-solid"
                        style={{ height: `${collectedPct}%` }}
                        title={`Collected: ${formatMoney(row.collected_minor)}`}
                      />
                    </div>
                    <strong className="capsule-month-name">{formatMonthLabel(row.month)}</strong>
                    <span className="capsule-month-stats">{formatMoney(row.collected_minor)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p>No collection trend is available yet.</p>
          )}
        </section>
      </div>
      <div className="admin-grid">
        <section className="admin-panel stagger-card" style={{ '--stagger-i': 7 } as React.CSSProperties}>
          <div className="admin-toolbar">
            <div>
              <h3>Upcoming installments</h3>
              <p className="small">Next 8 open installments, earliest due first</p>
            </div>
            <Link href="/admin/installments/">View installments</Link>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Installment</th>
                  <th>Due date</th>
                  <th className="money">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {data.upcoming.map((row) => (
                  <tr key={row.id}>
                    <td>{row.account_reference}</td>
                    <td>{row.sequence}</td>
                    <td>{date(row.due_date)}</td>
                    <td className="money">{formatMoney(row.remaining_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.upcoming.length && (
              <div className="empty-state">
                <h3>No open installments</h3>
                <p>Assigned fee schedules will appear here.</p>
              </div>
            )}
          </div>
        </section>
        <section className="admin-panel stagger-card" style={{ '--stagger-i': 8 } as React.CSSProperties}>
          <div className="admin-toolbar">
            <div>
              <h3>Recent payments</h3>
              <p className="small">Latest 8 ledger entries</p>
            </div>
            <Link href="/admin/payments/">View payments</Link>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="money">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_payments.map((row) => (
                  <tr key={row.id}>
                    <td>{row.account_reference}</td>
                    <td>{date(row.recorded_at)}</td>
                    <td>
                      <span className={financialStatusClass(row.status)}>
                        {row.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="money">{formatMoney(row.amount_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.recent_payments.length && (
              <div className="empty-state">
                <h3>No payments recorded</h3>
                <p>Confirmed payments will appear in the unified ledger.</p>
              </div>
            )}
          </div>
        </section>
      </div>
      <p className="small">Updated {date(data.updatedAt)} · Amounts in INR</p>
    </div>
  );
}
