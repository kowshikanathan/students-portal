'use client';

import { useEffect, useState, useRef } from 'react';
import { useAdminApi } from './context';

export type BranchInfo = {
  id: string;
  code: string;
  name: string;
  city?: string | null;
  state?: string | null;
  status: string;
};

export type InstitutionProfileData = {
  tenant: {
    id: string;
    slug: string;
    display_name: string;
    legal_name: string | null;
    status: string;
    locale: string;
  };
  institutionType: string;
  registrationDetails: {
    societyRegistration: string;
    pan: string;
    gstin: string;
    incorporationDate: string;
  };
  contacts: {
    email: string;
    phone: string;
    address: string;
    timezone: string;
  };
  bankSettlement: {
    bankName: string;
    maskedAccountNumber: string;
    ifscCode: string;
    accountType: string;
    payoutCycle: string;
    status: string;
  };
  onboardingStatus: string;
};

export function InstitutionProfile() {
  const { request, session } = useAdminApi();
  const [profile, setProfile] = useState<InstitutionProfileData | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // Edit Profile Modal State
  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [officialEmail, setOfficialEmail] = useState('');
  const [officialPhone, setOfficialPhone] = useState('');
  const [registeredAddress, setRegisteredAddress] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Add Branch Modal State
  const [addingBranch, setAddingBranch] = useState(false);
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCity, setNewBranchCity] = useState('');
  const [newBranchState, setNewBranchState] = useState('');
  const [savingBranch, setSavingBranch] = useState(false);

  const [toastMessage, setToastMessage] = useState('');

  const editDialogRef = useRef<HTMLDialogElement>(null);
  const branchDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    Promise.all([
      request<InstitutionProfileData>('admin/tenant/profile'),
      request<BranchInfo[]>('admin/tenant/branches'),
    ])
      .then(([prof, brs]) => {
        if (active) {
          setProfile(prof);
          setBranches(brs);
          setDisplayName(prof.tenant.display_name || '');
          setLegalName(prof.tenant.legal_name || '');
          setOfficialEmail(prof.contacts.email || '');
          setOfficialPhone(prof.contacts.phone || '');
          setRegisteredAddress(prof.contacts.address || '');
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
    if (editingProfile) editDialogRef.current?.showModal();
    else editDialogRef.current?.close();
  }, [editingProfile]);

  useEffect(() => {
    if (addingBranch) branchDialogRef.current?.showModal();
    else branchDialogRef.current?.close();
  }, [addingBranch]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await request('admin/tenant/profile', 'POST', {
        display_name: displayName,
        legal_name: legalName,
        official_email: officialEmail,
        official_phone: officialPhone,
        registered_address: registeredAddress,
      });
      showToast('Institution details updated successfully!');
      setEditingProfile(false);
      setRefresh((n) => n + 1);
    } catch {
      alert('Could not update profile details.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchCode || !newBranchName) return;
    setSavingBranch(true);
    try {
      await request('admin/tenant/branches', 'POST', {
        code: newBranchCode,
        name: newBranchName,
        city: newBranchCity,
        state: newBranchState,
      });
      showToast('New campus branch registered successfully!');
      setNewBranchCode('');
      setNewBranchName('');
      setNewBranchCity('');
      setNewBranchState('');
      setAddingBranch(false);
      setRefresh((n) => n + 1);
    } catch {
      alert('Could not add branch.');
    } finally {
      setSavingBranch(false);
    }
  };

  return (
    <div className="institution-profile-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <section className="admin-panel" style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <span className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f766e', fontWeight: 600 }}>
              Authorized Tenant Workspace
            </span>
            <h2 style={{ margin: '4px 0 6px', fontSize: 'var(--text-xl)', fontWeight: 700 }}>
              {profile?.tenant.display_name || session.tenant.name}
            </h2>
            <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>
              Official institutional legal entity profile, registered campus branches, verified settlement banking, and business onboarding state.
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
              onClick={() => setEditingProfile(true)}
            >
              ✎ Edit Institution Profile
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

      {/* Registration & KYC Status Banner */}
      <section style={{ background: '#f8fafc', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ fontSize: '24px' }}>🏛</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', color: '#0f172a' }}>
              Institution Identity: {profile?.tenant.legal_name || 'Delhi Public School Educational Society'}
            </div>
            <div className="small" style={{ color: 'var(--text-muted)' }}>
              Society Registration: <strong>{profile?.registrationDetails.societyRegistration || 'TRUST-DEL-2026-901'}</strong> · KYC Verified Onboarding Completed
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span className="status-pill success">Active & Operational</span>
          <span className="status-pill success">Settlement Active</span>
        </div>
      </section>

      {loading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
          <p>Loading institution profile…</p>
        </div>
      ) : error ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <p style={{ color: '#dc2626' }}>Could not load institution details.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-6)' }}>
          {/* Card 1: Legal & Business Identity */}
          <section className="admin-panel" style={{ margin: 0 }}>
            <h3 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-md)', fontWeight: 600 }}>Legal & Regulatory Identity</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Operating / Display Name</span>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{profile?.tenant.display_name}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Registered Legal Entity Name</span>
                <div style={{ fontWeight: 600 }}>{profile?.tenant.legal_name}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Institution Category / Board</span>
                <div style={{ fontWeight: 500 }}>{profile?.institutionType}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Tax PAN</span>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{profile?.registrationDetails.pan}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>GSTIN</span>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{profile?.registrationDetails.gstin}</div>
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Date of Incorporation</span>
                <div>{new Date(profile?.registrationDetails.incorporationDate || '1982-04-12').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
              </div>
            </div>
          </section>

          {/* Card 2: Contact & Operating Details */}
          <section className="admin-panel" style={{ margin: 0 }}>
            <h3 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-md)', fontWeight: 600 }}>Institutional Contact Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Official Fee Accounts Email</span>
                <div style={{ fontWeight: 600, color: '#0f766e' }}>{profile?.contacts.email}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Principal / Accounts Office Phone</span>
                <div style={{ fontWeight: 600 }}>{profile?.contacts.phone}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Official Campus Address</span>
                <div style={{ color: 'var(--text-main)' }}>{profile?.contacts.address}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Timezone & Currency</span>
                <div>{profile?.contacts.timezone} · <strong>INR (₹)</strong></div>
              </div>
            </div>
          </section>

          {/* Card 3: Masked Bank & Settlement Account */}
          <section className="admin-panel" style={{ margin: 0 }}>
            <h3 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-md)', fontWeight: 600 }}>Settlement Account Configuration</h3>
            <div style={{ background: '#f8fafc', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '15px', color: '#0f172a' }}>{profile?.bankSettlement.bankName}</strong>
                <span className="status-pill success">{profile?.bankSettlement.status}</span>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Masked Account Number:</span>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', letterSpacing: '0.05em' }}>
                  {profile?.bankSettlement.maskedAccountNumber}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', margin: '8px 0' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>IFSC Code</span>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{profile?.bankSettlement.ifscCode}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Account Type</span>
                  <div>{profile?.bankSettlement.accountType}</div>
                </div>
              </div>
              <div style={{ paddingTop: '8px', borderTop: '1px solid #e2e8f0', fontSize: '12px', color: '#0f766e' }}>
                Payout Cycle: <strong>{profile?.bankSettlement.payoutCycle}</strong>
              </div>
            </div>
          </section>

          {/* Card 4: Registered Campuses & Branches */}
          <section className="admin-panel" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 600 }}>Authorized Campuses & Branches</h3>
              <button
                type="button"
                className="button secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={() => setAddingBranch(true)}
              >
                + Add Branch
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {branches.map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{b.name}</div>
                    <div className="small" style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      Branch Code: <strong>{b.code}</strong> {b.city && `· ${b.city}, ${b.state}`}
                    </div>
                  </div>
                  <span className="status-pill success">{b.status}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Modal: Edit Profile */}
      <dialog
        className="finance-dialog"
        ref={editDialogRef}
        onCancel={() => setEditingProfile(false)}
        style={{ maxWidth: 540 }}
      >
        <form onSubmit={handleSaveProfile} style={{ padding: 'var(--space-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Edit Institution Profile</h3>
            <button
              type="button"
              className="button secondary"
              onClick={() => setEditingProfile(false)}
              style={{ padding: '4px 8px', fontSize: '12px' }}
            >
              ✕ Close
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Operating / Display Name
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Registered Legal Entity Name
              </label>
              <input
                type="text"
                required
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Accounts Contact Email
                </label>
                <input
                  type="email"
                  required
                  value={officialEmail}
                  onChange={(e) => setOfficialEmail(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  required
                  value={officialPhone}
                  onChange={(e) => setOfficialPhone(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Campus Address
              </label>
              <textarea
                rows={2}
                required
                value={registeredAddress}
                onChange={(e) => setRegisteredAddress(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => setEditingProfile(false)}
              disabled={savingProfile}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Modal: Add Campus Branch */}
      <dialog
        className="finance-dialog"
        ref={branchDialogRef}
        onCancel={() => setAddingBranch(false)}
        style={{ maxWidth: 480 }}
      >
        <form onSubmit={handleAddBranch} style={{ padding: 'var(--space-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Add Campus Branch</h3>
            <button
              type="button"
              className="button secondary"
              onClick={() => setAddingBranch(false)}
              style={{ padding: '4px 8px', fontSize: '12px' }}
            >
              ✕ Close
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Branch Code (e.g. DEL-NORTH)
              </label>
              <input
                type="text"
                required
                placeholder="e.g. DEL-NORTH"
                value={newBranchCode}
                onChange={(e) => setNewBranchCode(e.target.value.toUpperCase())}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Branch / Campus Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Delhi North Campus (Rohini)"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>City</label>
                <input
                  type="text"
                  placeholder="e.g. New Delhi"
                  value={newBranchCity}
                  onChange={(e) => setNewBranchCity(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>State</label>
                <input
                  type="text"
                  placeholder="e.g. Delhi"
                  value={newBranchState}
                  onChange={(e) => setNewBranchState(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => setAddingBranch(false)}
              disabled={savingBranch}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={savingBranch}
            >
              {savingBranch ? 'Adding…' : 'Register Branch'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
