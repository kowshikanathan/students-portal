import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBulkCsv } from '../../packages/core/src/bulk-csv';
test('finance CSV preserves quoted commas, escaped quotes and embedded newlines', () => {
  assert.deepEqual(
    parseBulkCsv('\uFEFFstudentReference,note\r\nST-1,"Name, ""quoted""\nnext line"\r\n'),
    [{ studentReference: 'ST-1', note: 'Name, "quoted"\nnext line' }],
  );
});
test('invalid finance CSV fails rather than silently shifting columns', () => {
  for (const source of ['id,id\n1,2', 'id,name\n1', 'id,name\n1,"unclosed', 'id,name\n1,"x"bad'])
    assert.throws(() => parseBulkCsv(source));
});
