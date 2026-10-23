'use client';
import React, { useEffect, useState } from 'react';
import { DataTable, useAdminApi } from './context';

type Overview = {
  timezone: string;
  from: string;
  to: string;
  asOf: string;
  summary: Record<string, string | number>;
  daily: Array<{ day: string; collected_minor: string; expected_minor: string; failed: number }>;
  funnel: Array<{ status: string; count: number }>;
  upcoming: Record<string, any>[];
  failures: Record<string, any>[];
  activity: Record<string, any>[];
};
const money = (v: unknown) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    Number(v || 0) / 100,
  );
const rate = (a: unknown, b: unknown) =>
  Number(b) > 0 ? `${((100 * Number(a)) / Number(b)).toFixed(1)}%` : 'Not available';

type EnachOverviewProps = {
  provider?: {
    provider?: string | null;
    autopayMode?: string;
    reconciliationMode?: string;
  } | null;
  onNavigateTab?: (
    tab: 'mandates' | 'setups' | 'debits' | 'settlements' | 'checkouts' | 'recovery',
  ) => void;
  unresolvedInvestigations?: number;
};

export function EnachOverview({
  provider,
  onNavigateTab,
  unresolvedInvestigations = 0,
}: EnachOverviewProps = {}) {
  const { request, session } = useAdminApi();
  const [period, setPeriod] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [branch, setBranch] = useState('');
  const [plan, setPlan] = useState('');
  const [options, setOptions] = useState<{ branches: any[]; plans: any[] }>({
    branches: [],
    plans: [],
  });
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<any[] | null>(null);
  const [detailError, setDetailError] = useState('');
  const params = new URLSearchParams({ period });
  if (period === 'custom') {
    params.set('from', from);
    params.set('to', to);
  }
  if (branch) params.set('branchId', branch);
  if (plan) params.set('planId', plan);
  const query = params.toString();
  useEffect(() => {
    let active = true;
    setOptions({ branches: [], plans: [] });
    setBranch('');
    setPlan('');
    void request<typeof options>('admin/enach/filters')
      .then((v) => {
        if (active) setOptions(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [session.tenant.id]);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    if (period === 'custom' && (!from || !to)) return;
    const load = () =>
      request<Overview>('admin/enach/overview?' + query)
        .then((v) => {
          if (active) {
            setData(v);
            setError('');
          }
        })
        .catch((e) => {
          if (active) {
            setData(null);
            setError(e.message);
          }
        });
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session.tenant.id, query, revision]);
  useEffect(() => {
    let active = true;
    setRows(null);
    setDetailError('');
    if (detail)
      void request<any[]>(
        'admin/enach/overview/records?' + query + '&kind=' + detail + '&page=' + page,
      )
        .then((v) => {
          if (active) setRows(v);
        })
        .catch((e) => {
          if (active) setDetailError(e.message);
        });
    return () => {
      active = false;
    };
  }, [session.tenant.id, query, detail, page, revision]);
  const s = data?.summary;
  const primaryMetrics = s
    ? [
        [
          'Total collected in period',
          money(s.collectedMinor),
          'collected',
          'Confirmed payments less refunds',
        ],
        [
          'Collection efficiency',
          rate(s.paidAgainstExpectedMinor, s.expectedMinor),
          'expected',
          'Paid balance vs expected',
        ],
        ['Active mandates', s.activeMandates, 'mandates', 'Currently active eNACH mandates'],
        ["Today's collections", money(s.todayMinor), 'today', 'Confirmed receipts for today'],
      ]
    : [];
  const pipelineMetrics = s
    ? [
        ['Expected in period', money(s.expectedMinor), 'expected', 'Adjusted instalments due'],
        [
          'Upcoming (next 7 days)',
          money(s.upcomingMinor),
          'upcoming',
          'Due for debit within 7 days',
        ],
        ['Overdue balance', money(s.overdueMinor), 'overdue', 'Unpaid past due date'],
        [
          'Pending settlements',
          money(s.pendingSettlementMinor),
          'settlements',
          'Transfers awaiting bank credit',
        ],
      ]
    : [];
  const healthMetrics = s
    ? [
        [
          'Registration success',
          rate(s.registrationActive, s.registrationTotal),
          'registrations',
          'Mandates active vs created',
        ],
        ['Failed debit attempts', s.failedDebits, 'failed', 'Unsuccessful bank debits'],
        [
          'Recovery rate',
          rate(s.recoveredInstallments, s.failedInstallments),
          'recovery',
          'Previously failed now paid',
        ],
      ]
    : [];
  const max = Math.max(
    1,
    ...(data?.daily.flatMap((d) => [Number(d.collected_minor), Number(d.expected_minor)]) || []),
  );
  return (
    <section className="admin-panel enach-overview" aria-label="Collection overview">
      <div className="admin-toolbar">
        <div>
          <p className="eyebrow">Collection intelligence</p>
          <h3>Your collections at a glance</h3>
          <p>
            Confirmed records across {session.tenant.name || 'this institution'}. Refreshed every
            minute.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div
            className="admin-notice"
            style={{ margin: 0, padding: '6px 14px', fontSize: '13px' }}
          >
            <strong>{provider?.provider || 'Gateway: Not configured'}</strong>
            {' · '}
            <span>AutoPay: {provider?.autopayMode === 'mandate_api' ? 'Active' : 'Disabled'}</span>
            {' · '}
            <span>
              Inquiry: {provider?.reconciliationMode === 'read_only' ? 'Active' : 'Disabled'}
            </span>
          </div>
          <button className="button outline" onClick={() => setRevision((v) => v + 1)}>
            Refresh overview
          </button>
        </div>
      </div>
      <div className="row">
        <label className="field">
          Reporting period
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
          >
            <option value="today">Today</option>
            <option value="7days">Last 7 days</option>
            <option value="month">Current month</option>
            <option value="custom">Custom period</option>
          </select>
        </label>
        {period === 'custom' && (
          <>
            <label className="field">
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field">
              To
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
          </>
        )}
        <label className="field">
          Campus
          <select
            value={branch}
            onChange={(e) => {
              setBranch(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All campuses</option>
            {options.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Fee plan
          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All fee plans</option>
            {options.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · v{p.version}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="admin-notice">
          {error}
        </p>
      ) : !data ? (
        <p role="status">
          {period === 'custom' && (!from || !to)
            ? 'Choose both dates to view records.'
            : 'Loading collection records…'}
        </p>
      ) : (
        <>
          <p className="small">
            {data.from} – {data.to} · {data.timezone} · Updated{' '}
            {new Date(data.asOf).toLocaleTimeString('en-IN', { timeZone: data.timezone })}
          </p>

          {/* Metric Hierarchy: Primary Tier */}
          <div style={{ margin: '14px 0 6px' }}>
            <h4
              style={{
                margin: '0 0 8px',
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-primary, #0f766e)',
              }}
            >
              Primary Collection Volume & Efficiency
            </h4>
            <div className="dashboard-stats enach-kpis">
              {primaryMetrics.map(([label, value, kind, desc]) => (
                <button
                  type="button"
                  className="dashboard-stat enach-kpi-primary"
                  key={String(label)}
                  onClick={() => {
                    setDetail(String(kind));
                    setPage(1);
                  }}
                >
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <span className="small" style={{ opacity: 0.8 }}>
                    {desc}
                  </span>
                  <small>View records →</small>
                </button>
              ))}
            </div>
          </div>

          <details className="console-details">
            <summary>Forecast and operational health</summary>
            {/* Metric Hierarchy: Pipeline & Forecast Tier */}
            <div style={{ margin: '18px 0 6px' }}>
              <h4
                style={{
                  margin: '0 0 8px',
                  fontSize: '13px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#475569',
                }}
              >
                Forecast, Pipeline & Settlement Status
              </h4>
              <div className="dashboard-stats enach-kpis">
                {pipelineMetrics.map(([label, value, kind, desc]) => (
                  <button
                    type="button"
                    className="dashboard-stat"
                    key={String(label)}
                    onClick={() => {
                      setDetail(String(kind));
                      setPage(1);
                    }}
                  >
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <span className="small" style={{ opacity: 0.8 }}>
                      {desc}
                    </span>
                    <small>View records →</small>
                  </button>
                ))}
              </div>
            </div>

            {/* Metric Hierarchy: Operational Health Tier */}
            <div style={{ margin: '18px 0 14px' }}>
              <h4
                style={{
                  margin: '0 0 8px',
                  fontSize: '13px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#475569',
                }}
              >
                Operational Health & Failure Recovery
              </h4>
              <div className="dashboard-stats enach-kpis">
                {healthMetrics.map(([label, value, kind, desc]) => (
                  <button
                    type="button"
                    className="dashboard-stat"
                    key={String(label)}
                    onClick={() => {
                      setDetail(String(kind));
                      setPage(1);
                    }}
                  >
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <span className="small" style={{ opacity: 0.8 }}>
                      {desc}
                    </span>
                    <small>View records →</small>
                  </button>
                ))}
              </div>
            </div>
          </details>
          {/* Pending Actions Section */}
          <section
            className="admin-panel enach-action-items"
            style={{
              background: '#f8fafc',
              borderLeft: '4px solid var(--color-primary, #0f766e)',
              margin: '20px 0',
            }}
          >
            <h4 style={{ margin: '0 0 10px' }}>Action items requiring attention</h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '14px',
              }}
            >
              <div
                className="record-row"
                style={{ padding: '8px 12px', background: '#fff', borderRadius: '8px' }}
              >
                <div>
                  <strong>Overdue collections</strong>
                  <p className="small" style={{ margin: 0 }}>
                    {money(s?.overdueMinor)} outstanding past due
                  </p>
                </div>
                {onNavigateTab && (
                  <button
                    type="button"
                    className="button outline small"
                    onClick={() => onNavigateTab('recovery')}
                  >
                    Recover →
                  </button>
                )}
              </div>
              <div
                className="record-row"
                style={{ padding: '8px 12px', background: '#fff', borderRadius: '8px' }}
              >
                <div>
                  <strong>Upcoming debits (7 days)</strong>
                  <p className="small" style={{ margin: 0 }}>
                    {money(s?.upcomingMinor)} due in the next 7 days
                  </p>
                </div>
                {onNavigateTab && (
                  <button
                    type="button"
                    className="button outline small"
                    onClick={() => onNavigateTab('debits')}
                  >
                    Review debits →
                  </button>
                )}
              </div>
              <div
                className="record-row"
                style={{ padding: '8px 12px', background: '#fff', borderRadius: '8px' }}
              >
                <div>
                  <strong>Pending settlements</strong>
                  <p className="small" style={{ margin: 0 }}>
                    {money(s?.pendingSettlementMinor)} awaiting bank transfer
                  </p>
                </div>
                {onNavigateTab && (
                  <button
                    type="button"
                    className="button outline small"
                    onClick={() => onNavigateTab('settlements')}
                  >
                    Reconcile →
                  </button>
                )}
              </div>
              {unresolvedInvestigations > 0 && (
                <div
                  className="record-row"
                  style={{ padding: '8px 12px', background: '#fff', borderRadius: '8px' }}
                >
                  <div>
                    <strong>Investigations ({unresolvedInvestigations})</strong>
                    <p className="small" style={{ margin: 0 }}>
                      Uncertain setups need evidence review
                    </p>
                  </div>
                  {onNavigateTab && (
                    <button
                      type="button"
                      className="button outline small"
                      onClick={() => onNavigateTab('setups')}
                    >
                      Investigate →
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
          <details className="console-details">
            <summary>Collection trends and registration funnel</summary>
            <div className="enach-insights-grid">
              <article>
                <h4>Expected vs confirmed collections</h4>
                <p className="small">
                  Expected instalments by due date; confirmed payments by recorded date. INR.
                </p>
                <div
                  className="enach-cash-chart"
                  role="img"
                  aria-label="Daily expected and confirmed collections"
                >
                  <svg
                    viewBox={`0 0 ${Math.max(300, data.daily.length * 18)} 120`}
                    preserveAspectRatio="none"
                  >
                    {data.daily.map((d, i) => (
                      <g key={d.day}>
                        <title>
                          {d.day}: expected {money(d.expected_minor)}, confirmed{' '}
                          {money(d.collected_minor)}
                        </title>
                        <rect
                          x={i * 18 + 2}
                          y={110 - (Number(d.expected_minor) / max) * 100}
                          width="6"
                          height={(Number(d.expected_minor) / max) * 100}
                          fill="var(--color-border, #bfd8d3)"
                        />
                        <rect
                          x={i * 18 + 9}
                          y={110 - (Number(d.collected_minor) / max) * 100}
                          width="6"
                          height={(Number(d.collected_minor) / max) * 100}
                          fill="var(--color-primary, #0f766e)"
                        />
                      </g>
                    ))}
                  </svg>
                </div>
                <details>
                  <summary>Daily collection data</summary>
                  <DataTable
                    rows={data.daily}
                    columns={[
                      ['day', 'Date'],
                      ['expected_minor', 'Expected (paise)'],
                      ['collected_minor', 'Confirmed (paise)'],
                      ['failed', 'Failed attempts'],
                    ]}
                  />
                </details>
              </article>
              <article>
                <h4>Registration funnel</h4>
                <DataTable
                  rows={data.funnel}
                  columns={[
                    ['status', 'Current status'],
                    ['count', 'Registrations'],
                  ]}
                />
                <h4>Failed debit summary</h4>
                <DataTable
                  rows={data.failures}
                  columns={[
                    ['failure_code', 'Provider failure code'],
                    ['count', 'Attempts'],
                  ]}
                />
              </article>
            </div>
          </details>
          <h4>Upcoming debits · next 7 days</h4>
          <p className="small">
            Outstanding instalments; provider eligibility is checked separately. Showing the first
            5.
          </p>
          <DataTable
            rows={data.upcoming
              .slice(0, 5)
              .map((r) => ({ ...r, amount: money(r.outstanding_minor) }))}
            columns={[
              ['account_reference', 'Account'],
              ['sequence', 'Instalment'],
              ['due_date', 'Due date'],
              ['amount', 'Outstanding'],
            ]}
          />
          <details className="console-details">
            <summary>Recent confirmed payments</summary>
            <DataTable
              rows={data.activity.slice(0, 5).map((r) => ({ ...r, amount: money(r.amount_minor) }))}
              columns={[
                ['id', 'Payment'],
                ['amount', 'Amount'],
                ['status', 'Status'],
                ['recorded_at', 'Recorded at'],
              ]}
            />
          </details>
          <details>
            <summary>Metric definitions</summary>
            <p>
              Collections are confirmed payment amounts less refunds currently recorded against
              those payments; this is not a historical refund cash-flow statement. Expected is the
              adjusted value of non-cancelled instalments due in the period. Efficiency is their
              current paid balance divided by expected. Active mandates, overdue balances and
              pending settlements are current snapshots. Registration success uses the current state
              of registrations created in the period. Recovery is the share of previously failed
              instalments now fully paid. Zero denominators are unavailable. Campus filters include
              schedules linked to a student fee-plan assignment; settlements are included when they
              allocate a matching payment and may span campuses.
            </p>
          </details>
        </>
      )}
      {detail && (
        <section aria-label="Metric records" className="admin-panel">
          <div className="admin-toolbar">
            <div>
              <h4>
                {[...primaryMetrics, ...pipelineMetrics, ...healthMetrics].find(
                  (m) => m[2] === detail,
                )?.[0] || 'Metric'}{' '}
                · records
              </h4>
              <p className="small" style={{ margin: 0 }}>
                Showing actual financial and operational ledger entries
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {onNavigateTab &&
                (detail === 'mandates' ? (
                  <button
                    type="button"
                    className="button outline small"
                    onClick={() => onNavigateTab('mandates')}
                  >
                    Open Mandates tab →
                  </button>
                ) : ['failed', 'recovery'].includes(detail) ? (
                  <button
                    type="button"
                    className="button outline small"
                    onClick={() => onNavigateTab('recovery')}
                  >
                    Open Recovery tab →
                  </button>
                ) : detail === 'settlements' ? (
                  <button
                    type="button"
                    className="button outline small"
                    onClick={() => onNavigateTab('settlements')}
                  >
                    Open Settlements tab →
                  </button>
                ) : detail === 'upcoming' ? (
                  <button
                    type="button"
                    className="button outline small"
                    onClick={() => onNavigateTab('debits')}
                  >
                    Open Debits tab →
                  </button>
                ) : detail === 'registrations' ? (
                  <button
                    type="button"
                    className="button outline small"
                    onClick={() => onNavigateTab('setups')}
                  >
                    Open Setup Attempts →
                  </button>
                ) : null)}
              <button type="button" onClick={() => setDetail('')}>
                Close records
              </button>
            </div>
          </div>
          {detailError ? (
            <p role="alert">{detailError}</p>
          ) : rows ? (
            <DataTable
              rows={rows.map((r) => ({
                ...r,
                amount: r.amount_minor === null ? '—' : money(r.amount_minor),
              }))}
              columns={[
                ['id', 'Record ID'],
                ['amount', 'Amount'],
                ['status', 'Status'],
                ['date', 'Date'],
              ]}
            />
          ) : (
            <p role="status">Loading records…</p>
          )}
          <div className="admin-toolbar">
            <button
              type="button"
              disabled={page === 1 || !rows}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous records
            </button>
            <span>Page {page}</span>
            <button
              type="button"
              disabled={!rows || rows.length < 50}
              onClick={() => setPage((p) => p + 1)}
            >
              Next records
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
