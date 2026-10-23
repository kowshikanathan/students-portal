# eNACH v2 implementation audit

Audit date: 2026-10-16. Specification: supplied MASTER IMPLEMENTATION PROMPT v2.0. The separately named “Options for a Successful Product” document was not supplied. Public functional reference: https://www.jodo.in/ (fee schedules, communication, analytics and reconciliation only; private features are unverified).

## Architecture and constraints

Next 16 / React 19 client workspaces share the existing AdminShell and CSS. Nest capability controllers use pg, Zod, session MFA, CSRF and tenant membership roles. PostgreSQL migrations 001–033 provide the single ledger. The worker uses transactional outbox records and row locks, not Redis. Provider endpoints are configurable generic contracts, not a certified Razorpay integration. SMTP exists; SMS, WhatsApp and AI calling are not connected. CI provisions isolated PostgreSQL and runs formatting, type checks, units, integration, builds and Playwright. No live provider credentials or approval evidence were supplied.

| Module | Existing functionality verified in source | Missing functionality | Files/APIs affected | Priority |
|---|---|---|---|---|
| Overview | Tenant-scoped lists, provider configuration status, limited fee totals | Server aggregate overview, consistent windows, drill-down, trends | enach-dashboard.tsx, fees.ts, new enach-overview.ts | P0 |
| Mandates | Hosted setup, payer links, signed callbacks, uncertain cases, inquiry and evidence review; search/detail workspace | Provider-supported cancellation/change adapters, bank/method metadata, bulk registration validation and delivery/open evidence | mandate-autopay.ts, mandate-workspace.tsx, payment-provider.ts | P0 |
| Debits | Durable attempts/outbox, installment locking, retries, uncertain reservation, manual-checkout exclusion | Verified mandate limits/validity, provider notification evidence/cutoffs, calendar and complete raw status model | worker/main.ts, worker/payments.ts, migration 009 | P0 |
| Failed debits | Failure codes, bounded automatic retry, payment-link fallback | Assigned recovery cases, bank categories, permitted next-action workflow and cross-channel history | payments.ts, payer.ts, new recovery service | P0 |
| Payers | Encrypted profiles, expiring payer links, students/guardians/catalogue, fee-plan assignments/statements | Unified profile and objective history indicator; governed notes | academic.ts, payer.ts, fee-plans.ts | P1 |
| Reconciliation | Settlement allocations, mismatch entries, signed mandate investigation cases | Contracted settlement retrieval, fee/net/bank references, bank-file matching and accounting exports | fees.ts, mandate-autopay.ts | P0 |
| Communication | Durable reminders, receipts, SMTP boundary | Consent-aware channel preferences, multilingual templates, WhatsApp/SMS adapters and delivery callbacks | worker/notifications.ts, payer.ts | P1 |
| Analytics | Fee overview and client exports of loaded rows | Full-ledger aggregations and exports, metric definitions, cohorts and bank/method reporting | new enach-overview.ts, enach-extras.tsx | P1 |
| Compliance | Append-only audit, tenant scope triggers, MFA, CSRF, maker-checker plans/adjustments | Provider consent terms, notice evidence, approved retention and RBI/NPCI/provider release review | auth.ts, migrations, release checklist | P0 |
| Developers | Signed events, replay protection, previous-key rollover, documentation | Scoped merchant API keys, subscription/replay UI, certified partner sandbox | payment-provider.ts, config.ts | P1 |
| Team/settings | Tenant organisation, branch membership field, governed role templates; route roles remain owner-only for finance | Effective campus row policies across every financial endpoint and operational role mapping | auth.ts, tenancy.ts, all finance services | P1 |
| Support/trust | Contextual mandate help, error states and investigation cases | Support/dispute case module and external provider status feed | mandate-workspace.tsx, new support service | P2 |

## Risks and existing defects

- Financial list APIs cap rows at 200; totals calculated from them are incomplete. New overview must aggregate in SQL independently of those lists.
- Existing finance routes intentionally require owner membership. Do not broaden a role until the corresponding row policy and negative tests exist. A membership branch field alone does not enforce campus authorization.
- Fee plans require manual installment arrays. Assignment already creates UUID installment records transactionally with unique student/plan and schedule/sequence constraints. Extend generation without duplicating that ledger.
- Plan version selection uses max(version)+1 without a per-key lock; serialize concurrent draft generation. Retry must not create another version unintentionally.
- Existing scheduler checks active mandate and balance but lacks independently recorded mandate caps, validity and advance-notice/cutoff evidence. Live enablement remains blocked.
- Never retry uncertain submissions. Existing worker reservation and callback ordering protections must remain.
- Existing migration checksums are immutable. Add new migrations; do not rewrite 001–033. No destructive rollback against financial history.
- README architecture has historical descriptions predating financial modules. This audit records present code separately from deployment approval.
- docs/SITE_BRIEF.md and docs/decisions/ADR-001.md referenced by root AGENTS.md are absent. docs/architecture.md contains ADR-001; no replacement requirements were invented.
- Local startup fixes from the prior task (preview variable, watch argument order and optional API documentation) are pre-existing session work and must be preserved.

## Phase tracking

Source presence is not test execution. Each implementation report records actual checks. Unselected provider, credentials, onboarding, notification rules, legal review, production operations and the missing companion document remain dependencies. No phase or production readiness is inferred from this audit.
