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
    <section className="sandbox-enach-workspace" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div className="admin-toolbar" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: '#0f172a' }}>Sandbox eNACH</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: '#64748b' }}>
            Test mandate registration, remaining-balance debits and failed collection recovery.
          </p>
        </div>
        <span className="status-pill warn">Simulation · no money movement</span>
      </div>
      {notice && <p role="status" className="admin-feedback" style={{ marginBottom: '1rem' }}>{notice}</p>}
      {enabled === null ? (
        <p role="status" className="small">Checking provider…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginTop: '1rem' }}>
          {/* Section 1: Register Mandate */}
          <form
            className="admin-form"
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
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
            <div>
              <h4 style={{ margin: '0 0 0.85rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>
                1. Register Sandbox Mandate
              </h4>
              <label className="field" style={{ marginBottom: '1rem' }}>
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
              <label
                className="checkbox-label"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.875rem',
                  color: '#334155',
                  cursor: 'pointer',
                  margin: '0.75rem 0 0 0',
                }}
              >
                <input
                  type="checkbox"
                  required
                  disabled={busy || session.tenant.readOnly || !can('enach.manage')}
                />
                <span>I agree to this simulated mandate registration.</span>
              </label>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button
                className="button primary"
                disabled={busy || session.tenant.readOnly || !can('enach.manage')}
                style={{ width: '100%' }}
              >
                Register sandbox mandate
              </button>
            </div>
          </form>

          {/* Section 2: Simulate Recurring Debit */}
          <form
            className="admin-form"
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
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
            <div>
              <h4 style={{ margin: '0 0 0.85rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>
                2. Simulate Recurring Collection
              </h4>
              <label className="field" style={{ marginBottom: '1rem' }}>
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
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button
                className="button primary"
                disabled={busy || session.tenant.readOnly || !can('enach.manage')}
                style={{ width: '100%' }}
              >
                {busy ? 'Processing…' : 'Simulate collection'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
