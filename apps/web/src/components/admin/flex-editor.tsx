'use client';
import { useEffect, useRef, useState } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';

type Schedule = {
  version: number;
  installments: Array<{
    id: string;
    due_date: string;
    amount_minor: number;
    adjustment_amount_minor: number;
    editable: boolean;
  }>;
};
export function FlexEditor({
  scheduleId,
  onClose,
  onSaved,
}: {
  scheduleId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { request } = useAdminApi();
  const dialog = useRef<HTMLDialogElement>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [rows, setRows] = useState<Array<{ key: string; dueDate: string; amount: string }>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    request<Schedule>(`admin/fees/schedules/${scheduleId}/flex`)
      .then((value) => {
        if (!active) return;
        setSchedule(value);
        setRows(
          value.installments
            .filter((i) => i.editable)
            .map((i) => ({
              key: i.id,
              dueDate: String(i.due_date).slice(0, 10),
              amount: String(
                (Number(i.amount_minor) - Number(i.adjustment_amount_minor || 0)) / 100,
              ),
            })),
        );
      })
      .catch(() => {
        if (active) setError('Schedule could not be loaded. Close and retry.');
      });
    return () => {
      active = false;
    };
  }, [scheduleId]);
  return (
    <dialog
      className="finance-dialog"
      ref={dialog}
      aria-labelledby="flex-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <form
        className="admin-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!schedule || busy) return;
          const reason = new FormData(event.currentTarget).get('reason');
          if (rows.some((row) => !/^\d+(\.\d{1,2})?$/.test(row.amount))) {
            setError('Use valid amounts with at most two decimal places.');
            return;
          }
          setBusy(true);
          setError('');
          try {
            await request(`admin/fees/schedules/${scheduleId}/flex`, 'POST', {
              version: schedule.version,
              reason,
              installments: rows.map((row) => ({
                dueDate: row.dueDate,
                amountMinor: Math.round(Number(row.amount) * 100),
              })),
            });
            onSaved();
          } catch {
            setError(
              'Schedule was not saved. Totals must reconcile, dates must be in the future, and processing payments must be resolved. Refresh if another user changed the schedule.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="admin-toolbar">
          <h2 id="flex-title">Customize Flex Schedule</h2>
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Close
          </button>
        </div>
        <p>
          Customize this student's unpaid future installments. Paid and past installments remain
          preserved. Approved discounts carry forward, and the total payable must remain unchanged.
        </p>
        {error && (
          <p role="alert" className="error-card">
            {error}
          </p>
        )}
        {!schedule ? (
          <p role="status">Loading schedule…</p>
        ) : (
          <>
            {schedule.installments
              .filter((i) => !i.editable)
              .map((i) => (
                <p className="small" key={i.id}>
                  Preserved: {String(i.due_date).slice(0, 10)} · {formatMoney(i.amount_minor)}
                </p>
              ))}
            {rows.map((row, index) => (
              <div className="row" key={row.key}>
                <label className="field">
                  Due date
                  <input
                    type="date"
                    required
                    value={row.dueDate}
                    disabled={busy}
                    onChange={(event) =>
                      setRows((items) =>
                        items.map((item, n) =>
                          n === index ? { ...item, dueDate: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="field">
                  Payable (INR)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={row.amount}
                    disabled={busy}
                    onChange={(event) =>
                      setRows((items) =>
                        items.map((item, n) =>
                          n === index ? { ...item, amount: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || rows.length === 1}
                  aria-label={`Remove installment ${index + 1}`}
                  onClick={() => setRows((items) => items.filter((_, n) => n !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button secondary"
              disabled={busy || rows.length >= 60 || !schedule.installments.some((i) => i.editable)}
              onClick={() =>
                setRows((items) => [
                  ...items,
                  { key: crypto.randomUUID(), dueDate: '', amount: '' },
                ])
              }
            >
              Add installment
            </button>
            <label className="field">
              Reason for change
              <textarea name="reason" required minLength={3} maxLength={300} disabled={busy} />
            </label>
            <button className="button primary" disabled={busy || !rows.length}>
              {busy ? 'Saving…' : 'Save Flex Schedule'}
            </button>
          </>
        )}
      </form>
    </dialog>
  );
}
