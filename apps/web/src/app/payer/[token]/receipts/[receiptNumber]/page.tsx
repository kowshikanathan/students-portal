import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReceiptPrint } from '@/components/receipt-print';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Payment receipt',
  robots: { index: false, follow: false, noarchive: true },
};
export default async function Receipt({
  params,
}: {
  params: Promise<{ token: string; receiptNumber: string }>;
}) {
  const { token, receiptNumber } = await params;
  if (
    !/^[A-Za-z0-9_-]{30,100}$/.test(token) ||
    !/^RCP-(?:[A-Z0-9]{8}|[A-F0-9]{32})$/.test(receiptNumber)
  )
    notFound();
  const response = await fetch(
    (process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000') +
      '/v1/payer/' +
      encodeURIComponent(token) +
      '/receipts/' +
      encodeURIComponent(receiptNumber),
    { cache: 'no-store', signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok) notFound();
  const receipt = await response.json();
  const snapshot = receipt.snapshot || {};
  const date =
    snapshot.directPayment?.transactionDate ||
    snapshot.occurredAt ||
    snapshot.recordedAt ||
    receipt.issued_at;
  const rows = [
    ['Receipt number', receipt.receipt_number],
    ['Student', snapshot.studentName || snapshot.accountReference],
    ['Institute', snapshot.instituteName || '—'],
    ['Account', snapshot.accountReference],
    [
      'Amount',
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
        Number(snapshot.amountMinor) / 100,
      ),
    ],
    [
      'Transaction date',
      new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(date)),
    ],
    ['Payment mode', snapshot.directPayment?.mode || snapshot.provider || 'External payment'],
    ['Reference', snapshot.providerReference],
    ['Notes', snapshot.notes || '—'],
  ];
  return (
    <main id="main" className="payer-portal">
      <header className="payer-portal-header">
        <strong>{process.env.NEXT_PUBLIC_BRAND_NAME || 'Dodo'}</strong>
        <ReceiptPrint />
      </header>
      <section className="payer-card">
        <p className="eyebrow">FEE ACCOUNT RECORD</p>
        <h1>Payment receipt</h1>
        {snapshot.provider === 'sandbox_enach' && (
          <p className="status-pill warn">Sandbox receipt · no money movement</p>
        )}
        <table className="admin-table">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Link className="no-print" href={'/payer/' + encodeURIComponent(token) + '/'}>
        Back to fee account
      </Link>
    </main>
  );
}
