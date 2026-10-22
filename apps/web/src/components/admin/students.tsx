'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';
import { financialStatusClass } from './financial-status';

type Student = {
  id: string;
  full_name: string;
  student_reference: string;
  status: string;
  institute: string;
  group_name?: string;
  course?: string;
  grade?: string;
  academic_year?: string;
  enach_status?: string;
  net_payable_minor: string;
  paid_minor: string;
  outstanding_minor: string;
};
type Page = { rows: Student[]; total: number; page: number; pageSize: number };

export function Students() {
  const router = useRouter();
  const { request, session, can } = useAdminApi();
  const [result, setResult] = useState<{ tenantId: string; value: Page } | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    setAdding(new URLSearchParams(window.location.search).get('new') === '1');
  }, []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [guardians, setGuardians] = useState<Array<{ id: string; display_name: string }>>([]);
  useEffect(() => {
    if (!adding) return;
    let active = true;
    request<typeof guardians>('admin/academic/guardians')
      .then((rows) => {
        if (active) setGuardians(rows);
      })
      .catch(() => {
        if (active) setGuardians([]);
      });
    return () => {
      active = false;
    };
  }, [adding, session.tenant.id]);
  const data = result?.tenantId === session.tenant.id ? result.value : null;
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      search: query,
      status,
      sort,
      page: String(page),
      pageSize: '25',
    });
    request<Page>('admin/fees/students?' + params)
      .then((value) => {
        if (active) setResult({ tenantId: session.tenant.id, value });
      })
      .catch(() => {
        if (active) setError('Students could not be loaded. Please retry.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.tenant.id, query, status, sort, page, refresh]);
  return (
    <>
      <div className="admin-toolbar">
        <div>
          <p className="eyebrow">STUDENT FINANCE</p>
          <h2>Students</h2>
          <p>Manage student receivables and collection activity.</p>
        </div>
        <div className="row">
          <button className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
            Refresh
          </button>
          <button
            className="button primary"
            disabled={session.tenant.readOnly || !can('customer.create')}
            onClick={() => {
              setAdding(true);
              setNotice('');
            }}
          >
            + New Student
          </button>
        </div>
      </div>
      {adding && (
        <section className="admin-panel">
          <form
            className="admin-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setNotice('');
              const form = new FormData(event.currentTarget);
              try {
                const payload: Record<string, any> = {
                  studentReference: form.get('studentReference'),
                  fullName: form.get('fullName'),
                };
                for (const key of [
                  'email',
                  'phone',
                  'campus',
                  'course',
                  'grade',
                  'groupName',
                  'academicYear',
                  'guardianId',
                  'guardianName',
                  'guardianEmail',
                  'guardianPhone',
                  'status',
                ]) {
                  const val = form.get(key);
                  if (val && typeof val === 'string' && val.trim().length > 0) {
                    payload[key] = val.trim();
                  }
                }
                const created: any = await request('admin/academic/students', 'POST', payload);
                const targetId = created?.id || payload.studentReference || 'stu-1';
                router.push('/admin/students/' + targetId + '/');
                setAdding(false);
                setRefresh((n) => n + 1);
                setNotice(
                  `Student created successfully (${payload.studentReference}). Next steps: Assign Fee Structure → Configure Components → Assign Master Schedule → Flex Schedule → Enable eNACH.`,
                );
              } catch (err: any) {
                setNotice(
                  err?.message ||
                    'Student could not be created. Please verify enrollment number format and try again.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>+ New Student Registration</h3>
            <p className="small">
              Enter academic and guardian details. Guardians will be linked as fee payers for eNACH
              and portal access.
            </p>

            <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Student Academic Profile</h4>
            <div className="row">
              <label className="field">
                Student Name *
                <input
                  name="fullName"
                  required
                  minLength={2}
                  maxLength={160}
                  placeholder="e.g. Rahul Sharma"
                  autoFocus
                />
              </label>
              <label className="field">
                Enrollment / Student ID *
                <input
                  name="studentReference"
                  required
                  pattern="[A-Za-z0-9._/-]{2,80}"
                  placeholder="e.g. STU-2026-001"
                />
              </label>
            </div>
            <div className="row">
              <label className="field">
                Student Email
                <input
                  name="email"
                  type="email"
                  placeholder="student@institution.edu"
                  maxLength={200}
                />
              </label>
              <label className="field">
                Student Phone
                <input name="phone" type="tel" placeholder="+91 98765 43210" />
              </label>
            </div>
            <div className="row">
              <label className="field">
                Institute
                <input value={session.tenant.name} disabled readOnly />
              </label>
              <label className="field">
                Campus / Branch
                <input name="campus" placeholder="e.g. Main Campus / South Wing" maxLength={160} />
              </label>
            </div>
            <div className="row">
              <label className="field">
                Course / Program
                <input name="course" placeholder="e.g. B.Tech Computer Science" maxLength={160} />
              </label>
              <label className="field">
                Grade / Class
                <input name="grade" placeholder="e.g. Year 2 / Grade 11" maxLength={160} />
              </label>
            </div>
            <div className="row">
              <label className="field">
                Group / Batch
                <input name="groupName" placeholder="e.g. Batch 2026-A" maxLength={160} />
              </label>
              <label className="field">
                Academic Year
                <input name="academicYear" placeholder="e.g. 2026-2027" maxLength={160} />
              </label>
              <label className="field">
                Admission Status
                <select name="status" defaultValue="active">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="withdrawn">Withdrawn</option>
                  <option value="graduated">Graduated</option>
                </select>
              </label>
            </div>

            <h4 style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
              Parent / Guardian Details (Fee Payer)
            </h4>
            <label className="field">
              Link Existing Parent / Payer
              <select name="guardianId" defaultValue="">
                <option value="">Create parent from details below</option>
                {guardians.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.display_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <label className="field">
                Parent / Guardian Name
                <input name="guardianName" placeholder="e.g. Ramesh Sharma" maxLength={160} />
              </label>
              <label className="field">
                Parent Email
                <input
                  name="guardianEmail"
                  type="email"
                  placeholder="parent@example.com"
                  maxLength={200}
                />
              </label>
              <label className="field">
                Parent Phone
                <input name="guardianPhone" type="tel" placeholder="+91 98765 00000" />
              </label>
            </div>

            <div className="row" style={{ marginTop: '1.5rem' }}>
              <button className="button primary" disabled={busy}>
                {busy ? 'Saving…' : 'Create & Register Student'}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
      {notice && <p role="status">{notice}</p>}
      <section className="admin-panel">
        <div className="row">
          <label className="field">
            Search students
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or enrollment number"
            />
          </label>
          <label className="field">
            Admission status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              {['all', 'active', 'inactive', 'withdrawn', 'graduated'].map((value) => (
                <option key={value} value={value}>
                  {value === 'all' ? 'All statuses' : value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Sort by
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
            >
              <option value="name">Student name</option>
              <option value="reference">Enrollment number</option>
            </select>
          </label>
        </div>
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
              Retry
            </button>
          </div>
        ) : loading ? (
          <p role="status" aria-busy="true">
            Loading students…
          </p>
        ) : (
          data && (
            <>
              <p className="small">{data.total} students</p>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Student name</th>
                      <th>Enrollment number</th>
                      <th>Institute</th>
                      <th>Group / Class</th>
                      <th>Course</th>
                      <th>Grade</th>
                      <th>Academic year</th>
                      <th>Status</th>
                      <th>eNACH</th>
                      <th className="money">Net payable</th>
                      <th className="money">Paid</th>
                      <th className="money">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((student) => (
                      <tr key={student.id}>
                        <td>
                          <Link href={'/admin/students/' + student.id + '/'}>
                            {student.full_name}
                          </Link>
                        </td>
                        <td>{student.student_reference}</td>
                        <td>{student.institute}</td>
                        <td>{student.group_name || '—'}</td>
                        <td>{student.course || '—'}</td>
                        <td>{student.grade || '—'}</td>
                        <td>{student.academic_year || '—'}</td>
                        <td>
                          <span className={financialStatusClass(student.status)}>{student.status}</span>
                        </td>
                        <td>
                          <span className={financialStatusClass(student.enach_status || 'not_registered')}>
                            {(student.enach_status || 'not_registered').replaceAll('_', ' ')}
                          </span>
                        </td>
                        <td className="money">{formatMoney(student.net_payable_minor)}</td>
                        <td className="money">{formatMoney(student.paid_minor)}</td>
                        <td className="money">{formatMoney(student.outstanding_minor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.rows.length && (
                <div className="empty-state">
                  <h3>No students found</h3>
                  <p>Add a student or adjust your filters.</p>
                </div>
              )}
              <nav className="admin-toolbar" aria-label="Student pages">
                <button
                  className="button secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((n) => n - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}
                </span>
                <button
                  className="button secondary"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Next
                </button>
              </nav>
            </>
          )
        )}
      </section>
    </>
  );
}
