'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DataTable, useAdminApi } from './context';
import { financialStatusClass } from './financial-status';
import { SuccessModal, SuccessPopupDetail } from './success-modal';

type AcademicOverview = {
  students: Array<{
    id: string;
    student_reference: string;
    full_name: string;
    date_of_birth?: string | null;
    status: string;
    branch_code?: string | null;
    branch_name?: string | null;
    academic_year?: string | null;
  }>;
  guardians: Array<{
    id: string;
    display_name: string;
    email?: string | null;
    phone?: string | null;
    verification_status: string;
    active_links: number;
  }>;
  catalogue: Array<{
    id: string;
    kind: string;
    code: string;
    label: string;
    parent_id?: string | null;
    parent_label?: string | null;
    status: string;
    version: number;
  }>;
  imports: Array<{
    id: string;
    source_system: string;
    status: string;
    row_count: number;
    valid_count: number;
    error_count: number;
    committed_count: number;
  }>;
  conflicts: Array<{
    id: string;
    source_system: string;
    entity_type: string;
    external_id: string;
    field_key: string;
    status: string;
  }>;
};

export function AcademicOperations() {
  const { request, session } = useAdminApi();
  const [data, setData] = useState<AcademicOverview | null>(null);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedGuardian, setSelectedGuardian] = useState('');

  // Submitting busy states
  const [busyStudent, setBusyStudent] = useState(false);
  const [busyGuardian, setBusyGuardian] = useState(false);
  const [busyLink, setBusyLink] = useState(false);
  const [busyCatalogue, setBusyCatalogue] = useState(false);
  const [busyPreview, setBusyPreview] = useState(false);

  // Success Popup Modal State
  const [modalConfig, setModalConfig] = useState<{
    badge?: string;
    title: string;
    subtitle?: string;
    details?: SuccessPopupDetail[];
    note?: string;
    primaryAction?: { label: string; onClick: () => void };
    secondaryAction?: { label: string; onClick: () => void };
  } | null>(null);

  async function load() {
    try {
      setData(await request<AcademicOverview>('admin/academic/overview'));
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, [session.tenant.id]);

  const activeCatalogue = useMemo(
    () => data?.catalogue?.filter((item) => item.status === 'active') || [],
    [data],
  );

  if (!data)
    return (
      <section className="admin-panel" style={{ borderRadius: '24px', padding: '36px', textAlign: 'center' }}>
        <p className="eyebrow">CAP-016 · CAP-020</p>
        <h2>Students, guardians & ERP context</h2>
        <p style={{ marginTop: '12px', color: '#6c8f89' }}>{message || 'Loading academic records…'}</p>
      </section>
    );

  return (
    <>
      {/* Universal Branded Success Popup Modal */}
      <SuccessModal
        isOpen={Boolean(modalConfig)}
        onClose={() => setModalConfig(null)}
        title={modalConfig?.title || ''}
        badge={modalConfig?.badge}
        subtitle={modalConfig?.subtitle}
        details={modalConfig?.details}
        note={modalConfig?.note}
        primaryAction={modalConfig?.primaryAction}
        secondaryAction={modalConfig?.secondaryAction}
      />

      {message && (
        <div
          className="admin-feedback"
          role="status"
          style={{
            background: '#eafbf4',
            border: '1px solid #a3ebce',
            color: '#075e47',
            borderRadius: '16px',
            padding: '12px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 500,
          }}
        >
          <span style={{ fontSize: '18px' }}>✓</span>
          <span>{message}</span>
        </div>
      )}

      {/* Academic Header Stats */}
      <section className="admin-panel" style={{ borderRadius: '24px', padding: '24px 28px' }}>
        <div className="admin-toolbar" style={{ marginBottom: '20px' }}>
          <div>
            <p className="eyebrow">EDU-01 · EDU-07</p>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#073533' }}>
              Academic &amp; Student Operations
            </h2>
            <p style={{ color: '#6c8f89', fontSize: '13.5px', marginTop: '4px' }}>
              Student identity, guardian access, academic dimensions and imports are tenant-scoped.
              A contact match never grants access by itself.
            </p>
          </div>
          <span
            className="status-pill"
            style={{
              background: '#e2f4ed',
              color: '#075e47',
              borderRadius: '9999px',
              padding: '6px 16px',
              fontWeight: 600,
              fontSize: '12.5px',
              border: '1px solid rgba(7, 53, 51, 0.08)',
            }}
          >
            {session.tenant.name}
          </span>
        </div>
        <div className="dashboard-stats" style={{ gap: '14px' }}>
          <div
            className="dashboard-stat"
            style={{
              background: '#f7fbf9',
              borderRadius: '18px',
              padding: '16px 20px',
              border: '1px solid rgba(7, 53, 51, 0.06)',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6c8f89', textTransform: 'uppercase' }}>
              Enrolled Students
            </span>
            <strong style={{ fontSize: '28px', color: '#073533', marginTop: '4px', display: 'block' }}>
              {data.students.length}
            </strong>
          </div>
          <div
            className="dashboard-stat"
            style={{
              background: '#f7fbf9',
              borderRadius: '18px',
              padding: '16px 20px',
              border: '1px solid rgba(7, 53, 51, 0.06)',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6c8f89', textTransform: 'uppercase' }}>
              Registered Guardians
            </span>
            <strong style={{ fontSize: '28px', color: '#073533', marginTop: '4px', display: 'block' }}>
              {data.guardians.length}
            </strong>
          </div>
          <div
            className="dashboard-stat"
            style={{
              background: '#f7fbf9',
              borderRadius: '18px',
              padding: '16px 20px',
              border: '1px solid rgba(7, 53, 51, 0.06)',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6c8f89', textTransform: 'uppercase' }}>
              Active Catalogue Items
            </span>
            <strong style={{ fontSize: '28px', color: '#073533', marginTop: '4px', display: 'block' }}>
              {activeCatalogue.length}
            </strong>
          </div>
          <div
            className="dashboard-stat"
            style={{
              background: '#f7fbf9',
              borderRadius: '18px',
              padding: '16px 20px',
              border: '1px solid rgba(7, 53, 51, 0.06)',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6c8f89', textTransform: 'uppercase' }}>
              Open ERP Conflicts
            </span>
            <strong style={{ fontSize: '28px', color: '#073533', marginTop: '4px', display: 'block' }}>
              {data.conflicts.filter((item) => item.status === 'open').length}
            </strong>
          </div>
        </div>
      </section>

      {/* Row 1: Create Student & Create Guardian Forms */}
      <section className="admin-grid" style={{ marginBottom: '24px' }}>
        {/* Form: Create Student */}
        <form
          className="admin-panel admin-form"
          style={{ borderRadius: '24px', padding: '24px 26px' }}
          onSubmit={async (event) => {
            event.preventDefault();
            setBusyStudent(true);
            const form = event.currentTarget;
            const formData = new FormData(form);
            const studentReference = String(formData.get('studentReference') || '').trim();
            const fullName = String(formData.get('fullName') || '').trim();
            const dateOfBirth = String(formData.get('dateOfBirth') || '').trim();
            try {
              const payload = {
                studentReference,
                fullName,
                ...(dateOfBirth ? { dateOfBirth } : {}),
              };
              await request('admin/academic/students', 'POST', payload);
              form.reset();
              setMessage(`Student "${fullName}" (${studentReference}) created successfully.`);
              await load();

              // Trigger clear popup
              setModalConfig({
                badge: 'STUDENT REGISTERED',
                title: 'Student Created Successfully',
                subtitle: 'The student identity has been securely committed to the academic registry.',
                details: [
                  { label: 'Student Reference', value: studentReference },
                  { label: 'Full Name', value: fullName },
                  { label: 'Date of Birth', value: dateOfBirth || 'Not specified' },
                  { label: 'Enrollment Status', value: 'Active / Enrolled' },
                  { label: 'Institution Tenant', value: session.tenant.name },
                ],
                note: 'Ready for fee schedule assignment, payment collection & eNACH registration.',
                primaryAction: {
                  label: 'Awesome, Done ✓',
                  onClick: () => setModalConfig(null),
                },
              });
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusyStudent(false);
            }
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <p className="eyebrow" style={{ margin: 0 }}>CAP-016 · EDU-01</p>
            <span style={{ fontSize: '11px', background: '#eafbf4', color: '#075e47', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
              Learner Profile
            </span>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: '0 0 16px' }}>
            Create student
          </h2>
          
          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
            Student reference *
            <input
              name="studentReference"
              required
              pattern="[A-Za-z0-9._/-]{2,80}"
              placeholder="e.g. STU-2026-001 or DPS-101"
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(7, 53, 51, 0.14)',
                background: '#ffffff',
                padding: '10px 14px',
                fontSize: '13.5px',
                color: '#073533',
                outline: 'none',
              }}
            />
          </label>

          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
            Full name *
            <input
              name="fullName"
              required
              minLength={2}
              maxLength={160}
              placeholder="e.g. Aarav Sharma"
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(7, 53, 51, 0.14)',
                background: '#ffffff',
                padding: '10px 14px',
                fontSize: '13.5px',
                color: '#073533',
                outline: 'none',
              }}
            />
          </label>

          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
            Date of birth
            <input
              type="date"
              name="dateOfBirth"
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(7, 53, 51, 0.14)',
                background: '#ffffff',
                padding: '10px 14px',
                fontSize: '13.5px',
                color: '#073533',
                outline: 'none',
              }}
            />
          </label>

          <button
            type="submit"
            className="button primary"
            disabled={busyStudent}
            style={{
              borderRadius: '9999px',
              padding: '10px 24px',
              fontWeight: 600,
              fontSize: '13.5px',
              cursor: busyStudent ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(6, 51, 49, 0.2)',
            }}
          >
            {busyStudent ? 'Creating student…' : 'Create student'}
          </button>
        </form>

        {/* Form: Create Guardian */}
        <form
          className="admin-panel admin-form"
          style={{ borderRadius: '24px', padding: '24px 26px' }}
          onSubmit={async (event) => {
            event.preventDefault();
            setBusyGuardian(true);
            const form = event.currentTarget;
            const formData = new FormData(form);
            const displayName = String(formData.get('displayName') || '').trim();
            const email = String(formData.get('email') || '').trim();
            const phone = String(formData.get('phone') || '').trim();
            try {
              const payload = {
                displayName,
                ...(email ? { email } : {}),
                ...(phone ? { phone } : {}),
              };
              await request('admin/academic/guardians', 'POST', payload);
              form.reset();
              setMessage(`Guardian "${displayName}" registered successfully.`);
              await load();

              // Trigger clear popup
              setModalConfig({
                badge: 'GUARDIAN REGISTERED',
                title: 'Guardian Identity Created',
                subtitle: 'Guardian record registered with verified payer status. You can now link them to a learner.',
                details: [
                  { label: 'Guardian / Payer Name', value: displayName },
                  { label: 'Email Address', value: email || 'Not provided' },
                  { label: 'Phone Number', value: phone || 'Not provided' },
                  { label: 'Verification Status', value: 'Verified Payer' },
                  { label: 'Active Linked Students', value: '0 (Ready to Link below)' },
                ],
                note: 'A contact match never automatically grants portal access without an explicit student relationship link.',
                primaryAction: {
                  label: 'Awesome, Done ✓',
                  onClick: () => setModalConfig(null),
                },
              });
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusyGuardian(false);
            }
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <p className="eyebrow" style={{ margin: 0 }}>CAP-016 · EDU-03</p>
            <span style={{ fontSize: '11px', background: '#d6f4ec', color: '#064840', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
              Payer Identity
            </span>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: '0 0 16px' }}>
            Create guardian / payer identity
          </h2>

          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
            Display name *
            <input
              name="displayName"
              required
              minLength={2}
              maxLength={160}
              placeholder="e.g. Rajesh Sharma"
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(7, 53, 51, 0.14)',
                background: '#ffffff',
                padding: '10px 14px',
                fontSize: '13.5px',
                color: '#073533',
                outline: 'none',
              }}
            />
          </label>

          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
            Email
            <input
              type="email"
              name="email"
              placeholder="e.g. rajesh@example.com"
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(7, 53, 51, 0.14)',
                background: '#ffffff',
                padding: '10px 14px',
                fontSize: '13.5px',
                color: '#073533',
                outline: 'none',
              }}
            />
          </label>

          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
            Phone
            <input
              name="phone"
              placeholder="e.g. +91 98765 43210"
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(7, 53, 51, 0.14)',
                background: '#ffffff',
                padding: '10px 14px',
                fontSize: '13.5px',
                color: '#073533',
                outline: 'none',
              }}
            />
          </label>

          <button
            type="submit"
            className="button primary"
            disabled={busyGuardian}
            style={{
              borderRadius: '9999px',
              padding: '10px 24px',
              fontWeight: 600,
              fontSize: '13.5px',
              cursor: busyGuardian ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(6, 51, 49, 0.2)',
            }}
          >
            {busyGuardian ? 'Creating guardian…' : 'Create guardian'}
          </button>
        </form>
      </section>

      {/* Row 2: Link Guardian to Student */}
      <form
        className="admin-panel admin-form"
        style={{ borderRadius: '24px', padding: '26px 30px', marginBottom: '24px' }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!selectedStudent || !selectedGuardian) {
            setMessage('Choose both a student and guardian.');
            return;
          }
          setBusyLink(true);
          const form = event.currentTarget;
          const formData = new FormData(form);
          const relationship = String(formData.get('relationship') || 'guardian');
          const payerRole = String(formData.get('payerRole') || 'authorised');
          const verified = formData.get('verified') === 'on';

          try {
            await request('admin/academic/students/' + selectedStudent + '/guardians', 'POST', {
              guardianId: selectedGuardian,
              relationship,
              payerRole,
              verified,
            });

            const studentObj = data.students.find((s) => s.id === selectedStudent);
            const guardianObj = data.guardians.find((g) => g.id === selectedGuardian);

            setMessage('Guardian relationship saved successfully.');
            await load();

            // Trigger clear popup
            setModalConfig({
              badge: 'RELATIONSHIP LINKED',
              title: 'Guardian Linked to Student Successfully',
              subtitle: 'Explicit relationship evidence established and active links updated in the registry.',
              details: [
                {
                  label: 'Student Learner',
                  value: studentObj ? `${studentObj.student_reference} · ${studentObj.full_name}` : selectedStudent,
                },
                {
                  label: 'Guardian / Payer',
                  value: guardianObj ? guardianObj.display_name : selectedGuardian,
                },
                {
                  label: 'Relationship Type',
                  value: relationship.charAt(0).toUpperCase() + relationship.slice(1),
                },
                {
                  label: 'Payer Role Authority',
                  value:
                    payerRole === 'primary'
                      ? 'Primary Payer'
                      : payerRole === 'authorised'
                      ? 'Authorised Payer'
                      : payerRole === 'view_only'
                      ? 'View Only'
                      : 'No Payer Role',
                },
                {
                  label: 'Relationship Evidence',
                  value: verified ? 'Verified & Audited' : 'Pending Formal Evidence',
                },
              ],
              note: 'Relationship evidence is explicitly recorded. The guardian is now authorized to view and pay student fees.',
              primaryAction: {
                label: 'Awesome, Done ✓',
                onClick: () => setModalConfig(null),
              },
            });
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusyLink(false);
          }
        }}
      >
        <p className="eyebrow">EDU-02 · EDU-03</p>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: '0 0 6px' }}>
          Link guardian to student
        </h2>
        <p style={{ color: '#6c8f89', fontSize: '13.5px', marginBottom: '18px' }}>
          Relationship evidence is explicit. Sharing a phone number or email never automatically
          grants access to another learner.
        </p>

        <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '14px' }}>
          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
            Student *
            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              required
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(7, 53, 51, 0.14)',
                background: '#ffffff',
                padding: '10px 14px',
                fontSize: '13.5px',
                color: '#073533',
                outline: 'none',
              }}
            >
              <option value="">Select student</option>
              {data.students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.student_reference} · {student.full_name}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
            Guardian *
            <select
              value={selectedGuardian}
              onChange={(e) => setSelectedGuardian(e.target.value)}
              required
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(7, 53, 51, 0.14)',
                background: '#ffffff',
                padding: '10px 14px',
                fontSize: '13.5px',
                color: '#073533',
                outline: 'none',
              }}
            >
              <option value="">Select guardian</option>
              {data.guardians.map((guardian) => (
                <option key={guardian.id} value={guardian.id}>
                  {guardian.display_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
            Relationship
            <select
              name="relationship"
              defaultValue="guardian"
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(7, 53, 51, 0.14)',
                background: '#ffffff',
                padding: '10px 14px',
                fontSize: '13.5px',
                color: '#073533',
                outline: 'none',
              }}
            >
              <option value="mother">Mother</option>
              <option value="father">Father</option>
              <option value="guardian">Guardian</option>
              <option value="self">Self</option>
              <option value="sponsor">Sponsor</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
            Payer role
            <select
              name="payerRole"
              defaultValue="authorised"
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(7, 53, 51, 0.14)',
                background: '#ffffff',
                padding: '10px 14px',
                fontSize: '13.5px',
                color: '#073533',
                outline: 'none',
              }}
            >
              <option value="primary">Primary payer</option>
              <option value="authorised">Authorised payer</option>
              <option value="view_only">View only</option>
              <option value="none">No payer role</option>
            </select>
          </label>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13.5px',
            color: '#073533',
            cursor: 'pointer',
            padding: '6px 0',
            marginBottom: '18px',
          }}
        >
          <input
            type="checkbox"
            name="verified"
            defaultChecked
            style={{ width: '18px', height: '18px', accentColor: '#063331', cursor: 'pointer' }}
          />
          <span>Relationship evidence has been verified &amp; approved</span>
        </label>

        <button
          type="submit"
          className="button primary"
          disabled={busyLink}
          style={{
            borderRadius: '9999px',
            padding: '10px 26px',
            fontWeight: 600,
            fontSize: '13.5px',
            cursor: busyLink ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 12px rgba(6, 51, 49, 0.2)',
          }}
        >
          {busyLink ? 'Saving relationship…' : 'Save relationship'}
        </button>
      </form>

      {/* Row 3: Catalogue Create & Active Dimensions */}
      <section className="admin-grid" style={{ marginBottom: '24px' }}>
        <form
          className="admin-panel admin-form"
          style={{ borderRadius: '24px', padding: '24px 26px' }}
          onSubmit={async (event) => {
            event.preventDefault();
            setBusyCatalogue(true);
            const form = event.currentTarget;
            const formData = new FormData(form);
            const kind = String(formData.get('kind') || 'course');
            const code = String(formData.get('code') || '').trim();
            const label = String(formData.get('label') || '').trim();
            const parentId = String(formData.get('parentId') || '');

            try {
              await request('admin/academic/catalogue', 'POST', {
                kind,
                code,
                label,
                ...(parentId ? { parentId } : {}),
              });
              const parentObj = activeCatalogue.find((c) => c.id === parentId);
              form.reset();
              setMessage(`Catalogue item "${label}" (${code}) created.`);
              await load();

              // Trigger clear popup
              setModalConfig({
                badge: 'CATALOGUE CREATED',
                title: 'Catalogue Dimension Created',
                subtitle: 'New academic taxonomy dimension is registered and active.',
                details: [
                  { label: 'Dimension Kind', value: kind.toUpperCase() },
                  { label: 'Dimension Code', value: code },
                  { label: 'Display Label', value: label },
                  { label: 'Parent Dimension', value: parentObj ? parentObj.label : 'None (Root)' },
                  { label: 'Status', value: 'Active (v1)' },
                ],
                note: 'Version-safe dimension ready for cohort mapping and fee structure assignment.',
                primaryAction: {
                  label: 'Awesome, Done ✓',
                  onClick: () => setModalConfig(null),
                },
              });
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusyCatalogue(false);
            }
          }}
        >
          <p className="eyebrow">CAP-017 · EDU-04</p>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: '0 0 16px' }}>
            Academic catalogue
          </h2>
          <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
              Dimension
              <select
                name="kind"
                defaultValue="course"
                style={{
                  borderRadius: '12px',
                  border: '1px solid rgba(7, 53, 51, 0.14)',
                  background: '#ffffff',
                  padding: '10px 14px',
                  fontSize: '13.5px',
                  color: '#073533',
                  outline: 'none',
                }}
              >
                <option value="course">Course</option>
                <option value="grade">Grade</option>
                <option value="batch">Batch</option>
                <option value="transport">Transport</option>
                <option value="hostel">Hostel</option>
              </select>
            </label>
            <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
              Code *
              <input
                name="code"
                required
                pattern="[A-Za-z0-9._/-]{2,60}"
                placeholder="e.g. CBSE-10"
                style={{
                  borderRadius: '12px',
                  border: '1px solid rgba(7, 53, 51, 0.14)',
                  background: '#ffffff',
                  padding: '10px 14px',
                  fontSize: '13.5px',
                  color: '#073533',
                  outline: 'none',
                }}
              />
            </label>
          </div>

          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
            Label *
            <input
              name="label"
              required
              minLength={2}
              maxLength={160}
              placeholder="e.g. Class 10 (Secondary)"
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(7, 53, 51, 0.14)',
                background: '#ffffff',
                padding: '10px 14px',
                fontSize: '13.5px',
                color: '#073533',
                outline: 'none',
              }}
            />
          </label>

          <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
            Optional parent
            <select
              name="parentId"
              defaultValue=""
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(7, 53, 51, 0.14)',
                background: '#ffffff',
                padding: '10px 14px',
                fontSize: '13.5px',
                color: '#073533',
                outline: 'none',
              }}
            >
              <option value="">No parent (Root)</option>
              {activeCatalogue.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.kind} · {item.code} · {item.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="button primary"
            disabled={busyCatalogue}
            style={{
              borderRadius: '9999px',
              padding: '10px 24px',
              fontWeight: 600,
              fontSize: '13.5px',
              cursor: busyCatalogue ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(6, 51, 49, 0.2)',
            }}
          >
            {busyCatalogue ? 'Creating dimension…' : 'Create catalogue item'}
          </button>
        </form>

        {/* Active and retired dimensions panel */}
        <section className="admin-panel" style={{ borderRadius: '24px', padding: '24px 26px' }}>
          <p className="eyebrow">Version-safe catalogue</p>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: '0 0 16px' }}>
            Active and retired dimensions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
            {data.catalogue.map((item) => (
              <div
                className="record-row"
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: '#f7fbf9',
                  border: '1px solid rgba(7, 53, 51, 0.06)',
                }}
              >
                <div>
                  <strong style={{ fontSize: '13.5px', color: '#073533' }}>
                    {item.kind} · {item.code}
                  </strong>
                  <span style={{ display: 'block', fontSize: '12.5px', color: '#6c8f89' }}>
                    {item.label} {item.parent_label ? `(${item.parent_label})` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={financialStatusClass(item.status)} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '9999px' }}>
                    {item.status}
                  </span>
                  {item.status === 'active' && (
                    <button
                      type="button"
                      className="button secondary"
                      style={{ borderRadius: '9999px', padding: '4px 12px', fontSize: '12px' }}
                      onClick={async () => {
                        try {
                          await request('admin/academic/catalogue/' + item.id + '/retire', 'POST', {});
                          setMessage('Catalogue item retired without deleting historical references.');
                          await load();

                          setModalConfig({
                            badge: 'DIMENSION RETIRED',
                            title: 'Catalogue Item Safely Retired',
                            subtitle: 'The dimension has been deactivated without deleting historical student records.',
                            details: [
                              { label: 'Dimension Code', value: item.code },
                              { label: 'Dimension Label', value: item.label },
                              { label: 'Dimension Type', value: item.kind.toUpperCase() },
                              { label: 'New Status', value: 'Retired' },
                            ],
                            note: 'Historical references and receipts remain completely intact.',
                            primaryAction: {
                              label: 'Understood ✓',
                              onClick: () => setModalConfig(null),
                            },
                          });
                        } catch (error) {
                          setMessage((error as Error).message);
                        }
                      }}
                    >
                      Retire
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>

      {/* Row 4: Bulk import dry run */}
      <form
        className="admin-panel admin-form"
        style={{ borderRadius: '24px', padding: '26px 30px', marginBottom: '24px' }}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusyPreview(true);
          const form = new FormData(event.currentTarget);
          try {
            const rows = JSON.parse(String(form.get('rows') || '[]'));
            const result = await request<any>('admin/academic/imports/preview', 'POST', {
              sourceSystem: String(form.get('sourceSystem') || ''),
              rows,
            });
            setPreview(result);
            setMessage(
              'Import preview created. No student records were written. Review row errors before commit.',
            );
            await load();
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusyPreview(false);
          }
        }}
      >
        <p className="eyebrow">CAP-019 · CAP-020 · EDU-07</p>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: '0 0 6px' }}>
          Bulk import dry run
        </h2>
        <p style={{ color: '#6c8f89', fontSize: '13.5px', marginBottom: '16px' }}>
          Preview validates rows, detects duplicate student references and preserves source-system
          IDs. Commit is a separate idempotent action.
        </p>
        <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
          Source system
          <input
            name="sourceSystem"
            defaultValue="erp"
            required
            minLength={2}
            maxLength={80}
            style={{
              borderRadius: '12px',
              border: '1px solid rgba(7, 53, 51, 0.14)',
              background: '#ffffff',
              padding: '10px 14px',
              fontSize: '13.5px',
              color: '#073533',
              outline: 'none',
            }}
          />
        </label>
        <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px', fontSize: '13px', fontWeight: 600, color: '#073533' }}>
          Rows as JSON array
          <textarea
            name="rows"
            rows={6}
            required
            defaultValue={JSON.stringify(
              [
                {
                  studentReference: 'STU-001',
                  fullName: 'Synthetic Student',
                  externalId: 'ERP-001',
                },
              ],
              null,
              2,
            )}
            style={{
              borderRadius: '12px',
              border: '1px solid rgba(7, 53, 51, 0.14)',
              background: '#ffffff',
              padding: '12px 14px',
              fontSize: '13px',
              fontFamily: 'monospace',
              color: '#073533',
              outline: 'none',
            }}
          />
        </label>
        <button
          type="submit"
          className="button primary"
          disabled={busyPreview}
          style={{
            borderRadius: '9999px',
            padding: '10px 24px',
            fontWeight: 600,
            fontSize: '13.5px',
            cursor: busyPreview ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 12px rgba(6, 51, 49, 0.2)',
          }}
        >
          {busyPreview ? 'Validating preview…' : 'Run dry preview'}
        </button>

        {preview?.batch && (
          <div
            className="admin-notice"
            style={{
              marginTop: '18px',
              padding: '16px 20px',
              background: '#f7fbf9',
              borderRadius: '16px',
              border: '1px solid rgba(7, 53, 51, 0.08)',
            }}
          >
            <strong style={{ color: '#073533', fontSize: '14px' }}>
              Batch {preview.batch.id} · {preview.batch.status}
            </strong>
            <p style={{ color: '#6c8f89', fontSize: '13px', margin: '4px 0 12px' }}>
              Valid{' '}
              {preview.batch.valid_count ??
                preview.rows?.filter((r: any) => r.status === 'valid').length ??
                0}
              {' · '}errors{' '}
              {preview.batch.error_count ??
                preview.rows?.filter((r: any) => r.status === 'error').length ??
                0}
            </p>
            {preview.batch.status === 'previewed' && (
              <button
                type="button"
                className="button primary"
                style={{ borderRadius: '9999px', padding: '8px 20px', fontSize: '13px' }}
                onClick={async () => {
                  try {
                    const result = await request<any>(
                      'admin/academic/imports/' + preview.batch.id + '/commit',
                      'POST',
                      {},
                    );
                    setMessage(
                      'Import committed: ' +
                        String(result.committed_count) +
                        ' row(s), status ' +
                        result.status +
                        '.',
                    );
                    setPreview(null);
                    await load();

                    setModalConfig({
                      badge: 'BATCH COMMITTED',
                      title: 'Bulk Import Committed Successfully',
                      subtitle: `Committed ${result.committed_count || 0} student records into the registry.`,
                      details: [
                        { label: 'Batch ID', value: String(preview.batch.id) },
                        { label: 'Source System', value: preview.batch.source_system || 'ERP' },
                        { label: 'Committed Rows', value: String(result.committed_count || 0) },
                        { label: 'Batch Status', value: result.status || 'Committed' },
                      ],
                      note: 'Records are written with unique identity isolation per tenant.',
                      primaryAction: {
                        label: 'View Students Table ✓',
                        onClick: () => setModalConfig(null),
                      },
                    });
                  } catch (error) {
                    setMessage((error as Error).message);
                  }
                }}
              >
                Commit validated rows
              </button>
            )}
          </div>
        )}
      </form>

      {/* Row 5: Students Table */}
      <section className="admin-panel" style={{ borderRadius: '24px', padding: '24px 28px', marginBottom: '24px' }}>
        <p className="eyebrow">EDU-01</p>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: '0 0 16px' }}>
          Registered Students
        </h2>
        <DataTable
          rows={data.students}
          columns={[
            ['student_reference', 'Reference'],
            ['full_name', 'Student'],
            ['branch_code', 'Branch'],
            ['academic_year', 'Academic year'],
            ['status', 'Status'],
          ]}
        />
      </section>

      {/* Row 6: Guardians & Import history */}
      <section className="admin-grid" style={{ marginBottom: '24px' }}>
        <section className="admin-panel" style={{ borderRadius: '24px', padding: '24px 26px' }}>
          <p className="eyebrow">EDU-03</p>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: '0 0 16px' }}>
            Guardians &amp; Payers
          </h2>
          <DataTable
            rows={data.guardians}
            columns={[
              ['display_name', 'Name'],
              ['verification_status', 'Verification'],
              ['active_links', 'Active links'],
            ]}
          />
        </section>
        <section className="admin-panel" style={{ borderRadius: '24px', padding: '24px 26px' }}>
          <p className="eyebrow">CAP-019</p>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: '0 0 16px' }}>
            Import history
          </h2>
          <DataTable
            rows={data.imports}
            columns={[
              ['source_system', 'Source'],
              ['status', 'Status'],
              ['row_count', 'Rows'],
              ['committed_count', 'Committed'],
              ['error_count', 'Errors'],
            ]}
          />
        </section>
      </section>

      {/* Row 7: ERP Conflict Queue */}
      <section className="admin-panel" style={{ borderRadius: '24px', padding: '24px 28px' }}>
        <p className="eyebrow">CAP-020</p>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#073533', margin: '0 0 6px' }}>
          ERP conflict queue
        </h2>
        <p style={{ color: '#6c8f89', fontSize: '13.5px', marginBottom: '16px' }}>
          Financial and identity conflicts require an explicit resolution. This view never applies
          “last write wins” automatically.
        </p>
        <DataTable
          rows={data.conflicts}
          columns={[
            ['source_system', 'Source'],
            ['entity_type', 'Entity'],
            ['external_id', 'External ID'],
            ['field_key', 'Field'],
            ['status', 'Status'],
          ]}
          actions={(row) =>
            row.status === 'open' ? (
              <button
                type="button"
                className="button outline"
                style={{ borderRadius: '9999px', padding: '4px 12px', fontSize: '12px' }}
                onClick={async () => {
                  try {
                    await request('admin/academic/conflicts/' + row.id + '/resolve', 'POST', {
                      resolution: 'resolved_local',
                      note: 'Kept the tenant-authorised local value after operator review',
                    });
                    setMessage('ERP conflict resolved in favour of the authorised local value.');
                    await load();

                    setModalConfig({
                      badge: 'CONFLICT RESOLVED',
                      title: 'ERP Conflict Explicitly Resolved',
                      subtitle: 'Local authorised tenant value retained in accordance with repository safety rules.',
                      details: [
                        { label: 'Conflict ID', value: row.id },
                        { label: 'Source System', value: row.source_system },
                        { label: 'Entity Type', value: row.entity_type },
                        { label: 'Field Key', value: row.field_key },
                      ],
                      note: 'Append-only audit trail committed with operator review note.',
                      primaryAction: {
                        label: 'Understood ✓',
                        onClick: () => setModalConfig(null),
                      },
                    });
                  } catch (error) {
                    setMessage((error as Error).message);
                  }
                }}
              >
                Keep local
              </button>
            ) : null
          }
        />
      </section>
    </>
  );
}
