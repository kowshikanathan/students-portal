'use client';

import { useEffect, useState } from 'react';
import { useAdminApi } from './context';
import { MandateWorkspace } from './mandate-workspace';
import { EnachExtras, EnachInfo } from './enach-extras';
import type { MandateDashboardData, MandateView } from './mandate-view-model';

type Props = {
  openFeeOperations: (target: 'payer' | 'schedule' | 'reconciliation') => void;
  initialView?: MandateView;
  onViewChange?: (view: MandateView) => void;
};
type Schedule = {
  id: string;
  account_reference: string;
  payer_id?: string | null;
  status: string;
};
type ProviderState = {
  provider?: string | null;
  autopayMode?: string;
  reconciliationMode?: string;
};
const emptyData: MandateDashboardData = {
  mandates: [],
  setups: [],
  debits: [],
  settlements: [],
  checkouts: [],
};

export function EnachDashboard({
  openFeeOperations,
  initialView = 'mandates',
  onViewChange,
}: Props) {
  const { request, session } = useAdminApi();
  const [data, setData] = useState<MandateDashboardData>(emptyData);
  const [displayView, setDisplayView] = useState<MandateView>(initialView);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [provider, setProvider] = useState<ProviderState | null>(null);
  const [cases, setCases] = useState<Array<{ id: string; status: string }>>([]);
  const [failedResources, setFailedResources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const resources = [
      ['mandates', () => request<MandateDashboardData['mandates']>('admin/fees/mandates')],
      ['setups', () => request<MandateDashboardData['setups']>('admin/fees/mandate-setups')],
      ['debits', () => request<MandateDashboardData['debits']>('admin/fees/autopay-attempts')],
      [
        'settlements',
        () => request<MandateDashboardData['settlements']>('admin/fees/settlements'),
      ],
      [
        'checkouts',
        () => request<MandateDashboardData['checkouts']>('admin/fees/checkout-sessions'),
      ],
      ['schedules', () => request<Schedule[]>('admin/fees/schedules')],
      ['provider', () => request<ProviderState>('provider/payments/status')],
      [
        'cases',
        () =>
          request<Array<{ id: string; status: string }>>(
            'admin/fees/mandate-reconciliation-cases',
          ),
      ],
    ] as const;
    const results = await Promise.allSettled(resources.map(([, run]) => run()));
    const failures: string[] = [];
    results.forEach((result, index) => {
      const key = resources[index]![0];
      if (result.status === 'rejected') {
        failures.push(key);
        return;
      }
      const value = result.value;
      if (
        key === 'mandates' ||
        key === 'setups' ||
        key === 'debits' ||
        key === 'settlements' ||
        key === 'checkouts'
      ) {
        setData((previous) => ({ ...previous, [key]: value as Record<string, any>[] }));
      } else if (key === 'schedules') {
        setSchedules(value as Schedule[]);
      } else if (key === 'provider') {
        setProvider(value as ProviderState);
      } else if (key === 'cases') {
        setCases(value as Array<{ id: string; status: string }>);
      }
    });
    setFailedResources(failures);
    setLoading(false);
    if (failures.length)
      throw new Error('Some eNACH records could not load: ' + failures.join(', '));
  }

  useEffect(() => {
    // Initialization errors appear in the dashboard, not as unhandled promises.
    void load().catch(() => undefined);
  }, [session.tenant.id]);

  async function createPayerLink(scheduleId: string) {
    const result = await request<{ path: string }>(
      'admin/fees/schedules/' + encodeURIComponent(scheduleId) + '/payer-link',
      'POST',
      {
        expiresHours: 72,
        paymentMode: 'full_balance',
        allowCustomAmount: false,
        allowComponentSelection: false,
      },
    );
    if (!result.path.startsWith('/payer/'))
      throw new Error('Unexpected secure payer link response');
    return window.location.origin + result.path;
  }

  const uncertain = data.setups.filter((entry) => entry.status === 'uncertain').length;
  const active = data.mandates.filter((entry) => entry.status === 'active').length;
  const unresolved = cases.filter((entry) => entry.status === 'open').length;
  useEffect(() => setDisplayView(initialView), [initialView]);

  return (
    <section aria-label="eNACH and AutoPay dashboard">
      <div className="admin-panel">
        <p className="eyebrow">Dodo · eNACH operations</p>
        <div className="enach-section-heading">
          <h2>eNACH & AutoPay dashboard</h2>
          <EnachInfo topic="See actual mandate and debit records, plus pending provider investigations. A zero count means there are no matching records returned." label="Explain dashboard overview" />
        </div>
        <p>
          Manage mandate registrations, recurring debit attempts, settlements and pending
          investigations using the existing tenant-scoped financial services.
        </p>
        <div className="dashboard-stats">
          {[
            ['Active mandates', active],
            [
              'Pending setups',
              data.setups.filter((item) => ['requested', 'created'].includes(item.status)).length,
            ],
            ['Uncertain setups', uncertain],
            ['Open investigations', unresolved],
          ].map(([label, value]) => (
            <div className="dashboard-stat" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <p role="status" className="small">
          Provider: {provider?.provider || 'Not configured'} · Live registration:{' '}
          {provider?.autopayMode === 'mandate_api' ? 'configured' : 'disabled'} · Bank inquiry:{' '}
          {provider?.reconciliationMode === 'read_only' ? 'configured' : 'disabled'}
        </p>
        {failedResources.length > 0 && (
          <div className="admin-notice" role="alert">
            <p>Could not load: {failedResources.join(', ')}. Other sections remain available.</p>
            <button
              type="button"
              className="button outline"
              disabled={loading}
              onClick={() => void load().catch(() => undefined)}
            >
              Retry failed data
            </button>
          </div>
        )}
        <div className="admin-toolbar">
          <button
            type="button"
            className="button outline"
            onClick={() => openFeeOperations('payer')}
          >
            Create payer profile
          </button>
          <button
            type="button"
            className="button outline"
            onClick={() => openFeeOperations('schedule')}
          >
            Create fee schedule
          </button>
          <button
            type="button"
            className="button outline"
            onClick={() => openFeeOperations('reconciliation')}
          >
            Reconciliation and evidence review
          </button>
        </div>
        {unresolved > 0 && (
          <p className="admin-notice" role="status">
            {unresolved} investigation(s) need review. An inquiry cannot authorize debits or
            establish a mandate; verified provider callbacks remain authoritative.
          </p>
        )}
      </div>
      <div className="admin-panel">
        <MandateWorkspace
          key={displayView}
          initialView={displayView}
          showFieldHelp
          onViewChange={(next) => {
            setDisplayView(next);
            onViewChange?.(next);
          }}
          data={data}
          schedules={schedules}
          providerName={provider?.provider}
          providerMode={provider?.autopayMode}
          readOnly={session.tenant.readOnly === true}
          onRefresh={load}
          onPayerLink={createPayerLink}
          onPreparePayer={() => openFeeOperations('payer')}
          onPrepareSchedule={() => openFeeOperations('schedule')}
        />
      </div>
      <EnachExtras
        data={data}
        view={displayView}
        onViewChange={(next) => {
          setDisplayView(next);
          onViewChange?.(next);
        }}
        loaded={!loading}
        failedResources={failedResources}
      />
    </section>
  );
}
