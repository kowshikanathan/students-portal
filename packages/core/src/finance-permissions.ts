/** Only explicitly recognized finance routes can use published tenant grants. */
export function financeRoutePermission(path: string, method: string): string | null {
  const read = ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  if (/^\/v1\/admin\/fees(?:\/|$)/.test(path)) {
    if (path.startsWith('/v1/admin/fees/bulk/export/')) return 'report.read';
    if (path.startsWith('/v1/admin/fees/bulk/')) return 'fee.read';
    if (read) return path.endsWith('/dashboard') ? 'dashboard.read' : 'fee.read';
    if (path.includes('/sandbox/') && /\/recovery$|\/resolve$/.test(path)) return 'enach.recover';
    if (path.includes('/sandbox/')) return 'enach.manage';
    if (path.endsWith('/flex')) return 'fee.schedule.edit';
    if (/\/payer-link$|\/revoke-payer-links$/.test(path)) return 'payer.manage';
    if (/\/schedules$|\/schedules\/[^/]+\/activate$/.test(path)) return 'fee.plan.manage';
    if (/\/payments(?:\/|$)/.test(path)) return 'payment.evidence.record';
    if (path.endsWith('/refunds')) return 'refund.approve';
    if (path.includes('/settings/')) return read ? 'fee.read' : 'fee.plan.manage';
    if (path.includes('/settlements')) return 'settlement.manage';
    if (path.includes('/reconciliation')) return 'reconciliation.manage';
    return null;
  }
  if (/^\/v1\/admin\/academic(?:\/|$)/.test(path)) {
    if (read) return 'customer.read';
    if (/\/students$/.test(path)) return 'customer.create';
    if (path.includes('/imports'))
      return path.endsWith('/commit') ? 'import.commit' : 'customer.import';
    if (path.includes('/catalogue')) return 'catalogue.edit';
    return null;
  }
  if (/^\/v1\/admin\/fee-plans(?:\/|$)/.test(path)) {
    if (read) return 'fee.read';
    if (path.includes('/adjustments') && !path.endsWith('/decide')) return 'fee.adjust.request';
    if (/\/decide$|\/approve$/.test(path)) return 'approval.decide';
    return 'fee.plan.manage';
  }
  if (/^\/v1\/admin\/payers(?:\/|$)/.test(path)) return read ? 'fee.read' : 'payer.manage';
  return null;
}

export function effectiveFinanceGrants(grants: unknown, denies: unknown): string[] {
  if (!Array.isArray(grants)) return [];
  const blocked = new Set(Array.isArray(denies) ? denies : []);
  return [
    ...new Set(
      grants.filter((grant): grant is string => typeof grant === 'string' && !blocked.has(grant)),
    ),
  ];
}
