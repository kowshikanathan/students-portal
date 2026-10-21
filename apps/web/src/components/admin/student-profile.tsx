'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';
import { DirectPayment } from './direct-payment';
import { SandboxEnach } from './sandbox-enach';
import { FlexEditor } from './flex-editor';
import { MandateState } from './mandate-state';
import { downloadFinancialDocument } from './financial-download';

type Profile = {
  id: string;
  full_name: string;
  student_reference: string;
  status: string;
  institute: string;
  group_name?: string;
  course?: string;
  grade?: string;
  academic_year?: string;
  campus?: string;
  enach_status?: string;
  summary: { net_payable_minor: string; paid_minor: string; outstanding_minor: string };
  balances: Array<{
    schedule_id: string;
    account_reference: string;
    net_payable_minor: string;
    paid_minor: string;
    outstanding_minor: string;
  }>;
};
type RecordPage = { total: number; rows: Record<string, string | number>[]; pageSize: number };
const sections = [
  ['overview', 'Overview'],
  ['components', 'Components'],
  ['installments', 'Fee Structure'],
  ['payments', 'Payments'],
  ['bank', 'Bank Transfer'],
  ['mandates', 'Flex / eNACH'],
  ['receipts', 'Receipts'],
  ['activity', 'Activity'],
] as const;
type Section = (typeof sections)[number][0];
const columns: Record<string, Array<[string, string]>> = {
  master: [
    ['sequence', 'Installment'],
    ['due_date', 'Due date'],
    ['amount_minor', 'Original amount'],
  ],
  components: [
    ['label', 'Component'],
    ['code', 'Code'],
    ['amount_minor', 'Original fee'],
    ['account_reference', 'Account'],
  ],
  installments: [
    ['sequence', 'Installment'],
    ['due_date', 'Due date'],
    ['amount_minor', 'Original amount'],
    ['adjustment_amount_minor', 'Adjustment'],
    ['paid_amount_minor', 'Paid'],
    ['remaining_minor', 'Remaining'],
    ['status', 'Status'],
  ],
  payments: [
    ['provider_reference', 'Reference'],
    ['recorded_at', 'Payment date'],
    ['amount_minor', 'Amount'],
    ['refunded_amount_minor', 'Refunded'],
    ['status', 'Status'],
  ],
  mandates: [
    ['provider_reference', 'Mandate reference'],
    ['rail', 'Type'],
    ['status', 'Status'],
    ['last_event_at', 'Updated'],
  ],
  receipts: [
    ['receipt_number', 'Receipt number'],
    ['issued_at', 'Issued'],
  ],
};
export function StudentProfile({ studentId }: { studentId: string }) {
  const { request, session, can } = useAdminApi();
  const [editing, setEditing] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [scheduleView, setScheduleView] = useState<'master' | 'flex'>('flex');
  const recordSection =
    section === 'installments' && scheduleView === 'master' ? 'master' : section;
  const [records, setRecords] = useState<RecordPage | null>(null);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setProfile(null);
    setError('');
    request<Profile>('admin/fees/students/' + studentId)
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch(() => {
        if (active) setError('Student financial records could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [studentId, session.tenant.id, refresh]);
  useEffect(() => {
    let active = true;
    setRecords(null);
    setError('');
    if (columns[section])
      request<RecordPage>(
        `admin/fees/students/${studentId}/records?section=${recordSection}&page=${page}`,
      )
        .then((value) => {
          if (active) setRecords(value);
        })
        .catch(() => {
          if (active) setError('This section could not be loaded. Please retry.');
        });
    return () => {
      active = false;
    };
  }, [studentId, session.tenant.id, section, scheduleView, page, refresh]);
  const pick = (value: Section) => {
    setSection(value);
    setPage(1);
  };
  return (
    <>
      {editing && (
        <FlexEditor
          scheduleId={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setRefresh((n) => n + 1);
            setNotice('Flex schedule saved.');
          }}
        />
      )}
      {paying && (
        <DirectPayment
          studentId={studentId}
          onClose={() => setPaying(false)}
          onSaved={() => {
            setPaying(false);
            setRefresh((n) => n + 1);
            setNotice('Payment recorded and receipt issued.');
          }}
        />
      )}
      {notice && <p role="status">{notice}</p>}
      <Link href="/admin/students/">← Students</Link>
      {error && (
        <div role="alert" className="error-card">
          <p>{error}</p>
          <button className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {!profile ? (
        !error && (
          <p role="status" aria-busy="true">
            Loading student financial profile…
          </p>
        )
      ) : (
        <>
          <header className="admin-panel student-financial-header">
            <p className="eyebrow">STUDENT FINANCIAL PROFILE</p>
            <div className="admin-toolbar">
              <h2>{profile.full_name}</h2>
              <button
                className="button secondary"
                onClick={() =>
                  downloadFinancialDocument(
                    'Student fee statement',
                    [
                      ['Student', profile.full_name],
                      ['Enrollment number', profile.student_reference],
                      ['Institute', profile.institute],
                      ['Net payable', formatMoney(profile.summary.net_payable_minor)],
                      ['Paid', formatMoney(profile.summary.paid_minor)],
                      ['Outstanding', formatMoney(profile.summary.outstanding_minor)],
                    ],
                    'student-statement-' + profile.student_reference,
                  )
                }
              >
                Download statement
              </button>
              <button
                className="button primary"
                disabled={session.tenant.readOnly || !can('payment.evidence.record')}
                onClick={() => setPaying(true)}
              >
                Add Direct Payment
              </button>
            </div>
            <p>
              {profile.student_reference} · {profile.institute} ·{' '}
              <span className="status-pill">{profile.status}</span>
            </p>
            <p className="small">
              {[
                profile.campus,
                profile.group_name,
                profile.course,
                profile.grade,
                profile.academic_year,
              ]
                .filter(Boolean)
                .join(' ? ')}
            </p>
            <p className="small">
              eNACH: {(profile.enach_status || 'not_registered').replaceAll('_', ' ')}
            </p>
          </header>
          <div className="dashboard-stats student-summary">
            {[
              ['Net payable', profile.summary.net_payable_minor],
              ['Paid', profile.summary.paid_minor],
              ['Outstanding', profile.summary.outstanding_minor],
            ].map(([label, amount]) => (
              <div className="dashboard-stat" key={label}>
                <span>{label}</span>
                <strong>{formatMoney(amount!)}</strong>
              </div>
            ))}
          </div>
          <div className="student-financial-workspace">
            <nav className="student-financial-nav" aria-label="Student financial sections">
              {sections.map(([key, title]) => (
                <button
                  type="button"
                  key={key}
                  aria-current={key === section ? 'page' : undefined}
                  className={key === section ? 'selected' : ''}
                  onClick={() => pick(key)}
                >
                  {title}
                </button>
              ))}
            </nav>
            <section
              className="admin-panel student-financial-content"
              aria-label={sections.find(([key]) => key === section)?.[1]}
            >
              <h3>{sections.find(([key]) => key === section)?.[1]}</h3>
              {section === 'overview' && (
                <>
                  <p>All assigned fee schedules and their current receivable balances.</p>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Account</th>
                          <th className="money">Net payable</th>
                          <th className="money">Paid</th>
                          <th className="money">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.balances.map((balance) => (
                          <tr key={balance.schedule_id}>
                            <td>{balance.account_reference}</td>
                            <td className="money">{formatMoney(balance.net_payable_minor)}</td>
                            <td className="money">{formatMoney(balance.paid_minor)}</td>
                            <td className="money">{formatMoney(balance.outstanding_minor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!profile.balances.length && <p>No active fee schedule assigned.</p>}
                </>
              )}
              {section === 'installments' && (
                <div className="row" aria-label="Schedule type">
                  <button
                    className="button secondary"
                    aria-pressed={scheduleView === 'master'}
                    onClick={() => {
                      setScheduleView('master');
                      setPage(1);
                    }}
                  >
                    Master Schedule
                  </button>
                  <button
                    className="button secondary"
                    aria-pressed={scheduleView === 'flex'}
                    onClick={() => {
                      setScheduleView('flex');
                      setPage(1);
                    }}
                  >
                    Flex Schedule
                  </button>
                </div>
              )}
              {section === 'installments' && scheduleView === 'flex' && (
                <div className="row">
                  {profile.balances.map((balance) => (
                    <button
                      key={balance.schedule_id}
                      className="button secondary"
                      disabled={session.tenant.readOnly || !can('fee.schedule.edit')}
                      onClick={() => setEditing(balance.schedule_id)}
                    >
                      Customize Flex {balance.account_reference}
                    </button>
                  ))}
                </div>
              )}
              {section === 'mandates' && (
                <SandboxEnach
                  studentId={studentId}
                  studentName={profile.full_name}
                  schedules={profile.balances}
                  onChanged={(message) => {
                    setNotice(message || 'Collection records updated.');
                    setRefresh((n) => n + 1);
                  }}
                />
              )}
              {section === 'bank' && (
                <p>Bank transfer instructions have not been configured for this workspace.</p>
              )}
              {section === 'activity' && (
                <p>Financial changes are recorded in the institute audit log.</p>
              )}
              {columns[section] &&
                (!records ? (
                  !error && <p role="status">Loading records…</p>
                ) : (
                  <>
                    <p className="small">{records.total} records</p>
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            {columns[recordSection]!.map(([key, title]) => (
                              <th key={key} className={key.endsWith('_minor') ? 'money' : ''}>
                                {title}
                              </th>
                            ))}
                            {['receipts', 'mandates'].includes(section) && <th>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {records.rows.map((row) => (
                            <tr key={row.id}>
                              {columns[section]!.map(([key]) => (
                                <td key={key} className={key.endsWith('_minor') ? 'money' : ''}>
                                  {key.endsWith('_minor')
                                    ? formatMoney(row[key] ?? 0)
                                    : key.endsWith('_at') || key === 'due_date'
                                      ? new Intl.DateTimeFormat('en-IN', {
                                          day: '2-digit',
                                          month: 'short',
                                          year: 'numeric',
                                          timeZone: 'Asia/Kolkata',
                                        }).format(new Date(row[key]!))
                                      : String(row[key] ?? '—').replaceAll('_', ' ')}
                                </td>
                              ))}
                              {section === 'mandates' && (
                                <td>
                                  {row.provider === 'sandbox_enach' &&
                                    can('enach.manage') &&
                                    !session.tenant.readOnly && (
                                      <MandateState
                                        id={String(row.id)}
                                        onChanged={() => {
                                          setRefresh((n) => n + 1);
                                          setNotice('Sandbox mandate state updated.');
                                        }}
                                      />
                                    )}
                                </td>
                              )}
                              {section === 'receipts' && (
                                <td>
                                  <button
                                    className="button secondary"
                                    onClick={async () => {
                                      try {
                                        const receipt = await request<{
                                          receipt_number: string;
                                          issued_at: string;
                                          snapshot: Record<string, any>;
                                        }>('admin/fees/receipts/' + row.id);
                                        downloadFinancialDocument(
                                          'Payment receipt',
                                          [
                                            ['Receipt number', receipt.receipt_number],
                                            ['Issued', receipt.issued_at],
                                            ['Student', receipt.snapshot.studentName],
                                            ['Institute', receipt.snapshot.instituteName],
                                            ['Student account', receipt.snapshot.accountReference],
                                            ['Amount', formatMoney(receipt.snapshot.amountMinor)],
                                            ['Reference', receipt.snapshot.providerReference],
                                            [
                                              'Payment mode',
                                              receipt.snapshot.directPayment?.mode ||
                                                'Provider payment',
                                            ],
                                          ],
                                          receipt.receipt_number,
                                        );
                                      } catch {
                                        setNotice('Receipt could not be downloaded. Please retry.');
                                      }
                                    }}
                                  >
                                    Download receipt
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!records.rows.length && (
                      <div className="empty-state">
                        <h4>No records yet</h4>
                        <p>
                          Records will appear when the corresponding financial workflow is
                          completed.
                        </p>
                      </div>
                    )}
                    <nav className="admin-toolbar" aria-label="Financial record pages">
                      <button
                        className="button secondary"
                        disabled={page <= 1}
                        onClick={() => setPage((n) => n - 1)}
                      >
                        Previous
                      </button>
                      <span>
                        Page {page} of {Math.max(1, Math.ceil(records.total / records.pageSize))}
                      </span>
                      <button
                        className="button secondary"
                        disabled={page * records.pageSize >= records.total}
                        onClick={() => setPage((n) => n + 1)}
                      >
                        Next
                      </button>
                    </nav>
                  </>
                ))}
            </section>
          </div>
        </>
      )}
    </>
  );
}
