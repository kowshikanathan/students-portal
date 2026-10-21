'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdminApi } from './context';

export function FinanceSettings() {
  const { request, session } = useAdminApi();
  const [provider, setProvider] = useState<{ autopayMode: string; moneyMovement: boolean } | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    request<{ autopayMode: string; moneyMovement: boolean }>('provider/payments/status')
      .then((value) => {
        if (active) setProvider(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [session.tenant.id, refresh]);
  return (
    <div className="admin-grid">
      <section className="admin-panel">
        <p className="eyebrow">INSTITUTE CONFIGURATION</p>
        <h2>Finance settings</h2>
        <p>{session.tenant.name}</p>
        <nav className="student-financial-nav" aria-label="Finance settings">
          <Link href="/admin/fee-plans/">Fee components, master plans and scholarships</Link>
          <Link href="/admin/tenant/">Institute, academic years and access</Link>
          <Link href="/admin/audit/">Audit logs and exports</Link>
          <Link href="/admin/fees/reconciliation/">Settlement reconciliation</Link>
        </nav>
      </section>
      <section className="admin-panel">
        <h3>Collection provider</h3>
        {error ? (
          <>
            <p role="alert">Provider status could not be loaded.</p>
            <button className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
              Retry
            </button>
          </>
        ) : !provider ? (
          <p role="status">Loading provider status…</p>
        ) : (
          <>
            <span className="status-pill">
              {provider.autopayMode === 'sandbox' ? 'Sandbox eNACH' : provider.autopayMode}
            </span>
            <p>
              {provider.moneyMovement
                ? 'External payment capabilities are configured.'
                : 'Simulation and ledger operations do not move real money.'}
            </p>
          </>
        )}
        <p className="small">Your active workspace role: {session.tenant.role}</p>
      </section>
    </div>
  );
}
