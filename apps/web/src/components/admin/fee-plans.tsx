'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminApi } from './context';

function toMinor(value: FormDataEntryValue | null | string) {
  const parsed = Number(String(value || '').replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Enter a valid positive INR amount');
  return Math.round(parsed * 100);
}

function rupees(value: unknown) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    Number(value || 0) / 100,
  );
}

type Plan = {
  id: string;
  plan_key: string;
  version: number;
  name: string;
  status: string;
  total_minor: string | number;
  component_count: number;
  installment_count: number;
  created_by: string;
};

type Overview = {
  plans: Plan[];
  assignments: any[];
  adjustments: any[];
  credits: any[];
  changes: any[];
  ageing: Array<{ bucket: string; obligations: number; outstanding_minor: string | number }>;
};

export function FeePlanStudio() {
  const { request, session } = useAdminApi();
  const [data, setData] = useState<Overview | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [payers, setPayers] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [components, setComponents] = useState([
    { code: 'tuition', label: 'Tuition Fee', amount: '50000', category: 'fee' },
  ]);
  const [installments, setInstallments] = useState([{ dueDate: '', amount: '50000' }]);

  const dialog = useRef<HTMLDialogElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [count, setCount] = useState('3');
  const [firstDate, setFirstDate] = useState('');

  const total = components.reduce(
    (sum, row) => sum + (Number(row.amount.replace(/,/g, '')) || 0),
    0,
  );
  const scheduled = installments.reduce(
    (sum, row) => sum + (Number(row.amount.replace(/,/g, '')) || 0),
    0,
  );

  useEffect(() => {
    if (message && data) dialog.current?.showModal();
  }, [message, data]);

  function notify(text: string, type: 'success' | 'error' = 'success') {
    setNotice({ text, type });
    setTimeout(() => {
      setNotice(null);
    }, 4500);
  }

  function validateForm(event: FormEvent<HTMLDivElement>) {
    const form = event.target as HTMLFormElement;
    const issues: string[] = [];
    let first: HTMLElement | undefined;
    for (const field of Array.from(form.elements)) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) continue;
      const invalid = !field.validity.valid || (field.required && !field.value.trim());
      field.setAttribute('aria-invalid', String(invalid));
      if (invalid) {
        first ||= field;
        issues.push(
          (field.labels?.[0]?.textContent?.trim() || field.name) +
            ': ' +
            (field.validationMessage || 'This field is required.'),
        );
      }
    }
    if (form.dataset.feeDraft) {
      if (Math.round(total * 100) !== Math.round(scheduled * 100))
        issues.push('Installment total must equal fee component total.');
      if (new Set(components.map((row) => row.code.trim())).size !== components.length)
        issues.push('Fee component codes must be unique.');
      if (new Set(installments.map((row) => row.dueDate)).size !== installments.length)
        issues.push('Installment due dates must be unique.');
    }
    setErrors(issues);
    if (issues.length) {
      event.preventDefault();
      event.stopPropagation();
      first?.focus();
      setMessage('Please correct the following errors:\n' + issues.join('\n'));
    }
  }

  function generateInstallments() {
    const number = Number(count);
    if (
      !Number.isInteger(number) ||
      number < 1 ||
      number > 60 ||
      !firstDate ||
      components.some((row) => !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0)
    ) {
      setMessage(
        'Enter positive fee amounts, a first due date and an installment count from 1 to 60.',
      );
      return;
    }
    const minor = Math.round(total * 100);
    if (minor < number) {
      setMessage('Each installment must be at least one paisa.');
      return;
    }
    const [year = 2026, month = 1, day = 1] = firstDate.split('-').map(Number);
    setInstallments(
      Array.from({ length: number }, (_, index) => {
        const date = new Date(Date.UTC(year, month - 1 + index, 1));
        const lastDay = new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
        ).getUTCDate();
        date.setUTCDate(Math.min(day, lastDay));
        return {
          dueDate: date.toISOString().slice(0, 10),
          amount: ((Math.floor(minor / number) + (index < minor % number ? 1 : 0)) / 100).toFixed(
            2,
          ),
        };
      }),
    );
    setErrors([]);
    notify(`Generated ${number} monthly installments successfully.`);
  }

  async function load() {
    try {
      const [overview, academic, payerRows, scheduleRows] = await Promise.all([
        request<Overview>('admin/fee-plans/overview').catch(() => null),
        request<any>('admin/academic/overview').catch(() => null),
        request<any>('admin/payers').catch(() => []),
        request<any>('admin/fees/schedules').catch(() => []),
      ]);
      setData({
        plans: Array.isArray(overview?.plans) ? overview.plans : [],
        assignments: Array.isArray(overview?.assignments) ? overview.assignments : [],
        adjustments: Array.isArray(overview?.adjustments) ? overview.adjustments : [],
        credits: Array.isArray(overview?.credits) ? overview.credits : [],
        changes: Array.isArray(overview?.changes) ? overview.changes : [],
        ageing: Array.isArray(overview?.ageing) ? overview.ageing : [],
      });
      setStudents(Array.isArray(academic?.students) ? academic.students : []);
      setPayers(
        Array.isArray(payerRows)
          ? payerRows
          : Array.isArray(payerRows?.rows)
            ? payerRows.rows
            : [],
      );
      setSchedules(
        Array.isArray(scheduleRows)
          ? scheduleRows
          : Array.isArray(scheduleRows?.rows)
            ? scheduleRows.rows
            : [],
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, [session.tenant.id]);

  const activeSchedules = useMemo(
    () =>
      (Array.isArray(schedules) ? schedules : []).filter((schedule) =>
        ['active', 'completed'].includes(schedule.status),
      ),
    [schedules],
  );

  async function submit(
    event: FormEvent<HTMLFormElement>,
    path: string,
    build: (form: FormData) => unknown,
    success: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await request(path, 'POST', build(new FormData(form)));
      form.reset();
      setMessage(success);
      notify(success, 'success');
      await load();
    } catch (error) {
      setMessage((error as Error).message);
      notify((error as Error).message, 'error');
    }
  }

  if (!data)
    return (
      <section className="admin-panel" style={{ padding: '36px', textAlign: 'center' }}>
        <p className="eyebrow">CAP-021 · CAP-025</p>
        <h2>Fee plans & receivables</h2>
        <p>{message || 'Loading fee-plan controls…'}</p>
      </section>
    );

  return (
    <div className="fee-plan-workspace" onSubmitCapture={validateForm}>
      {/* Feedback Dialog */}
      <dialog
        ref={dialog}
        className="fee-plan-dialog"
        aria-labelledby="fee-plan-feedback-title"
        onClose={() => setMessage('')}
      >
        <h2 id="fee-plan-feedback-title">Fee plan update</h2>
        <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
        <button
          type="button"
          className="button primary"
          onClick={() => {
            dialog.current?.close();
            setMessage('');
          }}
        >
          OK
        </button>
      </dialog>

      {/* Floating Notice / Toast */}
      {notice && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 9999,
            background: notice.type === 'error' ? '#ef4444' : '#063331',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.88rem',
            fontWeight: 600,
            maxWidth: '420px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <span>{notice.type === 'error' ? '⚠' : '✓'}</span>
          <span>{notice.text}</span>
        </div>
      )}

      {errors.length > 0 && (
        <div className="admin-feedback" role="alert">
          <strong>Please correct these errors:</strong>
          <ul>
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 1. Header Toolbar & High-Level Stats */}
      <section className="admin-panel">
        <div className="admin-toolbar">
          <div>
            <p className="eyebrow">CAP-021 → CAP-025 · FEE ARCHITECTURE</p>
            <h2>Fee-plan lifecycle & receivables</h2>
            <p>
              Draft, validate and independently approve fee plans before assignment. Payments,
              approved adjustments and credits remain governed accounting records.
            </p>
          </div>
          <button className="button outline" onClick={() => void load()}>
            Refresh Data
          </button>
        </div>
        <div className="dashboard-stats">
          <div className="dashboard-stat">
            <span>Effective plans</span>
            <strong>{data.plans.filter((plan) => plan.status === 'effective').length}</strong>
          </div>
          <div className="dashboard-stat">
            <span>Active assignments</span>
            <strong>{data.assignments.filter((item) => item.status === 'active').length}</strong>
          </div>
          <div className="dashboard-stat">
            <span>Pending adjustments</span>
            <strong>{data.adjustments.filter((item) => item.status === 'pending').length}</strong>
          </div>
          <div className="dashboard-stat">
            <span>Open change requests</span>
            <strong>{data.changes.filter((item) => item.status === 'pending').length}</strong>
          </div>
        </div>
      </section>

      {/* 2. Create Versioned Fee Plan (Screenshot 1) */}
      <form
        noValidate
        className="admin-panel admin-form"
        data-fee-draft="true"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          try {
            await request('admin/fee-plans', 'POST', {
              planKey: String(new FormData(form).get('planKey') || ''),
              name: String(new FormData(form).get('name') || ''),
              components: components.map((component) => ({
                code: component.code,
                label: component.label,
                amountMinor: toMinor(component.amount),
                category: component.category,
              })),
              installments: installments.map((installment) => ({
                dueDate: installment.dueDate,
                amountMinor: toMinor(installment.amount),
              })),
              eligibility: {},
              note: String(new FormData(form).get('note') || ''),
            });
            notify('Fee-plan draft created. Validate it before requesting approval.', 'success');
            await load();
          } catch (error) {
            setMessage((error as Error).message);
            notify((error as Error).message, 'error');
          }
        }}
      >
        <p className="eyebrow">EDU-05 · CAP-021 · MASTER FEE STRUCTURE</p>
        <h2>Create versioned fee plan</h2>
        <p style={{ marginBottom: '22px' }}>
          Configure components, category allocations, and installment schedules for an academic cohort.
        </p>

        <div className="row">
          <label className="field">
            Plan key
            <input
              name="planKey"
              required
              pattern="[A-Za-z0-9._/-]{2,80}"
              placeholder="e.g. grade10_2027"
              defaultValue="grade10_2027"
            />
          </label>
          <label className="field">
            Plan name
            <input
              name="name"
              required
              minLength={2}
              maxLength={160}
              placeholder="e.g. Grade 10 Annual Academic Fees"
              defaultValue="Grade 10 Annual Academic Fees"
            />
          </label>
        </div>

        <h3>
          <span>Fee components</span>
          <span style={{ fontSize: '0.75rem', background: '#f0faf6', color: '#0f766e', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600 }}>
            {components.length} component(s)
          </span>
        </h3>

        {components.map((component, index) => (
          <div className="fee-component-row" key={'component-' + index}>
            <label className="field">
              <span style={{ fontSize: '0.72rem', color: '#527972', textTransform: 'uppercase' }}>Code</span>
              <input
                required
                pattern="[A-Za-z0-9_-]{2,40}"
                value={component.code}
                placeholder="e.g. tuition"
                onChange={(e) =>
                  setComponents((rows) =>
                    rows.map((row, n) => (n === index ? { ...row, code: e.target.value } : row)),
                  )
                }
              />
            </label>
            <label className="field">
              <span style={{ fontSize: '0.72rem', color: '#527972', textTransform: 'uppercase' }}>Label</span>
              <input
                required
                minLength={2}
                maxLength={100}
                value={component.label}
                placeholder="e.g. Tuition Fee"
                onChange={(e) =>
                  setComponents((rows) =>
                    rows.map((row, n) => (n === index ? { ...row, label: e.target.value } : row)),
                  )
                }
              />
            </label>
            <label className="field">
              <span style={{ fontSize: '0.72rem', color: '#527972', textTransform: 'uppercase' }}>Category</span>
              <select
                value={component.category}
                onChange={(e) =>
                  setComponents((rows) =>
                    rows.map((row, n) =>
                      n === index ? { ...row, category: e.target.value } : row,
                    ),
                  )
                }
              >
                <option value="fee">Fee</option>
                <option value="deposit">Deposit</option>
                <option value="transport">Transport</option>
                <option value="hostel">Hostel</option>
                <option value="exam">Exam</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field">
              <span style={{ fontSize: '0.72rem', color: '#527972', textTransform: 'uppercase' }}>Amount (INR)</span>
              <input
                required
                type="number"
                min="0.01"
                max="10000000000"
                step="0.01"
                value={component.amount}
                inputMode="decimal"
                placeholder="50000"
                onChange={(e) =>
                  setComponents((rows) =>
                    rows.map((row, n) => (n === index ? { ...row, amount: e.target.value } : row)),
                  )
                }
              />
            </label>
            {components.length > 1 ? (
              <button
                type="button"
                className="btn-remove"
                title="Remove component"
                onClick={() => setComponents((rows) => rows.filter((_, n) => n !== index))}
              >
                ×
              </button>
            ) : (
              <div style={{ width: '42px' }} />
            )}
          </div>
        ))}

        <button
          type="button"
          className="btn-add-dashed"
          onClick={() =>
            setComponents((rows) => [
              ...rows,
              {
                code: 'comp_' + (rows.length + 1),
                label: 'Development Fee',
                amount: '10000',
                category: 'fee',
              },
            ])
          }
        >
          <span>+</span> Add Another Fee Component
        </button>

        <h3>Collection schedule</h3>
        <div className="fee-generator">
          <label className="field">
            Number of installments
            <input
              type="number"
              min="1"
              max="60"
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </label>
          <label className="field">
            First due date
            <input
              type="date"
              value={firstDate}
              onChange={(event) => setFirstDate(event.target.value)}
            />
          </label>
          <button type="button" className="btn-secondary" onClick={generateInstallments}>
            📅 Generate Monthly Schedule
          </button>
        </div>

        {/* Live Balance Summary Bar */}
        <div className="fee-balance-bar">
          <div className="fee-balance-chip">
            <span>Total Fee Amount</span>
            <strong>{rupees(Math.round(total * 100))}</strong>
          </div>
          <div style={{ width: '1px', height: '36px', background: 'rgba(15, 118, 110, 0.2)' }} />
          <div className="fee-balance-chip">
            <span>Scheduled Installments</span>
            <strong>{rupees(Math.round(scheduled * 100))}</strong>
          </div>
          <div style={{ width: '1px', height: '36px', background: 'rgba(15, 118, 110, 0.2)' }} />
          <div className="fee-balance-chip">
            <span>Allocation Balance</span>
            {Math.round(total * 100) === Math.round(scheduled * 100) ? (
              <strong style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '1rem' }}>
                <span>✓</span> Balanced (₹0.00)
              </strong>
            ) : (
              <strong style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '1rem' }}>
                <span>⚠</span> Remaining: {rupees(Math.round((total - scheduled) * 100))}
              </strong>
            )}
          </div>
        </div>

        {installments.map((installment, index) => (
          <div className="fee-installment-row" key={'installment-' + index}>
            <span style={{ fontWeight: 700, color: '#063331', fontSize: '0.85rem' }}>
              EMI {index + 1}
            </span>
            <label className="field">
              <span style={{ fontSize: '0.72rem', color: '#527972', textTransform: 'uppercase' }}>Due date</span>
              <input
                type="date"
                value={installment.dueDate}
                onChange={(e) =>
                  setInstallments((rows) =>
                    rows.map((row, n) => (n === index ? { ...row, dueDate: e.target.value } : row)),
                  )
                }
                required
              />
            </label>
            <label className="field">
              <span style={{ fontSize: '0.72rem', color: '#527972', textTransform: 'uppercase' }}>Amount (INR)</span>
              <input
                type="number"
                min="0.01"
                max="10000000000"
                step="0.01"
                value={installment.amount}
                inputMode="decimal"
                onChange={(e) =>
                  setInstallments((rows) =>
                    rows.map((row, n) => (n === index ? { ...row, amount: e.target.value } : row)),
                  )
                }
                required
              />
            </label>
            {installments.length > 1 ? (
              <button
                type="button"
                className="btn-remove"
                title="Remove installment"
                onClick={() => setInstallments((rows) => rows.filter((_, n) => n !== index))}
              >
                ×
              </button>
            ) : (
              <div style={{ width: '42px' }} />
            )}
          </div>
        ))}

        <button
          type="button"
          className="btn-add-dashed"
          onClick={() => setInstallments((rows) => [...rows, { dueDate: '', amount: '' }])}
        >
          <span>+</span> Add Custom Installment
        </button>

        <label className="field" style={{ marginTop: '18px', marginBottom: '22px' }}>
          Internal governance note
          <input name="note" placeholder="Audited for 2026-27 cohort board approval" maxLength={500} />
        </label>

        <button className="button primary" style={{ minWidth: '220px' }}>
          Create Draft Fee Plan ↗
        </button>
      </form>

      {/* 3. Plan Release Queue */}
      <section className="admin-panel">
        <p className="eyebrow">DRAFT → VALIDATED → APPROVED → EFFECTIVE</p>
        <h2>Plan release queue</h2>
        <p style={{ marginBottom: '20px' }}>
          Transition plans across validation, independent approval, and effective assignment stages.
        </p>

        <div className="fee-schedule-grid">
          {data.plans.map((plan) => (
            <article className="fee-schedule-card" key={plan.id}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className={`status-pill ${plan.status}`}>
                    {plan.status}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#527972', fontFamily: 'monospace' }}>
                    v{plan.version}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', color: '#063331' }}>
                  {plan.name}
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#0f766e', fontFamily: 'monospace', margin: '0 0 12px 0' }}>
                  {plan.plan_key}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid rgba(15, 118, 110, 0.1)', paddingTop: '10px' }}>
                  <span style={{ fontSize: '0.78rem', color: '#527972' }}>Total Plan Value</span>
                  <strong style={{ color: '#063331', fontSize: '1.15rem' }}>{rupees(plan.total_minor)}</strong>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#6c8f89', marginTop: '4px' }}>
                  {plan.component_count} components · {plan.installment_count} installments
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid rgba(15, 118, 110, 0.08)' }}>
                {plan.status === 'draft' && (
                  <button
                    className="btn-secondary"
                    onClick={async () => {
                      try {
                        await request('admin/fee-plans/' + plan.id + '/validate', 'POST', {});
                        notify('Fee plan validated successfully.', 'success');
                        await load();
                      } catch (error) {
                        notify((error as Error).message, 'error');
                      }
                    }}
                  >
                    Validate Structure
                  </button>
                )}
                {plan.status === 'validated' && (
                  <button
                    className="btn-primary"
                    onClick={async () => {
                      try {
                        await request(
                          'admin/fee-plans/' + plan.id + '/request-approval',
                          'POST',
                          {},
                        );
                        notify('Fee plan sent for approval.', 'success');
                        await load();
                      } catch (error) {
                        notify((error as Error).message, 'error');
                      }
                    }}
                  >
                    Request Approval
                  </button>
                )}
                {plan.status === 'pending_approval' && (
                  <button
                    className="btn-primary"
                    onClick={async () => {
                      try {
                        await request('admin/fee-plans/' + plan.id + '/approve', 'POST', {});
                        notify('Fee plan approved successfully.', 'success');
                        await load();
                      } catch (error) {
                        notify((error as Error).message, 'error');
                      }
                    }}
                  >
                    Approve Plan
                  </button>
                )}
                {plan.status === 'approved' && (
                  <button
                    className="btn-primary"
                    onClick={async () => {
                      try {
                        await request('admin/fee-plans/' + plan.id + '/effective', 'POST', {});
                        notify('Fee plan is now effective and assignable.', 'success');
                        await load();
                      } catch (error) {
                        notify((error as Error).message, 'error');
                      }
                    }}
                  >
                    Make Effective
                  </button>
                )}
                {plan.status === 'effective' && (
                  <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    ✓ Active for Assignments
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 4. Assign Effective Plan to Student */}
      <form
        noValidate
        className="admin-panel admin-form"
        onSubmit={(event) =>
          submit(
            event,
            'admin/fee-plans/' +
              String(new FormData(event.currentTarget).get('planId')) +
              '/assign',
            (form) => ({
              studentId: String(form.get('studentId') || ''),
              accountReference: String(form.get('accountReference') || ''),
              ...(String(form.get('payerId') || '')
                ? { payerId: String(form.get('payerId')) }
                : {}),
            }),
            'Effective fee plan assigned and active student receivable schedule created.',
          )
        }
      >
        <p className="eyebrow">CAP-021 · FEE ASSIGNMENT</p>
        <h2>Assign effective plan to student</h2>
        <p style={{ marginBottom: '20px' }}>
          Connect an approved effective fee structure to an enrolled student account.
        </p>

        <div className="row">
          <label className="field">
            Effective plan
            <select name="planId" required defaultValue="">
              <option value="" disabled>
                Select plan
              </option>
              {data.plans
                .filter((plan) => plan.status === 'effective')
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · v{plan.version} ({rupees(plan.total_minor)})
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Student
            <select name="studentId" required defaultValue="">
              <option value="" disabled>
                Select student
              </option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.student_reference} · {student.full_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row">
          <label className="field">
            Receivable account reference
            <input
              name="accountReference"
              required
              pattern="[A-Za-z0-9._/-]{2,80}"
              placeholder="e.g. DPS-2026-089 or test"
            />
          </label>
          <label className="field">
            Optional linked payer
            <select name="payerId" defaultValue="">
              <option value="">No payer linked yet</option>
              {payers.map((payer) => (
                <option key={payer.id} value={payer.id}>
                  {payer.display_name || payer.name} {payer.account_reference ? `(${payer.account_reference})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button className="button primary">Assign Plan to Student ↗</button>
      </form>

      {/* 5. Outstanding Ageing Overview */}
      <section className="admin-panel">
        <p className="eyebrow">CAP-024 · RPT-04 · RECEIVABLES AGEING</p>
        <h2>Outstanding ageing analysis</h2>
        <div className="dashboard-stats">
          {data.ageing.map((row) => (
            <div className="dashboard-stat" key={row.bucket}>
              <span>{row.bucket.replaceAll('_', '–')}</span>
              <strong>{rupees(row.outstanding_minor)}</strong>
              <small style={{ color: '#527972', marginTop: '4px' }}>{row.obligations} obligations</small>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Screenshot 2: Fee Adjustment & Advance Credit */}
      <section className="admin-grid">
        {/* Request fee adjustment (CAP-022) */}
        <form
          noValidate
          className="admin-panel admin-form"
          onSubmit={(event) =>
            submit(
              event,
              'admin/fee-plans/adjustments',
              (form) => ({
                scheduleId: String(form.get('scheduleId') || ''),
                kind: String(form.get('kind') || 'concession'),
                amountMinor: toMinor(form.get('amount')),
                reason: String(form.get('reason') || ''),
              }),
              'Adjustment request created successfully. Awaiting approval in the queue below.',
            )
          }
        >
          <p className="eyebrow">CAP-022 · ADJUSTMENT GOVERNANCE</p>
          <h2>Request fee adjustment</h2>
          <p style={{ marginBottom: '18px' }}>
            Record a concession, merit scholarship, or write-off against an active schedule.
          </p>

          <label className="field" style={{ marginBottom: '14px' }}>
            Schedule & Student Account
            <select name="scheduleId" defaultValue="" required>
              <option value="" disabled>
                Select student schedule
              </option>
              {activeSchedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {schedule.account_reference || schedule.student_name} · {rupees(schedule.total_amount_minor || schedule.total_minor)}
                </option>
              ))}
            </select>
          </label>

          <div className="row" style={{ marginBottom: '14px' }}>
            <label className="field">
              Adjustment Type
              <select name="kind" defaultValue="concession">
                <option value="concession">Concession</option>
                <option value="scholarship">Scholarship</option>
                <option value="waiver">Waiver</option>
                <option value="write_off">Write-off</option>
              </select>
            </label>
            <label className="field">
              Amount (INR)
              <input
                name="amount"
                type="number"
                min="0.01"
                max="10000000000"
                step="0.01"
                placeholder="e.g. 5000"
                inputMode="decimal"
                required
              />
            </label>
          </div>

          <label className="field" style={{ marginBottom: '20px' }}>
            Reason / Justification
            <input
              name="reason"
              placeholder="e.g. Sibling concession 10% or Merit discount"
              minLength={3}
              maxLength={500}
              required
            />
          </label>

          <button className="button primary" style={{ width: '100%' }}>
            Request Fee Adjustment ↗
          </button>
        </form>

        {/* Record unapplied / advance credit (CAP-023 · RPT-07) */}
        <form
          noValidate
          className="admin-panel admin-form"
          onSubmit={(event) =>
            submit(
              event,
              'admin/fee-plans/credits',
              (form) => ({
                accountReference: String(form.get('accountReference') || ''),
                source: String(form.get('source') || 'external_advance'),
                amountMinor: toMinor(form.get('amount')),
                ...(String(form.get('payerId') || '')
                  ? { payerId: String(form.get('payerId')) }
                  : {}),
                ...(String(form.get('evidenceReference') || '')
                  ? { evidenceReference: String(form.get('evidenceReference')) }
                  : {}),
                note: String(form.get('note') || ''),
              }),
              'Advance/unapplied credit recorded separately from revenue and payment status.',
            )
          }
        >
          <p className="eyebrow">CAP-023 · RPT-07 · ADVANCE CREDITS</p>
          <h2>Record unapplied / advance credit</h2>
          <p style={{ marginBottom: '18px' }}>
            Record unallocated advance receipts or counter deposits awaiting reconciliation.
          </p>

          <label className="field" style={{ marginBottom: '14px' }}>
            Account reference
            <input
              name="accountReference"
              placeholder="e.g. DPS-2026-089 or test"
              required
              minLength={2}
              maxLength={120}
            />
          </label>

          <div className="row" style={{ marginBottom: '14px' }}>
            <label className="field">
              Source
              <select name="source" defaultValue="external_advance">
                <option value="external_advance">Confirmed external advance</option>
                <option value="opening_balance">Opening balance</option>
                <option value="transfer_credit">Transfer credit</option>
              </select>
            </label>
            <label className="field">
              Amount (INR)
              <input
                name="amount"
                type="number"
                min="0.01"
                max="10000000000"
                step="0.01"
                placeholder="e.g. 15000"
                inputMode="decimal"
                required
              />
            </label>
          </div>

          <label className="field" style={{ marginBottom: '14px' }}>
            Linked Payer (Optional)
            <select name="payerId" defaultValue="">
              <option value="">No payer selected</option>
              {payers.map((payer) => (
                <option key={payer.id} value={payer.id}>
                  {payer.display_name || payer.name} {payer.account_reference ? `(${payer.account_reference})` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="row" style={{ marginBottom: '20px' }}>
            <label className="field">
              Evidence reference
              <input name="evidenceReference" placeholder="e.g. Bank UTR / Receipt" maxLength={160} />
            </label>
            <label className="field">
              Internal note
              <input name="note" placeholder="Notes for auditors" maxLength={500} />
            </label>
          </div>

          <button className="button primary" style={{ width: '100%' }}>
            Record Credit ↗
          </button>
        </form>
      </section>

      {/* 7. Screenshot 3: Withdrawal / Transfer / Plan-change Control */}
      <form
        noValidate
        className="admin-panel admin-form"
        onSubmit={(event) =>
          submit(
            event,
            'admin/fee-plans/changes',
            (form) => ({
              scheduleId: String(form.get('scheduleId') || ''),
              ...(String(form.get('assignmentId') || '')
                ? { assignmentId: String(form.get('assignmentId')) }
                : {}),
              changeType: String(form.get('changeType') || 'withdrawal'),
              reason: String(form.get('reason') || ''),
              payload: {},
            }),
            'Receivable change request created. Actionable in the Receivable-Change Queue below.',
          )
        }
      >
        <p className="eyebrow">CAP-025 · EDU-08 · ENROLLMENT LIFECYCLE</p>
        <h2>Withdrawal / transfer / plan-change control</h2>
        <p style={{ marginBottom: '18px' }}>
          Execute governed mid-term student withdrawals, campus transfers, or installment plan changes.
        </p>

        <div className="row-3" style={{ marginBottom: '16px' }}>
          <label className="field">
            Schedule & Student
            <select name="scheduleId" defaultValue="" required>
              <option value="" disabled>
                Select schedule
              </option>
              {activeSchedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {schedule.account_reference || schedule.student_name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Assignment
            <select name="assignmentId" defaultValue="">
              <option value="">Select assignment (optional)</option>
              {data.assignments
                .filter((item) => item.status === 'active')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.student_reference || item.student_name} · {item.name || item.plan_name}
                  </option>
                ))}
            </select>
          </label>

          <label className="field">
            Change Type
            <select name="changeType" defaultValue="withdrawal">
              <option value="withdrawal">Withdrawal</option>
              <option value="transfer">Transfer</option>
              <option value="plan_change">Plan change</option>
              <option value="write_off">Write-off request</option>
            </select>
          </label>
        </div>

        <label className="field" style={{ marginBottom: '20px' }}>
          Reason & Official Documentation
          <input
            name="reason"
            placeholder="e.g. Family relocation or Transfer to South campus with TC"
            minLength={3}
            maxLength={500}
            required
          />
        </label>

        <button className="button primary">Request Controlled Change ↗</button>
      </form>

      {/* 8. Screenshot 3: Assignments & Credits Tables */}
      <section className="admin-grid">
        <section className="admin-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ margin: 0 }}>Assignments</h2>
            <span style={{ fontSize: '0.8rem', color: '#0f766e', fontWeight: 600 }}>
              {data.assignments.length} enrolled
            </span>
          </div>

          <div className="admin-table-wrap" style={{ borderRadius: '12px', border: '1px solid rgba(15, 118, 110, 0.12)', overflow: 'hidden' }}>
            <table className="admin-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Plan</th>
                  <th>Version</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.assignments.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: '#6c8f89' }}>
                      No active assignments. Assign an effective plan above.
                    </td>
                  </tr>
                ) : (
                  data.assignments.map((asgn) => (
                    <tr key={asgn.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ color: '#063331' }}>{asgn.student_name || asgn.student_reference}</strong>
                          <span style={{ fontSize: '0.75rem', color: '#0f766e', fontFamily: 'monospace' }}>
                            {asgn.student_reference}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.88rem' }}>{asgn.name || asgn.plan_name}</td>
                      <td>
                        <span style={{ background: '#f0faf6', color: '#0f766e', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                          v{asgn.version || 1}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${asgn.status || 'active'}`}>
                          {asgn.status || 'active'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ margin: 0 }}>Credits</h2>
            <span style={{ fontSize: '0.8rem', color: '#0f766e', fontWeight: 600 }}>
              {data.credits.length} credit(s)
            </span>
          </div>

          <div className="admin-table-wrap" style={{ borderRadius: '12px', border: '1px solid rgba(15, 118, 110, 0.12)', overflow: 'hidden' }}>
            <table className="admin-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Source</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.credits.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: '#6c8f89' }}>
                      No advance credits recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.credits.map((crd) => (
                    <tr key={crd.id}>
                      <td>
                        <strong style={{ color: '#063331' }}>{crd.account_reference}</strong>
                      </td>
                      <td style={{ fontSize: '0.84rem' }}>{crd.source}</td>
                      <td className="money" style={{ color: '#16a34a', fontWeight: 700 }}>
                        {rupees(crd.amount_minor)}
                      </td>
                      <td>
                        <span className={`status-pill ${crd.status || 'unapplied'}`}>
                          {crd.status || 'unapplied'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {/* 9. Approval Queues */}
      <section className="admin-grid">
        <section className="admin-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ margin: 0 }}>Adjustment approval queue</h2>
            <span style={{ fontSize: '0.8rem', color: '#0f766e', fontWeight: 600 }}>
              {data.adjustments.length} record(s)
            </span>
          </div>

          {data.adjustments.length === 0 ? (
            <p style={{ color: '#6c8f89', textAlign: 'center', padding: '24px' }}>
              No adjustments in queue. Request an adjustment above.
            </p>
          ) : (
            data.adjustments.map((adjustment) => (
              <div className="record-row" key={adjustment.id}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <strong style={{ color: '#063331' }}>{adjustment.account_reference || adjustment.student_name}</strong>
                  <span style={{ fontSize: '0.78rem', color: '#527972' }}>
                    {adjustment.reason || 'Concession adjustment'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      background: '#f0faf6',
                      color: '#0f766e',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                    }}
                  >
                    {adjustment.kind || adjustment.type}
                  </span>
                  <strong style={{ color: '#063331', fontSize: '0.98rem' }}>
                    {rupees(adjustment.amount_minor)}
                  </strong>
                  <span className={`status-pill ${adjustment.status}`}>
                    {adjustment.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {adjustment.status === 'pending' && (
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                      onClick={async () => {
                        try {
                          await request(
                            'admin/fee-plans/adjustments/' + adjustment.id + '/decide',
                            'POST',
                            {
                              decision: 'approve',
                              reason: 'Independent owner approval after receivable review',
                            },
                          );
                          notify('Adjustment approved successfully.', 'success');
                          await load();
                        } catch (error) {
                          notify((error as Error).message, 'error');
                        }
                      }}
                    >
                      Approve
                    </button>
                  )}
                  {adjustment.status === 'approved' && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                      onClick={async () => {
                        try {
                          await request(
                            'admin/fee-plans/adjustments/' + adjustment.id + '/apply',
                            'POST',
                            {},
                          );
                          notify('Approved adjustment applied to receivable balance.', 'success');
                          await load();
                        } catch (error) {
                          notify((error as Error).message, 'error');
                        }
                      }}
                    >
                      Apply to Balance
                    </button>
                  )}
                  {adjustment.status === 'applied' && (
                    <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>
                      ✓ Applied
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </section>

        <section className="admin-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ margin: 0 }}>Receivable-change queue</h2>
            <span style={{ fontSize: '0.8rem', color: '#0f766e', fontWeight: 600 }}>
              {data.changes.length} record(s)
            </span>
          </div>

          {data.changes.length === 0 ? (
            <p style={{ color: '#6c8f89', textAlign: 'center', padding: '24px' }}>
              No change requests in queue. Request a withdrawal or transfer above.
            </p>
          ) : (
            data.changes.map((change) => (
              <div className="record-row" key={change.id}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <strong style={{ color: '#063331' }}>{change.account_reference || change.student_name}</strong>
                  <span style={{ fontSize: '0.78rem', color: '#527972' }}>{change.reason}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      background: '#f0faf6',
                      color: '#0f766e',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                    }}
                  >
                    {String(change.change_type || '').replace('_', ' ')}
                  </span>
                  <span className={`status-pill ${change.status}`}>
                    {change.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {change.status === 'pending' && (
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                      onClick={async () => {
                        try {
                          await request('admin/fee-plans/changes/' + change.id + '/decide', 'POST', {
                            decision: 'approve',
                            reason: 'Independent owner approval after obligation review',
                          });
                          notify('Receivable change approved.', 'success');
                          await load();
                        } catch (error) {
                          notify((error as Error).message, 'error');
                        }
                      }}
                    >
                      Approve
                    </button>
                  )}
                  {change.status === 'approved' && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                      onClick={async () => {
                        try {
                          await request(
                            'admin/fee-plans/changes/' + change.id + '/execute',
                            'POST',
                            {},
                          );
                          notify('Approved receivable change executed successfully.', 'success');
                          await load();
                        } catch (error) {
                          notify((error as Error).message, 'error');
                        }
                      }}
                    >
                      Execute Change
                    </button>
                  )}
                  {change.status === 'executed' && (
                    <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>
                      ✓ Executed
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      </section>
    </div>
  );
}
