import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Db } from './db';
import { AuthGuard, AuthedRequest, Roles } from './auth';

const actionSchema = z
  .object({
    idempotencyKey: z.uuid(),
    version: z.number().int().min(0),
    status: z.enum(['open', 'following_up', 'closed']),
    assignedTo: z.uuid().nullable().default(null),
    nextFollowupOn: z.iso.date().nullable().default(null),
    note: z.string().trim().min(3).max(500),
  })
  .strict();
@Controller('v1/admin/enach/recovery')
@UseGuards(AuthGuard)
@Roles('owner')
export class EnachRecoveryController {
  constructor(@Inject(Db) private db: Db) {}
  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: unknown) {
    const v = z
      .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
      .strict()
      .parse(query);
    return this.db.query(
      `SELECT i.id AS installment_id,i.schedule_id,s.account_reference,i.due_date,
    greatest(0,i.amount_minor-i.adjustment_amount_minor-i.paid_amount_minor)::text AS outstanding_minor,
    CASE WHEN i.status='paid' THEN 'paid_in_ledger' ELSE 'outstanding' END AS recovery_state,
    a.id AS attempt_id,a.failure_code,a.attempt_no,a.next_retry_at,a.created_at AS failed_at,
    c.id AS case_id,coalesce(c.status,'not_assigned') AS followup_status,coalesce(c.version,0) AS version,c.assigned_to,c.next_followup_on,
    EXISTS(SELECT 1 FROM autopay_debit_attempts pending WHERE pending.installment_id=i.id AND pending.tenant_id=$1 AND pending.status IN('queued','submitted','uncertain')) AS debit_pending
    FROM fee_installments i JOIN fee_schedules s ON s.id=i.schedule_id AND s.tenant_id=i.tenant_id
    JOIN LATERAL(SELECT * FROM autopay_debit_attempts d WHERE d.installment_id=i.id AND d.tenant_id=$1 AND d.status='failed' ORDER BY d.attempt_no DESC LIMIT 1) a ON true
    LEFT JOIN enach_recovery_cases c ON c.installment_id=i.id AND c.tenant_id=i.tenant_id
    WHERE i.tenant_id=$1 ORDER BY i.due_date,i.id LIMIT 50 OFFSET $2`,
      [req.actor.tenantId, (v.page - 1) * 50],
    );
  }
  @Get('assignees')
  async assignees(@Req() req: AuthedRequest) {
    return this.db.query(
      `SELECT u.id,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.status='active' AND u.active=true ORDER BY u.email`,
      [req.actor.tenantId],
    );
  }
  @Get(':installmentId/history')
  async history(@Req() req: AuthedRequest, @Param('installmentId') id: string) {
    const installmentId = z.uuid().parse(id);
    const [actions, communications] = await Promise.all([
      this.db.query(
        `SELECT a.id,a.action,a.note,a.created_at FROM enach_recovery_actions a JOIN enach_recovery_cases c ON c.id=a.case_id AND c.tenant_id=a.tenant_id WHERE a.tenant_id=$1 AND c.installment_id=$2 ORDER BY a.created_at DESC LIMIT 100`,
        [req.actor.tenantId, installmentId],
      ),
      this.db.query(
        `SELECT id,channel,kind,status,created_at FROM fee_communication_log WHERE tenant_id=$1 AND installment_id=$2 ORDER BY created_at DESC LIMIT 100`,
        [req.actor.tenantId, installmentId],
      ),
    ]);
    return { actions, communications };
  }
  @Post(':installmentId')
  async update(
    @Req() req: AuthedRequest,
    @Param('installmentId') id: string,
    @Body() body: unknown,
  ) {
    const installmentId = z.uuid().parse(id),
      v = actionSchema.parse(body),
      tenantId = req.actor.tenantId;
    const hash = createHash('sha256')
      .update(JSON.stringify({ installmentId, ...v }))
      .digest('hex');
    return this.db.tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        tenantId + ':recovery:' + v.idempotencyKey,
      ]);
      const previous = (
        await c.query(
          'SELECT id,payload_hash FROM enach_recovery_actions WHERE tenant_id=$1 AND idempotency_key=$2',
          [tenantId, v.idempotencyKey],
        )
      ).rows[0];
      if (previous) {
        if (previous.payload_hash !== hash)
          throw new ConflictException('Action key already used with different terms');
        return { actionId: previous.id, replayed: true };
      }
      const installment = (
        await c.query(
          `SELECT i.id FROM fee_installments i WHERE i.id=$1 AND i.tenant_id=$2 AND EXISTS(SELECT 1 FROM autopay_debit_attempts a WHERE a.installment_id=i.id AND a.tenant_id=$2 AND a.status='failed') FOR UPDATE OF i`,
          [installmentId, tenantId],
        )
      ).rows[0];
      if (!installment)
        throw new ConflictException('No failed debit exists for this workspace instalment');
      if (
        v.assignedTo &&
        !(
          await c.query(
            `SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='active' AND u.active=true`,
            [tenantId, v.assignedTo],
          )
        ).rowCount
      )
        throw new ConflictException('Choose an active workspace member');
      const current = (
        await c.query(
          'SELECT id,version FROM enach_recovery_cases WHERE tenant_id=$1 AND installment_id=$2 FOR UPDATE',
          [tenantId, installmentId],
        )
      ).rows[0];
      if (Number(current?.version || 0) !== v.version)
        throw new ConflictException('Recovery case changed; refresh before saving');
      const row = current
        ? (
            await c.query(
              `UPDATE enach_recovery_cases SET status=$3,assigned_to=$4,next_followup_on=$5,version=version+1,updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING id,version`,
              [current.id, tenantId, v.status, v.assignedTo, v.nextFollowupOn],
            )
          ).rows[0]
        : (
            await c.query(
              `INSERT INTO enach_recovery_cases(tenant_id,installment_id,status,assigned_to,next_followup_on,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,version`,
              [tenantId, installmentId, v.status, v.assignedTo, v.nextFollowupOn, req.actor.id],
            )
          ).rows[0];
      const action = (
        await c.query(
          `INSERT INTO enach_recovery_actions(tenant_id,case_id,idempotency_key,payload_hash,actor_id,action,note) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [tenantId, row.id, v.idempotencyKey, hash, req.actor.id, v.status, v.note],
        )
      ).rows[0];
      await this.db.audit(c, req.actor.id, 'enach.recovery.followup', row.id, {
        installmentId,
        actionId: action.id,
        status: v.status,
      });
      return { caseId: row.id, version: row.version, actionId: action.id };
    });
  }
}
