import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directPaymentDetailsSchema } from '../../packages/core/src/contracts';

test('cash requires no irrelevant bank fields and transfer evidence requires a bank', () => {
  assert.ok(
    directPaymentDetailsSchema.safeParse({ mode: 'cash', transactionDate: '2026-10-21' }).success,
  );
  assert.equal(
    directPaymentDetailsSchema.safeParse({
      mode: 'cash',
      transactionDate: '2026-10-21',
      bankName: 'Synthetic Bank',
    }).success,
    false,
  );
  for (const mode of ['neft', 'rtgs', 'imps']) {
    assert.equal(
      directPaymentDetailsSchema.safeParse({ mode, transactionDate: '2026-10-21' }).success,
      false,
    );
    assert.ok(
      directPaymentDetailsSchema.safeParse({
        mode,
        transactionDate: '2026-10-21',
        bankName: 'Synthetic Bank',
      }).success,
    );
  }
});
test('cheque and DD require dated instrument evidence and valid calendar dates', () => {
  for (const mode of ['cheque', 'dd']) {
    const fields = { mode, transactionDate: '2026-10-21', bankName: 'Synthetic Bank' };
    assert.equal(directPaymentDetailsSchema.safeParse(fields).success, false);
    assert.ok(
      directPaymentDetailsSchema.safeParse({
        ...fields,
        instrumentNumber: 'TEST-123',
        instrumentDate: '2026-10-20',
      }).success,
    );
  }
  assert.equal(
    directPaymentDetailsSchema.safeParse({ mode: 'cash', transactionDate: '2026-02-30' }).success,
    false,
  );
});
