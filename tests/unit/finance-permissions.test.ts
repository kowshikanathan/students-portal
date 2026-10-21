import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveFinanceGrants,
  financeRoutePermission,
} from '../../packages/core/src/finance-permissions';

test('finance roles cannot use grants to enter unrelated or unknown admin commands', () => {
  assert.equal(financeRoutePermission('/v1/admin/content', 'POST'), null);
  assert.equal(financeRoutePermission('/v1/admin/tenant/roles', 'POST'), null);
  assert.equal(financeRoutePermission('/v1/admin/fees/unknown-command', 'POST'), null);
});
test('finance commands require the appropriate action rather than generic read access', () => {
  assert.equal(financeRoutePermission('/v1/admin/fees/dashboard', 'GET'), 'dashboard.read');
  assert.equal(
    financeRoutePermission('/v1/admin/fees/payments/external-confirmation', 'POST'),
    'payment.evidence.record',
  );
  assert.equal(
    financeRoutePermission('/v1/admin/fees/schedules/id/flex', 'POST'),
    'fee.schedule.edit',
  );
  assert.equal(
    financeRoutePermission('/v1/admin/fees/sandbox/debits/id/resolve', 'POST'),
    'enach.recover',
  );
  assert.equal(financeRoutePermission('/v1/admin/fees/refunds', 'POST'), 'refund.approve');
});
test('explicit published denials override grants and malformed roles grant nothing', () => {
  assert.deepEqual(
    effectiveFinanceGrants(
      ['fee.read', 'payment.evidence.record', 'fee.read'],
      ['payment.evidence.record'],
    ),
    ['fee.read'],
  );
  assert.deepEqual(effectiveFinanceGrants(null, []), []);
});
