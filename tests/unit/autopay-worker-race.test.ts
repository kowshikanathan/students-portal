import assert from 'node:assert/strict';
import test from 'node:test';
import { submitAutopayDebit } from '../../apps/worker/src/payments';
import type { Db } from '../../apps/api/src/db';

const attempt = {
  id: 'attempt-1',
  mandate_id: 'mandate-1',
  schedule_id: 'schedule-1',
  installment_id: 'installment-1',
  mandate_reference: 'bank-mandate-1',
  amount_minor: '10000',
  currency: 'INR',
  idempotency_key: 'attempt-idempotency-1',
  status: 'queued',
  attempt_no: 1,
};

for (const providerStatus of ['accepted', 'rejected'] as const) {
  test(`a late ${providerStatus} debit response cannot overwrite confirmed state`, async () => {
    const previous = {
      mode: process.env.AUTOPAY_PROVIDER_MODE,
      url: process.env.AUTOPAY_DEBIT_CREATE_URL,
      hosts: process.env.AUTOPAY_ALLOWED_HOSTS,
      key: process.env.AUTOPAY_API_KEY,
      deployment: process.env.DEPLOYMENT_MODE,
    };
    const originalFetch = globalThis.fetch;
    const queries: string[] = [];
    const auditActions: string[] = [];
    process.env.AUTOPAY_PROVIDER_MODE = 'mandate_api';
    process.env.AUTOPAY_DEBIT_CREATE_URL = 'https://payments.example.invalid/debits';
    process.env.AUTOPAY_ALLOWED_HOSTS = 'payments.example.invalid';
    process.env.AUTOPAY_API_KEY = 'synthetic-test-key';
    process.env.DEPLOYMENT_MODE = 'test';
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: providerStatus,
          providerReference: 'provider-debit-1',
          ...(providerStatus === 'rejected' ? { reasonCode: 'BANK_REJECTED' } : {}),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const db = {
      query: async (sql: string) => {
        queries.push(sql);
        return [{ ...attempt }];
      },
      tx: async (callback: (client: { query: (sql: string) => Promise<{ rowCount: number }> }) => Promise<void>) =>
        callback({
          query: async (sql: string) => {
            queries.push(sql);
            // Simulate a verified callback confirming the debit before the
            // worker receives the HTTP response.
            return { rowCount: 0 };
          },
        }),
      audit: async (_client: unknown, _actor: string, action: string) => {
        auditActions.push(action);
      },
    } as unknown as Db;

    try {
      assert.equal(await submitAutopayDebit(db, 'synthetic-outbox-event'), 'provider_accepted');
      const update = queries.find((query) => query.includes('UPDATE autopay_debit_attempts'));
      assert.ok(update);
      assert.match(update, /status IN\\('queued','uncertain'\\)/);
      assert.deepEqual(auditActions, []);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries({
        AUTOPAY_PROVIDER_MODE: previous.mode,
        AUTOPAY_DEBIT_CREATE_URL: previous.url,
        AUTOPAY_ALLOWED_HOSTS: previous.hosts,
        AUTOPAY_API_KEY: previous.key,
        DEPLOYMENT_MODE: previous.deployment,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}
