'use client';

import { useEffect, useRef, useState } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';

type Installment = {
  id: string;
  sequence: number;
  due_date: string;
  remaining_minor: number | string;
  status: string;
};
export function DirectPayment({
  studentId,
  onClose,
  onSaved,
}: {
  studentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { request } = useAdminApi();
  const dialog = useRef<HTMLDialogElement>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState('cash');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: Installment[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    request<{ rows: Installment[]; total: number }>(
      `admin/fees/students/${studentId}/records?section=installments&page=${page}`,
    )
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active) setError('Installments could not be loaded. Please retry.');
      });
    return () => {
      active = false;
    };
  }, [studentId, page, retry]);
  const bank = ['neft', 'rtgs', 'imps', 'cheque', 'dd'].includes(mode);
  const instrument = ['cheque', 'dd'].includes(mode);
  return (
    <dialog
      ref={dialog}
      className="finance-dialog"
      aria-label="Add Direct Payment"
      aria-labelledby="direct-payment-title"
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
          const form = new FormData(event.currentTarget);
          const raw = String(form.get('amount') || '');
          if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
            setError('Enter a valid amount with up to two decimal places.');
            return;
          }
          const amountMinor = Math.round(Number(raw) * 100);
          const advance = form.get('installmentId') === 'auto';
          const selected = data?.rows.find((row) => row.id === form.get('installmentId'));
          if (
            amountMinor <= 0 ||
            (!advance && (!selected || amountMinor > Number(selected.remaining_minor)))
          ) {
            setError('Payment must be positive and within the remaining installment balance.');
            return;
          }
          setBusy(true);
          setError('');
          try {
            await request(
              advance
                ? `admin/fees/students/${studentId}/payments`
                : 'admin/fees/payments/external-confirmation',
              'POST',
              {
                ...(advance ? {} : { installmentId: selected!.id }),
                amountMinor,
                currency: 'INR',
                idempotencyKey,
                providerReference:
                  mode === 'cash' ? 'CASH-' + idempotencyKey : String(form.get('reference')),
                evidenceNote: String(form.get('notes') || 'Direct payment recorded by institute'),
                directPayment: {
                  mode,
                  transactionDate: form.get('transactionDate'),
                  ...(bank ? { bankName: form.get('bankName') } : {}),
                  ...(instrument
                    ? {
                        instrumentNumber: form.get('instrumentNumber'),
                        instrumentDate: form.get('instrumentDate'),
                      }
                    : {}),
                },
              },
            );
            onSaved();
          } catch {
            setError(
              'Payment was not confirmed. Check the balance and reference, then retry with this form.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="admin-toolbar">
          <div>
            <p className="eyebrow">RECORD COLLECTION</p>
            <h2 id="direct-payment-title">Add Direct Payment</h2>
          </div>
          <button
            type="button"
            className="button secondary"
            aria-label="Close direct payment"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p>
          Record funds received outside the platform. A receipt is issued when the payment is saved.
        </p>
        {error && (
          <p className="error-card" role="alert">
            {error}
          </p>
        )}
        {!data ? (
          <>
            <p role="status">Loading installments…</p>
            {error && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setRetry((n) => n + 1)}
              >
                Retry
              </button>
            )}
          </>
        ) : (
          <>
            <label className="field">
              Installment
              <select name="installmentId" required disabled={busy}>
                <option value="">Select an outstanding installment</option>
                <option value="auto">Advance payment · oldest outstanding first</option>
                {data.rows
                  .filter(
                    (row) =>
                      Number(row.remaining_minor) > 0 &&
                      !['cancelled', 'adjusted'].includes(row.status),
                  )
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      Installment {row.sequence} · {String(row.due_date).slice(0, 10)} ·{' '}
                      {formatMoney(row.remaining_minor)} remaining
                    </option>
                  ))}
              </select>
            </label>
            {data.total > 25 && (
              <div className="row">
                <button
                  type="button"
                  disabled={busy || page === 1}
                  onClick={() => setPage((n) => n - 1)}
                >
                  Previous installments
                </button>
                <span>
                  Page {page} of {Math.ceil(data.total / 25)}
                </span>
                <button
                  type="button"
                  disabled={busy || page * 25 >= data.total}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Next installments
                </button>
              </div>
            )}
            <div className="row">
              <label className="field">
                Amount (INR)
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  disabled={busy}
                />
              </label>
              <label className="field">
                Transaction date
                <input
                  name="transactionDate"
                  type="date"
                  required
                  disabled={busy}
                  defaultValue={new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'Asia/Kolkata',
                  }).format(new Date())}
                />
              </label>
            </div>
            <label className="field">
              Payment mode
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                disabled={busy}
              >
                {[
                  ['cash', 'Cash'],
                  ['neft', 'NEFT'],
                  ['rtgs', 'RTGS'],
                  ['imps', 'IMPS'],
                  ['cheque', 'Cheque'],
                  ['dd', 'DD'],
                  ['bank_transfer', 'Bank Transfer'],
                  ['other', 'Other'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {mode !== 'cash' && (
              <label className="field">
                {['neft', 'rtgs', 'imps'].includes(mode) ? 'UTR' : 'Transaction / reference ID'}
                <input name="reference" required pattern="[A-Za-z0-9._:-]{3,120}" disabled={busy} />
              </label>
            )}
            {bank && (
              <label className="field">
                Bank name
                <input name="bankName" minLength={2} maxLength={120} required disabled={busy} />
              </label>
            )}
            {instrument && (
              <div className="row">
                <label className="field">
                  {mode === 'dd' ? 'DD' : 'Cheque'} number
                  <input
                    name="instrumentNumber"
                    minLength={3}
                    maxLength={80}
                    required
                    disabled={busy}
                  />
                </label>
                <label className="field">
                  {mode === 'dd' ? 'DD' : 'Cheque'} date
                  <input name="instrumentDate" type="date" required disabled={busy} />
                </label>
              </div>
            )}
            <label className="field">
              Notes
              <textarea name="notes" maxLength={300} minLength={3} disabled={busy} />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? 'Recording…' : 'Record payment & issue receipt'}
            </button>
          </>
        )}
      </form>
    </dialog>
  );
}
