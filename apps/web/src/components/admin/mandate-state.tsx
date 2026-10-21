'use client';
import { useEffect, useRef, useState } from 'react';
import { useAdminApi } from './context';

export function MandateState({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { request } = useAdminApi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  return (
    <>
      <button type="button" className="button secondary" onClick={() => setOpen(true)}>
        Sandbox state
      </button>
      {open && (
        <dialog
          className="finance-dialog"
          ref={dialog}
          aria-label="Sandbox mandate state"
          onCancel={(event) => {
            if (busy) event.preventDefault();
            else setOpen(false);
          }}
        >
          <form
            className="admin-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              setError('');
              const data = new FormData(event.currentTarget);
              try {
                await request(`admin/fees/sandbox/mandates/${id}/state`, 'POST', {
                  state: data.get('state'),
                  reason: data.get('reason'),
                });
                setOpen(false);
                onChanged();
              } catch {
                setError('Mandate state could not be changed. Refresh before retrying.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Sandbox mandate state</h2>
            <p>Simulation only. No real bank authorization or money movement.</p>
            {error && <p role="alert">{error}</p>}
            <label className="field">
              State
              <select name="state" disabled={busy}>
                {['created', 'pending', 'active', 'rejected', 'cancelled', 'expired'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="field">
              Reason
              <textarea name="reason" required minLength={3} maxLength={300} disabled={busy} />
            </label>
            <div className="row">
              <button className="button primary" disabled={busy}>
                Apply sandbox state
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
