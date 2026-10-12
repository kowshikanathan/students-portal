# eNACH/UPI AutoPay: uncertain mandate setup runbook

## Scope

This supplements the existing `payment_mandate_setup_requests` flow and its signed
`mandate_status` callbacks. It does not enable a bank, gateway or lending provider.

## Why this state exists

A network timeout, invalid response or dropped connection after a create request is
**not evidence that the provider rejected the registration**. It may have accepted the
mandate while the platform lacked its provider reference. From migration 025 onward,
such attempts move from `requested` to `uncertain`, not `failed`.

## Operator procedure

1. Keep payment registration and retries disabled for this schedule while it has a
   `requested`, `created` or `uncertain` setup. An `uncertain` record deliberately
   has no automatic expiry. Never create a different idempotency key to bypass it.
2. Locate the setup under the active tenant's admin mandate-setup list. Use its
   internal setup ID and the original provider request idempotency key to query the
   **approved provider's authenticated back office/API**. Do not collect credentials
   from the payer or rely on a return-page screenshot.
3. The outbound create payload contains `merchantSetupId`. When an approved
   provider echoes that exact ID in its **HMAC-authenticated** `mandate_status`
   callback, the handler verifies tenant, schedule, mandate rail, provider and
   provider-reference uniqueness. It can then attach the reference to the
   uncertain setup and apply the signed status without creating another setup.
   The payer's return URL is never authoritative financial evidence.
4. If the provider cannot echo `merchantSetupId`, or reports registration exists
   without a matching signed callback, the local setup remains uncertain.
   In the tenant fee-operations console, use **Record investigation** on the uncertain
   mandate row. Supply only the provider's support case reference and select one
   of the predefined investigation reasons. This inserts one audited, tenant-scoped
   `mandate_reconciliation_cases` record. Repeated attempts for the same setup are
   rejected. Creating an investigation case **does not** change the mandate status,
   authorize a retry, or record a payment.
   Do not create another registration or manually label money as received. A governed, independently approved manual resolution
   workflow is still required for production activation.
5. If the provider proves the request never registered, require independent operator
   approval and an audited disposition before allowing a new registration attempt.
   This repository currently has no approved operator-disposition endpoint; the investigation case is read-only after creation.
6. Record tenant, schedule, setup ID, provider case/reference, timeline and the
   independent evidence. No bank account number, UPI credential or other secrets
   belong in support notes.

## Launch requirements

A real approved partner adapter must provide reconciliation by merchant setup ID or
idempotency key, deterministic response mapping, signed callback authentication,
operator-verified unknown-outcome resolution and end-to-end sandbox/UAT coverage.
Until those pass, the live eNACH provider stays disabled.

## Regression checks

- A timeout must leave `uncertain`, not `failed`.
- Same idempotency key cannot register another mandate.
- Another idempotency key for the same schedule is blocked while uncertain.
- Unsigned, replayed or out-of-order callbacks cannot create false success.
- A verified callback with a matching `merchantSetupId` binds the reference only
  to the same tenant, provider, schedule and rail.
- Callbacks with missing, mismatched or reused setup IDs cannot unlock an uncertain setup.
- Without a correlated signed callback, the unresolved case requires human reconciliation.

## Provider evidence and independent review (migration 029)

From the tenant fee-operations dashboard, open an investigation for an uncertain
mandate. Record provider evidence references (not bank-account numbers, OTPs,
passwords, credentials or copies of personal documents). Choose the provider's
finding; no free-form financial details are accepted. Entries are append-only and
uniquely keyed by case and provider evidence reference. A second active tenant
owner, different from the evidence submitter, may select **Verify evidence** or
**Insufficient evidence**. A review can be recorded only once per evidence item.

Evidence and review records do **not** change the mandate status, unlock a new
setup or confirm payment. Even a provider statement that no registration exists
must not enable retries until the separate, independently approved disposition
workflow and real partner reconciliation integration are developed, tested and
activated. Signed callbacks remain authoritative for bank outcomes. Single-owner
installations must retain an unresolved case rather than self-approve.

## Automatic closure from signed final provider outcomes (migration 030)

An open investigation case moves to `resolved_signed` only inside the existing
HMAC-authenticated mandate-status callback transaction when the provider reports
`active`, `failed`, or `revoked` and its reference matches the tenant,
provider, fee schedule, and mandate rail. The case stores the applied provider
event ID and resolution time. Replayed events do not create additional
resolutions; stale or mismatched events cannot close a case.

A signed `pending` event does not close the case. Operator-entered evidence,
even if independently reviewed as verified, does not close the case or change the
bank's status. Resolved cases remain visible as read-only history in the existing
fee-operations console. This closure is not a second authorization or payment.

