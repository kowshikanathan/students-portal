export function financialStatusClass(status: unknown): string {
  const value = String(status);
  if (['failed', 'overdue', 'rejected', 'invalid'].includes(value)) return 'status-pill bad';
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
    ].includes(value)
  )
    return 'status-pill warn';
  if (['cancelled', 'revoked', 'paused', 'refunded', 'not_applied'].includes(value))
    return 'status-pill neutral';
  return 'status-pill';
}
