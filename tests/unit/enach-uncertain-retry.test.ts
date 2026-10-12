import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PayerMandateController } from '../../apps/api/src/mandate-autopay';
import type { Db } from '../../apps/api/src/db';

const scheduleId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const payerId = '33333333-3333-4333-8333-333333333333';
const setupId = '44444444-4444-4444-8444-444444444444';
const firstKey = '55555555-5555-4555-8555-555555555555';
const secondKey = '66666666-6666-4666-8666-666666666666';

test('eNACH unknown outcome blocks duplicate provider registration', async () => {
  const keys = [
    'AUTOPAY_PROVIDER_MODE',
    'AUTOPAY_MANDATE_CREATE_URL',
    'AUTOPAY_ALLOWED_HOSTS',
    'AUTOPAY_API_KEY',
    'PAYMENT_PROVIDER_NAME',
    'SITE_URL',
  ];
  const previous = keys.map((key) => process.env[key]);
  const previousFetch = globalThis.fetch;
  let status = '';
  let inserts = 0;
  let providerCalls = 0;
  const auditEvents: string[] = [];

  try {
    process.env.AUTOPAY_PROVIDER_MODE = 'mandate_api';
    process.env.AUTOPAY_MANDATE_CREATE_URL = 'https://bank.example.invalid/mandates';
    process.env.AUTOPAY_ALLOWED_HOSTS = 'bank.example.invalid';
    process.env.AUTOPAY_API_KEY = 'synthetic-only';
    process.env.PAYMENT_PROVIDER_NAME = 'synthetic-bank';
    process.env.SITE_URL = 'https://school.example.invalid';

    globalThis.fetch = async (_url, options) => {
      providerCalls += 1;
      const headers = new Headers(options?.headers);
      assert.equal(headers.get('Idempotency-Key'), firstKey);
      const payload = JSON.parse(String(options?.body));
      assert.equal(payload.merchantSetupId, setupId);
      assert.equal(payload.rail, 'enach');
      throw new Error('simulated timeout after provider request');
    };

    const db = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM payer_access_tokens')) {
          return [
            {
              schedule_id: scheduleId,
              tenant_id: tenantId,
              payer_id: payerId,
              account_reference: 'SYNTHETIC-123',
              currency: 'INR',
              total_amount_minor: '50000',
              status: 'active',
              active: true,
            },
          ];
        }
        if (params?.[1] === firstKey && status) {
          return [
            {
              id: setupId,
              schedule_id: scheduleId,
              payer_id: payerId,
              rail: 'enach',
              status,
            },
          ];
        }
        return [];
      },
      tx: async (work: any) =>
        work({
          query: async (sql: string) => {
            if (sql.includes('FROM payment_mandates')) {
              return { rows: [] };
            }
            if (sql.includes('FROM payment_mandate_setup_requests')) {
              if (sql.includes('idempotency_key')) {
                return { rows: [] };
              }
              return {
                rows: status ? [{ id: setupId, status }] : [],
              };
            }
            if (sql.includes('INSERT INTO payment_mandate_setup_requests')) {
              inserts += 1;
              status = 'requested';
              return { rows: [{ id: setupId }] };
            }
            if (sql.includes('UPDATE payment_mandate_setup_requests')) {
              status = 'uncertain';
              return { rows: [] };
            }
            return { rows: [] };
          },
        }),
      audit: async (_client: unknown, _actor: string, action: string) => {
        auditEvents.push(action);
      },
    } as unknown as Db;

    const controller = new PayerMandateController(db);
    await assert.rejects(
      controller.create('a'.repeat(43), {
        rail: 'enach',
        idempotencyKey: firstKey,
      }),
      /outcome is uncertain/i,
    );
    assert.equal(status, 'uncertain');
    assert.deepEqual(auditEvents, ['fees.mandate_setup.uncertain']);

    await assert.rejects(
      controller.create('a'.repeat(43), {
        rail: 'enach',
        idempotencyKey: firstKey,
      }),
      /no longer reusable/i,
    );
    await assert.rejects(
      controller.create('a'.repeat(43), {
        rail: 'enach',
        idempotencyKey: secondKey,
      }),
      /already in progress/i,
    );
    assert.equal(inserts, 1);
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    keys.forEach((key, index) => {
      if (previous[index] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[index];
      }
    });
  }
});
