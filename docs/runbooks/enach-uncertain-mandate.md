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
