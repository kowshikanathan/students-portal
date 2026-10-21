-- 043_finance_customization_and_portal.sql
-- Adds student contact fields, admin-customizable payment form configuration,
-- customizable receipt and email configuration, and email dispatch audit logs.

ALTER TABLE academic_students
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE finance_bulk_runs DROP CONSTRAINT IF EXISTS finance_bulk_runs_operation_check;
ALTER TABLE finance_bulk_runs ADD CONSTRAINT finance_bulk_runs_operation_check CHECK(operation IN ('assign_plan','update_flex','update_due_date','prepare_enach','import_students'));

CREATE TABLE IF NOT EXISTS student_payment_form_configs(
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  fields jsonb NOT NULL DEFAULT '[
    {"key": "payer_name", "label": "Payer Name", "visible": true, "required": true, "editable": true, "order": 1},
    {"key": "payer_email", "label": "Payer Email", "visible": true, "required": true, "editable": true, "order": 2},
    {"key": "payer_phone", "label": "Payer Phone", "visible": true, "required": true, "editable": true, "order": 3},
    {"key": "student_name", "label": "Student Name", "visible": true, "required": true, "editable": false, "order": 4},
    {"key": "course", "label": "Course", "visible": true, "required": false, "editable": false, "order": 5},
    {"key": "grade", "label": "Grade / Class", "visible": true, "required": false, "editable": false, "order": 6}
  ]'::jsonb,
  components jsonb NOT NULL DEFAULT '[
    {"code": "REG", "label": "Registration Fee", "visible": true, "required": true, "selectable": false, "fixed": true},
    {"code": "CRS", "label": "Course Fee", "visible": true, "required": true, "selectable": false, "fixed": true},
    {"code": "TUI", "label": "Tuition Fee", "visible": true, "required": false, "selectable": true, "fixed": false},
    {"code": "HST", "label": "Hostel Fee", "visible": true, "required": false, "selectable": true, "fixed": false},
    {"code": "TRN", "label": "Transport Fee", "visible": true, "required": false, "selectable": true, "fixed": false},
    {"code": "EXM", "label": "Exam Fee", "visible": true, "required": false, "selectable": true, "fixed": false}
  ]'::jsonb,
  rules jsonb NOT NULL DEFAULT '{
    "allow_full_payment": true,
    "allow_partial_payment": true,
    "allow_advance_payment": true,
    "min_partial_amount_minor": 100000,
    "max_partial_amount_minor": null,
    "require_down_payment": false,
    "enable_enach": true,
    "allow_payer_contact_editing": true,
    "allow_fee_component_selection": true
  }'::jsonb,
  instructions text NOT NULL DEFAULT 'Review your fee schedule and submit payer details to complete eNACH registration.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS receipt_email_configs(
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  receipt_config jsonb NOT NULL DEFAULT '{
    "heading": "FEE PAYMENT RECEIPT",
    "header_text": "Official student fee payment acknowledgement",
    "footer_text": "This is a computer-generated receipt issued by the institution. No physical signature is required.",
    "support_info": "For fee queries, contact your institution accounts department.",
    "terms": "Fees once paid are subject to institutional refund policies.",
    "show_logo": true
  }'::jsonb,
  email_config jsonb NOT NULL DEFAULT '{
    "subject": "Payment Receipt — {{receipt_number}} — {{institution_name}}",
    "greeting": "Dear {{payer_name}},",
    "intro_message": "We have received your payment of {{amount}} for {{student_name}} (Course: {{course}}).",
    "confirmation_message": "Your transaction ID is {{transaction_id}} recorded on {{payment_date}}.",
    "footer": "Thank you for using the institution digital fee collection portal.",
    "support_details": "For assistance, reply to this email or contact the accounts desk.",
    "sender_display_name": "{{institution_name}} Finance Desk"
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS receipt_email_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  receipt_id uuid NOT NULL REFERENCES fee_receipts(id),
  recipient_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL CHECK(status IN ('sent','failed','simulated')),
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receipt_email_logs_tenant_idx ON receipt_email_logs(tenant_id,sent_at DESC);
CREATE INDEX IF NOT EXISTS receipt_email_logs_receipt_idx ON receipt_email_logs(receipt_id);
