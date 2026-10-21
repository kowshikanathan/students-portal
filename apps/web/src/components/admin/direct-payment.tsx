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

type FeeComponent = {
  id: string;
  label: string;
  code: string;
  amount_minor: number | string;
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
  const [mode, setMode] = useState<'cash' | 'neft' | 'rtgs' | 'imps' | 'cheque' | 'dd' | 'bank_transfer'>('cash');
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string>('');
  const [components, setComponents] = useState<FeeComponent[]>([]);
  const [selectedComponentId, setSelectedComponentId] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [transactionDate, setTransactionDate] = useState<string>(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
  );
  const [reference, setReference] = useState('');
  const [bankName, setBankName] = useState('');
  const [instrumentNumber, setInstrumentNumber] = useState('');
  const [instrumentDate, setInstrumentDate] = useState(transactionDate);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([
      request<{ rows: Installment[]; total: number }>(
        `admin/fees/students/${studentId}/records?section=installments&pageSize=100`,
      ),
      request<{ rows: FeeComponent[]; total: number }>(
        `admin/fees/students/${studentId}/records?section=components&pageSize=100`,
      ),
    ])
      .then(([instRes, compRes]) => {
        if (!active) return;
        setInstallments(instRes.rows || []);
        const comps = compRes.rows || [];
        setComponents(comps);
        if (comps.length > 0 && comps[0]) {
          setSelectedComponentId(comps[0].id);
          // Set initial amount based on first component
          const initialAmt = (Number(comps[0].amount_minor) / 100).toFixed(2);
          setAmountStr(initialAmt);
        } else if (instRes.rows && instRes.rows.length > 0) {
          const firstDue = instRes.rows.find((i) => Number(i.remaining_minor) > 0);
          if (firstDue) {
            setAmountStr((Number(firstDue.remaining_minor) / 100).toFixed(2));
          }
        }
      })
      .catch(() => {
        if (active) setError('Could not load fee records. Please retry.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [studentId]);

  const selectedComponent = components.find((c) => c.id === selectedComponentId) || components[0];

  const totalOutstandingMinor = installments
    .filter((i) => !['cancelled', 'adjusted'].includes(i.status))
    .reduce((sum, i) => sum + Number(i.remaining_minor || 0), 0);

  const enteredAmountMinor = Math.round((Number(amountStr) || 0) * 100);
  const remainingAfterPaymentMinor = Math.max(0, totalOutstandingMinor - enteredAmountMinor);

  const bankRequired = ['neft', 'rtgs', 'imps', 'cheque', 'dd'].includes(mode);
  const instrumentRequired = ['cheque', 'dd'].includes(mode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    if (!/^\d+(\.\d{1,2})?$/.test(amountStr) || enteredAmountMinor <= 0) {
      setError('Enter a valid positive payment amount.');
      return;
    }

    if (bankRequired && !bankName.trim()) {
      setError('Bank name is required for NEFT, RTGS, IMPS, Cheque, or DD.');
      return;
    }

    if (instrumentRequired && (!instrumentNumber.trim() || !instrumentDate)) {
      setError('Instrument number and date are required for Cheque or DD.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      if (selectedInstallmentId) {
        await request('admin/fees/payments', 'POST', {
          installmentId: selectedInstallmentId,
          amountMinor: enteredAmountMinor,
          currency: 'INR',
          idempotencyKey,
          providerReference: mode === 'cash' ? `CASH-${idempotencyKey.slice(0, 8)}` : (reference.trim() || `DIR-${idempotencyKey.slice(0, 8)}`),
          evidenceNote: notes.trim() || (selectedComponent ? `Direct payment for ${selectedComponent.label}` : 'Direct payment recorded by institution'),
          directPayment: {
            mode,
            transactionDate,
            ...(bankRequired ? { bankName: bankName.trim() } : {}),
            ...(instrumentRequired
              ? {
                  instrumentNumber: instrumentNumber.trim(),
                  instrumentDate,
                }
              : {}),
          },
        });
      } else {
        await request(`admin/fees/students/${studentId}/payments`, 'POST', {
          amountMinor: enteredAmountMinor,
          currency: 'INR',
          idempotencyKey,
          providerReference: mode === 'cash' ? `CASH-${idempotencyKey.slice(0, 8)}` : (reference.trim() || `DIR-${idempotencyKey.slice(0, 8)}`),
          evidenceNote: notes.trim() || (selectedComponent ? `Direct payment for ${selectedComponent.label}` : 'Direct payment recorded by institution'),
          directPayment: {
            mode,
            transactionDate,
            ...(bankRequired ? { bankName: bankName.trim() } : {}),
            ...(instrumentRequired
              ? {
                  instrumentNumber: instrumentNumber.trim(),
                  instrumentDate,
                }
              : {}),
          },
        });
      }

      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Payment could not be recorded. Please verify the amount and details.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="finance-dialog jodo-direct-payment-dialog"
      aria-label="Add direct payment"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      style={{
        maxWidth: '520px',
        width: '100%',
        borderRadius: '12px',
        padding: '1.5rem',
        border: '1px solid #dce3e8',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      }}
    >
      <form onSubmit={handleSubmit} className="admin-form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', fontWeight: 600 }}>
            Add direct payment
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#64748b',
              padding: '0.25rem',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div role="alert" style={{ background: '#fdf2f2', border: '1px solid #f8b4b4', color: '#9b1c1c', padding: '0.6rem 0.8rem', borderRadius: '6px', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {loading ? (
          <p role="status" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
            Loading fee components…
          </p>
        ) : (
          <>
            {/* 1. Select Fee Component(s) Chip Section */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#475569', marginBottom: '0.35rem' }}>
                Select Fee Component(s)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {components.length > 0 ? (
                  components.map((comp) => {
                    const isSelected = comp.id === selectedComponentId;
                    return (
                      <button
                        type="button"
                        key={comp.id}
                        onClick={() => {
                          setSelectedComponentId(comp.id);
                          setAmountStr((Number(comp.amount_minor) / 100).toFixed(2));
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          border: isSelected ? '1px solid #2563eb' : '1px solid #cbd5e1',
                          background: isSelected ? '#eff6ff' : '#f8fafc',
                          color: isSelected ? '#1d4ed8' : '#334155',
                        }}
                      >
                        <span>{comp.label} (₹ {(Number(comp.amount_minor) / 100).toFixed(1)})</span>
                        {isSelected && <span style={{ fontSize: '0.75rem' }}>✓</span>}
                      </button>
                    );
                  })
                ) : (
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Schedule general balance</span>
                )}
              </div>
            </div>

            {/* 1b. Installment Selector */}
            {installments.length > 0 && (
              <div>
                <label
                  htmlFor="direct-payment-installment"
                  style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#475569', marginBottom: '0.25rem' }}
                >
                  Installment
                </label>
                <select
                  id="direct-payment-installment"
                  aria-label="Installment"
                  value={selectedInstallmentId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedInstallmentId(val);
                    const inst = installments.find((i) => i.id === val);
                    if (inst) {
                      setAmountStr((Number(inst.remaining_minor) / 100).toFixed(2));
                    }
                  }}
                  disabled={busy}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    background: '#fff',
                  }}
                >
                  <option value="">Auto-allocate across outstanding balance</option>
                  {installments.map((inst, idx) => (
                    <option key={inst.id} value={inst.id}>
                      Installment #{inst.sequence || idx + 1} - Due {inst.due_date} (Remaining: {formatMoney(inst.remaining_minor)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 2. Component Amount Input */}
            <div>
              <label
                htmlFor="direct-payment-amount"
                style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#475569', marginBottom: '0.25rem' }}
              >
                {selectedComponent ? `${selectedComponent.label} amount` : 'Amount (INR)'}
              </label>
              <input
                id="direct-payment-amount"
                aria-label="Amount (INR)"
                type="number"
                step="0.01"
                min="0.01"
                required
                disabled={busy}
                placeholder={`Enter ${selectedComponent?.label || 'fee'} amount`}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #3b82f6',
                  fontSize: '0.95rem',
                  outline: 'none',
                }}
              />
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Payable Amount: {selectedComponent ? formatMoney(selectedComponent.amount_minor) : formatMoney(totalOutstandingMinor)}
              </span>
            </div>

            {/* 3. Transaction Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#475569', marginBottom: '0.25rem' }}>
                Transaction Date 📅
              </label>
              <input
                type="date"
                required
                disabled={busy}
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            {/* 4. Transaction Mode */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#475569', marginBottom: '0.25rem' }}>
                Transaction Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                disabled={busy}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  background: '#fff',
                }}
              >
                <option value="cash">Cash</option>
                <option value="neft">NEFT</option>
                <option value="rtgs">RTGS</option>
                <option value="imps">IMPS</option>
                <option value="cheque">Cheque</option>
                <option value="dd">Demand Draft (DD)</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>

            {/* 5. Transaction ID / Reference */}
            {mode !== 'cash' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#475569', marginBottom: '0.25rem' }}>
                  Transaction ID / UTR *
                </label>
                <input
                  type="text"
                  required
                  disabled={busy}
                  placeholder="e.g. UTR123456789"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                  }}
                />
              </div>
            )}

            {/* Bank Name if required */}
            {bankRequired && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#475569', marginBottom: '0.25rem' }}>
                  Bank Name *
                </label>
                <input
                  type="text"
                  required
                  disabled={busy}
                  placeholder="e.g. State Bank of India"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                  }}
                />
              </div>
            )}

            {/* Instrument Details if Cheque or DD */}
            {instrumentRequired && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#475569', marginBottom: '0.25rem' }}>
                    {mode === 'dd' ? 'DD' : 'Cheque'} Number *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={busy}
                    placeholder="e.g. 000123"
                    value={instrumentNumber}
                    onChange={(e) => setInstrumentNumber(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#475569', marginBottom: '0.25rem' }}>
                    {mode === 'dd' ? 'DD' : 'Cheque'} Date *
                  </label>
                  <input
                    type="date"
                    required
                    disabled={busy}
                    value={instrumentDate}
                    onChange={(e) => setInstrumentDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>
              </div>
            )}

            {/* 6. Notes (Optional) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#475569', marginBottom: '0.25rem' }}>
                Notes (optional)
              </label>
              <textarea
                rows={2}
                disabled={busy}
                placeholder="Optional notes or remarks"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            {/* 7. Outstanding calculation footer */}
            <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                Your direct payment outstanding:{' '}
                <strong style={{ color: '#0f172a' }}>{formatMoney(remainingAfterPaymentMinor)}</strong>
              </p>
            </div>

            {/* 8. Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={onClose}
                style={{ padding: '0.5rem 1rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                aria-label="Record payment & issue receipt"
                disabled={busy || enteredAmountMinor <= 0}
                style={{
                  padding: '0.5rem 1.25rem',
                  background: '#1d4ed8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {busy ? 'Recording…' : 'Record payment & issue receipt'}
              </button>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}
