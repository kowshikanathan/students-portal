'use client';
import { useEffect, useState } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';
import { DebitRecovery } from './debit-recovery';
import { financialStatusClass } from './financial-status';

export const financeColumns = {
  installments: [
    ['account_reference', 'Account'],
    ['sequence', 'Installment'],
    ['due_date', 'Due date'],
    ['amount_minor', 'Original amount'],
    ['paid_amount_minor', 'Paid'],
    ['remaining_minor', 'Remaining'],
    ['status', 'Status'],
  ],
  payments: [
    ['account_reference', 'Account'],
    ['provider_reference', 'Reference'],
    ['payment_mode', 'Mode'],
    ['recorded_at', 'Recorded'],
    ['amount_minor', 'Amount'],
    ['refunded_amount_minor', 'Refunded'],
    ['receipt_number', 'Receipt'],
    ['status', 'Status'],
  ],
  settlements: [
    ['provider_reference', 'Settlement reference'],
    ['provider', 'Provider'],
    ['amount_minor', 'Amount'],
    ['settled_at', 'Settled'],
    ['payment_count', 'Payments'],
    ['status', 'Status'],
  ],
  debits: [
    ['account_reference', 'Account'],
    ['created_at', 'Attempt date'],
    ['amount_minor', 'Amount'],
    ['attempt_no', 'Attempt'],
    ['provider_reference', 'Provider reference'],
    ['status', 'Status'],
    ['failure_code', 'Failure reason'],
    ['recovery_status', 'Recovery status'],
  ],
  reconciliation: [
    ['account_reference', 'Account'],
    ['payment_reference', 'Payment reference'],
    ['settlement_reference', 'Settlement reference'],
    ['amount_minor', 'Amount'],
    ['status', 'Status'],
    ['reason', 'Reason'],
  ],
  overdue: [
    ['account_reference', 'Account'],
    ['oldest_due_date', 'Oldest due date'],
    ['outstanding_minor', 'Outstanding'],
    ['overdue_minor', 'Overdue'],
    ['status', 'Status'],
  ],
} as const;
export type FinanceRecordKind = keyof typeof financeColumns;
type Result = { total: number; pageSize: number; rows: Record<string, string | number | null>[] };
export function FinanceRecords({
  kind: initialKind = 'installments',
  report = false,
  initialStatus = '',
}: {
  kind?: FinanceRecordKind;
  report?: boolean;
  initialStatus?: string;
}) {
  const { request, session, can } = useAdminApi();
  const [recovering, setRecovering] = useState<{
    id: string;
    installment_id: string;
    status: string;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [kind, setKind] = useState(initialKind);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState('date');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    setResult(null);
    setError(false);
    request<Result>(
      'admin/fees/records?' +
        new URLSearchParams({ kind, search: query, status, sort, page: String(page) }),
    )
      .then((data) => {
        if (active) setResult(data);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [session.tenant.id, kind, query, status, sort, page, refresh]);
  const columns = financeColumns[kind];
  function download() {
    if (!result) return;
    const cell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const csv = [
      columns.map(([, label]) => cell(label)).join(','),
      ...result.rows.map((row) =>
        columns
          .map(([key]) => cell(key.endsWith('_minor') ? Number(row[key] || 0) / 100 : row[key]))
          .join(','),
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind}-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="admin-panel">
      {recovering && (
        <DebitRecovery
          attempt={recovering}
          onClose={() => setRecovering(null)}
          onSaved={() => {
            setRecovering(null);
            setNotice('Recovery action saved.');
            setRefresh((n) => n + 1);
          }}
        />
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="admin-toolbar">
        <div>
          <p className="eyebrow">FINANCE OPERATIONS</p>
          <h2>{report ? 'Reports' : kind.charAt(0).toUpperCase() + kind.slice(1)}</h2>
          <p>{session.tenant.name} · Current financial records</p>
        </div>
        <div className="row">
          <button className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
            Refresh
          </button>
          <button className="button secondary" disabled={!result?.rows.length} onClick={download}>
            Export this page (CSV)
          </button>
        </div>
      </div>
      <div className="row">
        {report && (
          <label className="field">
            Report
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as FinanceRecordKind);
                setPage(1);
                setStatus('');
              }}
            >
              {Object.keys(financeColumns).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Account or reference"
          />
        </label>
        <label className="field">
          Status
          <input
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            placeholder="All statuses"
            list="finance-statuses"
          />
          <datalist id="finance-statuses">
            {[
              'scheduled',
              'part_paid',
              'paid',
              'confirmed_external',
              'confirmed',
              'failed',
              'uncertain',
              'pending',
              'settled',
              'matched',
              'unmatched',
              'needs_review',
              'overdue',
            ].map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </label>
        <label className="field">
          Sort
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="date">Date · latest first</option>
            <option value="amount">Amount · highest first</option>
          </select>
        </label>
      </div>
      {error ? (
        <div role="alert">
          <p>Records could not be loaded.</p>
          <button className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : !result ? (
        <p role="status" aria-busy="true">
          Loading records…
        </p>
      ) : (
        <>
          <p className="small">{result.total} records</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {kind === 'debits' && <th>Actions</th>}
                  {columns.map(([key, label]) => (
                    <th key={key} className={key.endsWith('_minor') ? 'money' : ''}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id}>
                    {kind === 'debits' && (
                      <td>
                        {row.provider === 'sandbox_enach' &&
                          ['failed', 'uncertain'].includes(String(row.status)) && (
                            <button
                              className="button secondary"
                              disabled={session.tenant.readOnly || !can('enach.recover')}
                              onClick={() =>
                                setRecovering({
                                  id: String(row.id),
                                  installment_id: String(row.installment_id),
                                  status: String(row.status),
                                })
                              }
                            >
                              Recover
                            </button>
                          )}
                      </td>
                    )}
                    {columns.map(([key]) => (
                      <td key={key} className={key.endsWith('_minor') ? 'money' : ''}>
                        {key.endsWith('_minor') ? (
                          formatMoney(row[key] || 0)
                        ) : key === 'status' ? (
                          <span className={financialStatusClass(row[key])}>
                            {String(row[key] || '—').replaceAll('_', ' ')}
                          </span>
                        ) : row[key] && (key.endsWith('_at') || key.endsWith('_date')) ? (
                          new Intl.DateTimeFormat('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'Asia/Kolkata',
                          }).format(new Date(row[key]!))
                        ) : (
                          String(row[key] ?? '—')
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result.rows.length && (
            <div className="empty-state">
              <h3>No matching records</h3>
              <p>Adjust the filters or complete a financial workflow to add records.</p>
            </div>
          )}
          <nav className="admin-toolbar" aria-label="Finance record pages">
            <button
              className="button secondary"
              disabled={page === 1}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}
            </span>
            <button
              className="button secondary"
              disabled={page * result.pageSize >= result.total}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
