import { z } from 'zod';

const minor = z.number().int().positive().max(1_000_000_000_000);
export const generatedScheduleSchema = z
  .object({
    startDate: z.iso.date(),
    count: z.number().int().min(1).max(60),
    frequency: z.enum(['monthly', 'quarterly', 'custom']).default('monthly'),
    dueDay: z.number().int().min(1).max(31).optional(),
    amountsMinor: z.array(minor).max(60).optional(),
    customDates: z.array(z.iso.date()).max(60).optional(),
    downPaymentMinor: z.number().int().min(0).max(1_000_000_000_000).default(0),
    downPaymentDate: z.iso.date().optional(),
    excludedDates: z.array(z.iso.date()).max(366).default([]),
    weekendPolicy: z.enum(['none', 'next_weekday']).default('none'),
  })
  .strict();
export type GeneratedScheduleInput = z.input<typeof generatedScheduleSchema>;

/** Pure calendar generation. No bank holiday calendar or provider eligibility is implied. */
export function generateInstallments(totalMinor: number, raw: GeneratedScheduleInput) {
  minor.parse(totalMinor);
  const v = generatedScheduleSchema.parse(raw);
  if (v.downPaymentMinor >= totalMinor)
    throw Error('Down payment must be smaller than the fee total');
  if (v.downPaymentMinor > 0 && (!v.downPaymentDate || v.downPaymentDate >= v.startDate))
    throw Error('A down-payment date before the first regular instalment is required');
  if (v.frequency === 'custom' && v.customDates?.length !== v.count)
    throw Error('Provide one custom date per instalment');
  if (v.frequency !== 'custom' && v.customDates)
    throw Error('Custom dates require a custom frequency');
  if (v.amountsMinor && v.amountsMinor.length !== v.count)
    throw Error('Provide one amount per regular instalment');
  const balance = totalMinor - v.downPaymentMinor;
  const base = Math.floor(balance / v.count);
  if (base < 1) throw Error('The balance must cover each instalment in minor units');
  const amounts =
    v.amountsMinor ||
    Array.from({ length: v.count }, (_, i) =>
      i === v.count - 1 ? balance - base * (v.count - 1) : base,
    );
  if (amounts.reduce((a, b) => a + b, 0) !== balance)
    throw Error('Regular instalments plus down payment must equal the fee total');
  const anchor = new Date(v.startDate + 'T00:00:00Z');
  const anchorDay = v.dueDay || anchor.getUTCDate();
  const excluded = new Set(v.excludedDates);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const adjust = (value: string) => {
    const d = new Date(value + 'T00:00:00Z');
    for (let shifts = 0; shifts <= 370; shifts++) {
      if (
        !excluded.has(iso(d)) &&
        !(v.weekendPolicy === 'next_weekday' && [0, 6].includes(d.getUTCDay()))
      )
        return iso(d);
      d.setUTCDate(d.getUTCDate() + 1);
    }
    throw Error('No permitted collection date in the configured calendar');
  };
  const rows = amounts.map((amountMinor, i) => {
    let dueDate: string;
    if (v.frequency === 'custom') dueDate = v.customDates![i]!;
    else {
      const month = new Date(
        Date.UTC(
          anchor.getUTCFullYear(),
          anchor.getUTCMonth() + i * (v.frequency === 'quarterly' ? 3 : 1),
          1,
        ),
      );
      const last = new Date(
        Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
      ).getUTCDate();
      month.setUTCDate(Math.min(anchorDay, last));
      dueDate = iso(month);
    }
    if (dueDate < v.startDate) throw Error('A generated due date precedes the chosen start date');
    return { dueDate: adjust(dueDate), amountMinor };
  });
  if (v.downPaymentMinor > 0)
    rows.unshift({ dueDate: adjust(v.downPaymentDate!), amountMinor: v.downPaymentMinor });
  if (rows.length > 60)
    throw Error('At most 60 instalments including the down payment are supported');
  if (rows.some((r, i) => i > 0 && r.dueDate <= rows[i - 1]!.dueDate))
    throw Error('Adjusted dates must be strictly increasing; review the calendar');
  rows.forEach((r) => z.iso.date().parse(r.dueDate));
  return rows;
}
