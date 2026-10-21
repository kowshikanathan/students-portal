'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminApi } from './context';

export function StudentFeeAssignment({
  studentId,
  onAssigned,
}: {
  studentId: string;
  onAssigned: () => void;
}) {
  const { request, can, session } = useAdminApi();
  const [plans, setPlans] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    request<typeof plans>('admin/fee-plans')
      .then((rows) => {
        if (active) setPlans(rows.filter((p) => p.status === 'effective'));
      })
      .catch(() => {
        if (active) setError('Fee structures could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [session.tenant.id]);
  if (!can('fee.plan.manage'))
    return <p>A finance administrator can assign this student’s fee structure.</p>;
  return (
    <section className="admin-panel">
      <h3>Assign Fee Structure &amp; Master Schedule</h3>
      <p>
        Assign an approved fee structure, then customize this student’s future Flex installments and
        enable eNACH.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        className="admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            await request('admin/fee-plans/' + form.get('planId') + '/assign', 'POST', {
              studentId,
            });
            onAssigned();
          } catch {
            setError(
              'Assignment failed. Check that the student is eligible and this plan has not already been assigned.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Approved Fee Structure
          <select name="planId" required defaultValue="">
            <option value="" disabled>
              Select a fee structure
            </option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button primary"
          disabled={busy || session.tenant.readOnly || !plans.length}
        >
          Assign Master Schedule
        </button>
      </form>
      <Link href="/admin/fee-plans/">Manage fee structures and approvals</Link>
    </section>
  );
}
