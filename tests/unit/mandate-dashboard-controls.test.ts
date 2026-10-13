import assert from 'node:assert/strict';
import test from 'node:test';
import {
  eligiblePayerSchedules,
  mandateAccount,
  mandateRows,
  mandateStatus,
  mandateViews,
} from '../../apps/web/src/components/admin/mandate-view-model';

test('each mandate button points to the matching backend-backed collection', () => {
  const data = {
    mandates: [{ id: 'm1' }],
    setups: [{ id: 's1' }],
    debits: [{ id: 'd1' }],
    settlements: [{ id: 't1' }],
    checkouts: [{ id: 'c1' }],
  };
  for (const view of mandateViews) {
    assert.equal(mandateRows(data, view.id).length, 1);
  }
  assert.equal(mandateRows(data, 'setups')[0].id, 's1');
  assert.equal(mandateRows(data, 'debits')[0].id, 'd1');
});

test('payer authorization links are restricted to active payer-owned schedules', () => {
  const schedules = [
    { id: 'a', status: 'active', payer_id: 'p1' },
    { id: 'b', status: 'draft', payer_id: 'p2' },
    { id: 'c', status: 'active', payer_id: null },
  ];
  assert.deepEqual(eligiblePayerSchedules(schedules).map((row) => row.id), ['a']);
});

test('present empty records without inventing a provider state', () => {
  assert.equal(mandateAccount({}), 'Reference unavailable');
  assert.equal(mandateStatus({}), 'Unknown');
  assert.equal(mandateStatus({ status: 'uncertain' }), 'uncertain');
});
