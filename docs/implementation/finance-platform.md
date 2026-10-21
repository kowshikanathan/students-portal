# Finance platform implementation

The owner confirmed on 21 October 2026 that `(9).zip` and `(9)(1).zip` have identical contents. The canonical root is `Website_jodo-main (9)/Website_jodo-main`. No Git metadata was supplied. `canonical-before-implementation.zip` preserves the supplied archive before edits.

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
- Finance controllers currently require the existing owner role. New finance roles must be implemented server-side before exposing additional UI permissions.

## Progress

- Phase 1: canonical source verified; archive backup created; scope decision recorded. Finance navigation is being separated from retained CMS capabilities.
- Remaining phases are not certified complete. Integration acceptance requires PostgreSQL and executable sandbox scenarios, including prepayment, history preservation and duplicate-debit prevention.
