# eNACH Master Implementation Audit & Gap Analysis Matrix
**Project**: Website_jodo-main (Jodo-Inspired eNACH Management System)  
**Audit Date**: October 2026  
**Reference Benchmark**: Jodo (https://www.jodo.in/)  

---

## 1. System Architecture Baseline

- **Frontend**: Next.js 16 (App Router + React 19), Tailwind CSS, AdminShell with institutional navigation, responsive tables, forms, and SVG metric visualizations.
- **Backend**: NestJS 12 modular API with Express, PostgreSQL (`pg`), Zod validation schemas, Argon2 password hashing, TOTP multi-factor authentication, CSRF tokens, and tenant scoping.
- **Ledger & Database**: PostgreSQL migrations 001–035 providing an append-only audit log, tenant isolation triggers, student/guardian customer context, fee plans with versioning and maker-checker approval, fee installments, payments, refunds, mandate setup requests, payment mandates, debit attempts, settlements, reconciliation entries, and recovery cases.
- **Worker Infrastructure**: Transactional outbox pattern with row locks (`FOR UPDATE SKIP LOCKED`), lease timeouts, dead-letter queueing, scheduled reminders, and durable debit attempt reservation.
- **External Integration**: Configurable provider boundaries for hosted checkout, recurring mandate creation, debit initiation, webhook HMAC verification with key rotation, and SMTP email notifications.

---

## 2. Phase 0 Audit Matrix

| Module | Existing Functionality | Missing Functionality | Files / APIs Affected | Priority |
|---|---|---|---|---|
| **Overview** | Server-aggregated SQL overview (`/v1/admin/enach/overview`), period/campus/plan filters, daily cash-flow chart, funnel/failures/upcoming tables, drilldown records API (`/v1/admin/enach/overview/records`). | Actionable pending tasks section, direct KPI card navigation to filtered views, real-time provider connection status badge, timezone consistency review. | `enach-overview.ts`, `enach-overview.tsx`, `enach-dashboard.tsx` | P0 |
| **Mandates** | Mandates list, setup attempts list, 72h expiring payer link creation, signed webhook intake, reconciliation cases for uncertain setups, CSV report export, custom fields. | Mandate detail view with authorization history & bank metadata, CSV bulk upload with pre-submission validation & error reports, resend auth link, pause/resume/cancel workflows, normalized status hierarchy. | `mandate-autopay.ts`, `mandate-workspace.tsx`, `enach-extras.tsx`, `contracts.ts` | P0 |
| **Payers & Students** | Academic students, guardians, student-guardian links, encrypted payer profiles, fee schedule assignments. | Unified Student/Payer 360 profile with complete financial history, objective payment-risk indicator (non-discriminatory), direct mandate setup shortcuts. | `academic.ts`, `payer.ts`, `academic.tsx`, `fees.tsx` | P1 |
| **Automatic Fee Plans** | `generateInstallments` helper (monthly/quarterly/custom, down-payment, excluded dates, weekend shifts, exact minor units), plan versioning, assignment into schedules. | Variable installment amount UI helper, installment rescheduling with audit log, single-click plan creation from eNACH dashboard. | `installment-schedule.ts`, `fee-plans.ts`, `fee-plans.tsx` | P0 |
| **Mandate Authorization** | Hosted authorization URL generation, signed callbacks (`mandate_created`, `active`, `rejected`), uncertain case investigations, early callback precedence. | Admin-initiated registration flow, pluggable sandbox/mock provider emulator for end-to-end testing, bank authentication method capture (NetBanking/Debit/Aadhaar). | `mandate-autopay.ts`, `payment-provider.ts`, `mandate-workspace.tsx` | P0 |
| **Automatic Debit Scheduling** | Due-date debit scheduler in worker, durable `uncertain` reservation before external call, duplicate prevention, outbox retries. | Mandate maximum amount cap verification, mandatory advance pre-debit notice check (24-48h NPCI compliance), bank clearing cutoff window check. | `worker/main.ts`, `worker/payments.ts`, `mandate-autopay.ts` | P0 |
| **Debit Management** | Automatic debits list view in mandate workspace, retry timestamps. | Dedicated debits view with status filters (Scheduled, Processing, Successful, Failed, Cancelled), pre-debit notification status, debit calendar view, guarded manual one-off collection. | `mandate-workspace.tsx`, `fees.ts`, `enach-overview.ts` | P0 |
| **Failed Debit Recovery** | Recovery cases & actions table (migration 035), case assignment, notes, follow-up date, payment link fallback. | Smart salary-date retry scheduling with cooldowns, bank failure categorization & analytics, one-click fallback payment link with ledger sync preventing duplicate debits. | `enach-recovery.ts`, `enach-recovery.tsx`, `payment-checkout.ts` | P0 |
| **Reconciliation & Settlements** | Settlement records & payment allocations, mismatch reconciliation entries, signed evidence review. | Bank/provider settlement file upload & automated matching, discrepancy queues, accounting exports (Tally XML/CSV, Zoho Books CSV), gross/fee/net statement. | `fees.ts`, `mandate-autopay.ts`, `enach-extras.tsx` | P0 |
| **Communication** | Worker fee reminders (upcoming 3d, due today, overdue), SMTP email delivery, communication log. | Multi-channel template library (Registration link, Pre-debit notice, Success, Failure, Overdue), multilingual previews (English, Hindi, Telugu, Tamil, Kannada), channel delivery tracking. | `worker/notifications.ts`, `payer.ts`, new communication controller | P1 |
| **Analytics & Reporting** | Daily collection trends, registration funnel, failure breakdown, CSV report download. | Bank-wise registration success rates, authentication method breakdown, drop-off funnel analytics, server-side full ledger export. | `enach-overview.ts`, `enach-overview.tsx`, `enach-extras.tsx` | P1 |
| **Compliance & Audit** | Append-only audit log, HMAC checkpointing, tenant isolation triggers, password hashing, MFA, CSRF. | Mandate consent records (terms, timestamp, IP, consent version), pre-debit notice evidence, regulatory NPCI/RBI compliance checklist. | `auth.ts`, `mandate-autopay.ts`, new compliance service | P0 |
| **Developer Tools** | Configurable endpoints, webhook signature verification with rollover key. | Pluggable provider adapter interface, sandbox test simulator (simulate registration, debits, webhooks), webhook delivery logs & replay. | `payment-provider.ts`, `config.ts`, new developer console | P1 |
| **Team & Settings** | Tenancy studio, legal entities, branches, custom roles, maker-checker publishing. | eNACH operational parameters (max limits, retry rules, quiet hours, advance notice), maker-checker controls for financial threshold changes. | `tenancy.ts`, `settings.tsx` | P1 |
| **AI Calling** | Disabled placeholder. | Configurable AI reminder integration: quiet hours check, consent check, localized context generation, call outcome recording, gated on credentials. | `worker/notifications.ts`, new voice adapter | P2 |
| **Support & Trust** | Contextual help tooltips (`EnachInfo`), error boundaries. | In-app bank failure code troubleshooting dictionary, dispute/support ticket tracker, external provider status indicator. | `enach-extras.tsx`, `mandate-workspace.tsx` | P2 |

---

## 3. Migration and Code Defect Risks Identified & Mitigated

1. **Persistent Database Collisions**: In integration tests, hardcoded fixture names (like legal entity names and domain hostnames) caused duplicate key errors on subsequent runs. Fixed by ensuring unique test identifiers.
2. **Missing Database Migrations**: Migrations 034 (`fee_plan_generation.sql`) and 035 (`enach_recovery.sql`) had been authored but not applied to the running local database. Applied cleanly via `npm run migrate`.
3. **Password Quoting in `.env`**: Hashes (`#`) in passwords without quotation marks were parsed as comments by Node's `--env-file`. Resolved by enclosing passwords in quotes.
4. **React Imports in Test Runner**: Classic JSX transpile under Node test runner required explicit `import React from 'react'` in frontend components rendered via `renderToStaticMarkup`.
5. **Immutable Financial Migrations**: All existing migrations 001–035 remain untouched to preserve database schema integrity. Any new schema additions will be additive in migration 036+.

