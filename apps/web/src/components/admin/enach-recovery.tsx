'use client';
import React, { useEffect, useState } from 'react';
import { DataTable, useAdminApi } from './context';

export function EnachRecovery() {
  const { request, session } = useAdminApi();
  const [rows, setRows] = useState<any[] | null>(null),
    [members, setMembers] = useState<any[]>([]);
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<any>(null),
    [history, setHistory] = useState<any>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setRows(null);
    setError('');
    setSelected(null);
    setHistory(null);
    void Promise.all([
      request<any[]>('admin/enach/recovery?page=' + page),
      request<any[]>('admin/enach/recovery/assignees'),
    ])
      .then(([r, m]) => {
        if (active) {
          setRows(r);
          setMembers(m);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [session.tenant.id, page, revision]);
  async function select(row: any) {
    setSelected(row);
    setHistory(null);
    setError('');
    try {
      setHistory(await request('admin/enach/recovery/' + row.installment_id + '/history'));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="admin-panel" id="enach-recovery" aria-label="Failed debit recovery">
      <div className="admin-toolbar">
        <div>
          <p className="eyebrow">Recovery operations</p>
          <h3>Failed debit follow-up</h3>
        </div>
        <button type="button" className="button outline" onClick={() => setRevision((r) => r + 1)}>
          Refresh recovery
        </button>
      </div>
      <p>
        Review confirmed debit failures, assign follow-up and inspect recorded communications.
        Payment links use the existing payer workflow. Staff follow-up never submits a debit or
        changes a payment outcome.
      </p>
      {error && (
        <p role="alert" className="admin-notice">
          {error}
        </p>
      )}
      {rows ? (
        <DataTable
          rows={rows.map((r) => ({
            ...r,
            amount: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
              Number(r.outstanding_minor) / 100,
            ),
            nextAction: r.debit_pending
              ? 'Wait for authoritative outcome'
              : r.recovery_state === 'paid_in_ledger'
                ? 'Paid; review follow-up'
                : r.next_retry_at
                  ? 'Worker retry policy applies'
                  : 'Review payer payment options',
          }))}
          columns={[
            ['account_reference', 'Account'],
            ['due_date', 'Due'],
            ['amount', 'Outstanding'],
            ['failure_code', 'Failure code'],
            ['attempt_no', 'Attempts'],
            ['followup_status', 'Follow-up'],
            ['nextAction', 'Next action'],
          ]}
          actions={(row) => (
            <button type="button" onClick={() => void select(row)}>
              Review recovery
            </button>
          )}
        />
      ) : (
        <p role="status">Loading failed debit records…</p>
      )}
      <div className="admin-toolbar">
        <button type="button" disabled={page === 1 || !rows} onClick={() => setPage((p) => p - 1)}>
          Previous failures
        </button>
        <span>Page {page}</span>
        <button
          type="button"
          disabled={!rows || rows.length < 50}
          onClick={() => setPage((p) => p + 1)}
        >
          Next failures
        </button>
      </div>
      {selected && (
        <div className="admin-panel">
          <h4>Follow-up · {selected.account_reference}</h4>
          <p className="small">
            Instalment {selected.installment_id} · {selected.recovery_state}. Closing this
            operational case does not mark the debt recovered.
          </p>
          <form
            className="admin-form"
            key={selected.installment_id + ':' + selected.version}
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError('');
              try {
                await request('admin/enach/recovery/' + selected.installment_id, 'POST', {
                  idempotencyKey: crypto.randomUUID(),
                  version: selected.version,
                  status: String(f.get('status')),
                  assignedTo: f.get('assignedTo') || null,
                  nextFollowupOn: f.get('nextFollowupOn') || null,
                  note: String(f.get('note')),
                });
                setRevision((v) => v + 1);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="row">
              <label className="field">
                Follow-up status
                <select
                  name="status"
                  defaultValue={
                    selected.followup_status === 'not_assigned' ? 'open' : selected.followup_status
                  }
                >
                  <option value="open">Open</option>
                  <option value="following_up">Following up</option>
                  <option value="closed">Close follow-up</option>
                </select>
              </label>
              <label className="field">
                Assigned staff
                <select name="assignedTo" defaultValue={selected.assigned_to || ''}>
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Next follow-up
                <input
                  type="date"
                  name="nextFollowupOn"
                  defaultValue={selected.next_followup_on?.slice(0, 10) || ''}
                />
              </label>
            </div>
            <label className="field">
              Internal note
              <input name="note" required minLength={3} maxLength={500} />
            </label>
            <button className="button primary" disabled={busy || session.tenant.readOnly}>
              Save follow-up
            </button>
          </form>
          <a className="button outline" href="/admin/fees/payer/">
            Open payer and secure payment-link controls
          </a>
          {history && (
            <>
              <h4>Follow-up history</h4>
              <DataTable
                rows={history.actions}
                columns={[
                  ['action', 'Action'],
                  ['note', 'Note'],
                  ['created_at', 'Recorded at'],
                ]}
              />
              <h4>Recorded communications</h4>
              <DataTable
                rows={history.communications}
                columns={[
                  ['channel', 'Channel'],
                  ['kind', 'Type'],
                  ['status', 'Delivery status'],
                  ['created_at', 'Recorded at'],
                ]}
              />
            </>
          )}
        </div>
      )}
      <details>
        <summary>Optional reminder-call integration</summary>
        <p>
          Not configured. AI calling, SMS and WhatsApp follow-up remain disabled until an approved
          adapter, consent policy, quiet hours and delivery evidence are implemented. No calls have
          been initiated by this feature.
        </p>
      </details>
    </section>
  );
}
