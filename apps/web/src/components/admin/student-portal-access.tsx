'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAdminApi } from './context';

export function StudentPortalAccess({
  reference,
  schedules,
}: {
  reference: string;
  schedules: Array<{ schedule_id: string; account_reference: string }>;
}) {
  const { request, can, session } = useAdminApi();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [grant, setGrant] = useState<{ path: string; expiresHours: number } | null>(null);
  if (!can('payer.manage') || !schedules.length) return null;
  const code = grant?.path.split('/').filter(Boolean).pop() || '';
  return (
    <section className="admin-panel student-portal-access">
      <div className="admin-toolbar">
        <div>
          <h3>Student / Parent access</h3>
          <p className="small">
            Create a secure, 24-hour access code for this student’s linked payer.
          </p>
        </div>
        <Link href="/portal/" target="_blank" rel="noopener noreferrer">
          Open student login ↗
        </Link>
      </div>
      <form
        className="admin-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setMessage('');
          setGrant(null);
          try {
            setGrant(
              await request(
                'admin/fees/schedules/' + form.get('scheduleId') + '/payer-link',
                'POST',
                { expiresHours: 24 },
              ),
            );
          } catch {
            setMessage(
              'Access could not be created. Confirm that this schedule has an active linked payer, then retry.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="row">
          <label className="field">
            Fee schedule
            <select name="scheduleId" required defaultValue={schedules[0]?.schedule_id}>
              {schedules.map((s) => (
                <option value={s.schedule_id} key={s.schedule_id}>
                  {s.account_reference}
                </option>
              ))}
            </select>
          </label>
          <div className="finance-field-action">
            <button className="button secondary" disabled={busy || session.tenant.readOnly}>
              {busy ? 'Creating access…' : 'Generate access code'}
            </button>
          </div>
        </div>
      </form>
      {grant && (
        <div className="finance-access-result">
          <label className="field">
            Enrollment / Student ID
            <input value={reference} readOnly onFocus={(event) => event.target.select()} />
          </label>
          <label className="field">
            Institution-issued Access Code
            <input value={code} readOnly onFocus={(event) => event.target.select()} />
          </label>
          <div className="finance-page-actions">
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  setMessage(
                    'Access code copied. Share it only with this student or linked payer.',
                  );
                } catch {
                  setMessage('Select the access code above and press Ctrl+C to copy it.');
                }
              }}
            >
              Copy access code
            </button>
            <Link href={grant.path} target="_blank" rel="noopener noreferrer">
              Open secure payer page ↗
            </Link>
          </div>
          <p className="small">
            This code grants access to this fee account. Keep it private; it expires after 24 hours.
          </p>
        </div>
      )}
      {message && (
        <p role="status" className="small">
          {message}
        </p>
      )}
    </section>
  );
}
