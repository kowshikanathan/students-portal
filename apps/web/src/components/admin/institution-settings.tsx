'use client';

import { useEffect, useState } from 'react';
import { useAdminApi } from './context';

export type SettingsSection =
  | 'general'
  | 'branches'
  | 'payments'
  | 'notifications'
  | 'staff'
  | 'security'
  | 'enach';

const SETTINGS_TABS: Array<{ id: SettingsSection; label: string; icon: string }> = [
  { id: 'general', label: '1. General Settings', icon: '⚙' },
  { id: 'branches', label: '2. Branch Settings', icon: '🏢' },
  { id: 'payments', label: '3. Payment & Receipts', icon: '💳' },
  { id: 'notifications', label: '4. Notifications', icon: '🔔' },
  { id: 'staff', label: '5. Staff & Permissions', icon: '👥' },
  { id: 'security', label: '6. Security & Account', icon: '🔒' },
  { id: 'enach', label: '7. eNACH Preferences', icon: '⚡' },
];

export function InstitutionSettings() {
  const { request, session } = useAdminApi();
  const [activeTab, setActiveTab] = useState<SettingsSection>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [refresh, setRefresh] = useState(0);

  // Form states
  // 1. General
  const [displayName, setDisplayName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata (IST +05:30)');

  // 2. Branches
  const [branchesList, setBranchesList] = useState<Array<{ code: string; name: string; city: string; state: string; isDefault: boolean; activeStudents: number }>>([]);

  // 3. Payment & Receipts
  const [allowedMethods, setAllowedMethods] = useState({
    enachAutopay: true,
    upiInstant: true,
    netbanking: true,
    creditDebitCard: true,
    directBankTransfer: true,
  });
  const [receiptPrefix, setReceiptPrefix] = useState('DPS-REC-2026-');
  const [receiptHeader, setReceiptHeader] = useState('Official Fee Collection Receipt. Thank you for your payment.');
  const [receiptTerms, setReceiptTerms] = useState('Fee once paid is strictly governed by the institution fee and refund regulations.');
  const [settlementAccountInfo, setSettlementAccountInfo] = useState({
    bankName: 'HDFC Bank Ltd.',
    maskedAccountNumber: '•••• •••• •••• 4092',
    ifscCode: 'HDFC0001234',
    payoutCycle: 'T+1 Working Day (NPCI Cleared)',
    status: 'Verified via Penny Drop',
  });

  // 4. Notifications
  const [notifyPaymentConfirmations, setNotifyPaymentConfirmations] = useState(true);
  const [notifyUpcomingReminders, setNotifyUpcomingReminders] = useState(true);
  const [reminderDays, setReminderDays] = useState('7, 3');
  const [notifyOverdue, setNotifyOverdue] = useState(true);
  const [notifyFailedDebit, setNotifyFailedDebit] = useState(true);

  // 5. Staff & Permissions
  const [rolesList, setRolesList] = useState<Array<{ role: string; count: number; description: string }>>([]);

  // 6. Security & Account
  const [sessionTimeout, setSessionTimeout] = useState('60');
  const [mfaActive, setMfaActive] = useState(true);

  // 7. eNACH Preferences
  const [mandateProvider, setMandateProvider] = useState('NPCI National Automated Clearing House / Sandbox eNACH Rail');
  const [presentationWindow, setPresentationWindow] = useState('T-0 Morning (08:30 AM IST)');
  const [retryStrategy, setRetryStrategy] = useState('Maximum 2 retries with 3-day buffer interval');
  const [whatsAppLinks, setWhatsAppLinks] = useState(true);

  // Load from backend
  useEffect(() => {
    let active = true;
    setLoading(true);

    request<any>('admin/fees/settings/institution')
      .then((cfg) => {
        if (!active) return;
        if (cfg.general) {
          setDisplayName(cfg.general.displayName || session.tenant.name);
          setContactEmail(cfg.general.contactEmail || '');
          setContactPhone(cfg.general.contactPhone || '');
          setAddress(cfg.general.address || '');
          setTimezone(cfg.general.timezone || 'Asia/Kolkata (IST +05:30)');
        }
        if (cfg.branches) setBranchesList(cfg.branches);
        if (cfg.payments) {
          if (cfg.payments.allowedMethods) setAllowedMethods(cfg.payments.allowedMethods);
          if (cfg.payments.receiptPreferences) {
            setReceiptPrefix(cfg.payments.receiptPreferences.prefix || 'DPS-REC-');
            setReceiptHeader(cfg.payments.receiptPreferences.headerNote || '');
            setReceiptTerms(cfg.payments.receiptPreferences.termsAndConditions || '');
          }
          if (cfg.payments.settlementAccount) setSettlementAccountInfo(cfg.payments.settlementAccount);
        }
        if (cfg.notifications) {
          setNotifyPaymentConfirmations(Boolean(cfg.notifications.paymentConfirmations?.email));
          setNotifyUpcomingReminders(Boolean(cfg.notifications.upcomingInstalmentReminders?.enabled));
          setNotifyOverdue(Boolean(cfg.notifications.overdueReminders?.enabled));
          setNotifyFailedDebit(Boolean(cfg.notifications.failedDebitNotifications?.immediateEmail));
        }
        if (cfg.staffPermissions) {
          setRolesList(cfg.staffPermissions.institutionRoles || []);
        }
        if (cfg.securityAccount) {
          setSessionTimeout(String(cfg.securityAccount.sessionTimeoutMinutes || '60'));
          setMfaActive(Boolean(cfg.securityAccount.mfaEnabled));
        }
        if (cfg.enachPreferences) {
          setMandateProvider(cfg.enachPreferences.mandateProvider || '');
          setPresentationWindow(cfg.enachPreferences.presentationWindow || '');
          setRetryStrategy(cfg.enachPreferences.retryStrategy || '');
          setWhatsAppLinks(Boolean(cfg.enachPreferences.sendWhatsAppRegistrationLink));
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session.tenant.id, refresh]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await request('admin/fees/settings/institution', 'POST', {
        general: {
          displayName,
          contactEmail,
          contactPhone,
          address,
          timezone,
        },
        payments: {
          allowedMethods,
          receiptPreferences: {
            prefix: receiptPrefix,
            headerNote: receiptHeader,
            termsAndConditions: receiptTerms,
          },
        },
        notifications: {
          paymentConfirmations: { email: notifyPaymentConfirmations, sms: true, whatsapp: true },
          upcomingInstalmentReminders: { enabled: notifyUpcomingReminders, daysBeforeDue: [7, 3] },
          overdueReminders: { enabled: notifyOverdue },
          failedDebitNotifications: { immediateEmail: notifyFailedDebit },
        },
        securityAccount: {
          sessionTimeoutMinutes: Number(sessionTimeout),
          mfaEnabled: mfaActive,
        },
        enachPreferences: {
          mandateProvider,
          presentationWindow,
          retryStrategy,
          sendWhatsAppRegistrationLink: whatsAppLinks,
        },
      });
      showToast('Institution settings saved and persisted successfully!');
    } catch {
      alert('Could not save settings. Please verify inputs.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setRefresh((n) => n + 1);
    showToast('Changes discarded.');
  };

  return (
    <div className="institution-settings-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <section className="admin-panel" style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <span className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f766e', fontWeight: 600 }}>
              Configuration Console
            </span>
            <h2 style={{ margin: '4px 0 6px', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Institution Settings</h2>
            <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>
              Authorized institution parameters, branch policies, payment receipt preferences, reminder automation, and eNACH presentation rules for {session.tenant.name}.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="button secondary"
              onClick={handleCancel}
              disabled={saving}
            >
              Discard Changes
            </button>
            <button
              type="button"
              className="button primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Changes'}
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

      {/* Settings Navigation Tabs & Form Workspace */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 280px) 1fr', gap: 'var(--space-6)', alignItems: 'start' }}>
        {/* Left Column: 7 Section Tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', padding: '0 4px 6px' }}>
            Settings Sections
          </div>
          {SETTINGS_TABS.map((tab) => {
            const isSelected = tab.id === activeTab;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: isSelected ? '2px solid #0f172a' : '1px solid var(--surface-border)',
                  background: isSelected ? '#f8fafc' : '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: '13px',
                  color: isSelected ? '#0f172a' : 'var(--text-main)',
                  boxShadow: isSelected ? 'var(--shadow-card)' : 'none',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Column: Active Tab Content */}
        <section className="admin-panel" style={{ margin: 0 }}>
          {loading ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>Loading institution settings…</p>
            </div>
          ) : (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {/* SECTION 1: GENERAL SETTINGS */}
              {activeTab === 'general' && (
                <>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '16px' }}>General Institution Settings</h3>
                    <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>Display identity, billing emails, and default campus timezone.</p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Institution Display Name</label>
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Accounts Contact Email</label>
                        <input
                          type="email"
                          required
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Contact Phone</label>
                        <input
                          type="tel"
                          required
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Registered Address</label>
                      <textarea
                        rows={2}
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Operating Timezone</label>
                      <input
                        type="text"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* SECTION 2: BRANCH SETTINGS */}
              {activeTab === 'branches' && (
                <>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '16px' }}>Campus & Branch Settings</h3>
                    <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>Configured campus branches for admissions, fee schedules, and student enrollment.</p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {branchesList.map((b, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 14px',
                          background: '#f8fafc',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{b.name}</div>
                          <div className="small" style={{ color: 'var(--text-muted)' }}>
                            Code: <strong>{b.code}</strong> · {b.city}, {b.state} · {b.activeStudents} active students
                          </div>
                        </div>
                        {b.isDefault && <span className="status-pill success">Default Campus</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* SECTION 3: PAYMENT SETTINGS */}
              {activeTab === 'payments' && (
                <>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '16px' }}>Payment Methods & Fee Receipts</h3>
                    <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>Allowed payment rails, receipt numbering, and masked payout account confirmation.</p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Allowed Payment Rails:</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-2)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={allowedMethods.enachAutopay}
                            onChange={(e) => setAllowedMethods({ ...allowedMethods, enachAutopay: e.target.checked })}
                          />
                          eNACH Recurring Autopay
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={allowedMethods.upiInstant}
                            onChange={(e) => setAllowedMethods({ ...allowedMethods, upiInstant: e.target.checked })}
                          />
                          UPI Instant Collections
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={allowedMethods.netbanking}
                            onChange={(e) => setAllowedMethods({ ...allowedMethods, netbanking: e.target.checked })}
                          />
                          Corporate Netbanking
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={allowedMethods.creditDebitCard}
                            onChange={(e) => setAllowedMethods({ ...allowedMethods, creditDebitCard: e.target.checked })}
                          />
                          Credit & Debit Cards
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={allowedMethods.directBankTransfer}
                            onChange={(e) => setAllowedMethods({ ...allowedMethods, directBankTransfer: e.target.checked })}
                          />
                          Direct Bank Transfer (NEFT/IMPS)
                        </label>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: 'var(--space-4)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Official Fee Receipt Preferences:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Receipt Prefix</label>
                          <input
                            type="text"
                            value={receiptPrefix}
                            onChange={(e) => setReceiptPrefix(e.target.value)}
                            style={{ width: '100%', maxWidth: 280 }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Header Acknowledgement Note</label>
                          <input
                            type="text"
                            value={receiptHeader}
                            onChange={(e) => setReceiptHeader(e.target.value)}
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Receipt Terms & Conditions</label>
                          <textarea
                            rows={2}
                            value={receiptTerms}
                            onChange={(e) => setReceiptTerms(e.target.value)}
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>Settlement Payout Bank:</div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        {settlementAccountInfo.bankName} · Masked A/C: <strong>{settlementAccountInfo.maskedAccountNumber}</strong> · IFSC: {settlementAccountInfo.ifscCode}
                      </div>
                      <div className="small" style={{ color: '#059669', marginTop: '4px' }}>
                        ✓ {settlementAccountInfo.status} ({settlementAccountInfo.payoutCycle})
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* SECTION 4: NOTIFICATION SETTINGS */}
              {activeTab === 'notifications' && (
                <>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '16px' }}>Notification & Reminder Rules</h3>
                    <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>Configure automated payment acknowledgements and delinquency alerts.</p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={notifyPaymentConfirmations}
                        onChange={(e) => setNotifyPaymentConfirmations(e.target.checked)}
                        style={{ marginTop: '3px' }}
                      />
                      <div>
                        <strong>Instant Fee Payment Confirmations</strong>
                        <div className="small" style={{ color: 'var(--text-muted)' }}>Send official receipt voucher via WhatsApp and Email upon payment receipt.</div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={notifyUpcomingReminders}
                        onChange={(e) => setNotifyUpcomingReminders(e.target.checked)}
                        style={{ marginTop: '3px' }}
                      />
                      <div>
                        <strong>Upcoming Instalment Reminders</strong>
                        <div className="small" style={{ color: 'var(--text-muted)' }}>Alert parents before scheduled eNACH debits and milestone due dates.</div>
                      </div>
                    </label>

                    <div style={{ paddingLeft: '28px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Reminder intervals (days before due date)</label>
                      <input
                        type="text"
                        value={reminderDays}
                        onChange={(e) => setReminderDays(e.target.value)}
                        style={{ width: 140 }}
                      />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={notifyOverdue}
                        onChange={(e) => setNotifyOverdue(e.target.checked)}
                        style={{ marginTop: '3px' }}
                      />
                      <div>
                        <strong>Weekly Overdue Fee Escalation Notices</strong>
                        <div className="small" style={{ color: 'var(--text-muted)' }}>Automatic weekly reminders for students with overdue balances.</div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={notifyFailedDebit}
                        onChange={(e) => setNotifyFailedDebit(e.target.checked)}
                        style={{ marginTop: '3px' }}
                      />
                      <div>
                        <strong>Failed Debit Alerts</strong>
                        <div className="small" style={{ color: 'var(--text-muted)' }}>Notify institution accounts officer and parent immediately when an autopay debit fails.</div>
                      </div>
                    </label>
                  </div>
                </>
              )}

              {/* SECTION 5: STAFF & PERMISSIONS */}
              {activeTab === 'staff' && (
                <>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '16px' }}>Institution Role Policies</h3>
                    <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>Overview of role hierarchy and branch isolation policies for current institution.</p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {rolesList.map((r, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 14px',
                          background: '#f8fafc',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <strong style={{ fontSize: '14px', color: '#0f172a' }}>{r.role}</strong>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f766e' }}>{r.count} staff assigned</span>
                        </div>
                        <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>{r.description}</p>
                      </div>
                    ))}

                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: 6, fontSize: '12px', color: '#166534', marginTop: 'var(--space-2)' }}>
                      🔒 Campus Branch Isolation Policy: Enforced. Staff can only access fee records belonging to their assigned campus branches.
                    </div>
                  </div>
                </>
              )}

              {/* SECTION 6: SECURITY & ACCOUNT */}
              {activeTab === 'security' && (
                <>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '16px' }}>Account & Session Security</h3>
                    <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>Authentication safety, multi-factor authentication (MFA), and session timeout.</p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '13px' }}>
                      <div style={{ marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Active Account:</span> <strong>{session.user.email}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Institution Role:</span> <strong>Institution Owner</strong>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        Session Inactivity Timeout (Minutes)
                      </label>
                      <select
                        value={sessionTimeout}
                        onChange={(e) => setSessionTimeout(e.target.value)}
                        style={{ minWidth: 180 }}
                      >
                        <option value="15">15 Minutes</option>
                        <option value="30">30 Minutes</option>
                        <option value="60">60 Minutes (Default)</option>
                        <option value="120">2 Hours</option>
                      </select>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={mfaActive}
                        onChange={(e) => setMfaActive(e.target.checked)}
                      />
                      <span>Enforce Two-Factor Authentication (MFA) on all institution staff logins</span>
                    </label>
                  </div>
                </>
              )}

              {/* SECTION 7: eNACH PREFERENCES */}
              {activeTab === 'enach' && (
                <>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '16px' }}>eNACH Autopay Configuration</h3>
                    <p className="small" style={{ margin: 0, color: 'var(--text-muted)' }}>National clearing house mandate parameters, debit timings, and retry rules.</p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Mandate Provider Rail</label>
                      <input
                        type="text"
                        disabled
                        value={mandateProvider}
                        style={{ width: '100%', background: '#f8fafc', color: 'var(--text-muted)' }}
                      />
                      <span className="small" style={{ color: 'var(--text-muted)' }}>Verified NPCI eNACH institutional gateway.</span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Debit Presentation Timing</label>
                      <input
                        type="text"
                        value={presentationWindow}
                        onChange={(e) => setPresentationWindow(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Debit Retry Strategy</label>
                      <input
                        type="text"
                        value={retryStrategy}
                        onChange={(e) => setRetryStrategy(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={whatsAppLinks}
                        onChange={(e) => setWhatsAppLinks(e.target.checked)}
                      />
                      <span>Dispatch eNACH mandate registration links to parents via WhatsApp</span>
                    </label>
                  </div>
                </>
              )}

              {/* Action Buttons at bottom of active section */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', borderTop: '1px solid var(--surface-border)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Discard Changes
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
