# Finance platform implementation

The owner confirmed on 21 October 2026 that `(9).zip` and `(9)(1).zip` have identical contents. The canonical root is `Website_jodo-main (9)/Website_jodo-main`. The original archive had no Git metadata; the current continuation includes Git baseline 2db864d and uncommitted Antigravity changes, inspected before editing. `canonical-before-implementation.zip` preserves the supplied archive before edits.

## Scope decision

The final user specification supersedes the broad marketing/CMS blueprint. Retain existing content, revisions, audit history and backend capabilities. Hide publishing, campaigns, media and marketing from the operational finance sidebar. Reuse PostgreSQL, tenant authorization, fee schedules, payment records, receipt snapshots, fee plans and recurring-debit records. No live bank, NPCI, WhatsApp or UPI AutoPay integration is part of this implementation.

The repository instructions reference `docs/SITE_BRIEF.md` and `docs/decisions/ADR-001.md`; neither exists in this archive. README and the existing acceptance register were inspected. Historical acceptance claims remain historical; this document does not certify completion of the new specification.

## Architecture verified

- Next.js console: `apps/web/src/components/admin/shell.tsx`.
- NestJS API and PostgreSQL SQL migrations; no ORM or database replacement.
- `academic_students` and `student_fee_plan_assignments` provide explicit student-to-schedule identity.
- `fee_installments` stores charges, approved adjustments and allocated paid amounts.
- `payment_records`, component allocations and `fee_receipts` are the existing ledger and receipt system.
- `payment_mandates`, setup requests and `autopay_debit_attempts` are the existing recurring collection system.
- Finance commands use published tenant grants and explicit denials, with protected owner access. Bulk operations enforce operation-specific grants.

## Current continuation - 21 October 2026

Antigravity changes present before this continuation included student/guardian fields and creation, bulk student import and CSV exports, finance settings screens and APIs, receipt/email customization scaffolding, user management updates, public login choices, and a new student portal. These changes were preserved and repaired where frontend/backend contracts or authorization were incomplete.

Completed continuation work includes:

- Portal access based on existing schedule-bound payer grants, expiring/revocable parent sessions, logout revocation, tenant/student receipt isolation, sandbox deployment guards and no invented payment success.
- Connected institute/student confirmation, prefilled configurable payer fields, required/read-only enforcement, registration payloads, existing mandate reuse and atomic concurrent registration.
- New Student opens its financial profile; approved Master Schedule assignment is available there; existing parents can be selected explicitly without matching records implicitly by contact data.
- Fee assignment reuses the account's existing payer. Student-specific Flex edits preserve payment and receipt history.
- Settings field names and email templates connected end-to-end; settings changes are audited atomically. Receipt/email templates are captured at issuance; the existing outbox worker performs one notification delivery path. Transactional receipt delivery reuses the payer or an explicitly linked student/guardian contact and is independent of eNACH activation.
- Public product presentation restricted to fee management, Flex and eNACH; public owner links removed; legacy /enach redirects into the institution console. Generic hosted checkout routes are not registered; new mandate contracts accept only eNACH.
- Bulk preview/apply/replay and atomic rollback tests; whole-dataset institution-scoped CSV exports retain Antigravity's implementation.

Main changed modules: API academic onboarding, fee-plan assignment, finance settings, portal sessions, receipt-contact selection and normalized payment events; worker receipt rendering/delivery; frontend students, financial profile, Master assignment, payer setup, settings, receipt printing, institution login/navigation and public product presentation; shared mandate/payment contracts and regression tests.

Migrations 043 (Antigravity) and 044 (revocable student portal sessions) were applied only to isolated synthetic acceptance databases. No production database was changed.

## Validation

Formatting, lint and strict typecheck passed. All 121 unit tests and 63 integration tests passed. The 18-test finance integration suite was rerun after the final transactional-email changes and passed, including required/optional/read-only payer configuration, concurrent registration, explicit parent reuse and receipt email queueing before eNACH setup. Production API and Next.js builds passed.

Browser results across the complete suite and targeted final retests: 21 desktop scenarios passed; 18 mobile scenarios passed; three duplicate staff mutation scenarios were intentionally skipped on mobile. Checks include actual institution direct-payment and sandbox debit operations, parent institute/student confirmation and registration, mandate-active versus payment-complete messaging, receipt viewing, desktop/mobile overflow, automated WCAG accessibility checks, protected admin workflows, public login choices, consent and false-success prevention. Retests corrected stale MFA timing, missing test Origin headers, ambiguous heading selectors, mobile menu interaction and audit timeouts. Real application fixes included stale student-section data causing a receipt-view crash, text contrast, mandate search naming, and mobile consent controls.

Local verification uses private ignored .data environment files, synthetic contacts, a separate loopback PostgreSQL test instance, and isolated Chrome profiles. No live money or external customer messages are sent.

## Deployment configuration

Real eNACH requires a selected provider's merchant credentials, HTTPS authorization/debit/status endpoints, signing keys and provider UAT evidence. Real NPCI/bank APIs are outside this implementation. Email delivery requires SMTP_HOST, SMTP_PORT, SMTP_FROM and the appropriate SMTP_USER/SMTP_PASSWORD, with PAYER_NOTIFICATION_MODE=smtp; otherwise delivery remains blocked/disabled. Configure the institute's real support and branding details before deployment. Build with the same API_INTERNAL_URL used by the server because Next.js rewrites capture it at build time.

The secure parent access code is the final token segment of an institution-issued existing /payer/{token}/ link. A parent cannot enroll an unrelated student or institution using a guessed reference or shared email address. Institutions must explicitly create/link records and issue the appropriate access grant.
