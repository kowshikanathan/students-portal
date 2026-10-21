'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="wrap narrow section">
      <h1>This page is temporarily unavailable.</h1>
      <p>
        The service could not complete this request. Refresh to reload your records. A payment is
        confirmed only when it appears in your ledger.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
      <Link className="button outline" href="/admin/">
        Finance dashboard
      </Link>
    </main>
  );
}
