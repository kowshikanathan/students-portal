import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInstallments } from '../../packages/core/src/installment-schedule';

test('60000 INR automatically produces six monthly 10000 INR instalments', () => {
  const rows = generateInstallments(6000000, { startDate: '2026-10-31', count: 6 });
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.amountMinor === 1000000));
  assert.deepEqual(
    rows.map((r) => r.dueDate),
    ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31'],
  );
});
test('rounding is exact, quarterly dates preserve their anchor and leap days are clamped', () => {
  const rows = generateInstallments(10001, {
    startDate: '2027-11-30',
    count: 3,
    frequency: 'quarterly',
  });
  assert.deepEqual(
    rows.map((r) => r.amountMinor),
    [3333, 3333, 3335],
  );
  assert.deepEqual(
    rows.map((r) => r.dueDate),
    ['2027-11-30', '2028-02-29', '2028-05-30'],
  );
});
test('down payments, configured exclusions, weekends and variable custom amounts remain exact', () => {
  const rows = generateInstallments(10000, {
    startDate: '2026-10-31',
    count: 2,
    frequency: 'custom',
    customDates: ['2026-10-31', '2026-12-01'],
    amountsMinor: [3000, 5000],
    downPaymentMinor: 2000,
    downPaymentDate: '2026-10-01',
    weekendPolicy: 'next_weekday',
    excludedDates: ['2026-11-02'],
  });
  assert.deepEqual(rows, [
    { dueDate: '2026-10-01', amountMinor: 2000 },
    { dueDate: '2026-11-03', amountMinor: 3000 },
    { dueDate: '2026-12-01', amountMinor: 5000 },
  ]);
});
test('reject invalid dates, zero amounts, mismatched totals and overlapping adjusted dates', () => {
  assert.throws(() => generateInstallments(100, { startDate: '2026-02-30', count: 2 }));
  assert.throws(() => generateInstallments(1, { startDate: '2026-01-01', count: 2 }));
  assert.throws(() =>
    generateInstallments(100, { startDate: '2026-01-01', count: 2, amountsMinor: [20, 30] }),
  );
  assert.throws(() =>
    generateInstallments(100, {
      startDate: '2026-10-31',
      count: 2,
      frequency: 'custom',
      customDates: ['2026-10-31', '2026-11-01'],
      weekendPolicy: 'next_weekday',
    }),
  );
  assert.throws(() =>
    generateInstallments(100, { startDate: '2026-01-01', count: 2, downPaymentMinor: 100 }),
  );
});
