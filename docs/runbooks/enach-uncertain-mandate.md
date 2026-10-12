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
3. If the provider identifies the mandate and a verified signed callback arrives
   with its reference, the existing callback handler can apply the financial mandate
   state. The setup row is automatically matched only when it already has the
   provider reference. A timeout can leave that reference blank; **do not assume the
   setup row will resolve itself**.
4. If the provider reports registration exists but the local setup remains uncertain,
   open a documented manual reconciliation task; do not create another registration
   or manually label money as received. A governed, audited reference-resolution
   workflow is still required for production activation.
5. If the provider proves the request never registered, require independent operator
   approval and an audited disposition before allowing a new registration attempt.
   This repository currently has no automated operator-disposition endpoint.
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
- A verified callback with a known provider reference updates only the same
  provider, schedule and tenant.
- Missing provider reference remains an explicit human reconciliation case.
