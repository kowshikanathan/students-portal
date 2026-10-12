import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { AutopayAdminController } from '../../apps/api/src/mandate-autopay';
import type { Db } from '../../apps/api/src/db';
import type { AuthedRequest } from '../../apps/api/src/auth';

const setupId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const request = {
  actor: { id: actorId, tenantId },
} as AuthedRequest;
const input = {
  providerCaseReference: 'CASE-12345',
  evidenceSummary: 'provider_inquiry_opened',
};

function mockDb(state: 'missing' | 'active' | 'uncertain', duplicate = false) {
  const queries: Array<{ sql: string; args: unknown[] }> = [];
  const audits: string[] = [];
  const db = {
    tx: async (work: any) =>
      work({
        query: async (sql: string, args: unknown[] = []) => {
          queries.push({ sql, args });
          if (sql.includes('SELECT id,status FROM payment_mandate_setup_requests')) {
            return { rows: state === 'missing' ? [] : [{ id: setupId, status: state }] };
          }
          if (sql.includes('SELECT id FROM mandate_reconciliation_cases')) {
            return { rows: duplicate ? [{ id: 'existing' }] : [] };
          }
          if (sql.includes('INSERT INTO mandate_reconciliation_cases')) {
            return {
              rows: [
                {
                  id: '44444444-4444-4444-8444-444444444444',
                  setup_id: setupId,
                  status: 'open',
                },
              ],
            };
          }
          throw new Error('Unexpected query: ' + sql);
        },
      }),
    audit: async (_client: unknown, _actor: string, action: string) => {
      audits.push(action);
    },
  } as unknown as Db;
  return { db, queries, audits };
}

test('cannot open an eNACH case for a missing or non-uncertain setup', async () => {
  for (const state of ['missing', 'active'] as const) {
    const { db, queries, audits } = mockDb(state);
    await assert.rejects(
      new AutopayAdminController(db).openReconciliationCase(request, setupId, input),
    );
    assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO')), false);
    assert.deepEqual(audits, []);
  }
});

test('one uncertain eNACH setup accepts only one investigation case', async () => {
  const { db, queries, audits } = mockDb('uncertain');
  const result = await new AutopayAdminController(db).openReconciliationCase(
    request,
    setupId,
    input,
  );
  assert.equal(result.status, 'open');
  assert.deepEqual(audits, ['fees.mandate_reconciliation.opened']);
  const insert = queries.find(({ sql }) =>
    sql.includes('INSERT INTO mandate_reconciliation_cases'),
  );
  assert.ok(insert);
  assert.equal(insert.args[0], tenantId);
  assert.equal(insert.args[1], setupId);
  assert.equal(insert.args[4], actorId);
  assert.equal(
    queries.some(({ sql }) => sql.includes('UPDATE payment_mandate_setup_requests')),
    false,
  );

  const duplicate = mockDb('uncertain', true);
  await assert.rejects(
    new AutopayAdminController(duplicate.db).openReconciliationCase(request, setupId, input),
    /already exists/i,
  );
  assert.equal(duplicate.queries.some(({ sql }) => sql.includes('INSERT INTO')), false);
  assert.deepEqual(duplicate.audits, []);
});

test('provider reconciliation reference and reason must pass strict validation', async () => {
  const { db, queries } = mockDb('uncertain');
  await assert.rejects(
    new AutopayAdminController(db).openReconciliationCase(request, setupId, {
      providerCaseReference: 'SECRET INFO WITH SPACES',
      evidenceSummary: 'provider_inquiry_opened',
    }),
  );
  await assert.rejects(
    new AutopayAdminController(db).openReconciliationCase(request, setupId, {
      providerCaseReference: 'CASE-12345',
      evidenceSummary: 'mark_payment_success',
    }),
  );
  assert.deepEqual(queries, []);
});
