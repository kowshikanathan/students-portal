/**
 * Sidebar visibility is a presentation safeguard, not a substitute for
 * server-side tenant authorization. Keep one consistent active-role policy.
 */
export const allowedAdminAreas: Record<string, readonly string[]> = {
  owner: [
    'overview',
    'academic-tools',
    'debits',
    'failed-debits',
    'installments',
    'payments',
    'settlements',
    'cashflow',
    'overdue',
    'reports',
    'bulk',
    'groups',
    'content',
    'leads',
    'enquiries',
    'notifications',
    'collections',
    'fees',
    'enach',
    'fee-plans',
    'academic',
    'tenant',
    'tasks',
    'media',
    'campaigns',
    'workflows',
    'conversations',
    'settings',
    'outbox',
    'audit',
    'privacy-requests',
    'users',
    'integrations',
  ],
  editor: ['overview', 'content', 'media', 'collections'],
  sales: ['overview', 'leads', 'enquiries', 'notifications', 'tasks'],
  analyst: ['overview'],
};

const financeAreaPermissions: Record<string, string> = {
  overview: 'dashboard.read',
  academic: 'fee.read',
  installments: 'fee.read',
  payments: 'fee.read',
  settlements: 'fee.read',
  enach: 'fee.read',
  cashflow: 'dashboard.read',
  overdue: 'fee.read',
  reports: 'report.read',
  bulk: 'customer.import',
  'academic-tools': 'customer.import',
  groups: 'customer.read',
  'fee-plans': 'fee.read',
  fees: 'fee.read',
  debits: 'fee.read',
  'failed-debits': 'fee.read',
  settings: 'fee.read',
};
export function canViewAdminArea(
  tenantRole: string,
  area: string,
  permissions: readonly string[] = [],
): boolean {
  if (
    area === 'bulk' &&
    ['customer.import', 'fee.plan.manage', 'fee.schedule.edit', 'enach.manage'].some((permission) =>
      permissions.includes(permission),
    )
  )
    return true;
  return (
    (allowedAdminAreas[tenantRole] ?? []).includes(area) ||
    Boolean(financeAreaPermissions[area] && permissions.includes(financeAreaPermissions[area]!))
  );
}

export function safeAdminArea(
  tenantRole: string,
  requestedArea: string,
  permissions: readonly string[] = [],
): string {
  return canViewAdminArea(tenantRole, requestedArea, permissions) ? requestedArea : 'overview';
}
