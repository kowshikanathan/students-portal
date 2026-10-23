'use client';

import { useEffect, useState, useRef } from 'react';
import { useAdminApi } from './context';
import { financialStatusClass } from './financial-status';

export type StaffMember = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role_key: string;
  status: string;
  branch_id?: string | null;
  assigned_branch?: string;
  last_login?: string;
};

type UsersApiResponse = {
  members: StaffMember[];
  kpis: {
    totalStaff: number;
    activeStaff: number;
    inactiveStaff: number;
    pendingInvitations: number;
  };
};

const INSTITUTION_ROLES = [
  { key: 'owner', label: 'Institution Owner', desc: 'Unrestricted administration across all campuses and financial ledgers' },
  { key: 'builder', label: 'Finance & Fee Manager (Admin)', desc: 'Instalment customization, collections, waivers, and reconciliations' },
  { key: 'accountant', label: 'Accountant', desc: 'Fee recording, offline payment verification, and receipt issuance' },
  { key: 'collections', label: 'Collection Staff', desc: 'Follow-ups, reminder dispatch, and recovery note logging' },
  { key: 'support', label: 'Read-only Staff / Auditor', desc: 'Read-only access to records, settlements, and export reports' },
];

export function InstitutionUsers() {
  const { request, session } = useAdminApi();
  const [data, setData] = useState<UsersApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [addingStaff, setAddingStaff] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [viewingPermissionsStaff, setViewingPermissionsStaff] = useState<StaffMember | null>(null);

  // New staff form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState('accountant');
  const [branchId, setBranchId] = useState('br-1');
  const [submittingStaff, setSubmittingStaff] = useState(false);

  const [toastMessage, setToastMessage] = useState('');

  const addDialogRef = useRef<HTMLDialogElement>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const permDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    request<UsersApiResponse>('admin/tenant/members')
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session.tenant.id, refresh]);

  useEffect(() => {
    if (addingStaff) addDialogRef.current?.showModal();
    else addDialogRef.current?.close();
  }, [addingStaff]);

  useEffect(() => {
    if (editingStaff) editDialogRef.current?.showModal();
    else editDialogRef.current?.close();
  }, [editingStaff]);

  useEffect(() => {
    if (viewingPermissionsStaff) permDialogRef.current?.showModal();
    else permDialogRef.current?.close();
  }, [viewingPermissionsStaff]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return;
    setSubmittingStaff(true);
    try {
      await request('admin/tenant/members', 'POST', {
        name,
        email,
        role_key: roleKey,
        branch_id: branchId,
      });
      showToast(`Invitation dispatched to ${email}!`);
      setName('');
      setEmail('');
      setAddingStaff(false);
      setRefresh((n) => n + 1);
    } catch {
      alert('Could not add staff member.');
    } finally {
      setSubmittingStaff(false);
    }
  };

  const handleToggleStatus = async (member: StaffMember) => {
    try {
      await request(`admin/tenant/members/${member.id}/toggle`, 'POST');
      showToast(`Status toggled for ${member.name}`);
      setRefresh((n) => n + 1);
    } catch {
      alert('Could not toggle staff status.');
    }
  };

  const filteredMembers = (data?.members || []).filter((m) => {
    if (search) {
      const q = search.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !m.email.toLowerCase().includes(q)) return false;
    }
    if (roleFilter && m.role_key !== roleFilter) return false;
    if (statusFilter && m.status !== statusFilter) return false;
    return true;
  });

  const kpis = data?.kpis || {
    totalStaff: 6,
    activeStaff: 4,
    inactiveStaff: 1,
    pendingInvitations: 1,
  };

  return (
    <div className="institution-users-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <section className="admin-panel" style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <span className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f766e', fontWeight: 600 }}>
              Staff & Access Control
            </span>
            <h2 style={{ margin: '4px 0 6px', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Institution Staff & Authorized Users</h2>
            <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>
              Manage accounts, institution-scoped roles, and branch-level access permissions for staff belonging to {session.tenant.name}.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => setRefresh((n) => n + 1)}
            >
              ↻ Refresh
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => setAddingStaff(true)}
            >
              + Add Staff Member
            </button>
          </div>
        </div>
      </section>

      {/* Toast Notice */}
      {toastMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: 6, color: '#166534', fontWeight: 600, fontSize: '14px' }}>
          ✓ {toastMessage}
        </div>
      )}

      {/* 4 Required KPI Cards */}
      <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', margin: 0 }}>
        <div className="finance-metric finance-metric-emphasis">
          <span className="finance-metric-label">Total Staff</span>
          <strong>{kpis.totalStaff}</strong>
          <span className="finance-metric-hint">Authorized staff members</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Active Staff</span>
          <strong style={{ color: '#059669' }}>{kpis.activeStaff}</strong>
          <span className="finance-metric-hint">Operational accounts</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Inactive Staff</span>
          <strong style={{ color: '#64748b' }}>{kpis.inactiveStaff}</strong>
          <span className="finance-metric-hint">Deactivated accounts</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Pending Invitations</span>
          <strong style={{ color: '#d97706' }}>{kpis.pendingInvitations}</strong>
          <span className="finance-metric-hint">Awaiting first login</span>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <section className="admin-panel" style={{ padding: 'var(--space-3) var(--space-4)', margin: 0 }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flex: 1, minWidth: 280 }}>
            <input
              type="search"
              placeholder="Search staff by name or email address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, maxWidth: 360 }}
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{ minWidth: 160 }}
            >
              <option value="">All Institution Roles</option>
              {INSTITUTION_ROLES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          {(search || roleFilter || statusFilter) && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setSearch('');
                setRoleFilter('');
                setStatusFilter('');
              }}
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </section>

      {/* Staff Table */}
      <section className="admin-panel" style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p>Loading staff directory…</p>
          </div>
        ) : error ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <p style={{ color: '#dc2626' }}>Could not load staff users.</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h3>No staff members found</h3>
            <p className="small">Try adjusting your search criteria or role filters.</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--surface-border)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Staff Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Email Address</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Institution Role</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Assigned Branch</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Account Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Last Login</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((row) => {
                  const roleObj = INSTITUTION_ROLES.find((r) => r.key === row.role_key) || { label: row.role_key };
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-main)' }}>
                        {row.name}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                        {row.email}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '12px',
                            fontWeight: 600,
                            background: row.role_key === 'owner' ? '#f0fdfa' : '#f1f5f9',
                            color: row.role_key === 'owner' ? '#0f766e' : '#334155',
                          }}
                        >
                          {roleObj.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-main)' }}>
                        {row.assigned_branch || 'All Campuses'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={financialStatusClass(row.status)}>{row.status}</span>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        {row.last_login || 'Recent'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="button secondary"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => setViewingPermissionsStaff(row)}
                            title="View Staff Permissions"
                          >
                            Permissions
                          </button>
                          {row.role_key !== 'owner' && (
                            <button
                              type="button"
                              className="button secondary"
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                color: row.status === 'active' ? '#dc2626' : '#059669',
                              }}
                              onClick={() => handleToggleStatus(row)}
                              title={row.status === 'active' ? 'Deactivate staff account' : 'Activate staff account'}
                            >
                              {row.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal: Add Staff Member */}
      <dialog
        className="finance-dialog"
        ref={addDialogRef}
        onCancel={() => setAddingStaff(false)}
        style={{ maxWidth: 480 }}
      >
        <form onSubmit={handleAddStaff} style={{ padding: 'var(--space-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Add Institution Staff Member</h3>
            <button
              type="button"
              className="button secondary"
              onClick={() => setAddingStaff(false)}
              style={{ padding: '4px 8px', fontSize: '12px' }}
            >
              ✕ Close
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Full Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Ananya Sen"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Staff Email Address (for authentication)
              </label>
              <input
                type="email"
                required
                placeholder="staff.name@dps-demo.invalid"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Assigned Institution Role
              </label>
              <select
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value)}
                style={{ width: '100%' }}
              >
                {INSTITUTION_ROLES.filter((r) => r.key !== 'owner').map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Assigned Campus Branch Scope
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="br-1">Delhi Main Campus (Mathura Road)</option>
                <option value="br-2">Delhi South Campus (RK Puram)</option>
                <option value="all">All Campuses (Multi-branch)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => setAddingStaff(false)}
              disabled={submittingStaff}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={submittingStaff}
            >
              {submittingStaff ? 'Dispatching…' : 'Add Staff & Send Invitation'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Modal: View Permissions */}
      <dialog
        className="finance-dialog"
        ref={permDialogRef}
        onCancel={() => setViewingPermissionsStaff(null)}
        style={{ maxWidth: 480 }}
      >
        {viewingPermissionsStaff && (
          <div style={{ padding: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Role Permissions</h3>
                <p className="small" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>
                  {viewingPermissionsStaff.name} ({viewingPermissionsStaff.email})
                </p>
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => setViewingPermissionsStaff(null)}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: 'var(--space-4)', borderRadius: 6, marginBottom: 'var(--space-4)', fontSize: '13px' }}>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>Authorized Capability Grants:</div>
              <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>✓ Dashboard and Financial Ledgers Read Access</li>
                <li>✓ Student Directory and Fee Records Access</li>
                {viewingPermissionsStaff.role_key !== 'support' && (
                  <>
                    <li>✓ Offline Fee Collection & Direct Payment Entry</li>
                    <li>✓ Authorized Receipt Issuance</li>
                    <li>✓ Overdue Follow-up & Reminder Trigger</li>
                  </>
                )}
                {viewingPermissionsStaff.role_key === 'owner' && (
                  <>
                    <li>✓ Complete Multi-Campus Financial Administration</li>
                    <li>✓ Bank Settlement Account Configuration</li>
                    <li>✓ Staff User & Access Control Management</li>
                  </>
                )}
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="button secondary" onClick={() => setViewingPermissionsStaff(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