## Database proof and immutability (migration 031)

The database now enforces the same resolution boundary as the signed callback:
only a case still in `open` status can transition once to `resolved_signed`.
The referenced provider event must already be `applied`, be a mandate-status
event for the same tenant and provider, and match the original setup's schedule,
rail, provider reference, and terminal outcome. Case identity, opening evidence,
author, and timestamp cannot be changed during resolution. Closed cases cannot
be modified or deleted. This is a defense-in-depth check in addition to HMAC
verification, not a replacement for provider signature verification.

Regression coverage attempts a forged resolution using a rejected provider event,
then confirms that a valid signed callback closes the case exactly once and
prevents subsequent editing or deletion.

## Rejecting uncorrelated first-mandate callbacks

An HMAC-valid `mandate_status` callback is not enough to identify a registration
if a schedule has an `uncertain` setup without a provider reference. When the
callback has no `merchantSetupId` and does not match an existing mandate, the
handler rejects it with `MANDATE_SETUP_CORRELATION_REQUIRED` while _any_ setup
on that schedule is uncertain, including one on another mandate rail. The
provider event remains auditable as rejected and no new mandate is inserted.
A callback with a valid, correlated original setup ID still follows the
existing signed-event path. This prevents duplicate mandates without adding a
manual activation shortcut.

## Rejecting conflicting active provider references

The signed mandate callback also checks whether a fee schedule already has an
active mandate under a different provider reference. In that case the new
provider event is rejected with `ACTIVE_MANDATE_REFERENCE_CONFLICT`, is
auditable, and cannot create an additional active mandate. A legitimate status
change for the existing provider reference continues through the established
ordering checks. This guard applies across eNACH and UPI AutoPay rails.

## Database-level duplicate active mandate protection (migration 032)

The partial unique index `payment_mandates_one_active_per_schedule_idx`
prevents a second `active` mandate on a fee schedule, even if a database
writer bypasses the signed webhook route. It applies to both eNACH and UPI
AutoPay. Deployments with pre-existing duplicate active mandates fail this
migration with an explicit error; the platform does not delete or silently
change either mandate. Reconcile these cases with the provider before retrying
the migration.

## Operations triage for unresolved cases

The existing tenant fee-operations console now derives a read-only queue state
from each investigation's append-only provider evidence and independent reviews:
`awaiting_provider_evidence`, `awaiting_independent_review`,
`additional_provider_evidence_needed`, `awaiting_signed_callback`, or
`resolved_signed`. It also displays evidence counts, pending reviewer counts,
and the case's age in hours. Open cases are prioritized oldest first, and a
24-hour age indicator helps owners identify items needing follow-up. Age is
not evidence of failure, and no timer authorizes retries, mandate activation,
or payment confirmation.

## First mandate callback correlation

Signed mandate-status webhooks cannot create the first local mandate unless
the registration can be traced to a prior platform setup. New provider
integrations should echo `merchantSetupId`; the existing handler checks the
exact tenant, schedule, provider, rail, and provider reference before applying
that callback. For legacy providers omitting `merchantSetupId`, the exact
provider reference must already be stored against a matching setup in
`created` or `active` status. An otherwise signed but orphaned event is
recorded as `MANDATE_SETUP_NOT_FOUND`; when registration remains uncertain
the more specific `MANDATE_SETUP_CORRELATION_REQUIRED` applies. Neither
rejection inserts a mandate or confirms a payment. Lifecycle events for
previously matched mandates continue to use the existing verified handler.

## Signed webhook secret rollover

The existing `v1/provider/payments/webhook` handler supports optional
`PAYMENT_WEBHOOK_PREVIOUS_SECRET` while switching providers from an old
signing key to `PAYMENT_WEBHOOK_SECRET`. Both keys must be independently
generated, distinct, and at least 48 characters. Enable the old key only
during a provider-approved cutover, deploy the new key as primary, and then
remove the previous key after the provider confirms the switch. Every configured
previous key must also have a `PAYMENT_WEBHOOK_PREVIOUS_SECRET_EXPIRES_AT`
UTC timestamp no more than seven days in the future at service startup.
The old key is automatically rejected after this deadline, even if the
configuration remains. A missing or invalid deadline fails startup checks;
the current signing key continues working when the old key expires. Callbacks
must still satisfy the timestamp window, HMAC signature, strict payload
schema, and replay/idempotency controls. A signature using an unconfigured
or retired key is rejected before accessing the database. No key material
is included in webhook responses or audit entries.
