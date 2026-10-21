import type { PoolClient } from 'pg';
import { decrypt, encrypt } from '../../../packages/core/src/security';
import { Db } from './db';

/** Transactional receipts reuse the schedule's payer, with an explicitly linked student/guardian fallback. */
export async function receiptContact(
  c: PoolClient,
  db: Db,
  tenantId: string,
  scheduleId: string,
  actor: string,
) {
  const row = (
    await c.query(
      `SELECT s.payer_id,s.account_reference,s.created_by,p.encrypted_profile
    FROM fee_schedules s LEFT JOIN fee_payers p ON p.id=s.payer_id AND p.tenant_id=s.tenant_id
    WHERE s.id=$1 AND s.tenant_id=$2`,
      [scheduleId, tenantId],
    )
  ).rows[0];
  if (!row) return {};
  if (row.encrypted_profile) {
    const profile = decrypt<{ email?: string }>(row.encrypted_profile);
    if (profile.email) return { payer_id: row.payer_id, preferred_channel: 'email' };
    return {};
  }
  const linked = (
    await c.query(
      `SELECT ast.full_name,coalesce(g.email,ast.email) AS email,g.display_name
    FROM student_fee_plan_assignments a JOIN academic_students ast ON ast.id=a.student_id AND ast.tenant_id=a.tenant_id
    LEFT JOIN LATERAL(SELECT ag.email,ag.display_name FROM academic_guardian_links l
      JOIN academic_guardians ag ON ag.id=l.guardian_id AND ag.tenant_id=l.tenant_id
      WHERE l.student_id=ast.id AND l.tenant_id=ast.tenant_id AND l.visibility_status='active'
        AND ag.verification_status<>'revoked' AND ag.email IS NOT NULL
      ORDER BY CASE WHEN l.payer_role='primary' THEN 0 ELSE 1 END,l.created_at LIMIT 1) g ON true
    WHERE a.schedule_id=$1 AND a.tenant_id=$2 ORDER BY a.assigned_on DESC LIMIT 1`,
      [scheduleId, tenantId],
    )
  ).rows[0];
  if (!linked?.email) return {};
  const payer = (
    await c.query(
      `INSERT INTO fee_payers(tenant_id,account_reference,encrypted_profile,preferred_channel,created_by)
    VALUES($1,$2,$3,'email',$4) ON CONFLICT(tenant_id,account_reference) DO UPDATE SET updated_at=fee_payers.updated_at
    RETURNING id,encrypted_profile,active`,
      [
        tenantId,
        row.account_reference,
        encrypt({
          accountReference: row.account_reference,
          displayName: linked.display_name || linked.full_name,
          email: linked.email,
          locale: 'en-IN',
          preferredChannel: 'email',
        }),
        row.created_by,
      ],
    )
  ).rows[0];
  if (!payer.active) return {};
  await c.query('UPDATE fee_schedules SET payer_id=$1 WHERE id=$2 AND tenant_id=$3', [
    payer.id,
    scheduleId,
    tenantId,
  ]);
  await db.audit(c, actor, 'fees.receipt.payer_linked', scheduleId, {
    tenantId,
    payerId: payer.id,
  });
  const profile = decrypt<{ email?: string }>(payer.encrypted_profile);
  return { payer_id: payer.id, preferred_channel: profile.email ? 'email' : 'none' };
}
