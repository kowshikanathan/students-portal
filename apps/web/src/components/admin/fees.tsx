'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAdminApi } from './context';
import { MandateWorkspace } from './mandate-workspace';

type Installment = {
  id: string;
  sequence: number;
  dueDate: string;
  amountMinor: number | string;
  paidAmountMinor: number | string;
  status: string;
};
type Payer = {
  id: string;
  accountReference: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  preferredChannel: 'email' | 'whatsapp' | 'none';
  active: boolean;
  schedules: number;
};
type Schedule = {
  id: string;
  account_reference: string;
  payer_id?: string | null;
  scope_type?: string;
  scope_reference?: string;
  gross_amount_minor?: number | string | null;
  concession_amount_minor?: number | string;
  components?: Array<{
    code: string;
    label: string;
    amountMinor: number | string;
    bankRouteKey?: string | null;
  }>;
  concessions?: Array<{
    code: string;
    label: string;
    amountMinor: number | string;
    reason: string;
  }>;
  late_fee?: {
    mode: string;
    graceDays: number;
    amountMinor: number | string;
    capMinor?: number | string | null;
  } | null;
  currency: string;
  total_amount_minor: number | string;
  note: string;
  status: string;
  version: number;
  installments: Installment[];
};
const rupees = (minor: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    Number(minor || 0) / 100,
  );
const toMinor = (value: FormDataEntryValue | null) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a valid positive amount');
  return Math.round(n * 100);
};

