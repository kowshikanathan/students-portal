# Mandates, AutoPay & settlements — dashboard controls

## Dedicated Dodo eNACH dashboard

The dedicated eNACH application is now served at **/enach/** with its own
**Dodo eNACH** sidebar, separate from **Dodo Studio /admin/**. The main Studio
sidebar no longer includes an eNACH menu item. Owners can bookmark **/enach/**,
and the legacy **/admin/enach/** URL redirects to the separate application.
The eNACH navigation selects the existing mandate, setup, debit, settlement
and checkout views. It reuses the existing mandate, setup, debit,
settlement, checkout, schedules, provider-readiness and investigation APIs
and the same interactive mandate workspace. Its cards show actual
workspace-scoped counts rather than fabricated transactions, and partial
API failures are shown without hiding successfully loaded records.

**Create payer profile** and **Create fee schedule** take the owner to
**/admin/fees/payer/** and **/admin/fees/schedule/**, respectively.
**Reconciliation and evidence review** opens **/admin/fees/reconciliation/**.
Those routes preserve the existing secure financial workflows instead of
creating parallel API or database services. **Generate
payer link** invokes the existing secured 72-hour payer-link API and opens the
same payer portal. The separate dashboard creates no additional database
tables, mandate endpoints, approval rights or direct debit permissions.
The bank integration still has to be configured and verified independently.

The product-facing console and default public site identity are **Dodo**.
Existing database usernames, repository paths, signed callback contracts,
consent storage keys and historical citations to Jodo as a third-party
reference are intentionally not renamed: that would risk migration
breakage or incorrectly claim Jodo's partner relationships as Dodo's.
Previously published CMS titles/text are owner-controlled and may need
separate review in the CMS to replace historical reference wording.

In the institution owner console, open **Fee operations**. The existing
**Mandates, AutoPay & settlements** workspace now appears immediately after the
fee dashboard summary and before payer and fee-schedule forms, at full content
width. Select **Go to Mandates & AutoPay** to jump directly to it. The heading
is a section title, not a financial-action button; use the five selectable
record-view buttons immediately below it. Existing payment ledgers, provider
callbacks and reconciliation forms remain intact.

The mandate panel now has five selectable views: Mandates, Setup attempts,
Automatic debits, Settlements, and Checkouts. Every view shows actual rows from
the existing tenant-scoped admin endpoints, offers text filtering, supports
expandable read-only record details and refreshes without posting financial
instructions. An empty collection shows an explicit empty state rather than
presenting an inert zero counter as an action. If no active payer-linked schedule
exists, owners of writable institutions can use **Create payer profile** and
**Create fee schedule** to jump to the existing entry forms without creating
duplicate payment modules. Read-only workspaces do not offer mutation shortcuts.

For an active fee schedule with an assigned payer, an owner of a writable
institution can select **Generate payer link**. This calls the existing
`POST /v1/admin/fees/schedules/:id/payer-link` endpoint with a 72-hour,
full-balance policy. It displays a link to the existing secure payer portal.
The payer, not the admin, can select **Set up eNACH** if
`AUTOPAY_PROVIDER_MODE=mandate_api` and the approved bank provider is
configured and available. Generating a link does not create a mandate,
confirm payment, or submit a debit.

Uncertain mandate setup investigations, independent provider evidence review,
signed callbacks, and retry policies remain under the existing section and
backend. No new payment authority was added. Backend role/tenant and
read-only checks remain the enforcement boundary.

## eNACH-only custom fields, reports and help

In **/enach/**, the eNACH sidebar has **Custom fields** and **Reports**.
These are **not added to Dodo Studio, Fee Operations or the public website**.
Users can click the **ⓘ / eye** control beside eNACH features and relevant
fields to see an explanation without changing a transaction.

An authorized owner can create up to 30 optional tenant-scoped eNACH fields:
short text, number, date or choice/dropdown (with configurable options).
Provide a lowercase key such as `campus_code`, a descriptive label, and a
field type; choose an existing mandate, setup attempt, debit, settlement or
checkout record before saving its operational annotation. Only records
belonging to the current tenant can be annotated. These extra values are
held in `enach_custom_fields` and `enach_custom_values` (migration 033);
they do **not** alter any bank-mandate, debit, settlement or evidence record.
Apply the migration using the established `npm run migrate` deployment step.
Never put banking credentials, OTPs, PINs or other sensitive details into
operational notes.

In **Reports**, choose one of the five record types, optional account/status
and creation-date filters, and the columns to include. Click **Download CSV
report** to export the _currently loaded_ tenant-scoped records together
with optional custom columns. This is a filtered working report, **not**
a complete audit export. It does not establish bank authorization or
payment settlement, and CSV cell content is escaped against spreadsheet
formula execution. Report generation is entirely read-only.

## Verification

- `npm run typecheck`
- `npm test` (view-model and server-render contract cases)
- `npm run test:e2e` in the isolated test environment with an owner account,
  configured PostgreSQL and an available browser; includes tab navigation.
- Manual check against an actual configured provider is still required.
- With provider mode disabled, the UI must explain why the payer cannot start
  eNACH rather than claiming the mandate has been activated.

These checks are instructions for operators/CI, not evidence that the
repository tests, live bank callbacks or hosted eNACH transactions passed.
