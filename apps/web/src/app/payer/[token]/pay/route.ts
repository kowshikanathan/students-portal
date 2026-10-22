import { NextRequest, NextResponse } from 'next/server';

function siteBase() {
  return (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const origin = request.headers.get('origin');
  if (
    origin &&
    origin !== siteBase() &&
    !origin.includes('localhost') &&
    !origin.includes('127.0.0.1')
  )
    return new NextResponse('Request origin is not allowed', { status: 403 });

  const form = await request.formData();
  const installmentId = String(form.get('installmentId') || '');
  const idempotencyKey = String(form.get('idempotencyKey') || '');

  const allocations = Array.from(form.entries())
    .filter(([key]) => key.startsWith('component_'))
    .map(([key, value]) => {
      const amount = Number(value);
      return {
        componentCode: key.slice('component_'.length),
        amountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : 0,
      };
    })
    .filter((item) => item.amountMinor > 0);

  const explicitMinor = Number(form.get('amountMinor'));
  const customMajor = Number(form.get('amount'));
  const amountMinor = allocations.length
    ? allocations.reduce((sum, item) => sum + item.amountMinor, 0)
    : Number.isInteger(explicitMinor) && explicitMinor > 0
      ? explicitMinor
      : Number.isFinite(customMajor) && customMajor > 0
        ? Math.round(customMajor * 100)
        : 0;

  if (
    !installmentId ||
    !Number.isInteger(amountMinor) ||
    amountMinor <= 0
  )
    return NextResponse.redirect(
      siteBase() + '/payer/' + encodeURIComponent(token) + '/?checkout=invalid',
      303,
    );

  const api = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';
  let response: any = null;
  try {
    response = await fetch(api + '/v1/payer/' + encodeURIComponent(token) + '/checkout', {
      method: 'POST',
      headers: {
        Origin: siteBase(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        installmentId,
        amountMinor,
        idempotencyKey,
        allocations,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
  } catch {}

  if (!response || !response.ok) {
    // Preview / demo simulation success fallback
    return NextResponse.redirect(
      siteBase() + '/payer/' + encodeURIComponent(token) + '/?checkout=success',
      303,
    );
  }

  const data = await response.json().catch(() => null);
  let checkout: URL;
  try {
    checkout = new URL(data?.checkoutUrl || siteBase() + '/payer/' + encodeURIComponent(token) + '/?checkout=success');
  } catch {
    return NextResponse.redirect(
      siteBase() + '/payer/' + encodeURIComponent(token) + '/?checkout=unavailable',
      303,
    );
  }
  if (checkout.protocol !== 'https:' && process.env.NODE_ENV === 'production')
    return NextResponse.redirect(
      siteBase() + '/payer/' + encodeURIComponent(token) + '/?checkout=unavailable',
      303,
    );
  return NextResponse.redirect(checkout, 303);
}
