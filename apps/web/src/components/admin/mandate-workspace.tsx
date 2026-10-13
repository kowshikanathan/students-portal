'use client';

import { useState } from 'react';
import {
  eligiblePayerSchedules,
  mandateAccount,
  mandateRows,
  mandateStatus,
  mandateViews,
  type MandateDashboardData,
  type MandateView,
} from './mandate-view-model';

type Schedule = {
  id: string;
  account_reference: string;
  payer_id?: string | null;
  status: string;
};

type Props = {
  data: MandateDashboardData;
  schedules: Schedule[];
  providerName?: string | null;
  providerMode?: string | null;
  readOnly: boolean;
  onRefresh: () => Promise<void>;
  onPayerLink: (scheduleId: string) => Promise<string>;
  onPreparePayer?: () => void;
  onPrepareSchedule?: () => void;
};

export function MandateWorkspace({
  data,
  schedules,
  providerName,
  providerMode,
  readOnly,
  onRefresh,
  onPayerLink,
  onPreparePayer,
  onPrepareSchedule,
}: Props) {
  const [view, setView] = useState<MandateView>('mandates');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [payerLink, setPayerLink] = useState<{ scheduleId: string; url: string } | null>(null);

  const source = mandateRows(data, view);
  const normalized = query.trim().toLowerCase();
  const rows = normalized
    ? source.filter((entry) =>
        [mandateAccount(entry), entry.status, entry.rail, entry.provider_reference]
          .some((value) => String(value ?? '').toLowerCase().includes(normalized)),
      )
    : source;
  const actionable = eligiblePayerSchedules(schedules);
  const providerConnected = providerMode === 'mandate_api';

  async function refresh() {
    setBusy(true);
    try {
      await onRefresh();
      setNotice('Mandate, debit and settlement data refreshed.');
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createPayerLink(scheduleId: string) {
    setBusy(true);
    setPayerLink(null);
    try {
      const url = await onPayerLink(scheduleId);
      setPayerLink({ scheduleId, url });
      setNotice('Secure payer link created. Open it to review the eNACH setup option.');
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Mandate and recurring collections workspace">
      <div className="admin-toolbar">
        <div>
          <p className="eyebrow">Mandate operations</p>
          <h3>Explore mandates and payment-provider activity</h3>
        </div>
        <button
          type="button"
          className="button outline"
          onClick={() => void refresh()}
          disabled={busy}
        >
          {busy ? 'Working…' : 'Refresh records'}
        </button>
      </div>
      <p className="small" role="status">
        Provider: {providerName || 'Not configured'} · Recurring payment setup:{' '}
        {providerConnected ? 'enabled by configuration' : 'disabled'}
      </p>
      {!providerConnected && (
        <p className="admin-notice" role="status">
          Live eNACH authorization is unavailable until an approved mandate provider is configured.
          You can still review existing records and create a secure payer-portal link, but a link
          does not activate a mandate or authorize a debit.
        </p>
      )}
      <div className="admin-toolbar" role="group" aria-label="Mandate record views">
        {mandateViews.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? 'button primary' : 'button outline'}
            aria-pressed={view === item.id}
            onClick={() => {
              setView(item.id);
              setQuery('');
            }}
          >
            {item.label} ({mandateRows(data, item.id).length})
          </button>
        ))}
      </div>
      <label className="field">
        Search {mandateViews.find((item) => item.id === view)?.label.toLowerCase()}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Account, provider reference or status"
          type="search"
        />
      </label>
      <div aria-live="polite">
        {rows.length === 0 ? (
          <div className="empty-state">
            <h3>No {mandateViews.find((item) => item.id === view)?.label.toLowerCase()} found</h3>
            <p>
              {source.length === 0
                ? 'No records exist yet. Select another view or use an active fee schedule below.'
                : 'No records match the current search. Clear the search to see all records.'}
            </p>
          </div>
        ) : (
          rows.slice(0, 100).map((entry, index) => (
            <details key={String(entry.id ?? index)} className="record-row">
              <summary>
                <strong>{mandateAccount(entry)}</strong>
                {' · '}
                {mandateStatus(entry)}
                {entry.rail ? ' · ' + (entry.rail === 'enach' ? 'eNACH' : entry.rail) : ''}
                {' · View details'}
              </summary>
              <div className="admin-panel">
                {[
                  ['Status', entry.status],
                  ['Rail', entry.rail],
                  ['Provider', entry.provider],
                  ['Provider reference', entry.provider_reference],
                  ['Attempt number', entry.attempt_no],
                  ['Amount (minor units)', entry.amount_minor],
                  ['Failure code', entry.failure_code],
                  ['Created', entry.created_at],
                  ['Updated', entry.updated_at],
                  ['Expected settlement', entry.expected_on],
                  ['Next retry', entry.next_retry_at],
                ]
                  .filter(([, value]) => value !== undefined && value !== null)
                  .map(([label, value]) => (
                    <p key={String(label)} className="small">
                      <strong>{String(label)}:</strong> {String(value)}
                    </p>
                  ))}
                <p className="small">
                  Read-only provider evidence. Status changes require verified provider events
                  or the established independent reconciliation process.
                </p>
              </div>
            </details>
          ))
        )}
        {rows.length > 100 && <p className="small">Showing the first 100 matching records.</p>}
      </div>
      <div className="admin-panel">
        <h3>Open eNACH setup in the payer portal</h3>
        <p className="small">
          Select an active fee schedule to create a time-limited payer link. The payer
          will see the eNACH setup option only when provider integration is enabled.
        </p>
        {actionable.length === 0 ? (
          <div>
            <p className="small">
              No active fee schedule with an assigned payer is available. Create and activate a fee
              schedule with a payer first.
            </p>
            {!readOnly && (onPreparePayer || onPrepareSchedule) && (
              <div className="admin-toolbar">
                {onPreparePayer && (
                  <button type="button" className="button outline" onClick={onPreparePayer}>
                    Create payer profile
                  </button>
                )}
                {onPrepareSchedule && (
                  <button type="button" className="button outline" onClick={onPrepareSchedule}>
                    Create fee schedule
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="fee-schedule-grid">
            {actionable.slice(0, 20).map((schedule) => (
              <div className="record-row" key={schedule.id}>
                <strong>{schedule.account_reference}</strong>
                <button
                  type="button"
                  className="button outline"
                  disabled={busy || readOnly}
                  onClick={() => void createPayerLink(schedule.id)}
                >
                  Generate payer link
                </button>
              </div>
            ))}
          </div>
        )}
        {readOnly && (
          <p className="small">The institution is read-only; link creation is disabled.</p>
        )}
        {payerLink && (
          <p className="small">
            Payer link created for the selected schedule:{' '}
            <a href={payerLink.url} target="_blank" rel="noopener noreferrer">
              Open secure payer portal ↗
            </a>
          </p>
        )}
      </div>
      {notice && (
        <p className="admin-feedback" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
