'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdminApi } from './context';
import { formatMoney } from './finance-dashboard';

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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
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
            + Add Student
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
                await request('admin/academic/students', 'POST', {
                  studentReference: form.get('studentReference'),
                  fullName: form.get('fullName'),
                });
                setAdding(false);
                setRefresh((n) => n + 1);
                setNotice('Student created.');
              } catch {
                setNotice(
                  'Student could not be created. Check the enrollment number and try again.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>Add Student</h3>
            <div className="row">
              <label className="field">
                Full name
                <input name="fullName" required minLength={2} maxLength={160} autoFocus />
              </label>
              <label className="field">
                Enrollment number
                <input name="studentReference" required pattern="[A-Za-z0-9._/-]{2,80}" />
              </label>
            </div>
            <div className="row">
              <button className="button primary" disabled={busy}>
                {busy ? 'Saving…' : 'Create Student'}
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
                        <td>{student.group_name || '?'}</td>
                        <td>{student.course || '?'}</td>
                        <td>{student.grade || '?'}</td>
                        <td>{student.academic_year || '?'}</td>
                        <td>
                          <span className="status-pill">{student.status}</span>
                        </td>
                        <td>
                          <span className="status-pill">
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
