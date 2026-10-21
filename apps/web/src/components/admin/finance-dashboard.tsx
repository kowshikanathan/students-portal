'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdminApi } from './context';

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
const date = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));

export function FinanceDashboard({ cashflow = false }: { cashflow?: boolean } = {}) {
  const { request, session } = useAdminApi();
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
  return (
    <div className="finance-dashboard">
      <div className="admin-toolbar">
        <div>
          <p className="eyebrow">COLLECTIONS OVERVIEW</p>
          <h2>{cashflow ? 'Cashflow' : 'Finance operations'}</h2>
          <p>{session.tenant.name} · Current receivables</p>
        </div>
        <button className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
          Refresh
        </button>
      </div>
      <div className="dashboard-stats">
        {metrics.map(([label, value]) => (
          <div className="dashboard-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className="admin-panel">
        <h3>Expected vs collected</h3>
        <p className="small">Monthly net fee obligations and recorded net receipts</p>
        {data.trend?.some(
          (row) => Number(row.expected_minor) > 0 || Number(row.collected_minor) > 0,
        ) ? (
          <div
            className="finance-trend"
            role="group"
            aria-label="Expected and collected amounts for the past six months"
          >
            {data.trend.map((row) => (
              <div className="finance-trend-month" key={row.month}>
                <div className="finance-trend-bars" aria-hidden="true">
                  <span
                    className="expected"
                    style={{
                      height: Math.max(0, (Number(row.expected_minor) / trendMaximum) * 100) + '%',
                    }}
                  />
                  <span
                    className="collected"
                    style={{
                      height: Math.max(0, (Number(row.collected_minor) / trendMaximum) * 100) + '%',
                    }}
                  />
                </div>
                <strong>
                  {new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(
                    new Date(row.month),
                  )}
                </strong>
                <span>Expected {formatMoney(row.expected_minor)}</span>
                <span>Collected {formatMoney(row.collected_minor)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p>No collection trend is available yet.</p>
        )}
      </section>
      <div className="admin-grid">
        <section className="admin-panel">
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
        <section className="admin-panel">
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
                      <span className="status-pill">{row.status.replaceAll('_', ' ')}</span>
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
