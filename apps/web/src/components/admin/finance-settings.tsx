'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdminApi } from './context';

type FormFieldConfig = {
  key: string;
  label: string;
  visible: boolean;
  required: boolean;
  editable: boolean;
  order: number;
};

type ComponentConfig = {
  code: string;
  label: string;
  visible: boolean;
  required: boolean;
  selectable: boolean;
  fixed: boolean;
};

type PaymentRules = {
  allowFullPayment: boolean;
  allowPartialPayment: boolean;
  allowAdvance: boolean;
  minPartialAmountMinor: number;
  maxPartialAmountMinor: number;
  requireDownPayment: boolean;
  enableEnach: boolean;
  allowPayerEditing: boolean;
};

type Instructions = {
  bannerText: string;
  termsText: string;
};

type ReceiptConfig = {
  institution_name: string;
  institution_address: string;
  contact_email: string;
  contact_phone: string;
  receipt_heading: string;
  receipt_prefix: string;
  header_note: string;
  footer_note: string;
  signatory_title: string;
  terms_and_conditions: string;
};

type EmailConfig = {
  sender_name: string;
  subject_line: string;
  greeting_text: string;
  body_template: string;
};

export function FinanceSettings() {
  const { request, session, can } = useAdminApi();
  const [tab, setTab] = useState<'provider' | 'form' | 'receipts'>('form');

  // Provider state
  const [provider, setProvider] = useState<{ autopayMode: string; moneyMovement: boolean } | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // Student Payment Form state
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [components, setComponents] = useState<ComponentConfig[]>([]);
  const [rules, setRules] = useState<PaymentRules>({
    allowFullPayment: true,
    allowPartialPayment: true,
    allowAdvance: true,
    minPartialAmountMinor: 100000,
    maxPartialAmountMinor: 50000000,
    requireDownPayment: false,
    enableEnach: true,
    allowPayerEditing: true,
  });
  const [instructions, setInstructions] = useState<Instructions>({
    bannerText:
      'Please review and verify your payer contact details before registering your recurring eNACH mandate.',
    termsText:
      'I hereby authorize recurring eNACH debits for educational institution fee installments as per the assigned schedule. Registration activates recurring collection and money is not deducted until scheduled due dates.',
  });

  // Receipt & Email state
  const [receipt, setReceipt] = useState<ReceiptConfig>({
    institution_name: session.tenant.name,
    institution_address: '123 Education Boulevard, Knowledge City, Bangalore',
    contact_email: 'accounts@institution.edu',
    contact_phone: '+91 1800-123-4567',
    receipt_heading: 'OFFICIAL FEE RECEIPT',
    receipt_prefix: 'REC',
    header_note: 'Thank you for your payment. This is an official computer-generated receipt.',
    footer_note: 'For fee inquiries, please contact the institution accounts office.',
    signatory_title: 'Authorized Finance Officer',
    terms_and_conditions:
      'Fee once paid is subject to the institution refund policy. Retain this receipt for tax and academic records.',
  });
  const [email, setEmail] = useState<EmailConfig>({
    sender_name: `${session.tenant.name} Finance Desk`,
    subject_line: 'Payment Receipt: {{receipt_number}} for {{student_name}}',
    greeting_text: 'Dear {{parent_name}},',
    body_template:
      'We have received your payment of {{amount}} towards {{student_name}} (Course: {{course}}) on {{date}}.\n\nReceipt Number: {{receipt_number}}\nTransaction Reference: {{transaction_id}}\nRemaining Outstanding Balance: {{outstanding_balance}}\n\nThank you for choosing {{institution_name}}.',
  });

  const [savingForm, setSavingForm] = useState(false);
  const [formSavedNotice, setFormSavedNotice] = useState('');
  const [savingReceipts, setSavingReceipts] = useState(false);
  const [receiptsSavedNotice, setReceiptsSavedNotice] = useState('');

  useEffect(() => {
    let active = true;
    request<{ autopayMode: string; moneyMovement: boolean }>('provider/payments/status')
      .then((v) => {
        if (active) setProvider(v);
      })
      .catch(() => {
        if (active) setError(true);
      });

    request<{
      fields: FormFieldConfig[];
      components: ComponentConfig[];
      rules: PaymentRules;
      instructions: Instructions;
    }>('admin/fees/settings/payment-form')
      .then((cfg) => {
        if (active && cfg) {
          if (cfg.fields) setFields(cfg.fields);
          if (cfg.components) setComponents(cfg.components);
          if (cfg.rules) {
            const r = cfg.rules as any;
            setRules({
              allowFullPayment: r.allow_full_payment,
              allowPartialPayment: r.allow_partial_payment,
              allowAdvance: r.allow_advance_payment,
              minPartialAmountMinor: r.min_partial_amount_minor,
              maxPartialAmountMinor: r.max_partial_amount_minor,
              requireDownPayment: r.require_down_payment,
              enableEnach: r.enable_enach,
              allowPayerEditing: r.allow_payer_contact_editing,
            });
          }
          if (cfg.instructions)
            setInstructions({
              bannerText: String(cfg.instructions),
              termsText: (cfg.rules as any).terms_text || instructions.termsText,
            });
        }
      })
      .catch(() => {});

    request<{ receipt_config: ReceiptConfig; email_config: EmailConfig }>(
      'admin/fees/settings/receipt-email',
    )
      .then((cfg) => {
        if (active && cfg) {
          if (cfg.receipt_config) setReceipt((v) => ({ ...v, ...cfg.receipt_config }));
          if (cfg.email_config) setEmail((v) => ({ ...v, ...cfg.email_config }));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [session.tenant.id, refresh]);

  const savePaymentForm = async () => {
    setSavingForm(true);
    setFormSavedNotice('');
    try {
      await request('admin/fees/settings/payment-form', 'POST', {
        fields,
        components,
        rules: {
          allow_full_payment: rules.allowFullPayment,
          allow_partial_payment: rules.allowPartialPayment,
          allow_advance_payment: rules.allowAdvance,
          min_partial_amount_minor: rules.minPartialAmountMinor,
          max_partial_amount_minor: rules.maxPartialAmountMinor,
          require_down_payment: rules.requireDownPayment,
          enable_enach: rules.enableEnach,
          allow_payer_contact_editing: rules.allowPayerEditing,
          terms_text: instructions.termsText,
        },
        instructions: instructions.bannerText,
      });
      setFormSavedNotice('Student Payment Form configuration updated successfully.');
    } catch {
      setFormSavedNotice('Failed to update form configuration.');
    } finally {
      setSavingForm(false);
    }
  };

  const saveReceiptEmail = async () => {
    setSavingReceipts(true);
    setReceiptsSavedNotice('');
    try {
      await request('admin/fees/settings/receipt-email', 'POST', {
        receipt_config: receipt,
        email_config: email,
      });
      setReceiptsSavedNotice('Receipt and email template configurations updated successfully.');
    } catch {
      setReceiptsSavedNotice('Failed to update receipt and email configuration.');
    } finally {
      setSavingReceipts(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="admin-toolbar">
        <div>
          <p className="eyebrow">INSTITUTE CONFIGURATION</p>
          <h2>Finance Settings</h2>
          <p>{session.tenant.name} · Customizable forms, receipts, and templates</p>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <button
            className={`button ${tab === 'form' ? 'primary' : 'secondary'}`}
            onClick={() => setTab('form')}
          >
            Student Payment Form
          </button>
          <button
            className={`button ${tab === 'receipts' ? 'primary' : 'secondary'}`}
            onClick={() => setTab('receipts')}
          >
            Receipt & Email Templates
          </button>
          <button
            className={`button ${tab === 'provider' ? 'primary' : 'secondary'}`}
            onClick={() => setTab('provider')}
          >
            Provider & Status
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          TAB 1: STUDENT PAYMENT FORM CONFIGURATION
      ------------------------------------------------------------- */}
      {tab === 'form' && (
        <section
          className="admin-panel"
          style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem' }}
        >
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0 }}>Student Payment Form Configuration</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
              Configure which fields and fee components the Student / Parent sees on their portal
              form. Set field visibility, requirement, and read-only attributes.
            </p>
          </div>

          {formSavedNotice && (
            <div
              role="status"
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                padding: '0.75rem',
                borderRadius: '4px',
                marginBottom: '1.5rem',
              }}
            >
              {formSavedNotice}
            </div>
          )}

          {/* Form Fields Table */}
          <h4 style={{ marginBottom: '0.5rem' }}>Payer Form Fields & Rules</h4>
          <div className="admin-table-wrap" style={{ marginBottom: '1.5rem' }}>
            <table className="admin-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Field Key</th>
                  <th>Display Label</th>
                  <th style={{ textAlign: 'center' }}>Visible</th>
                  <th style={{ textAlign: 'center' }}>Required</th>
                  <th style={{ textAlign: 'center' }}>Editable by Student</th>
                  <th style={{ textAlign: 'center' }}>Field Order</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f, idx) => (
                  <tr key={f.key}>
                    <td>
                      <code>{f.key}</code>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={f.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFields(
                            fields.map((item, i) => (i === idx ? { ...item, label: val } : item)),
                          );
                        }}
                        style={{ padding: '0.25rem 0.5rem', width: '100%' }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={f.visible}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFields(
                            fields.map((item, i) =>
                              i === idx ? { ...item, visible: checked } : item,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFields(
                            fields.map((item, i) =>
                              i === idx ? { ...item, required: checked } : item,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={f.editable}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFields(
                            fields.map((item, i) =>
                              i === idx ? { ...item, editable: checked } : item,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={f.order}
                        onChange={(e) => {
                          const num = Number(e.target.value);
                          setFields(
                            fields.map((item, i) => (i === idx ? { ...item, order: num } : item)),
                          );
                        }}
                        style={{ width: '60px', padding: '0.25rem' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Configurable Fee Components */}
          <h4 style={{ marginBottom: '0.5rem' }}>Fee Component Availability</h4>
          <div className="admin-table-wrap" style={{ marginBottom: '1.5rem' }}>
            <table className="admin-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Fee Component Label</th>
                  <th style={{ textAlign: 'center' }}>Visible</th>
                  <th style={{ textAlign: 'center' }}>Required</th>
                  <th style={{ textAlign: 'center' }}>Selectable</th>
                  <th style={{ textAlign: 'center' }}>Fixed Amount</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c, idx) => (
                  <tr key={c.code}>
                    <td>
                      <strong>{c.code}</strong>
                    </td>
                    <td>{c.label}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={c.visible}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setComponents(
                            components.map((item, i) =>
                              i === idx ? { ...item, visible: checked } : item,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={c.required}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setComponents(
                            components.map((item, i) =>
                              i === idx ? { ...item, required: checked } : item,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={c.selectable}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setComponents(
                            components.map((item, i) =>
                              i === idx ? { ...item, selectable: checked } : item,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={c.fixed}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setComponents(
                            components.map((item, i) =>
                              i === idx ? { ...item, fixed: checked } : item,
                            ),
                          );
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Payment Rules */}
          <h4 style={{ marginBottom: '0.5rem' }}>Payment Rules & eNACH Scope</h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
              background: '#f8fafc',
              padding: '1rem',
              borderRadius: '6px',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={rules.allowFullPayment}
                onChange={(e) => setRules({ ...rules, allowFullPayment: e.target.checked })}
              />
              <span>Allow Full Balance Payment</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={rules.allowPartialPayment}
                onChange={(e) => setRules({ ...rules, allowPartialPayment: e.target.checked })}
              />
              <span>Allow Partial Payment</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={rules.allowAdvance}
                onChange={(e) => setRules({ ...rules, allowAdvance: e.target.checked })}
              />
              <span>Allow Advance / Prepayment</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={rules.enableEnach}
                onChange={(e) => setRules({ ...rules, enableEnach: e.target.checked })}
              />
              <span>Enable eNACH Mandate Registration</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={rules.allowPayerEditing}
                onChange={(e) => setRules({ ...rules, allowPayerEditing: e.target.checked })}
              />
              <span>Allow Payer Contact Editing</span>
            </label>
          </div>

          {/* Student Instructions */}
          <h4 style={{ marginBottom: '0.5rem' }}>Student-Facing Instructions</h4>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <label className="field">
              Form Banner Text
              <textarea
                value={instructions.bannerText}
                onChange={(e) => setInstructions({ ...instructions, bannerText: e.target.value })}
                rows={2}
              />
            </label>
            <label className="field">
              eNACH Mandate Consent Terms
              <textarea
                value={instructions.termsText}
                onChange={(e) => setInstructions({ ...instructions, termsText: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <button
              className="button primary"
              disabled={savingForm || session.tenant.readOnly || !can('fee.plan.manage')}
              onClick={savePaymentForm}
            >
              {savingForm ? 'Saving Configuration…' : 'Save Payment Form Configuration'}
            </button>
          </div>
        </section>
      )}

      {/* -------------------------------------------------------------
          TAB 2: RECEIPT & EMAIL TEMPLATES
      ------------------------------------------------------------- */}
      {tab === 'receipts' && (
        <section
          className="admin-panel"
          style={{ background: '#ffffff', borderRadius: '8px', padding: '1.5rem' }}
        >
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0 }}>Customizable Receipt & Email Templates</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
              Customize receipt branding, headings, notes, and automated receipt email templates.
              Note: financial amounts and ledger balances are strictly protected from modification.
            </p>
          </div>

          {receiptsSavedNotice && (
            <div
              role="status"
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                padding: '0.75rem',
                borderRadius: '4px',
                marginBottom: '1.5rem',
              }}
            >
              {receiptsSavedNotice}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '2rem',
            }}
          >
            {/* Receipt Styling Form */}
            <div>
              <h4
                style={{
                  borderBottom: '1px solid #e2e8f0',
                  paddingBottom: '0.5rem',
                  marginBottom: '1rem',
                }}
              >
                1. Official Fee Receipt Branding
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label className="field">
                  Institution Name
                  <input
                    type="text"
                    value={receipt.institution_name}
                    onChange={(e) => setReceipt({ ...receipt, institution_name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Institution Address
                  <textarea
                    rows={2}
                    value={receipt.institution_address}
                    onChange={(e) =>
                      setReceipt({ ...receipt, institution_address: e.target.value })
                    }
                  />
                </label>
                <div className="row">
                  <label className="field">
                    Contact Email
                    <input
                      type="email"
                      value={receipt.contact_email}
                      onChange={(e) => setReceipt({ ...receipt, contact_email: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Contact Phone
                    <input
                      type="tel"
                      value={receipt.contact_phone}
                      onChange={(e) => setReceipt({ ...receipt, contact_phone: e.target.value })}
                    />
                  </label>
                </div>
                <div className="row">
                  <label className="field">
                    Receipt Heading
                    <input
                      type="text"
                      value={receipt.receipt_heading}
                      onChange={(e) => setReceipt({ ...receipt, receipt_heading: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Number Prefix
                    <input
                      type="text"
                      value={receipt.receipt_prefix}
                      onChange={(e) => setReceipt({ ...receipt, receipt_prefix: e.target.value })}
                    />
                  </label>
                </div>
                <label className="field">
                  Authorized Signatory / Seal Title
                  <input
                    type="text"
                    value={receipt.signatory_title}
                    onChange={(e) => setReceipt({ ...receipt, signatory_title: e.target.value })}
                  />
                </label>
                <label className="field">
                  Terms & Conditions (Printed at Footer)
                  <textarea
                    rows={2}
                    value={receipt.terms_and_conditions}
                    onChange={(e) =>
                      setReceipt({ ...receipt, terms_and_conditions: e.target.value })
                    }
                  />
                </label>
              </div>
            </div>

            {/* Email Alert Template */}
            <div>
              <h4
                style={{
                  borderBottom: '1px solid #e2e8f0',
                  paddingBottom: '0.5rem',
                  marginBottom: '1rem',
                }}
              >
                2. Automated Receipt Email Template
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label className="field">
                  Email Sender Name
                  <input
                    type="text"
                    value={email.sender_name}
                    onChange={(e) => setEmail({ ...email, sender_name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Subject Line
                  <input
                    type="text"
                    value={email.subject_line}
                    onChange={(e) => setEmail({ ...email, subject_line: e.target.value })}
                  />
                </label>
                <label className="field">
                  Salutation / Greeting
                  <input
                    type="text"
                    value={email.greeting_text}
                    onChange={(e) => setEmail({ ...email, greeting_text: e.target.value })}
                  />
                </label>
                <label className="field">
                  Email Body Template
                  <textarea
                    rows={7}
                    value={email.body_template}
                    onChange={(e) => setEmail({ ...email, body_template: e.target.value })}
                  />
                </label>
              </div>

              {/* Placeholder Reference Guide */}
              <div
                style={{
                  marginTop: '1.25rem',
                  background: '#f8fafc',
                  padding: '1rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                }}
              >
                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Available Dynamic Placeholders:
                </strong>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.25rem',
                    color: '#475569',
                  }}
                >
                  <div>
                    <code>&#123;&#123;student_name&#125;&#125;</code>
                  </div>
                  <div>
                    <code>&#123;&#123;parent_name&#125;&#125;</code>
                  </div>
                  <div>
                    <code>&#123;&#123;amount&#125;&#125;</code>
                  </div>
                  <div>
                    <code>&#123;&#123;receipt_number&#125;&#125;</code>
                  </div>
                  <div>
                    <code>&#123;&#123;date&#125;&#125;</code>
                  </div>
                  <div>
                    <code>&#123;&#123;course&#125;&#125;</code>
                  </div>
                  <div>
                    <code>&#123;&#123;transaction_id&#125;&#125;</code>
                  </div>
                  <div>
                    <code>&#123;&#123;institution_name&#125;&#125;</code>
                  </div>
                  <div>
                    <code>&#123;&#123;outstanding_balance&#125;&#125;</code>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <button
              className="button primary"
              disabled={savingReceipts || session.tenant.readOnly || !can('fee.plan.manage')}
              onClick={saveReceiptEmail}
            >
              {savingReceipts ? 'Saving Templates…' : 'Save Receipt & Email Templates'}
            </button>
          </div>
        </section>
      )}

      {/* -------------------------------------------------------------
          TAB 3: PROVIDER & SYSTEM STATUS
      ------------------------------------------------------------- */}
      {tab === 'provider' && (
        <div className="admin-grid">
          <section className="admin-panel">
            <h3>Institution Navigation</h3>
            <p>{session.tenant.name}</p>
            <nav className="student-financial-nav" aria-label="Finance settings">
              <Link href="/admin/fee-plans/">Fee components, master plans and scholarships</Link>
              <Link href="/admin/tenant/">Institute, academic years and access</Link>
              <Link href="/admin/audit/">Audit logs and exports</Link>
              <Link href="/admin/fees/reconciliation/">Settlement reconciliation</Link>
            </nav>
          </section>
          <section className="admin-panel">
            <h3>Collection Provider Status</h3>
            {error ? (
              <>
                <p role="alert">Provider status could not be loaded.</p>
                <button className="button secondary" onClick={() => setRefresh((n) => n + 1)}>
                  Retry
                </button>
              </>
            ) : !provider ? (
              <p role="status">Loading provider status…</p>
            ) : (
              <>
                <span className="status-pill">
                  {provider.autopayMode === 'sandbox' ? 'Sandbox eNACH' : provider.autopayMode}
                </span>
                <p style={{ marginTop: '0.75rem' }}>
                  {provider.moneyMovement
                    ? 'External payment capabilities are configured.'
                    : 'Simulation and ledger operations do not move real money. Sandbox mode is active.'}
                </p>
              </>
            )}
            <p className="small">Your active workspace role: {session.tenant.role}</p>
          </section>
        </div>
      )}
    </div>
  );
}
