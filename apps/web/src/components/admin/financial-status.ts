export function financialStatusClass(status: unknown): string {
  const value = String(status || '').toLowerCase().trim();
  if (['failed', 'overdue', 'rejected', 'invalid', 'withdrawn', 'bad'].includes(value))
    return 'status-pill bad';
  if (
    [
      'pending',
      'queued',
      'scheduled',
      'submitted',
      'uncertain',
      'part_paid',
      'needs_review',
      'unmatched',
      'open',
      'contacted',
      'warn',
      'warning',
    ].includes(value)
  )
    return 'status-pill warn';
  if (
    [
      'cancelled',
      'revoked',
      'paused',
      'refunded',
      'not_applied',
      'inactive',
      'not_registered',
      'draft',
      'graduated',
      'neutral',
    ].includes(value)
  )
    return 'status-pill neutral';
  return 'status-pill success';
}
