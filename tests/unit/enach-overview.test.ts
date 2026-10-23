import assert from 'node:assert/strict';
import test from 'node:test';
import { EnachOverviewController, overviewFilters } from '../../apps/api/src/enach-overview';
import type { AuthedRequest } from '../../apps/api/src/auth';
import type { Db } from '../../apps/api/src/db';

test('overview rejects invalid dates, inverted windows and unbounded ranges', () => {
  for (const v of [
    { period: 'custom' },
    { period: 'custom', from: '2026-02-30', to: '2026-03-01' },
    { period: 'custom', from: '2026-10-20', to: '2026-10-01' },
    { period: 'custom', from: '2020-01-01', to: '2026-01-01' },
    { branchId: 'another-campus' },
  ])
    assert.equal(overviewFilters.safeParse(v).success, false);
  assert.equal(overviewFilters.parse({}).period, 'month');
});
test('overview and drilldown bind tenant and filter values without interpolating them', async () => {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    query: async (sql: string, args: unknown[]) => {
      calls.push({ sql, args });
      return [{ result: { summary: {} } }];
    },
  } as unknown as Db;
  const c = new EnachOverviewController(db);
  const req = { actor: { tenantId: 'tenant-a' } } as AuthedRequest;
  await c.overview(req, { period: 'today' });
  assert.deepEqual(calls[0]!.args, ['tenant-a', 'today', null, null, null, null]);
  await c.records(req, { kind: 'overdue', page: '2' });
  assert.equal(calls[1]!.args[0], 'tenant-a');
  assert.equal(calls[1]!.args[6], 50);
  assert.match(calls[1]!.sql, /outstanding>0/);
  await assert.rejects(() => c.records(req, { kind: 'payments; DROP TABLE users' }));
});
