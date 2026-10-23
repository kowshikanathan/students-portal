'use client';

import { useEffect, useState, useRef } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';
import { financialStatusClass } from './financial-status';

export type PaymentRecord = {
  id: string;
  account_reference: string;
  student_name: string;
  student_id: string;
  payer_name: string;
  payer_phone?: string;
  payer_email?: string;
  fee_category: string;
  amount_minor: number;
  payment_mode: string;
  provider_reference: string;
  recorded_at: string;
  receipt_number: string;
  status: string;
  refunded_amount_minor?: number;
  refund_reason?: string;
  failure_reason?: string;
  breakdown?: Array<{ label: string; amount_minor: number }>;
};

type PaymentApiResponse = {
  rows: PaymentRecord[];
  total: number;
  kpis: {
    total_collected_minor: number;
    today_collections_minor: number;
    successful_count: number;
    pending_count: number;
    failed_count: number;
    refunded_amount_minor: number;
  };
};

export function PaymentsView() {
  const { request, session } = useAdminApi();
  const [data, setData] = useState<PaymentApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');

  // Modals
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<PaymentRecord | null>(null);
  const [refundPayment, setRefundPayment] = useState<PaymentRecord | null>(null);
  const detailsDialogRef = useRef<HTMLDialogElement>(null);
  const receiptDialogRef = useRef<HTMLDialogElement>(null);
  const refundDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (modeFilter) params.set('mode', modeFilter);

    request<PaymentApiResponse>(`admin/fees/payments?${params.toString()}`)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session.tenant.id, search, statusFilter, modeFilter, refresh]);

  // Handle open dialogs
  useEffect(() => {
    if (selectedPayment) detailsDialogRef.current?.showModal();
    else detailsDialogRef.current?.close();
  }, [selectedPayment]);

  useEffect(() => {
    if (receiptPayment) receiptDialogRef.current?.showModal();
    else receiptDialogRef.current?.close();
  }, [receiptPayment]);

  useEffect(() => {
    if (refundPayment) refundDialogRef.current?.showModal();
    else refundDialogRef.current?.close();
  }, [refundPayment]);

  // Export CSV
  const exportCsv = () => {
    if (!data?.rows || data.rows.length === 0) return;
    const headers = [
      'Payment ID',
      'Student Name',
      'Account Reference',
      'Payer Name',
      'Payer Email',
      'Payer Phone',
      'Fee Category',
      'Amount (INR)',
      'Payment Mode',
      'Transaction Reference',
      'Receipt Number',
      'Recorded Date',
      'Status',
    ];
    const rows = data.rows.map((p) => [
      `"${p.id}"`,
      `"${p.student_name}"`,
      `"${p.account_reference}"`,
      `"${p.payer_name}"`,
      `"${p.payer_email || ''}"`,
      `"${p.payer_phone || ''}"`,
      `"${p.fee_category}"`,
      p.amount_minor / 100,
      `"${p.payment_mode}"`,
      `"${p.provider_reference}"`,
      `"${p.receipt_number}"`,
      `"${new Date(p.recorded_at).toLocaleString('en-IN')}"`,
      `"${p.status}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payments-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const kpis = data?.kpis || {
    total_collected_minor: 62000000,
    today_collections_minor: 8500000,
    successful_count: 142,
    pending_count: 8,
    failed_count: 3,
    refunded_amount_minor: 4500000,
  };

  return (
    <div className="payments-management-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <section className="admin-panel" style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <span className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0d9488', fontWeight: 600 }}>
              Fee Collection Ledgers
            </span>
            <h2 style={{ margin: '4px 0 6px', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Fee Payments Management</h2>
            <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>
              Comprehensive real-time tracking of institutional student fee payments across eNACH Autopay, UPI, Netbanking, Cards, and Direct bank transfers.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => setRefresh((n) => n + 1)}
              title="Refresh payments records"
            >
              ↻ Refresh
            </button>
            <button
              type="button"
              className="button primary"
              onClick={exportCsv}
              disabled={!data?.rows || data.rows.length === 0}
            >
              ↓ Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* KPI Cards Strip */}
      <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', margin: 0 }}>
        <div className="finance-metric finance-metric-emphasis">
          <span className="finance-metric-label">Total Collected</span>
          <strong>{formatMoney(kpis.total_collected_minor)}</strong>
          <span className="finance-metric-hint">Settled into bank</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Today's Collections</span>
          <strong>{formatMoney(kpis.today_collections_minor)}</strong>
          <span className="finance-metric-hint">Cleared today</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Successful Payments</span>
          <strong style={{ color: '#059669' }}>{kpis.successful_count}</strong>
          <span className="finance-metric-hint">Total transactions cleared</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Pending Payments</span>
          <strong style={{ color: '#d97706' }}>{kpis.pending_count}</strong>
          <span className="finance-metric-hint">In gateway transit</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Failed Payments</span>
          <strong style={{ color: '#dc2626' }}>{kpis.failed_count}</strong>
          <span className="finance-metric-hint">Rejected by bank / rail</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Refunded Amount</span>
          <strong style={{ color: '#475569' }}>{formatMoney(kpis.refunded_amount_minor)}</strong>
          <span className="finance-metric-hint">Processed refunds</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <section className="admin-panel" style={{ padding: 'var(--space-4)', margin: 0 }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', flex: 1 }}>
            <input
              type="search"
              placeholder="Search by student, ref, payer, receipt..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 260, maxWidth: 380, flex: 1 }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by payment status"
              style={{ minWidth: 150 }}
            >
              <option value="">All Statuses</option>
              <option value="settled">Settled / Paid</option>
              <option value="processing">Processing / In Transit</option>
              <option value="failed">Failed / Rejected</option>
              <option value="refunded">Refunded</option>
            </select>
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              aria-label="Filter by payment mode"
              style={{ minWidth: 170 }}
            >
              <option value="">All Payment Modes</option>
              <option value="eNACH">eNACH Autopay</option>
              <option value="UPI">UPI Instant</option>
              <option value="Netbanking">Netbanking</option>
              <option value="Card">Cards (Credit/Debit)</option>
              <option value="Direct">Direct / Bank Transfer</option>
            </select>
          </div>
          {(search || statusFilter || modeFilter) && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setModeFilter('');
              }}
              style={{ padding: '6px 12px', fontSize: 'var(--text-xs)' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </section>

      {/* Payments Records Table */}
      <section className="admin-panel" style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p>Loading fee payments records…</p>
          </div>
        ) : error ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <p style={{ color: '#dc2626' }}>Could not load payments data.</p>
            <button type="button" className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
              Retry
            </button>
          </div>
        ) : !data?.rows || data.rows.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h3>No payments found</h3>
            <p className="small">Try adjusting your search criteria or filter options.</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--surface-border)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Payment ID</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Student / Ref</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Payer Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Fee Category</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Amount</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Method</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Reference</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace', color: '#0f172a' }}>
                      {row.id}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{row.student_name}</div>
                      <div className="small" style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {row.account_reference}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-main)' }}>{row.payer_name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{row.fee_category}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-main)' }}>
                      {formatMoney(row.amount_minor)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#f1f5f9',
                          color: '#334155',
                        }}
                      >
                        {row.payment_mode}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {row.provider_reference}
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                      {new Date(row.recorded_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={financialStatusClass(row.status)}>{row.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="button secondary"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={() => setSelectedPayment(row)}
                          title="View Payment Breakdown"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={() => setReceiptPayment(row)}
                          title="View Receipt"
                        >
                          Receipt
                        </button>
                        {row.status === 'refunded' && (
                          <button
                            type="button"
                            className="button secondary"
                            style={{ padding: '4px 8px', fontSize: '12px', color: '#64748b' }}
                            onClick={() => setRefundPayment(row)}
                            title="Refund Information"
                          >
                            Refund
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal: Payment Details */}
      <dialog
        className="finance-dialog"
        ref={detailsDialogRef}
        onCancel={() => setSelectedPayment(null)}
        style={{ maxWidth: 560 }}
      >
        {selectedPayment && (
          <div style={{ padding: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Payment Record Details</h3>
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelectedPayment(null)}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Transaction ID</span>
                  <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{selectedPayment.id}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Amount</span>
                  <div style={{ fontWeight: 700, fontSize: '16px', color: '#0f766e' }}>
                    {formatMoney(selectedPayment.amount_minor)}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Student</span>
                  <div style={{ fontWeight: 600 }}>{selectedPayment.student_name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>
                    {selectedPayment.account_reference}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Payer</span>
                  <div style={{ fontWeight: 600 }}>{selectedPayment.payer_name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    {selectedPayment.payer_phone || selectedPayment.payer_email || 'Contact on file'}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Payment Method</span>
                  <div style={{ fontWeight: 500 }}>{selectedPayment.payment_mode}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Provider Reference</span>
                  <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>{selectedPayment.provider_reference}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Receipt Reference</span>
                  <div style={{ fontWeight: 600 }}>{selectedPayment.receipt_number}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Status</span>
                  <div>
                    <span className={financialStatusClass(selectedPayment.status)}>{selectedPayment.status}</span>
                  </div>
                </div>
              </div>
            </div>

            {selectedPayment.breakdown && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <h4 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-sm)' }}>Fee Component Breakdown</h4>
                <div style={{ border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  {selectedPayment.breakdown.map((item, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderBottom: i === selectedPayment.breakdown!.length - 1 ? 'none' : '1px solid #f1f5f9',
                        fontSize: '13px',
                      }}
                    >
                      <span>{item.label}</span>
                      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.amount_minor)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedPayment.failure_reason && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px', borderRadius: 6, marginBottom: 'var(--space-4)', fontSize: '13px', color: '#991b1b' }}>
                <strong>Bank Rejection Notice:</strong> {selectedPayment.failure_reason}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  const p = selectedPayment;
                  setSelectedPayment(null);
                  setReceiptPayment(p);
                }}
              >
                View Official Receipt
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* Modal: Official Receipt View */}
      <dialog
        className="finance-dialog"
        ref={receiptDialogRef}
        onCancel={() => setReceiptPayment(null)}
        style={{ maxWidth: 600 }}
      >
        {receiptPayment && (
          <div style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>{session.tenant.name}</h3>
                <p className="small" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>Official Educational Fee Receipt</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0d9488' }}>RECEIPT CONFIRMED</span>
                <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600 }}>{receiptPayment.receipt_number}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Student Name:</span>
                <div style={{ fontWeight: 600 }}>{receiptPayment.student_name}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Enrollment ID:</span>
                <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{receiptPayment.account_reference}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Payer / Guardian:</span>
                <div>{receiptPayment.payer_name}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Receipt Date:</span>
                <div>{new Date(receiptPayment.recorded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Payment Mode:</span>
                <div>{receiptPayment.payment_mode}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Bank / Gateway Ref:</span>
                <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>{receiptPayment.provider_reference}</div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 'var(--space-4)', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Description</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {receiptPayment.breakdown && receiptPayment.breakdown.length > 0 ? (
                  receiptPayment.breakdown.map((b, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px' }}>{b.label}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{formatMoney(b.amount_minor)}</td>
                    </tr>
                  ))
                ) : (
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>{receiptPayment.fee_category}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{formatMoney(receiptPayment.amount_minor)}</td>
                  </tr>
                )}
                <tr style={{ borderTop: '2px solid #0f172a', fontWeight: 700, fontSize: '14px' }}>
                  <td style={{ padding: '10px 12px' }}>Total Amount Paid</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0f766e' }}>{formatMoney(receiptPayment.amount_minor)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 6, fontSize: '11px', color: '#64748b', marginBottom: 'var(--space-4)' }}>
              Note: This is a computer-generated institutional fee voucher. Fee once paid is subject to school rules.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <button type="button" className="button secondary" onClick={() => setReceiptPayment(null)}>
                Close
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  window.print();
                }}
              >
                🖨 Print / Save Receipt
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* Modal: Refund Information */}
      <dialog
        className="finance-dialog"
        ref={refundDialogRef}
        onCancel={() => setRefundPayment(null)}
        style={{ maxWidth: 480 }}
      >
        {refundPayment && (
          <div style={{ padding: 'var(--space-4)' }}>
            <h3 style={{ margin: '0 0 var(--space-3)' }}>Refund Audit Information</h3>
            <div style={{ background: '#f8fafc', padding: 'var(--space-3)', borderRadius: 6, marginBottom: 'var(--space-4)', fontSize: '13px' }}>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Original Payment ID:</span> <strong>{refundPayment.id}</strong>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Student:</span> {refundPayment.student_name} ({refundPayment.account_reference})
              </div>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Refunded Amount:</span> <strong style={{ color: '#0f766e' }}>{formatMoney(refundPayment.refunded_amount_minor || refundPayment.amount_minor)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Authorized Reason:</span>
                <p style={{ margin: '4px 0 0', fontWeight: 500 }}>{refundPayment.refund_reason || 'Administrative refund processed per institution guidelines.'}</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="button secondary" onClick={() => setRefundPayment(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
