'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { AdminContext, Session } from './context';
import { canViewAdminArea, safeAdminArea } from './access';
import { ContentList } from './content-list';
import { Leads } from './leads';
import { TenantEnquiries } from './tenant-enquiries';
import { TenantNotifications } from './tenant-notifications';
import { TenantCollections } from './tenant-collections';
import { Workflows } from './workflows';
import { Campaigns, Media, Settings, Records } from './panels';
import { FinanceDashboard } from './finance-dashboard';
import { FinanceSettings } from './finance-settings';
import { FinanceBulk } from './finance-bulk';
import { FinanceRecords, type FinanceRecordKind } from './finance-records';
import { FeeOperations } from './fees';
import { EnachDashboard } from './enach-dashboard';
import { mandateViews, type MandateView } from './mandate-view-model';
import { TenancyStudio } from './tenancy';
import { AcademicOperations } from './academic';
import { Students } from './students';
import { StudentProfile } from './student-profile';
import { FeePlanStudio } from './fee-plans';
const sections = [
  ['overview', 'Dashboard'],
  ['academic', 'Students'],
  ['installments', 'Installments'],
  ['payments', 'Payments'],
  ['settlements', 'Settlements'],
  ['enach', 'Flex / eNACH'],
  ['cashflow', 'Cashflow'],
  ['overdue', 'Overdue'],
  ['reports', 'Reports'],
  ['bulk', 'Bulk Actions'],
  ['tenant', 'Institutes'],
  ['groups', 'Groups / Classes'],
  ['users', 'Users'],
  ['settings', 'Settings'],
];
export function AdminShell({
  initialArea = 'overview',
  standaloneEnach = false,
  initialFeeTarget = null,
  studentId,
}: {
  initialArea?: string;
  standaloneEnach?: boolean;
  initialFeeTarget?: 'payer' | 'schedule' | 'reconciliation' | null;
  studentId?: string;
} = {}) {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [area, setArea] = useState(initialArea);
  const [enachView, setEnachView] = useState<MandateView>('mandates');
  const [feeTarget, setFeeTarget] = useState<'payer' | 'schedule' | 'reconciliation' | null>(
    initialFeeTarget,
  );
  async function sync() {
    try {
      setSession(await api<Session>('/v1/auth/me'));
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void sync();
    const restore = () => {
      setSession(null);
      setLoading(true);
      void sync();
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    window.addEventListener('pageshow', restore);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pageshow', restore);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  async function signOut(everywhere: boolean) {
    if (!session || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(everywhere ? '/v1/auth/logout-all' : '/v1/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': session.csrf },
        body: '{}',
      });
      setSession(null);
      setArea('overview');
      try {
        for (const key of Object.keys(sessionStorage))
          if (key.startsWith('jodo-draft:')) sessionStorage.removeItem(key);
      } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main id="main" className="admin-login">
        <p role="status">Checking the staff session…</p>
      </main>
    );
  if (!session)
    return (
      <main id="main" className="admin-login">
        <form
          className="login-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const f = new FormData(e.currentTarget);
              setSession(
                await api<Session>('/v1/auth/login', {
                  method: 'POST',
                  body: JSON.stringify(Object.fromEntries(f)),
                }).then(() => api<Session>('/v1/auth/me')),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="brand brand-wordmark" aria-label="Owner workspace">
            <span className="brand-mark" aria-hidden="true">
              ◆
            </span>
            <strong>Dodo owner workspace</strong>
          </div>
          <h1>Your owner workspace.</h1>
          <p>Manage students, fees and collections for your institute.</p>
          <label className="field">
            Staff email
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label className="field">
            Password
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <label className="field">
            Authenticator code
            <input
              name="otp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
          </label>
          {error && (
            <p className="error-card" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? 'Verifying…' : 'Sign in securely'}
          </button>
          <p className="small" style={{ marginTop: 20 }}>
            No default password is included. Provision your owner with{' '}
            <code>npm run create:owner</code>.
          </p>
          <Link href="/" className="small">
            ← Back to the website
          </Link>
        </form>
      </main>
    );
  const activeArea = standaloneEnach
    ? canViewAdminArea(session.tenant.role, 'enach', session.tenant.permissions)
      ? 'enach'
      : 'overview'
    : safeAdminArea(session.tenant.role, area, session.tenant.permissions);
  const render = () => {
    if (['installments', 'payments', 'settlements', 'overdue'].includes(activeArea))
      return (
        <FinanceRecords
          key={session.tenant.id + activeArea}
          kind={activeArea as FinanceRecordKind}
        />
      );
    if (activeArea === 'debits' || activeArea === 'failed-debits')
      return (
        <FinanceRecords
          key={session.tenant.id + activeArea}
          kind="debits"
          initialStatus={activeArea === 'failed-debits' ? 'failed' : ''}
        />
      );
    if (activeArea === 'reports')
      return <FinanceRecords key={session.tenant.id + 'reports'} report />;
    if (activeArea === 'cashflow')
      return <FinanceDashboard key={session.tenant.id + 'cashflow'} cashflow />;
    if (activeArea === 'bulk') return <FinanceBulk key={session.tenant.id} />;
    if (activeArea === 'academic-tools' || activeArea === 'groups')
      return <AcademicOperations key={session.tenant.id + activeArea} />;
    switch (activeArea) {
      case 'overview':
        return session.tenant.role === 'owner' ||
          session.tenant.permissions?.includes('dashboard.read') ? (
          <FinanceDashboard />
        ) : (
          <section className="admin-panel">
            <h2>Finance workspace</h2>
            <p>Your current role has no finance access. Contact your institute administrator.</p>
          </section>
        );
      case 'content':
        return <ContentList />;
      case 'leads':
        return <Leads />;
      case 'enquiries':
        return <TenantEnquiries />;
      case 'notifications':
        return <TenantNotifications openEnquiries={() => setArea('enquiries')} />;
      case 'collections':
        return <TenantCollections />;
      case 'campaigns':
        return <Campaigns />;
      case 'workflows':
        return <Workflows />;
      case 'fees':
        return <FeeOperations scrollTarget={feeTarget} />;
      case 'enach':
        return (
          <EnachDashboard
            key={session.tenant.id}
            initialView={enachView}
            onViewChange={setEnachView}
            openFeeOperations={(target) => {
              if (standaloneEnach) {
                window.location.assign('/admin/fees/' + target + '/');
              } else {
                setFeeTarget(target);
                setArea('fees');
                window.history.replaceState(null, '', '/admin/');
              }
            }}
          />
        );
      case 'fee-plans':
        return <FeePlanStudio />;
      case 'academic':
        return studentId ? (
          <StudentProfile key={session.tenant.id + studentId} studentId={studentId} />
        ) : (
          <Students key={session.tenant.id} />
        );
      case 'tenant':
      case 'users':
        return <TenancyStudio />;
      case 'media':
        return <Media />;
      case 'settings':
        return <FinanceSettings key={session.tenant.id} />;
      default:
        return <Records key={activeArea} area={activeArea} />;
    }
  };
  return (
    <AdminContext.Provider value={session}>
      <div className="admin-root admin-shell">
        <aside className="admin-sidebar">
          <Link href={standaloneEnach ? '/enach/' : '/admin/'} className="admin-logo">
            Dodo<span className="yellow-dot">.</span>
            {standaloneEnach ? ' eNACH' : ' finance'}
          </Link>
          <p>{standaloneEnach ? 'DODO · ENACH CONSOLE' : 'DODO · INSTITUTION CONSOLE'}</p>
          {standaloneEnach ? (
            <nav className="admin-nav" aria-label="eNACH navigation">
              <button
                type="button"
                className={enachView === 'mandates' ? 'selected' : ''}
                onClick={() => setEnachView('mandates')}
              >
                Mandate overview
              </button>
              {mandateViews
                .filter((item) => item.id !== 'mandates')
                .map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={enachView === item.id ? 'selected' : ''}
                    onClick={() => setEnachView(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              <a href="#enach-custom-fields">Custom fields</a>
              <a href="#enach-reports">Reports</a>
              <Link href="/admin/fees/">Payers & fee schedules ↗</Link>
              <Link href="/admin/fees/reconciliation/">Reconciliation & evidence ↗</Link>
              <Link href="/admin/">← Dodo Finance</Link>
            </nav>
          ) : (
            <nav className="admin-nav" aria-label="Finance navigation">
              {sections
                .filter(([key]) =>
                  canViewAdminArea(session.tenant.role, key!, session.tenant.permissions),
                )
                .map(([key, title]) => (
                  <button
                    className={activeArea === key ? 'selected' : ''}
                    key={key}
                    onClick={() => {
                      if (key === 'academic') {
                        window.location.assign('/admin/students/');
                        return;
                      }
                      setFeeTarget(null);
                      setArea(key!);
                      if (window.location.pathname !== '/admin/') {
                        window.history.replaceState(null, '', '/admin/');
                      }
                    }}
                  >
                    {title}
                  </button>
                ))}
            </nav>
          )}
        </aside>
        <main id="main" className="admin-main">
          <div className="admin-topbar">
            <div>
              <h1>
                {standaloneEnach
                  ? 'eNACH operations'
                  : sections.find((item) => item[0] === activeArea)?.[1] || 'Finance workspace'}
              </h1>
              <p>
                {session.user.email} · {session.tenant.name} · {session.tenant.role}
              </p>
            </div>
            <div className="admin-top-actions">
              {session.workspaces.length > 1 && (
                <label className="small">
                  Workspace
                  <select
                    aria-label="Active workspace"
                    value={session.tenant.id}
                    onChange={async (event) => {
                      try {
                        await api('/v1/auth/switch-tenant', {
                          method: 'POST',
                          headers: { 'X-CSRF-Token': session.csrf },
                          body: JSON.stringify({ tenantId: event.target.value }),
                        });
                        setArea('overview');
                        setLoading(true);
                        await sync();
                      } catch (error) {
                        setError((error as Error).message);
                      }
                    }}
                  >
                    {session.workspaces.map((workspace) => (
                      <option value={workspace.id} key={workspace.id}>
                        {workspace.name} · {workspace.role}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <span className="status-pill">MFA session</span>
              <button disabled={busy} onClick={() => void signOut(false)}>
                Sign out
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Sign out every session on all devices and workspaces?'))
                    void signOut(true);
                }}
              >
                Sign out everywhere
              </button>
            </div>
          </div>
          {session.tenant.readOnly && (
            <div role="status" className="admin-notice">
              <strong>Read-only institution.</strong>
              <p>This workspace is restricted. Existing records remain available for review.</p>
              <p>Changes are blocked. Switch to another active institution if you have access.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="error-card">
              {error}
            </p>
          )}
          {standaloneEnach && !canViewAdminArea(session.tenant.role, 'enach') ? (
            <div className="admin-panel" role="alert">
              <h2>Owner access required</h2>
              <p>This financial workspace is restricted to authorized institution owners.</p>
              <Link href="/admin/">Return to Dodo Finance</Link>
            </div>
          ) : (
            render()
          )}
        </main>
      </div>
    </AdminContext.Provider>
  );
}
