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
    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.redirect, 'error');
      return new Response(
        JSON.stringify({
          status: providerStatus,
          providerReference: 'provider-debit-1',
          ...(providerStatus === 'rejected' ? { reasonCode: 'BANK_REJECTED' } : {}),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const db = {
      query: async (sql: string) => {
        queries.push(sql);
        return [{ ...attempt }];
      },
      tx: async (callback: (client: object) => Promise<void>) =>
        callback({
          query: async (sql: string) => {
            queries.push(sql);
            // The durable reservation wins first, then simulate a signed
            // callback winning the race against the later HTTP response.
            if (sql.includes('SELECT a.id')) return { rowCount: 1, rows: [{ id: attempt.id }] };
            if (sql.includes('PROVIDER_SUBMISSION_PENDING') && sql.includes('RETURNING id'))
              return { rowCount: 1, rows: [{ id: attempt.id }] };
            return { rowCount: 0, rows: [] };
          },
        }),
      audit: async (_client: unknown, _actor: string, action: string) => {
        auditActions.push(action);
      },
    } as unknown as Db;

    try {
      assert.equal(await submitAutopayDebit(db, 'synthetic-outbox-event'), 'provider_accepted');
      const update = queries.find(
        (query) =>
          query.includes('UPDATE autopay_debit_attempts') &&
          (query.includes("status='submitted'") || query.includes("status='failed'")),
      );
      assert.ok(update);
      assert.ok(update.includes("failure_code='PROVIDER_SUBMISSION_PENDING'"));
      assert.deepEqual(auditActions, ['fees.autopay.submission_claimed']);
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

test('an uncertain debit is not submitted to the provider again', async () => {
  const previousMode = process.env.AUTOPAY_PROVIDER_MODE;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  process.env.AUTOPAY_PROVIDER_MODE = 'mandate_api';
  globalThis.fetch = async () => {
    calls++;
    throw new Error('Unexpected provider resubmission');
  };
  const db = {
    query: async () => [{ ...attempt, status: 'uncertain' }],
  } as unknown as Db;
  try {
    assert.equal(await submitAutopayDebit(db, 'uncertain-event'), 'reconciliation_required');
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousMode === undefined) delete process.env.AUTOPAY_PROVIDER_MODE;
    else process.env.AUTOPAY_PROVIDER_MODE = previousMode;
  }
});

test('an ineligible queued debit is cancelled without charging the payer', async () => {
  const previousMode = process.env.AUTOPAY_PROVIDER_MODE;
  const originalFetch = globalThis.fetch;
  process.env.AUTOPAY_PROVIDER_MODE = 'mandate_api';
  let queries = 0;
  let charged = false;
  const audits: string[] = [];
  globalThis.fetch = async () => {
    charged = true;
    throw new Error('Stale debit submitted');
  };
  const db = {
    query: async () => (queries++ === 0 ? [{ ...attempt }] : []),
    tx: async (callback: (client: object) => Promise<void>) =>
      callback({
        query: async (sql: string) =>
          sql.includes('SELECT a.id') ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [] },
      }),
    audit: async (_client: unknown, _actor: string, action: string) => {
      audits.push(action);
    },
  } as unknown as Db;
  try {
    assert.equal(await submitAutopayDebit(db, 'stale-event'), 'provider_accepted');
    assert.equal(charged, false);
    assert.deepEqual(audits, ['fees.autopay.stale_cancelled']);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousMode === undefined) delete process.env.AUTOPAY_PROVIDER_MODE;
    else process.env.AUTOPAY_PROVIDER_MODE = previousMode;
  }
});

test('an unknown provider debit response is held for reconciliation', async () => {
  const old = {
    mode: process.env.AUTOPAY_PROVIDER_MODE,
    url: process.env.AUTOPAY_DEBIT_CREATE_URL,
    hosts: process.env.AUTOPAY_ALLOWED_HOSTS,
    key: process.env.AUTOPAY_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  process.env.AUTOPAY_PROVIDER_MODE = 'mandate_api';
  process.env.AUTOPAY_DEBIT_CREATE_URL = 'https://payments.example.invalid/debits';
  process.env.AUTOPAY_ALLOWED_HOSTS = 'payments.example.invalid';
  process.env.AUTOPAY_API_KEY = 'synthetic-test-key';
  globalThis.fetch = async () => {
    throw new Error('Provider timeout: outcome unknown');
  };
  const updates: string[] = [];
  const audits: string[] = [];
  const db = {
    query: async () => [{ ...attempt }],
    tx: async (callback: (client: object) => Promise<void>) =>
      callback({
        query: async (sql: string) => {
          if (sql.includes('SELECT a.id')) return { rowCount: 1, rows: [{ id: attempt.id }] };
          updates.push(sql);
          return { rowCount: 1, rows: [] };
        },
      }),
    audit: async (_client: unknown, _actor: string, action: string) => {
      audits.push(action);
    },
  } as unknown as Db;
  try {
    assert.equal(await submitAutopayDebit(db, 'timed-out-event'), 'reconciliation_required');
    assert.equal(updates.length, 2);
    assert.ok(updates[0].includes("failure_code='PROVIDER_SUBMISSION_PENDING'"));
    assert.ok(updates[1].includes("failure_code='PROVIDER_SUBMIT_UNCERTAIN'"));
    assert.ok(updates.join('\n').includes('next_retry_at=NULL'));
    assert.deepEqual(audits, [
      'fees.autopay.submission_claimed',
      'fees.autopay.reconciliation_required',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      AUTOPAY_PROVIDER_MODE: old.mode,
      AUTOPAY_DEBIT_CREATE_URL: old.url,
      AUTOPAY_ALLOWED_HOSTS: old.hosts,
      AUTOPAY_API_KEY: old.key,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

for (const providerStatus of ['accepted', 'rejected'] as const) {
  test(`an early signed confirmation wins over a later ${providerStatus} provider reply`, async () => {
    const originalFetch = globalThis.fetch;
    const saved = {
      mode: process.env.AUTOPAY_PROVIDER_MODE,
      url: process.env.AUTOPAY_DEBIT_CREATE_URL,
      hosts: process.env.AUTOPAY_ALLOWED_HOSTS,
      key: process.env.AUTOPAY_API_KEY,
    };
    const actions: string[] = [];
    const updates: string[] = [];
    process.env.AUTOPAY_PROVIDER_MODE = 'mandate_api';
    process.env.AUTOPAY_DEBIT_CREATE_URL = 'https://payments.example.invalid/debits';
    process.env.AUTOPAY_ALLOWED_HOSTS = 'payments.example.invalid';
    process.env.AUTOPAY_API_KEY = 'synthetic-test-key';
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
      query: async () => [{ ...attempt, tenant_id: 'tenant-1', provider: 'test_provider' }],
      tx: async (callback: (client: object) => Promise<void>) =>
        callback({
          query: async (sql: string) => {
            if (sql.includes('SELECT a.id')) return { rows: [{ id: attempt.id }], rowCount: 1 };
            if (sql.includes('FROM payment_records'))
              return { rows: [{ id: 'signed-payment-1' }], rowCount: 1 };
            if (sql.includes('UPDATE autopay_debit_attempts')) updates.push(sql);
            return { rows: [], rowCount: 1 };
          },
        }),
      audit: async (_client: unknown, _actor: string, action: string) => {
        actions.push(action);
      },
    } as unknown as Db;
    try {
      assert.equal(await submitAutopayDebit(db, 'early-confirmed'), 'provider_accepted');
      assert.equal(updates.length, 2);
      assert.ok(updates[0].includes("failure_code='PROVIDER_SUBMISSION_PENDING'"));
      assert.ok(updates[1].includes("status='confirmed'"));
      assert.deepEqual(actions, [
        'fees.autopay.submission_claimed',
        'fees.autopay.early_confirmation_reconciled',
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries({
        AUTOPAY_PROVIDER_MODE: saved.mode,
        AUTOPAY_DEBIT_CREATE_URL: saved.url,
        AUTOPAY_ALLOWED_HOSTS: saved.hosts,
        AUTOPAY_API_KEY: saved.key,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}
