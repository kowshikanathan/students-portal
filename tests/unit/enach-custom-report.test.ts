import assert from 'node:assert/strict';
import test from 'node:test';
import { makeEnachCsv } from '../../apps/web/src/components/admin/enach-extras';

test('eNACH report uses the selected columns and preserves literal commas and quotes', () => {
  const result = makeEnachCsv(
    [{ account_reference: 'STU001', status: 'active', note: 'North, "Block A"' }],
    [
      { key: 'account_reference', title: 'Account reference' },
      { key: 'note', title: 'Custom field' },
    ],
  );
  assert.equal(
    result,
    '"Account reference","Custom field"\r\n"STU001","North, ""Block A"""',
  );
  assert.ok(!result.includes('"active"'));
});

test('eNACH CSV neutralizes spreadsheet formulas without changing ordinary numbers', () => {
  const result = makeEnachCsv(
    [
      { value: '=HYPERLINK("https://invalid.example","click")' },
      { value: '+cmd' },
      { value: '-1+2' },
      { value: '@SUM(1)' },
      { value: '1000' },
    ],
    [{ key: 'value', title: 'Value' }],
  );
  const lines = result.split('\r\n');
  assert.ok(lines[1]?.startsWith('"\'='));
  assert.ok(lines[2]?.startsWith('"\'+'));
  assert.ok(lines[3]?.startsWith('"\'-'));
  assert.ok(lines[4]?.startsWith('"\'@'));
  assert.equal(lines[5], '"1000"');
});

test('empty eNACH report includes headers without fake transactions', () => {
  const result = makeEnachCsv([], [{ key: 'status', title: 'Status' }]);
  assert.equal(result, '"Status"');
});
