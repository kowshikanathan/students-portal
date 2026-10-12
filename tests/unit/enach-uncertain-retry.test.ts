import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PayerMandateController } from '../../apps/api/src/mandate-autopay';
import type { Db } from '../../apps/api/src/db';

const scheduleId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const payerId = '33333333-3333-4333-8333-333333333333';
const setupId = '44444444-4444-4444-8444-444444444444';
const firstKey = '55555555-5555-4555-8555-555555555555';
const secondKey = '66666666-6666-4666-8666-666666666666';
const access = {
  schedule_id: scheduleId,
  tenant_id: tenantId,
  payer_id: payerId,
  account_reference: 'SYNTHETIC-123',
  currency: 'INR',
  total_amount_minor: '50000',
  status: 'active',
  active: true,
};

test('eNACH timeout remains uncertain and blocks a duplicate authorization', async () => {
  const keys = [
    'AUTOPAY_PROVIDER_MODE',
    'AUTOPAY_MANDATE_CREATE_URL',
    'AUTOPAY_ALLOWED_HOSTS',
    'AUTOPAY_API_KEY',
    'PAYMENT_PROVIDER_NAME',
    'SITE_URL',
  ] as const;
  const oldEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  const requests: Array<{ key: string | null; body: Record<string, unknown> }> = [];
  const auditEvents: string[] = [];
  let setupStatus = '';
  let insertions = 0;
  try {
    process.env.AUTOPAY_PROVIDER_MODE = 'mandate_api';
    process.env.AUTOPAY_MANDATE_CREATE_URL = 'https://provider.example.invalid/mandates';
    process.env.AUTOPAY_ALLOWED_HOSTS = 'provider.example.invalid';
    process.env.AUTOPAY_API_KEY = 'synthetic-key';
    process.env.PAYMENT_PROVIDER_NAME = 'synthetic-provider';
    process.env.SITE_URL = 'https://school.example.invalid';

    globalThis.fetch = async (_input, init) => {
      requests.push({
        key: new Headers(init?.headers).get('Idempotency-Key'),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      throw new Error('simulated network timeout after submission');
    };

    const db = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM payer_access_tokens')) return [access];
        if (sql.includes('FROM payment_mandate_setup_requests') && params?.[1] === firstKey && setupStatus)
          return [{ id: setupId, schedule_id: scheduleId, payer_id: payerId, rail: 'enach', status: setupStatus }];
        return [];
      },
      tx: async (callback: (c: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> }) => Promise<unknown>) =>
        callback({
          query: async (sql: string, params?: unknown[]) => {
            if (sql.includes('FROM payment_mandate_setup_requests') && sql.includes('idempotency_key'))
              return { rows: [], rowCount: 0 };
            if (sql.includes('FROM payment_mandates')) return { rows: [], rowCount: 0 };
            if (sql.includes('FROM payment_mandate_setup_requests') && sql.includes("status IN('requested','created','uncertain')"))
              return { rows: setupStatus ? [{ id: setupId, status: setupStatus }] : [], rowCount: setupStatus ? 1 : 0 };
            if (sql.includes('INSERT INTO payment_mandate_setup_requests')) {
              insertions += 1;
              setupStatus = 'requested';
              return { rows: [{ id: setupId }], rowCount: 1 };
            }
            if (sql.includes('UPDATE payment_mandate_setup_requests') && sql.includes("status='uncertain'")) {
              assert.equal(params?.[0], setupId);
              setupStatus = 'uncertain';
              return { rows: [], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          },
        }),
      audit: async (_client: unknown, _actor: string, eventName: string) => {
        auditEvents.push(eventName);
      },
    } as unknown as Db;

    const controller = new PayerMandateController(db);
    await assert.rejects(
      controller.create('a'.repeat(43), { rail: 'enach', idempotencyKey: firstKey }),
      /outcome is uncertain/i,
    );
    assert.equal(setupStatus, 'uncertain');
    assert.equal(insertions, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].key, firstKey);
    assert.equal(requests[0].body.merchantSetupId, setupId);
    assert.equal(requests[0].body.rail, 'enach');
    assert.deepEqual(auditEvents, ['fees.mandate_setup.uncertain']);

    await assert.rejects(
      controller.create('a'.repeat(43), { rail: 'enach', idempotencyKey: firstKey }),
      /no longer reusable/i,
    );
    await assert.rejects(
      controller.create('a'.repeat(43), { rail: 'enach', idempotencyKey: secondKey }),
      /already in progress/i,
    );
    assert.equal(insertions, 1, 'no second mandate setup may be inserted');
    assert.equal(requests.length, 1, 'no second provider request may be sent');
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of keys) {
      const oldValue = oldEnv[key];
      if (oldValue === undefined) delete process.env[key];
      else process.env[key] = oldValue;
    }
  }
});
