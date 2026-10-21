export const mandateViews = [
  { id: 'mandates', label: 'Mandates' },
  { id: 'setups', label: 'Setup attempts' },
  { id: 'debits', label: 'Automatic debits' },
  { id: 'settlements', label: 'Settlements' },
  { id: 'checkouts', label: 'Checkouts' },
] as const;

export type MandateView = (typeof mandateViews)[number]['id'];

export type MandateDashboardData = {
  mandates: Record<string, any>[];
  setups: Record<string, any>[];
  debits: Record<string, any>[];
  settlements: Record<string, any>[];
  checkouts: Record<string, any>[];
};

export function mandateRows(data: MandateDashboardData, view: MandateView) {
  const rows = {
    mandates: data.mandates,
    setups: data.setups,
    debits: data.debits,
    settlements: data.settlements,
    checkouts: data.checkouts,
  } satisfies Record<MandateView, Record<string, any>[]>;
  return rows[view];
}

export function mandateAccount(row: Record<string, any>): string {
  return String(row.account_reference || row.provider_reference || 'Reference unavailable');
}

export function mandateStatus(row: Record<string, any>): string {
  return String(row.status || 'Unknown');
}

export function eligiblePayerSchedules<
  T extends { id: string; payer_id?: string | null; status: string },
>(schedules: T[]) {
  return schedules.filter((row) => row.status === 'active' && Boolean(row.payer_id));
}