export function FeeOperations() {
  const { request, session } = useAdminApi();
  const [overview, setOverview] = useState<any>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [mandates, setMandates] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [payers, setPayers] = useState<Payer[]>([]);
  const [communications, setCommunications] = useState<any[]>([]);
  const [providerEvents, setProviderEvents] = useState<any[]>([]);
  const [providerStatus, setProviderStatus] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [lateFees, setLateFees] = useState<any[]>([]);
  const [mandateSetups, setMandateSetups] = useState<any[]>([]);
  const [mandateCases, setMandateCases] = useState<any[]>([]);
  const [mandateEvidence, setMandateEvidence] = useState<any[]>([]);
  const [autopayAttempts, setAutopayAttempts] = useState<any[]>([]);
  const [checkoutSessions, setCheckoutSessions] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [scheduleFeedback, setScheduleFeedback] = useState('');
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [installmentRows, setInstallmentRows] = useState([{ dueDate: '', amount: '' }]);
  const [componentRows, setComponentRows] = useState([
    { code: 'tuition', label: 'Tuition fee', amount: '', bankRouteKey: '' },
  ]);
  const [concessionRows, setConcessionRows] = useState<
    Array<{ code: string; label: string; amount: string; reason: string }>
  >([]);

  // Fetch each panel independently: a failure in communications or analytics
  // must not make mandate, settlement and reconciliation controls appear empty.
  const load = async () => {
    const resources: Array<{ label: string; run: () => Promise<void> }> = [
      { label: 'fee overview', run: async () => setOverview(await request('admin/fees/overview')) },
      {
        label: 'fee schedules',
        run: async () => setSchedules(await request<Schedule[]>('admin/fees/schedules')),
      },
      {
        label: 'payments',
        run: async () => setPayments(await request<any[]>('admin/fees/payments')),
      },
      {
        label: 'mandates',
        run: async () => setMandates(await request<any[]>('admin/fees/mandates')),
      },
      {
        label: 'settlements',
        run: async () => setSettlements(await request<any[]>('admin/fees/settlements')),
      },
      { label: 'payers', run: async () => setPayers(await request<Payer[]>('admin/payers')) },
      {
        label: 'communications',
        run: async () => setCommunications(await request<any[]>('admin/fees/communications')),
      },
      {
        label: 'provider events',
        run: async () => setProviderEvents(await request<any[]>('admin/fees/provider-events')),
      },
      {
        label: 'provider status',
        run: async () => setProviderStatus(await request<any>('provider/payments/status')),
      },
      {
        label: 'analytics',
        run: async () => setAnalytics(await request<any>('admin/fees/analytics')),
      },
      {
        label: 'late fees',
        run: async () => setLateFees(await request<any[]>('admin/fees/late-fees')),
      },
      {
        label: 'mandate setups',
        run: async () => setMandateSetups(await request<any[]>('admin/fees/mandate-setups')),
      },
      {
        label: 'automatic debits',
        run: async () => setAutopayAttempts(await request<any[]>('admin/fees/autopay-attempts')),
      },
      {
        label: 'checkouts',
        run: async () => setCheckoutSessions(await request<any[]>('admin/fees/checkout-sessions')),
      },
      {
        label: 'reconciliation cases',
        run: async () =>
          setMandateCases(await request<any[]>('admin/fees/mandate-reconciliation-cases')),
      },
      {
        label: 'reconciliation evidence',
        run: async () =>
          setMandateEvidence(await request<any[]>('admin/fees/mandate-reconciliation-evidence')),
      },
    ];
    const results = await Promise.allSettled(resources.map((item) => item.run()));
    const failed = results.flatMap((result, i) =>
      result.status === 'rejected' ? [resources[i]!.label] : [],
    );
    setLoadError(
      failed.length ? 'Some fee data could not load: ' + failed.join(', ') + '.' : '',
    );
  };
  useEffect(() => {
    void load();
  }, [session.tenant.id]);

  const refreshMandateWorkspace = async () => {
    const resources: Array<{ label: string; run: () => Promise<void> }> = [
      {
        label: 'mandates',
        run: async () => setMandates(await request<any[]>('admin/fees/mandates')),
      },
      {
        label: 'settlements',
        run: async () => setSettlements(await request<any[]>('admin/fees/settlements')),
      },
      {
        label: 'provider status',
        run: async () => setProviderStatus(await request<any>('provider/payments/status')),
      },
      {
        label: 'mandate setups',
        run: async () => setMandateSetups(await request<any[]>('admin/fees/mandate-setups')),
      },
      {
        label: 'automatic debits',
        run: async () => setAutopayAttempts(await request<any[]>('admin/fees/autopay-attempts')),
      },
      {
        label: 'checkouts',
        run: async () => setCheckoutSessions(await request<any[]>('admin/fees/checkout-sessions')),
      },
      {
        label: 'reconciliation cases',
        run: async () =>
          setMandateCases(await request<any[]>('admin/fees/mandate-reconciliation-cases')),
      },
      {
        label: 'reconciliation evidence',
        run: async () =>
          setMandateEvidence(await request<any[]>('admin/fees/mandate-reconciliation-evidence')),
      },
    ];
    const results = await Promise.allSettled(resources.map((item) => item.run()));
    const failed = results.flatMap((result, i) =>
      result.status === 'rejected' ? [resources[i]!.label] : [],
    );
    if (failed.length)
      throw new Error(
        'Could not refresh: ' +
          failed.join(', ') +
          '. Successfully loaded records are still displayed.',
      );
  };

  const activeInstallments = useMemo(
    () =>
      schedules.flatMap((s) =>
        s.status === 'active'
          ? s.installments
              .filter((i) => !['paid', 'cancelled'].includes(i.status))
              .map((i) => ({ ...i, schedule: s }))
          : [],
      ),
    [schedules],
  );

  async function createSchedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (scheduleSubmitting) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    setScheduleFeedback('');
    try {
      const feeTotal = componentRows.reduce((sum, row) => sum + toMinor(row.amount), 0);
      const concessionTotal = concessionRows.reduce(
        (sum, row) => sum + toMinor(row.amount),
        0,
      );
      const installmentTotal = installmentRows.reduce(
        (sum, row) => sum + toMinor(row.amount),
        0,
      );
      if (installmentTotal !== feeTotal - concessionTotal) {
        throw new Error(
          'Installment amounts must add up to the fee components minus concessions. ' +
            'Review the amounts above before creating the draft.',
        );
      }
      setScheduleSubmitting(true);
      await request('admin/fees/schedules', 'POST', {
        accountReference: String(f.get('accountReference') || ''),
        ...(String(f.get('payerId') || '') ? { payerId: String(f.get('payerId')) } : {}),
        scopeType: String(f.get('scopeType') || 'custom'),
        scopeReference: String(f.get('scopeReference') || 'custom'),
        currency: 'INR',
        components: componentRows.map((row) => ({
          code: row.code,
          label: row.label,
          amountMinor: toMinor(row.amount),
          ...(row.bankRouteKey ? { bankRouteKey: row.bankRouteKey } : {}),
        })),
        concessions: concessionRows.map((row) => ({
          code: row.code,
          label: row.label,
          amountMinor: toMinor(row.amount),
          reason: row.reason,
        })),
        ...(String(f.get('lateFeeAmount') || '')
          ? {
              lateFee: {
                mode: String(f.get('lateFeeMode') || 'fixed_once'),
                graceDays: Number(f.get('lateFeeGraceDays') || 0),
                amountMinor: toMinor(f.get('lateFeeAmount')),
                ...(String(f.get('lateFeeCap') || '')
                  ? { capMinor: toMinor(f.get('lateFeeCap')) }
                  : {}),
              },
            }
          : {}),
        note: String(f.get('note') || ''),
        installments: installmentRows.map((row) => ({
          dueDate: row.dueDate,
          amountMinor: toMinor(row.amount),
        })),
      });
      form.reset();
      setInstallmentRows([{ dueDate: '', amount: '' }]);
      setComponentRows([{ code: 'tuition', label: 'Tuition fee', amount: '', bankRouteKey: '' }]);
      setConcessionRows([]);
      setScheduleFeedback(
        'Draft fee schedule created. Find it under Fee schedules below and select Activate schedule.',
      );
      await load();
    } catch (e) {
      setScheduleFeedback((e as Error).message);
    } finally {
      setScheduleSubmitting(false);
    }
  }

  const uncertainMandateSetups = mandateSetups.filter((setup) => setup.status === 'uncertain');

  async function openMandateCase(e: FormEvent<HTMLFormElement>, setupId: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = new FormData(form);
    try {
      await request(
        'admin/fees/mandate-setups/' + encodeURIComponent(setupId) + '/reconciliation',
        'POST',
        {
          providerCaseReference: String(fields.get('providerCaseReference') || ''),
          evidenceSummary: String(fields.get('evidenceSummary') || 'provider_inquiry_opened'),
        },
      );
      await load();
      setMessage(
        'Investigation recorded. Mandate remains blocked pending verified provider evidence.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function inquireMandateProvider(caseId: string) {
    try {
      await request(
        'admin/fees/mandate-reconciliation-cases/' +
          encodeURIComponent(caseId) +
          '/provider-inquiry',
        'POST',
        {},
      );
      await load();
      setMessage(
        'Provider inquiry evidence recorded for independent review. No mandate state was changed.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function submitMandateEvidence(e: FormEvent<HTMLFormElement>, caseId: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = new FormData(form);
    try {
      await request(
        'admin/fees/mandate-reconciliation-cases/' + encodeURIComponent(caseId) + '/evidence',
        'POST',
        {
          providerEvidenceReference: String(fields.get('providerEvidenceReference') || ''),
          finding: String(fields.get('finding') || 'provider_inquiry_pending'),
        },
      );
      await load();
      setMessage('Provider evidence recorded. A separate owner must review it.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function reviewMandateEvidence(evidenceId: string, decision: string) {
    try {
      await request(
        'admin/fees/mandate-reconciliation-evidence/' + encodeURIComponent(evidenceId) + '/review',
        'POST',
        { decision },
      );
      await load();
      setMessage('Independent review recorded. Mandate remains blocked until signed confirmation.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  const uncertainAttempts = autopayAttempts.filter((attempt) => attempt.status === 'uncertain');
  const uncertainCheckouts = checkoutSessions.filter((session) => session.status === 'uncertain');
  const prioritizedAttempts = [...autopayAttempts]
    .sort((a, b) => Number(b.status === 'uncertain') - Number(a.status === 'uncertain'))
    .slice(0, 12);

  return (
    <>
      {loadError && (
        <div className="admin-notice" role="alert">
          <p>{loadError} Loaded records remain available.</p>
          <button type="button" className="button outline" onClick={() => void load()}>
            Retry loading fee data
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="admin-feedback">
          {message}
        </p>
      )}

      <section className="admin-panel">
        <p className="eyebrow">Fee lifecycle</p>
        <h2>Collection operations dashboard</h2>
        <button
          type="button"
          className="button outline"
          aria-controls="mandate-workspace"
          onClick={() => {
            const target = document.getElementById('mandate-workspace');
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            target?.focus({ preventScroll: true });
          }}
        >
          Go to Mandates & AutoPay
        </button>
        <p>
          Schedules, installments, externally confirmed payment evidence, refunds, mandates,
          settlements and reconciliation share one audited ledger. This workspace does not move
          money by itself.
        </p>
        {overview && (
          <div className="dashboard-stats">
            {[
              ['Active schedules', overview.summary.active_schedules],
              ['Scheduled', rupees(overview.summary.scheduled_minor)],
              ['Confirmed net', rupees(overview.summary.confirmed_minor)],
              ['Outstanding', rupees(overview.summary.outstanding_minor)],
              ['Overdue', rupees(overview.summary.overdue_minor)],
            ].map(([label, value]) => (
              <div className="dashboard-stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Keep the existing mandate and reconciliation controls immediately visible. */}
      <div className="admin-panel" id="mandate-workspace" tabIndex={-1}>
        <h2>Mandates, AutoPay & settlements</h2>
        <MandateWorkspace
          data={{
            mandates,
            setups: mandateSetups,
            debits: autopayAttempts,
            settlements,
            checkouts: checkoutSessions,
          }}
          schedules={schedules}
          providerName={providerStatus?.provider}
          providerMode={providerStatus?.autopayMode}
          readOnly={session.tenant.readOnly === true}
          onPreparePayer={() =>
            document.getElementById('fee-payer-create')?.scrollIntoView({ behavior: 'smooth' })
          }
          onPrepareSchedule={() =>
            document.getElementById('fee-schedule-create')?.scrollIntoView({ behavior: 'smooth' })
          }
          onRefresh={refreshMandateWorkspace}
          onPayerLink={async (scheduleId) => {
            const result = await request<{ path: string; expiresHours: number }>(
              'admin/fees/schedules/' + encodeURIComponent(scheduleId) + '/payer-link',
              'POST',
              {
                expiresHours: 72,
                paymentMode: 'full_balance',
                allowCustomAmount: false,
                allowComponentSelection: false,
              },
            );
            if (!result.path.startsWith('/payer/')) {
              throw new Error('Unexpected secure payer link response');
            }
            return window.location.origin + result.path;
          }}
        />
        <p>
          {mandates.length} mandate record(s) · {mandateSetups.length} setup attempt(s) ·{' '}
          {autopayAttempts.length} automated debit attempt(s) · {checkoutSessions.length} hosted
          checkout(s) · {settlements.length} settlement record(s) · {communications.length}{' '}
          communication record(s).
        </p>
        <p className="small">
          Hosted mandate setup and due-date debit submission activate only when an approved
          provider endpoint is configured. Payer bank credentials, UPI PINs and OTPs are never
          collected by this console. Verified callbacks remain the source of truth for final
          payment and mandate status.
        </p>
        {uncertainMandateSetups.length > 0 && (
          <div className="admin-notice" role="status">
            <strong>
              {uncertainMandateSetups.length} mandate setup(s) require investigation.
            </strong>
            <p>
              Do not create another authorization for the same schedule. Record only the approved
              provider support case reference; never enter bank details, OTPs or credentials.
            </p>
            <p className="small">
              {mandateCases.filter((entry) => entry.status === 'open').length} open
              investigation(s)
              {' · '}
              {
                mandateCases.filter(
                  (entry) => entry.status === 'open' && Number(entry.age_hours) >= 24,
                ).length
              }{' '}
              older than 24 hours. Case age is a triage indicator, not a bank status or retry
              authorization.
            </p>
            {uncertainMandateSetups.map((setup) => {
              const existingCase = mandateCases.find((entry) => entry.setup_id === setup.id);
              return (
                <div key={setup.id}>
                  <div className="record-row">
                    <strong>{setup.account_reference}</strong>
                    <span>{setup.rail}</span>
                    <span>{existingCase?.provider_case_reference || 'No provider case'}</span>
                    <span className="status-pill">{setup.status}</span>
                  </div>
                  {existingCase && (
                    <p className="small">
                      Queue: {String(existingCase.queue_state).replaceAll('_', ' ')}
                      {' · '}
                      {existingCase.age_hours} hour(s) open
                      {' · '}
                      {existingCase.evidence_count} evidence item(s)
                      {' · '}
                      {existingCase.pending_review_count} awaiting independent review. No
                      investigation outcome releases a mandate.
                    </p>
                  )}

                  {existingCase && (
                    <div>
                      <button
                        type="button"
                        className="button outline"
                        disabled={
                          session.tenant.readOnly === true ||
                          providerStatus?.reconciliationMode !== 'read_only'
                        }
                        onClick={() => void inquireMandateProvider(existingCase.id)}
                      >
                        Inquire with configured provider (read-only)
                      </button>
                      {providerStatus?.reconciliationMode !== 'read_only' && (
                        <p className="small">
                          Bank inquiry is not configured. Use the provider support reference
                          and evidence form; no mandate is activated by an inquiry.
                        </p>
                      )}
                      <form
                        className="admin-form"
                        onSubmit={(e) => submitMandateEvidence(e, existingCase.id)}
                      >
                        <label>
                          Provider evidence reference
                          <input
                            name="providerEvidenceReference"
                            required
                            minLength={3}
                            maxLength={120}
                            pattern="[A-Za-z0-9._:-]+"
                            autoComplete="off"
                          />
                        </label>
                        <label>
                          Provider investigation finding
                          <select name="finding" defaultValue="provider_inquiry_pending">
                            <option value="provider_inquiry_pending">Inquiry pending</option>
                            <option value="provider_reports_registered">
                              Provider reports registration exists
                            </option>
                            <option value="provider_reports_not_registered">
                              Provider reports registration absent
                            </option>
                            <option value="provider_outcome_inconclusive">Inconclusive</option>
                          </select>
                        </label>
                        <button type="submit">Record provider evidence</button>
                      </form>
                      {mandateEvidence
                        .filter((entry) => entry.case_id === existingCase.id)
                        .map((entry) => (
                          <div className="record-row" key={entry.id}>
                            <strong>{entry.provider_evidence_reference}</strong>
                            <span>{entry.finding}</span>
                            <span className="status-pill">
                              {entry.decision || 'Review required'}
                            </span>
                            {!entry.decision && entry.submitted_by !== session.user.id && (
                              <div>
                                <button
                                  className="button outline"
                                  onClick={() => void reviewMandateEvidence(entry.id, 'verified')}
                                >
                                  Verify evidence
                                </button>
                                <button
                                  className="button outline"
                                  onClick={() =>
                                    void reviewMandateEvidence(entry.id, 'insufficient_evidence')
                                  }
                                >
                                  Insufficient evidence
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                  {!existingCase && (
                    <form className="admin-form" onSubmit={(e) => openMandateCase(e, setup.id)}>
                      <label>
                        Provider case reference
                        <input
                          name="providerCaseReference"
                          required
                          minLength={3}
                          maxLength={120}
                          pattern="[A-Za-z0-9._:-]+"
                          autoComplete="off"
                        />
                      </label>
                      <label>
                        Investigation reason
                        <select name="evidenceSummary" defaultValue="provider_inquiry_opened">
                          <option value="provider_inquiry_opened">Provider inquiry opened</option>
                          <option value="provider_reference_not_returned">
                            Provider reference not returned
                          </option>
                          <option value="provider_status_not_confirmed">
                            Provider status not confirmed
                          </option>
                        </select>
                      </label>
                      <button type="submit">Record investigation</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {mandateCases.some((entry) => entry.status === 'resolved_signed') && (
          <div className="admin-notice">
            <strong>Provider-signed mandate investigation resolutions</strong>
            <p>
              Closed cases below reflect authenticated terminal provider callbacks, not manual
              approval or a new payment instruction.
            </p>
            {mandateCases
              .filter((entry) => entry.status === 'resolved_signed')
              .slice(0, 12)
              .map((entry) => (
                <div className="record-row" key={entry.id}>
                  <strong>{entry.account_reference}</strong>
                  <span>{entry.rail}</span>
                  <span>{entry.mandate_setup_status}</span>
                  <span className="status-pill">Signed resolution</span>
                </div>
              ))}
          </div>
        )}
        {uncertainCheckouts.length > 0 && (
          <div className="admin-notice" role="status">
            <strong>
              {uncertainCheckouts.length} hosted checkout(s) require reconciliation.
            </strong>
            <p>
              Unknown bank session creation is not a payment failure. Verify the provider outcome
              before permitting another collection.
            </p>
            {uncertainCheckouts.slice(0, 8).map((session) => (
              <div className="record-row" key={session.id}>
                <strong>{session.account_reference}</strong>
                <span>
                  #{session.sequence} · {rupees(session.amount_minor)}
                </span>
                <span>{session.failure_code || 'BANK_OUTCOME_UNKNOWN'}</span>
                <span className="status-pill">{session.status}</span>
              </div>
            ))}
          </div>
        )}
        {uncertainAttempts.length > 0 && (
          <p className="admin-notice" role="status">
            <strong>{uncertainAttempts.length} debit(s) require reconciliation.</strong> Check the
            signed provider outcome before collecting again. Never assume payment success from a
            redirect or a timeout.
          </p>
        )}
        <div className="record-row">
          <strong>Recurring provider</strong>
          <span>{providerStatus?.provider || 'Not configured'}</span>
          <span>{providerStatus?.autopayMode || 'disabled'}</span>
          <span className="status-pill">
            {autopayAttempts.filter((attempt) => attempt.status === 'confirmed').length} confirmed
          </span>
        </div>
        {prioritizedAttempts.map((attempt) => (
          <div className="record-row" key={attempt.id}>
            <strong>{attempt.account_reference}</strong>
            <span>
              #{attempt.sequence} · {rupees(attempt.amount_minor)}
            </span>
            <span>
              attempt {attempt.attempt_no}
              {attempt.failure_code ? ' · ' + attempt.failure_code : ''}
            </span>
            <span className="status-pill">{attempt.status}</span>
          </div>
        ))}
      </div>

      <form
        id="fee-payer-create"
        className="admin-panel admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          try {
            await request('admin/payers', 'POST', {
              accountReference: String(f.get('accountReference') || ''),
              displayName: String(f.get('displayName') || ''),
              ...(String(f.get('email') || '') ? { email: String(f.get('email')) } : {}),
              ...(String(f.get('phone') || '') ? { phone: String(f.get('phone')) } : {}),
              preferredChannel: String(f.get('preferredChannel') || 'email'),
              locale: 'en-IN',
            });
            form.reset();
            setMessage('Payer profile encrypted and saved.');
            await load();
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <h2>Create payer profile</h2>
        <p>
          Contact details are encrypted at rest. Choose only a communication channel you are
          authorized to use.
        </p>
        <div className="row">
          <label className="field">
            Account reference
            <input name="accountReference" required pattern="[A-Za-z0-9_-]{2,80}" />
          </label>
          <label className="field">
            Display name
            <input name="displayName" required minLength={2} maxLength={120} />
          </label>
        </div>
        <div className="row">
          <label className="field">
            Email
            <input type="email" name="email" />
          </label>
          <label className="field">
            Phone
            <input name="phone" placeholder="+91..." />
          </label>
          <label className="field">
            Reminder channel
            <select name="preferredChannel" defaultValue="email">
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp (provider required)</option>
              <option value="none">No automated reminders</option>
            </select>
          </label>
        </div>
        <button className="button primary">Save payer profile</button>
      </form>

      <form
        id="fee-schedule-create"
        className="admin-panel admin-form"
        onSubmit={createSchedule}
        onInvalidCapture={(event) => {
          const field = event.target as HTMLInputElement;
          const label = field.closest('label')?.textContent?.trim() || 'Required field';
          setScheduleFeedback(
            'Please complete ' + label + ' before creating the draft schedule.',
          );
        }}
      >
        <h2>Create fee schedule</h2>
        <p>
          Use an internal, non-sensitive account reference. Store student names and banking
          information in an approved system, not in this field.
        </p>
        <div className="row">
          <label className="field">
            Account reference
            <input name="accountReference" required pattern="[A-Za-z0-9_-]{2,80}" />
          </label>
          <label className="field">
            Payer profile
            <select name="payerId" defaultValue="">
              <option value="">No portal/reminders yet</option>
              {payers
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} · {p.accountReference}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Internal note
            <input name="note" maxLength={300} placeholder="Course / cohort context" />
          </label>
        </div>
        <div className="row">
          <label className="field">
            Fee scope
            <select name="scopeType" defaultValue="course">
              <option value="course">Course</option>
              <option value="batch">Batch</option>
              <option value="year">Year</option>
              <option value="student">Student</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="field">
            Scope reference
            <input
              name="scopeReference"
              required
              defaultValue="general"
              pattern="[A-Za-z0-9_./:-]{2,100}"
            />
          </label>
        </div>

        <h3>Fee components</h3>
        <p className="small">
          Break the fee into auditable heads such as tuition, transport or hostel. Optional bank
          route keys stay logical until a verified settlement provider mapping is activated.
        </p>
        {componentRows.map((row, index) => (
          <div className="row" key={'component-' + index}>
            <label className="field">
              Code
              <input
                value={row.code}
                required
                onChange={(e) =>
                  setComponentRows((rows) =>
                    rows.map((r, n) => (n === index ? { ...r, code: e.target.value } : r)),
                  )
                }
              />
            </label>
            <label className="field">
              Label
              <input
                value={row.label}
                required
                onChange={(e) =>
                  setComponentRows((rows) =>
                    rows.map((r, n) => (n === index ? { ...r, label: e.target.value } : r)),
                  )
                }
              />
            </label>
            <label className="field">
              Amount (INR)
              <input
                inputMode="decimal"
                value={row.amount}
                required
                onChange={(e) =>
                  setComponentRows((rows) =>
                    rows.map((r, n) => (n === index ? { ...r, amount: e.target.value } : r)),
                  )
                }
              />
            </label>
            <label className="field">
              Bank route key
              <input
                value={row.bankRouteKey}
                placeholder="optional"
                onChange={(e) =>
                  setComponentRows((rows) =>
                    rows.map((r, n) => (n === index ? { ...r, bankRouteKey: e.target.value } : r)),
                  )
                }
              />
            </label>
            {componentRows.length > 1 && (
              <button
                type="button"
                className="button outline"
                onClick={() => setComponentRows((rows) => rows.filter((_, n) => n !== index))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="button outline"
          onClick={() =>
            setComponentRows((rows) => [
              ...rows,
              {
                code: 'fee_' + (rows.length + 1),
                label: 'Fee component',
                amount: '',
                bankRouteKey: '',
              },
            ])
          }
        >
          Add fee component
        </button>

        <h3>Concessions / scholarships</h3>
        {concessionRows.map((row, index) => (
          <div className="row" key={'concession-' + index}>
            <label className="field">
              Code
              <input
                value={row.code}
                required
                onChange={(e) =>
                  setConcessionRows((rows) =>
                    rows.map((r, n) => (n === index ? { ...r, code: e.target.value } : r)),
                  )
                }
              />
            </label>
            <label className="field">
              Label
              <input
                value={row.label}
                required
                onChange={(e) =>
                  setConcessionRows((rows) =>
                    rows.map((r, n) => (n === index ? { ...r, label: e.target.value } : r)),
                  )
                }
              />
            </label>
            <label className="field">
              Amount (INR)
              <input
                inputMode="decimal"
                value={row.amount}
                required
                onChange={(e) =>
                  setConcessionRows((rows) =>
                    rows.map((r, n) => (n === index ? { ...r, amount: e.target.value } : r)),
                  )
                }
              />
            </label>
            <label className="field">
              Reason
              <input
                value={row.reason}
                required
                onChange={(e) =>
                  setConcessionRows((rows) =>
                    rows.map((r, n) => (n === index ? { ...r, reason: e.target.value } : r)),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="button outline"
              onClick={() => setConcessionRows((rows) => rows.filter((_, n) => n !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button outline"
          onClick={() =>
            setConcessionRows((rows) => [
              ...rows,
              {
                code: 'concession_' + (rows.length + 1),
                label: 'Concession',
                amount: '',
                reason: '',
              },
            ])
          }
        >
          Add concession
        </button>

        <h3>Late-fee policy</h3>
        <div className="row">
          <label className="field">
            Mode
            <select name="lateFeeMode" defaultValue="fixed_once">
              <option value="fixed_once">Fixed once</option>
              <option value="daily_fixed">Daily fixed</option>
            </select>
          </label>
          <label className="field">
            Grace days
            <input name="lateFeeGraceDays" type="number" min={0} max={60} defaultValue={0} />
          </label>
          <label className="field">
            Late fee amount (INR)
            <input name="lateFeeAmount" inputMode="decimal" placeholder="leave blank to disable" />
          </label>
          <label className="field">
            Maximum late fee (INR)
            <input name="lateFeeCap" inputMode="decimal" placeholder="optional cap" />
          </label>
        </div>

        <h3>Installments</h3>
        {installmentRows.map((row, index) => (
          <div className="row" key={index}>
            <label className="field">
              Due date
              <input
                type="date"
                value={row.dueDate}
                required
                onChange={(e) =>
                  setInstallmentRows((rows) =>
                    rows.map((r, n) => (n === index ? { ...r, dueDate: e.target.value } : r)),
                  )
                }
              />
            </label>
            <label className="field">
              Amount (INR)
              <input
                inputMode="decimal"
                value={row.amount}
                required
                placeholder="25000"
                onChange={(e) =>
                  setInstallmentRows((rows) =>
                    rows.map((r, n) => (n === index ? { ...r, amount: e.target.value } : r)),
                  )
                }
              />
            </label>
            {installmentRows.length > 1 && (
              <button
                type="button"
                className="button outline"
                onClick={() => setInstallmentRows((rows) => rows.filter((_, n) => n !== index))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <div className="admin-toolbar">
          <button
            type="button"
            className="button outline"
            onClick={() => setInstallmentRows((rows) => [...rows, { dueDate: '', amount: '' }])}
          >
            Add installment
          </button>
          <button type="submit" className="button primary" disabled={scheduleSubmitting}>
            {scheduleSubmitting ? 'Creating draft…' : 'Create draft schedule'}
          </button>
        </div>
        {scheduleFeedback && (
          <p role="status" className="admin-feedback">
            {scheduleFeedback}
          </p>
        )}
      </form>

      <section className="admin-panel">
        <div className="admin-toolbar">
          <div>
            <h2>Fee schedules</h2>
            <p>Draft schedules require explicit activation before payment evidence can be added.</p>
          </div>
          <button className="button outline" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        <div className="fee-schedule-grid">
          {schedules.map((s) => (
            <article className="fee-schedule-card" key={s.id}>
              <div className="admin-toolbar">
                <div>
                  <p className="eyebrow">{s.status}</p>
                  <h3>{s.account_reference}</h3>
                </div>
                <strong>{rupees(s.total_amount_minor)}</strong>
              </div>
              <p className="small">
                {s.scope_type || 'custom'} · {s.scope_reference || 'custom'} · Gross{' '}
                {rupees(s.gross_amount_minor || s.total_amount_minor)} · Concessions{' '}
                {rupees(s.concession_amount_minor || 0)}
              </p>
              {s.note && <p>{s.note}</p>}
              {!!s.components?.length && (
                <div className="fee-component-list">
                  {s.components.map((component) => (
                    <span key={component.code}>
                      {component.label}: {rupees(component.amountMinor)}
                    </span>
                  ))}
                </div>
              )}
              <div className="fee-installments">
                {s.installments.map((i) => (
                  <div key={i.id}>
                    <span>
                      #{i.sequence} · {new Date(i.dueDate).toLocaleDateString('en-IN')}
                    </span>
                    <span>{rupees(i.amountMinor)}</span>
                    <span className="status-pill">{i.status}</span>
                  </div>
                ))}
              </div>
              {s.status === 'draft' && (
                <button
                  className="button primary"
                  onClick={async () => {
                    try {
                      await request('admin/fees/schedules/' + s.id + '/activate', 'POST', {
                        expectedVersion: s.version,
                      });
                      setMessage('Fee schedule activated.');
                      await load();
                    } catch (e) {
                      setMessage((e as Error).message);
                    }
                  }}
                >
                  Activate schedule
                </button>
              )}
              {s.payer_id && (
                <div className="admin-toolbar">
                  <button
                    className="button outline"
                    onClick={async () => {
                      try {
                        const result = await request<{ path: string; expiresHours: number }>(
                          'admin/fees/schedules/' + s.id + '/payer-link',
                          'POST',
                          {
                            expiresHours: 72,
                            paymentMode: 'full_balance',
                            allowCustomAmount: false,
                            allowComponentSelection: false,
                          },
                        );
                        const url = window.location.origin + result.path;
                        await navigator.clipboard.writeText(url);
                        setMessage('Secure 72-hour full-balance payer link copied to clipboard.');
                      } catch (e) {
                        setMessage((e as Error).message);
                      }
                    }}
                  >
                    Copy full-balance link
                  </button>
                  <button
                    className="button outline"
                    onClick={async () => {
                      try {
                        const result = await request<{ path: string; expiresHours: number }>(
                          'admin/fees/schedules/' + s.id + '/payer-link',
                          'POST',
                          {
                            expiresHours: 72,
                            paymentMode: 'flexible',
                            allowCustomAmount: true,
                            allowComponentSelection: true,
                            minAmountMinor: 100,
                          },
                        );
                        const url = window.location.origin + result.path;
                        await navigator.clipboard.writeText(url);
                        setMessage(
                          'Secure 72-hour smart collection link copied. It allows custom and fee-head payments subject to server-side balance checks.',
                        );
                      } catch (e) {
                        setMessage((e as Error).message);
                      }
                    }}
                  >
                    Copy smart collection link
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <form
        className="admin-panel admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await request('admin/fees/payments/external-confirmation', 'POST', {
              installmentId: String(f.get('installmentId')),
              amountMinor: toMinor(f.get('amount')),
              currency: 'INR',
              providerReference: String(f.get('providerReference')),
              idempotencyKey: crypto.randomUUID(),
              evidenceNote: String(f.get('evidenceNote')),
            });
            e.currentTarget.reset();
            setMessage('External payment evidence recorded and audited.');
            await load();
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <h2>Record external payment confirmation</h2>
        <p>
          Use only after the payment processor or bank has independently confirmed the transaction.
          This action records evidence; it does not charge the payer.
        </p>
        <label className="field">
          Installment
          <select name="installmentId" required defaultValue="">
            <option value="" disabled>
              Select an unpaid installment
            </option>
            {activeInstallments.map((i) => (
              <option value={i.id} key={i.id}>
                {i.schedule.account_reference} · #{i.sequence} · {rupees(i.amountMinor)}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label className="field">
            Confirmed amount (INR)
            <input name="amount" inputMode="decimal" required />
          </label>
          <label className="field">
            Provider / bank reference
            <input name="providerReference" pattern="[A-Za-z0-9._:-]{3,120}" required />
          </label>
        </div>
        <label className="field">
          Evidence note
          <input
            name="evidenceNote"
            minLength={3}
            maxLength={300}
            required
            placeholder="Verified in processor settlement report"
          />
        </label>
        <button className="button primary">Record confirmation</button>
      </form>

      <section className="admin-panel">
        <div className="admin-toolbar">
          <div>
            <p className="eyebrow">Provider integrity</p>
            <h2>Signed payment callbacks</h2>
          </div>
          <span className="status-pill">{providerStatus?.webhookMode || 'disabled'}</span>
        </div>
        <p>
          Browser redirects never mark an installment paid. Only staff-confirmed evidence or a
          verified, replay-safe provider event can update the ledger.
        </p>
        <div className="record-row">
          <strong>{providerStatus?.provider || 'No provider configured'}</strong>
          <span>{providerEvents.length} event(s)</span>
          <span>{providerEvents.filter((event) => event.status === 'applied').length} applied</span>
          <span className="status-pill">
            {providerStatus?.webhookMode === 'signed_hmac'
              ? 'signature verification on'
              : 'blocked'}
          </span>
        </div>
        {providerEvents.slice(0, 8).map((event) => (
          <div className="record-row" key={event.id}>
            <strong>{event.event_type}</strong>
            <span>{event.provider_event_id}</span>
            <span>{event.failure_code || event.provider}</span>
            <span className="status-pill">{event.status}</span>
          </div>
        ))}
      </section>

      <section className="admin-panel">
        <div className="admin-toolbar">
          <div>
            <p className="eyebrow">Collection intelligence</p>
            <h2>Fee analytics</h2>
          </div>
          <span className="status-pill">
            {lateFees.filter((x) => x.status === 'assessed').length} active late fee(s)
          </span>
        </div>
        <div className="dashboard-stats">
          {(analytics?.byScope || []).slice(0, 4).map((row: any) => (
            <div className="dashboard-stat" key={row.scope_type + ':' + row.scope_reference}>
              <span>
                {row.scope_type} · {row.scope_reference}
              </span>
              <strong>{rupees(row.paid_minor)}</strong>
              <small>{rupees(row.outstanding_minor)} outstanding</small>
            </div>
          ))}
        </div>
        {!!lateFees.length && (
          <div className="fee-schedule-grid">
            {lateFees.slice(0, 8).map((fee) => (
              <div className="record-row" key={fee.id}>
                <strong>{fee.account_reference}</strong>
                <span>{rupees(fee.amount_minor)}</span>
                <span>
                  Installment #{fee.sequence} · {fee.status}
                </span>
                {fee.status === 'assessed' ? (
                  <button
                    className="button outline"
                    onClick={async () => {
                      const reason = window.prompt('Reason for waiving this late fee?');
                      if (!reason) return;
                      try {
                        await request('admin/fees/late-fees/' + fee.id + '/waive', 'POST', {
                          reason,
                        });
                        setMessage('Late fee waived with an audit record.');
                        await load();
                      } catch (e) {
                        setMessage((e as Error).message);
                      }
                    }}
                  >
                    Waive
                  </button>
                ) : (
                  <span className="status-pill">{fee.status}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-grid">
        <div className="admin-panel">
          <h2>Recent payment evidence</h2>
          {!payments.length ? (
            <p>No payment evidence recorded.</p>
          ) : (
            payments.slice(0, 20).map((p) => (
              <div className="record-row" key={p.id}>
                <strong>{p.account_reference}</strong>
                <span>{rupees(Number(p.amount_minor) - Number(p.refunded_amount_minor))}</span>
                <span>{p.provider_reference}</span>
                <span className="status-pill">{p.status}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
