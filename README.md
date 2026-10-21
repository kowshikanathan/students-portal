# Dodo - Fee Management, Flex and eNACH

The current canonical project is Website_jodo-main (9)/Website_jodo-main. It continues the existing Codex and Antigravity implementation, using one PostgreSQL fee ledger, immutable receipt snapshots and the existing mandate/debit/event/outbox architecture.

Public access offers Student / Parent Login and Institution Login. The parent portal accepts an enrollment reference and an institution-issued secure payer access code; an email address or phone number alone is not an authentication credential. Staff use the existing password and authenticator MFA flow. Platform-owner privileges remain protected institution administration permissions.

Institution operations include students and parent links, approved fee structures, Master and student-specific Flex schedules, installments, staff-recorded cash and bank payments, receipts, sandbox mandates/debits/recovery, settlements, reconciliation, cashflow, overdue records, reports, bulk actions and tenant roles. Student setup reuses linked academic, payer and schedule records. Institution settings configure payer fields and receipt/email templates.

Generic hosted checkout routes are disabled. New mandate contracts accept eNACH only. No lending, CRED, UPI AutoPay, QR, card, wallet, netbanking, Stripe, WhatsApp or real bank/NPCI integration is enabled. Existing source content and historical financial records are retained.

Use AUTOPAY_PROVIDER_MODE=sandbox in a test/demo deployment. Sandbox is rejected in production mode. Simulated debits use the existing financial event handler, recalculate the remaining balance when executed and never move money. An active mandate is not a successful payment.

Receipt branding and email templates are captured in each new immutable receipt snapshot. The existing durable worker delivers payment confirmations using SMTP when configured; email acceptance is separate from payment success. Older receipts retain their original snapshots.

See [current implementation and validation](docs/implementation/finance-platform.md). This is a development/demo implementation; real-provider readiness and deployment approval are not implied by a passing production build.

## Fast visual preview — no database

Install Node.js 22 and Git, then:

```bash
git clone https://github.com/ooarchitect92/Website_jodo.git
cd Website_jodo
npm ci
npm run preview
```

Open `http://localhost:3000`. This is deliberately **read-only**. Forms and administration cannot report success without the real API/database. Use the full installation below for working enquiries and editing.

## Full local application

```bash
npm ci
npm run bootstrap                 # generates unique local secrets; never overwrites .env
docker compose up -d db            # only PostgreSQL; application can run natively
npm run migrate
npm run seed:demo                  # insert-only; never resets existing content
npm run create:owner               # requires the environment values described below
npm run dev
```

Before `create:owner`, set `OWNER_EMAIL` and a unique `OWNER_PASSWORD` (at least 16 characters) in your private `.env`. The command prints a one-time authenticator enrollment secret. Enroll it in an authenticator app; use its six-digit code when signing in. Do not put credentials in Git, screenshots, chat or this README. Remove `OWNER_PASSWORD` after provisioning. There is no shared/default admin password.

Public site: `http://localhost:3000` · Tenant/owner console: `http://localhost:3000/admin/` · Development API docs: `http://localhost:4000/docs`.

For a fully native setup, create the PostgreSQL database/owner yourself and update `MIGRATION_DATABASE_URL`. Set a different restricted runtime account in `DATABASE_URL`, `APP_DB_USER` and `APP_DB_PASSWORD`; the migration command provisions it. PostgreSQL client tools are required for backups. See [deployment](docs/runbooks/deployment.md).

## Run everything in Docker

```bash
npm run bootstrap
docker compose up -d db
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm seed
# Add private OWNER_EMAIL / OWNER_PASSWORD to .env first:
docker compose --profile tools run --rm create-owner
docker compose up -d --build web api worker
```

No schema reset or seed runs implicitly at container startup. Ports bind to loopback by default. Production requires a real reverse proxy/TLS, reviewed environment isolation, owner rights/claims approval, a configured notification route, recovery evidence and the remaining blueprint controls.

## Verification

```bash
npm run doctor
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration           # isolated test database only
npm run test:e2e                   # API + built website must be running
npm run backup
npm run restore:verify             # explicit empty *_restore_verify database required
```

The GitHub Actions CI uses synthetic contacts ending in `example.invalid`, a real PostgreSQL service and Chromium. It does not contact Jodo or a real customer. Browser test traces may contain synthetic test data and are not production evidence. See the workflow run rather than assuming a committed workflow has passed.

## Project map

```text
apps/web/          Public website and route-isolated owner console
apps/api/src/      NestJS capability controllers/services, access and persistence
apps/worker/src/   Durable outbox, task workflows, scheduled publication, SMTP
packages/core/src/ Shared schemas, pure domain rules and insert-only seed snapshot
db/migrations/     Ordered, checksum-verified PostgreSQL migrations
scripts/           Bootstrap, provisioning, health, build, backup and restore tools
infra/native/      Reverse-proxy template
.github/workflows/ Reproducible CI
 docs/             Architecture, source provenance, runbooks and acceptance status
```

SQL migrations and `pg` are the single persistence system in this build; Prisma is **not** claimed as implemented. The public site and admin share one Next deployment but have separate routes and API permissions. Redis, Python, GraphQL, SOAP, Kubernetes and live financial integrations are not required or activated.

## Productization and launch boundaries

Production deployments must use the company's own brand name, logo, media, copy, customer evidence and legal claims. Competitor trademarks, proprietary visuals and copied marketing text are not required for feature parity and should not be published as company content. The reference/demo content remains non-indexed until replaced and approved.

Reference/demo content is not a production claim. Local demonstration leads are stored only in this installation. Configure verified company identity, provider contracts, portal URLs, privacy decisions and operational ownership before launch.

See [owner guide](docs/owner-guide.md), [architecture and decisions](docs/architecture.md), [API contract](docs/api.md), [privacy boundaries](docs/privacy.md), and [release gaps](docs/acceptance/RELEASE.md).

### Brand configuration

Set `NEXT_PUBLIC_BRAND_NAME` and `NEXT_PUBLIC_BRAND_PRIMARY` for the public identity. Optional `NEXT_PUBLIC_STUDENT_PORTAL_URL`, `NEXT_PUBLIC_INSTITUTE_PORTAL_URL`, and `NEXT_PUBLIC_BUSINESS_PORTAL_URL` values connect owned portals when they exist. In preview mode use `REFERENCE_READONLY_PREVIEW=true`.
