import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { AutopayAdminController } from '../../apps/api/src/mandate-autopay';
import type { AuthedRequest } from '../../apps/api/src/auth';

const tenantId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const caseId = '44444444-4444-4444-8444-444444444444';
const setupId = '55555555-5555-4555-8555-555555555555';
const scheduleId = '66666666-6666-4666-8666-666666666666';
const req = { actor: { id: actorId, tenantId } } as AuthedRequest;

test('provider reconciliation inquiry creates reviewed-later evidence, never changes mandates', async () => {
  const old = {
    mode: process.env.AUTOPAY_RECONCILE_MODE,
    url: process.env.AUTOPAY_RECONCILE_URL,
    hosts: process.env.AUTOPAY_ALLOWED_HOSTS,
    provider: process.env.PAYMENT_PROVIDER_NAME,
    apiKey: process.env.AUTOPAY_API_KEY,
    deployment: process.env.DEPLOYMENT_MODE,
  };
  const originalFetch = globalThis.fetch;
  const queries: string[] = [];
  const audits: string[] = [];
  const httpRequests: Array<{ url: string; init: RequestInit }> = [];
  const db = {
    query: async (sql: string, args: unknown[]) => {
      queries.push(sql);
      assert.equal(args[1], tenantId);
      return [
        {
          id: caseId,
          setup_id: setupId,
          schedule_id: scheduleId,
          provider: 'qa_enach_gateway',
          rail: 'enach',
        },
      ];
    },
    tx: async (
      fn: (c: {
        query: (sql: string, args: unknown[]) => Promise<{ rows: unknown[] }>;
      }) => Promise<unknown>,
    ) =>
      fn({
        query: async (sql: string, args: unknown[]) => {
          queries.push(sql);
          if (sql.includes('SELECT c.id FROM mandate_reconciliation_cases')) {
            assert.deepEqual(args, [caseId, tenantId, 'qa_enach_gateway']);
            return { rows: [{ id: caseId }] };
          }
          if (sql.includes('INSERT INTO mandate_reconciliation_evidence')) {
            assert.deepEqual(args, [
              tenantId,
              caseId,
              'BANK-TRACE-123',
              'provider_reports_registered',
              actorId,
            ]);
            return {
              rows: [
                {
                  id: '77777777-7777-4777-8777-777777777777',
                  case_id: caseId,
                  finding: 'provider_reports_registered',
                },
              ],
            };
          }
          throw Error('Unexpected mutation: ' + sql);
        },
      }),
    audit: async (_c: unknown, _actor: string, action: string) => {
      audits.push(action);
    },
  };
  Object.assign(process.env, {
    AUTOPAY_RECONCILE_MODE: 'read_only',
    AUTOPAY_RECONCILE_URL: 'http://127.0.0.1:8818/inquiry',
    AUTOPAY_ALLOWED_HOSTS: '127.0.0.1',
    PAYMENT_PROVIDER_NAME: 'qa_enach_gateway',
    AUTOPAY_API_KEY: 'synthetic-test-credential-for-inquiry',
    DEPLOYMENT_MODE: 'demo',
  });
  globalThis.fetch = async (url, init) => {
    httpRequests.push({ url: String(url), init: init || {} });
    return new Response(
      JSON.stringify({
        inquiryReference: 'BANK-TRACE-123',
        outcome: 'registered',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
  try {
    const controller = new AutopayAdminController(db as never);
    const evidence = await controller.inquireReconciliationProvider(req, caseId);
    assert.equal(evidence.finding, 'provider_reports_registered');
    assert.equal(httpRequests.length, 1);
    assert.equal(httpRequests[0].init.method, 'POST');
    assert.equal(httpRequests[0].init.redirect, 'error');
    assert.deepEqual(JSON.parse(httpRequests[0].init.body as string), {
      merchantSetupId: setupId,
      scheduleId,
      rail: 'enach',
    });
    assert.ok(queries.every((sql) => !sql.includes('UPDATE payment_mandates')));
    assert.ok(queries.every((sql) => !sql.includes('UPDATE payment_mandate_setup_requests')));
    assert.deepEqual(audits, ['fees.mandate_reconciliation.provider_inquiry_recorded']);

    const initialQueryCount = queries.length;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ inquiryReference: 'X'.repeat(17_000) }), {
        headers: { 'Content-Type': 'application/json' },
      });
    await assert.rejects(
      controller.inquireReconciliationProvider(req, caseId),
      /Provider inquiry unavailable/,
    );
    assert.equal(queries.length, initialQueryCount + 1);
    assert.equal(
      audits.length,
      1,
      'oversized provider responses must never be recorded as financial evidence',
    );

    globalThis.fetch = async () =>
      new Response('<html>Not a bank inquiry</html>', {
        headers: { 'Content-Type': 'text/html' },
      });
    await assert.rejects(
      controller.inquireReconciliationProvider(req, caseId),
      /Provider inquiry unavailable/,
    );
    assert.equal(audits.length, 1);

    process.env.AUTOPAY_RECONCILE_MODE = 'disabled';
    await assert.rejects(
      controller.inquireReconciliationProvider(req, caseId),
      /Provider reconciliation inquiries are disabled/,
    );
    assert.equal(httpRequests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of [
      ['AUTOPAY_RECONCILE_MODE', old.mode],
      ['AUTOPAY_RECONCILE_URL', old.url],
      ['AUTOPAY_ALLOWED_HOSTS', old.hosts],
      ['PAYMENT_PROVIDER_NAME', old.provider],
      ['AUTOPAY_API_KEY', old.apiKey],
      ['DEPLOYMENT_MODE', old.deployment],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
