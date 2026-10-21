'use client';

import { useEffect, useRef, useState } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';

export function SandboxEnach({
  studentId,
  studentName,
  schedules,
  onChanged,
}: {
  studentId: string;
  studentName: string;
  schedules: Array<{ schedule_id: string; account_reference: string }>;
  onChanged: (message?: string) => void;
}) {
  const { request, session, can } = useAdminApi();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [page, setPage] = useState(1);
  const [installments, setInstallments] = useState<{
    rows: Array<{ id: string; sequence: number; remaining_minor: string | number; status: string }>;
    total: number;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const keys = useRef(new Map<string, string>());
  useEffect(() => {
    let active = true;
    request<{ autopayMode: string; sandboxSimulationAllowed?: boolean }>('provider/payments/status')
      .then((value) => {
        if (active)
          setEnabled(value.autopayMode === 'sandbox' && value.sandboxSimulationAllowed !== false);
      })
      .catch(() => {
        if (active) setNotice('Collection provider status could not be loaded.');
      });
    request<typeof installments>(
      `admin/fees/students/${studentId}/records?section=installments&page=${page}`,
    )
      .then((value) => {
        if (active) setInstallments(value);
      })
      .catch(() => {
        if (active) setNotice('Installments could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [studentId, page]);
  async function execute(kind: 'register' | 'debits', data: Record<string, unknown>, key: string) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    const idempotencyKey = keys.current.get(key) || crypto.randomUUID();
    keys.current.set(key, idempotencyKey);
    try {
      const result = await request<{ status: string; accepted?: boolean }>(
        'admin/fees/sandbox/' + kind,
        'POST',
        { ...data, idempotencyKey },
      );
      if (result.accepted === false) throw new Error('Sandbox event rejected');
      onChanged(
        kind === 'register' ? 'Sandbox mandate activated.' : `Sandbox debit ${result.status}.`,
      );
    } catch {
      setNotice('The sandbox operation was not confirmed. Refresh the records before retrying.');
    } finally {
      setBusy(false);
    }
  }
  if (enabled === false) return <p>Sandbox collection is not enabled for this installation.</p>;
  return (
    <section className="admin-panel">
      <div className="admin-toolbar">
        <h3>Sandbox eNACH</h3>
        <span className="status-pill warn">Simulation · no money movement</span>
      </div>
      <p>Test mandate registration, remaining-balance debits and failed collection recovery.</p>
      {notice && <p role="status">{notice}</p>}
      {enabled === null ? (
        <p role="status">Checking provider…</p>
      ) : (
        <>
          <form
            className="admin-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void execute(
                'register',
                {
                  scheduleId: form.get('scheduleId'),
                  holderName: studentName,
                  sandboxConsent: true,
                },
                'register:' + form.get('scheduleId'),
              );
            }}
          >
            <label className="field">
              Fee schedule
              <select
                name="scheduleId"
                required
                disabled={busy || session.tenant.readOnly || !can('enach.manage')}
              >
                <option value="">Select a fee schedule</option>
                {schedules.map((schedule) => (
                  <option key={schedule.schedule_id} value={schedule.schedule_id}>
                    {schedule.account_reference}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                required
                disabled={busy || session.tenant.readOnly || !can('enach.manage')}
              />{' '}
              I agree to this simulated mandate registration.
            </label>
            <button
              className="button secondary"
              disabled={busy || session.tenant.readOnly || !can('enach.manage')}
            >
              Register sandbox mandate
            </button>
          </form>
          <hr />
          <form
            className="admin-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void execute(
                'debits',
                { installmentId: form.get('installmentId'), outcome: form.get('outcome') },
                'debit:' + form.get('installmentId') + ':' + form.get('outcome'),
              );
            }}
          >
            <label className="field">
              Installment
              <select
                name="installmentId"
                required
                disabled={busy || session.tenant.readOnly || !can('enach.manage')}
              >
                <option value="">Select an outstanding installment</option>
                {installments?.rows
                  .filter(
                    (row) =>
                      Number(row.remaining_minor) > 0 &&
                      !['cancelled', 'adjusted'].includes(row.status),
                  )
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      Installment {row.sequence} · {formatMoney(row.remaining_minor)} remaining
                    </option>
                  ))}
              </select>
            </label>
            {installments && installments.total > 25 && (
              <div className="row">
                <button
                  type="button"
                  disabled={busy || page === 1}
                  onClick={() => setPage((n) => n - 1)}
                >
                  Previous
                </button>
                <span>Page {page}</span>
                <button
                  type="button"
                  disabled={busy || page * 25 >= installments.total}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Next
                </button>
              </div>
            )}
            <label className="field">
              Simulated result
              <select
                name="outcome"
                disabled={busy || session.tenant.readOnly || !can('enach.manage')}
              >
                <option value="successful">Successful debit / retry</option>
                <option value="failed">Failed · insufficient funds</option>
                <option value="uncertain">Uncertain · requires review</option>
              </select>
            </label>
            <button
              className="button primary"
              disabled={busy || session.tenant.readOnly || !can('enach.manage')}
            >
              {busy ? 'Processing…' : 'Simulate collection'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
