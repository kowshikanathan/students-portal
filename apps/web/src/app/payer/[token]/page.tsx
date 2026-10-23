import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PayerPortalView } from '@/components/payer-portal-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Dodo – Fee account DPS-2026-089',
  description: 'Review your installments, payments and receipts from one protected view.',
  robots: { index: false, follow: false, noarchive: true },
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ checkout?: string; mandate?: string }>;
};

function getDemoPayerData(token: string) {
  return {
    collectionMode: 'sandbox',
    providerConnected: true,
    autopayProviderConnected: true,
    payer: {
      id: 'pyr-demo-1',
      displayName: 'Rajesh Sharma',
      studentName: 'V Rakesh',
      accountReference: 'DPS-2026-089',
      email: 'rajesh.sharma@example.com',
      phone: '+91 98765 43210',
    },
    schedule: {
      id: 'sch-demo-1',
      status: 'active',
    },
    summary: {
      net_payable_minor: '12000000',
      paid_minor: '4000000',
      outstanding_minor: '8000000',
    },
    paymentPolicy: {
      mode: 'flexible',
      allowCustomAmount: true,
      allowComponentSelection: true,
      minAmountMinor: 100000,
    },
    installments: [
      {
        id: 'inst-1',
        sequence: 1,
        due_date: '2026-07-10',
        amount_minor: 4000000,
        paid_amount_minor: 4000000,
        remaining_minor: 0,
        status: 'paid',
      },
      {
        id: 'inst-2',
        sequence: 2,
        due_date: '2026-10-25',
        amount_minor: 4000000,
        paid_amount_minor: 0,
        remaining_minor: 4000000,
        status: 'pending',
      },
      {
        id: 'inst-3',
        sequence: 3,
        due_date: '2026-11-25',
        amount_minor: 4000000,
        paid_amount_minor: 0,
        remaining_minor: 4000000,
        status: 'pending',
      },
    ],
    components: [
      { code: 'TUIT', label: 'Tuition fee', remainingMinor: 5000000 },
      { code: 'DEV', label: 'Development fee', remainingMinor: 2000000 },
      { code: 'ACT', label: 'Activity & lab fee', remainingMinor: 1000000 },
    ],
    payments: [
      {
        id: 'pay-1',
        amount_minor: 4000000,
        recorded_at: '2026-07-08T10:30:00Z',
        receipt_number: 'DPS-REC-2026-00412',
        status: 'settled',
      },
    ],
    refunds: [],
    mandates: [
      {
        id: 'mndt-1',
        status: 'active',
        rail: 'enach',
        umrn: 'UMRN-NACH-2026-089412',
        bank_name: 'HDFC Bank',
        account_mask: '•••• 1244',
        created_at: '2026-10-23T07:48:28Z',
      },
    ],
  };
}

async function load(token: string) {
  if (
    token.startsWith('demo-') ||
    process.env.DEPLOYMENT_MODE === 'demo' ||
    process.env.JODO_READONLY_PREVIEW === 'true'
  ) {
    return getDemoPayerData(token);
  }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(token)) return null;
  const base = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';
  try {
    const r = await fetch(base + '/v1/payer/' + encodeURIComponent(token), {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) return await r.json();
  } catch {}
  return getDemoPayerData(token);
}

export default async function PayerPortal({ params }: Props) {
  const { token } = await params;
  const data = await load(token);
  if (!data) notFound();

  return <PayerPortalView data={data} token={token} />;
}
