import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PayerMandateController } from '../../apps/api/src/mandate-autopay';
import type { Db } from '../../apps/api/src/db';

const providerReference = 'bank-mandate-signed-123';
const access = {
  schedule_id: '11111111-1111-4111-8111-111111111111',
  tenant_id: '22222222-2222-4222-8222-222222222222',
  payer_id: '33333333-3333-4333-8333-333333333333',
  account_reference: 'QA-123',
  currency: 'INR',
  total_amount_minor: '50000',
  status: 'active',
  active: true,
};

for (const earlyStatus of ['active', 'created'] as const) {
  test(`an early signed mandate callback (${earlyStatus}) cannot be overwritten by its HTTP response`, async () => {
    const env = {
      mode: process.env.AUTOPAY_PROVIDER_MODE,
      createUrl: process.env.AUTOPAY_MANDATE_CREATE_URL,
      allowedHosts: process.env.AUTOPAY_ALLOWED_HOSTS,
      apiKey: process.env.AUTOPAY_API_KEY,
      provider: process.env.PAYMENT_PROVIDER_NAME,
      site: process.env.SITE_URL,
    };
    const previousFetch = globalThis.fetch;
    const updates: string[] = [];
    process.env.AUTOPAY_PROVIDER_MODE = 'mandate_api';
    process.env.AUTOPAY_MANDATE_CREATE_URL = 'https://bank.example.invalid/mandates';
    process.env.AUTOPAY_ALLOWED_HOSTS = 'bank.example.invalid';
    process.env.AUTOPAY_API_KEY = 'synthetic-test-key';
    process.env.PAYMENT_PROVIDER_NAME = 'synthetic_bank';
    process.env.SITE_URL = 'https://client.example.test';

    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.redirect, 'error');
      return new Response(
        JSON.stringify({
          providerReference,
          authorizationUrl: 'https://bank.example.invalid/authorize',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const db = {
      query: async (sql: string) => {
        if (sql.includes('FROM payer_access_tokens')) return [access];
        if (sql.includes('FROM payment_mandate_setup_requests')) return [];
        throw new Error('Unexpected read: ' + sql);
      },
      tx: async (callback: (client: object) => Promise<unknown>) =>
        callback({
          query: async (sql: string) => {
            if (sql.includes('INSERT INTO payment_mandate_setup_requests'))
              return { rows: [{ id: '44444444-4444-4444-8444-444444444444' }], rowCount: 1 };
            if (sql.includes('UPDATE payment_mandate_setup_requests')) {
              updates.push(sql);
              if (sql.includes("status='requested'")) return { rows: [], rowCount: 0 };
              if (earlyStatus === 'created')
                return {
                  rows: [
                    {
                      id: '44444444-4444-4444-8444-444444444444',
                      status: 'created',
                      authorization_url: 'https://bank.example.invalid/authorize',
                      expires_at: null,
                    },
                  ],
                  rowCount: 1,
                };
            }
            if (sql.includes('SELECT id,status,provider_reference,authorization_url,expires_at'))
              return {
                rows: [
                  {
                    id: '44444444-4444-4444-8444-444444444444',
                    status: earlyStatus,
                    provider_reference: providerReference,
                    authorization_url: null,
                    expires_at: null,
                  },
                ],
                rowCount: 1,
              };
            return { rows: [], rowCount: 0 };
          },
        }),
      audit: async () => {},
    } as unknown as Db;

    try {
      const controller = new PayerMandateController(db);
      const result = await controller.create('a'.repeat(43), {
        rail: 'enach',
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
      });
      assert.equal(result.status, earlyStatus);
      if (earlyStatus === 'active') {
        assert.match(
          result.authorizationUrl,
          /^https:\/\/client\.example\.test\/mandate\/return\//,
        );
      } else {
        assert.equal(result.authorizationUrl, 'https://bank.example.invalid/authorize');
        assert.ok(updates.some((sql) => sql.includes('authorization_url IS NULL')));
      }
      assert.ok(!updates.some((sql) => sql.includes("status='failed'")));
    } finally {
      globalThis.fetch = previousFetch;
      for (const [key, value] of Object.entries({
        AUTOPAY_PROVIDER_MODE: env.mode,
        AUTOPAY_MANDATE_CREATE_URL: env.createUrl,
        AUTOPAY_ALLOWED_HOSTS: env.allowedHosts,
        AUTOPAY_API_KEY: env.apiKey,
        PAYMENT_PROVIDER_NAME: env.provider,
        SITE_URL: env.site,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}
