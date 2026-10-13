# Mandates, AutoPay & settlements — dashboard controls

In the institution owner console, open **Fee operations**, then select **Go to
Mandates & AutoPay** near the top of the page. The original finance lifecycle,
payment ledger, provider callbacks and reconciliation forms remain in place.

The mandate panel now has five selectable views: Mandates, Setup attempts,
Automatic debits, Settlements, and Checkouts. Every view shows actual rows from
the existing tenant-scoped admin endpoints, offers text filtering, supports
expandable read-only record details and refreshes without posting financial
instructions. An empty collection shows an explicit empty state rather than
presenting an inert zero counter as an action.

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
