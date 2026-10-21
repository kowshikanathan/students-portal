'use client';
import Link from 'next/link';
import { useState } from 'react';
import { parseBulkCsv } from '@core/bulk-csv';
import { useAdminApi } from './context';
import { financialStatusClass } from './financial-status';

const actions = [
  ['assign_plan', 'Bulk fee assignment', 'fee.plan.manage'],
  ['update_flex', 'Bulk installment update', 'fee.schedule.edit'],
  ['update_due_date', 'Bulk due date update', 'fee.schedule.edit'],
  ['prepare_enach', 'Bulk eNACH preparation', 'enach.manage'],
] as const;
type Preview = {
  id: string;
  status: string;
  canApply?: boolean;
  message?: string;
  rows: Array<{ row: number; student?: string; status: string; error?: string }>;
};
export function FinanceBulk() {
  const { request, session, can } = useAdminApi();
  const options = actions.filter(([, , permission]) => can(permission));
  const [operation, setOperation] = useState<string>(options[0]?.[0] || 'assign_plan');
  const [source, setSource] = useState('[]');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function template() {
    const text =
      operation === 'update_flex'
        ? JSON.stringify(
            [{ studentReference: '', installments: [{ dueDate: '', amountMinor: 0 }] }],
            null,
            2,
          )
        : operation === 'assign_plan'
          ? 'studentReference,planKey,accountReference\r\n'
          : operation === 'update_due_date'
            ? 'studentReference,accountReference,installmentSequence,dueDate\r\n'
            : 'studentReference,accountReference\r\n';
    const url = URL.createObjectURL(
      new Blob([text], { type: operation === 'update_flex' ? 'application/json' : 'text/csv' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = operation + '-template.' + (operation === 'update_flex' ? 'json' : 'csv');
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <section className="admin-panel">
        <div className="admin-toolbar">
          <div>
            <p className="eyebrow">FINANCE OPERATIONS</p>
            <h2>Bulk Actions</h2>
            <p>Validate the complete batch before applying. Financial updates commit together.</p>
          </div>
          <div className="row">
            {can('customer.import') && (
              <Link className="button secondary" href="/admin/academic-tools/">
                Student import
              </Link>
            )}
            {can('report.read') && (
              <Link className="button secondary" href="/admin/reports/">
                Bulk exports
              </Link>
            )}
          </div>
        </div>
        {!options.length ? (
          <p>Your role can use the available import or export tools above.</p>
        ) : (
          <form
            className="admin-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError('');
              setPreview(null);
              try {
                const rows = JSON.parse(source);
                const payload = {
                  operation,
                  reason: new FormData(event.currentTarget).get('reason'),
                  rows,
                };
                if (JSON.stringify(payload).length > 90000)
                  throw new Error('Reduce the file size before previewing');
                setPreview(await request<Preview>('admin/fees/bulk/preview', 'POST', payload));
              } catch (problem) {
                setError(
                  problem instanceof SyntaxError
                    ? 'The file is not valid JSON. Check the import format.'
                    : 'The preview could not be created. Check the template, permissions and file size.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="row">
              <label className="field">
                Action
                <select
                  value={operation}
                  disabled={busy || session.tenant.readOnly}
                  onChange={(event) => {
                    setOperation(event.target.value);
                    setPreview(null);
                    setSource('[]');
                  }}
                >
                  {options.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="button secondary" onClick={template} disabled={busy}>
                Download template
              </button>
            </div>
            <p className="small">
              Use enrollment numbers to identify students. Include an account reference when a
              student has multiple active schedules. Up to 100 rows per batch; complete Flex
              schedules allow 20 rows. Flex amounts use paise.
            </p>
            <label className="field">
              Upload CSV or JSON
              <input
                key={operation}
                type="file"
                accept=".csv,.json"
                disabled={busy || session.tenant.readOnly}
                onChange={async (event) => {
                  setPreview(null);
                  setError('');
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    if (file.size > 90000) throw new Error('File too large');
                    const text = await file.text();
                    setSource(
                      JSON.stringify(
                        file.name.toLowerCase().endsWith('.json')
                          ? JSON.parse(text)
                          : parseBulkCsv(text),
                        null,
                        2,
                      ),
                    );
                  } catch {
                    setError(
                      'The file could not be read. Use the template and keep the batch below 90 KB.',
                    );
                  }
                }}
              />
            </label>
            <details>
              <summary>Review imported rows</summary>
              <label className="field">
                Rows (JSON)
                <textarea
                  value={source}
                  rows={10}
                  disabled={busy || session.tenant.readOnly}
                  onChange={(event) => {
                    setSource(event.target.value);
                    setPreview(null);
                  }}
                />
              </label>
            </details>
            <label className="field">
              Reason for this batch
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={200}
                disabled={busy || session.tenant.readOnly}
              />
            </label>
            <button className="button primary" disabled={busy || session.tenant.readOnly}>
              {busy ? 'Processing…' : 'Validate & preview'}
            </button>
          </form>
        )}
        {error && (
          <p className="error-card" role="alert">
            {error}
          </p>
        )}
      </section>
      {preview && (
        <section className="admin-panel">
          <h3>Batch preview</h3>
          <p role="status">
            {preview.message ||
              (preview.status === 'applied'
                ? operation === 'prepare_enach'
                  ? 'Preparation is ready. No mandates were authorized.'
                  : 'Batch applied.'
                : preview.status === 'validated'
                  ? 'All rows validated. Review them before applying.'
                  : 'Correct the row errors and create a new preview.')}
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Enrollment number</th>
                  <th>Status</th>
                  <th>Issue</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>{row.student || '—'}</td>
                    <td>
                      <span className={financialStatusClass(row.status)}>{row.status}</span>
                    </td>
                    <td>{row.error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.canApply && (
            <button
              className="button primary"
              disabled={busy || session.tenant.readOnly}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  setPreview(
                    await request<Preview>('admin/fees/bulk/apply', 'POST', { runId: preview.id }),
                  );
                } catch {
                  setError('The batch was not confirmed. Retry this preview safely.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? 'Applying…'
                : operation === 'prepare_enach'
                  ? 'Prepare registrations'
                  : 'Apply validated batch'}
            </button>
          )}
        </section>
      )}
    </>
  );
}
