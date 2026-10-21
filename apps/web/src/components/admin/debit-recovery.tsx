'use client';
import { useEffect, useRef, useState } from 'react';
import { useAdminApi } from './context';

export function DebitRecovery({
  attempt,
  onClose,
  onSaved,
}: {
  attempt: { id: string; installment_id: string; status: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { request } = useAdminApi();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState(attempt.status === 'uncertain' ? 'successful' : 'retry');
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="finance-dialog"
      ref={dialog}
      aria-labelledby="recovery-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <form
        className="admin-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          const reason = new FormData(event.currentTarget).get('reason');
          try {
            if (action === 'retry')
              await request('admin/fees/sandbox/debits', 'POST', {
                installmentId: attempt.installment_id,
                idempotencyKey: key,
                outcome: 'successful',
              });
            else if (attempt.status === 'uncertain')
              await request(`admin/fees/sandbox/debits/${attempt.id}/resolve`, 'POST', {
                outcome: action,
                reason,
              });
            else
              await request(`admin/fees/sandbox/debits/${attempt.id}/recovery`, 'POST', {
                status: action,
                reason,
              });
            onSaved();
          } catch {
            setError('Recovery action was not confirmed. Refresh the record before retrying.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 id="recovery-title">Sandbox debit recovery</h2>
        <p>Simulation only. Every recovery decision is audited.</p>
        {error && <p role="alert">{error}</p>}
        <label className="field">
          Action
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            disabled={busy}
          >
            {attempt.status === 'uncertain' ? (
              <>
                <option value="successful">Resolve as successful</option>
                <option value="failed">Resolve as failed</option>
              </>
            ) : (
              <>
                <option value="retry">Retry sandbox collection</option>
                <option value="contacted">Mark contacted / add note</option>
                <option value="resolved">Mark recovery resolved</option>
              </>
            )}
          </select>
        </label>
        <label className="field">
          Reason / recovery note
          <textarea name="reason" required minLength={3} maxLength={300} disabled={busy} />
        </label>
        <div className="row">
          <button className="button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Apply recovery action'}
          </button>
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
