import {
  BadGatewayException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { AuthGuard, AuthedRequest, Roles } from './auth';
import { payerMandateSetupSchema } from '../../../packages/core/src/contracts';
import { digest, token } from '../../../packages/core/src/security';

const providerMandateResponseSchema = z
  .object({
    providerReference: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._:-]{3,120}$/),
    authorizationUrl: z.string().trim().min(8).max(1200),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();

function configuredHosts() {
  return new Set(
    (process.env.AUTOPAY_ALLOWED_HOSTS || '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

function safeProviderUrl(raw: string, label: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ServiceUnavailableException(label + ' is invalid');
  }
  if (url.username || url.password) throw new ServiceUnavailableException(label + ' is unsafe');
  const local =
    process.env.DEPLOYMENT_MODE !== 'production' &&
    ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    throw new ServiceUnavailableException(label + ' must use HTTPS');
  if (!configuredHosts().has(url.hostname.toLowerCase()))
    throw new ServiceUnavailableException(label + ' host is not allowlisted');
  return url;
}

export function autopayProviderEnabled() {
  return process.env.AUTOPAY_PROVIDER_MODE === 'mandate_api';
}

@Controller('v1/payer')
export class PayerMandateController {
  constructor(@Inject(Db) private db: Db) {}

  private async access(rawToken: string) {
    if (!/^[A-Za-z0-9_-]{30,100}$/.test(rawToken))
      throw new ConflictException('Portal link is invalid or expired');
    const row = (
      await this.db.query(
        `SELECT t.schedule_id,s.tenant_id,s.account_reference,s.currency,s.total_amount_minor,s.status,
                p.id AS payer_id,p.active
         FROM payer_access_tokens t
         JOIN fee_schedules s ON s.id=t.schedule_id
         JOIN fee_payers p ON p.id=s.payer_id
         WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND t.expires_at>now()`,
        [digest(rawToken)],
      )
    )[0];
    if (!row || !row.active) throw new ConflictException('Portal link is invalid or expired');
    if (row.status !== 'active') throw new ConflictException('This fee schedule is not active');
    return row;
  }

  @Post(':token/mandates')
  async create(@Param('token') rawToken: string, @Body() body: unknown) {
    if (!autopayProviderEnabled())
      throw new ServiceUnavailableException('Recurring payment setup is not activated');

    const provider = process.env.PAYMENT_PROVIDER_NAME!;
    const createUrl = safeProviderUrl(
      process.env.AUTOPAY_MANDATE_CREATE_URL || '',
      'AUTOPAY_MANDATE_CREATE_URL',
    );
    const secret = process.env.AUTOPAY_API_KEY!;
    const timeoutMs = Number(process.env.AUTOPAY_TIMEOUT_MS || 5000);
    const v = payerMandateSetupSchema.parse(body);
    const access = await this.access(rawToken);

    const existing = (
      await this.db.query(
        `SELECT id,schedule_id,payer_id,rail,status,authorization_url,expires_at
         FROM payment_mandate_setup_requests
         WHERE tenant_id=$1 AND idempotency_key=$2`,
        [access.tenant_id, v.idempotencyKey],
      )
    )[0];
    if (existing) {
      if (
        existing.schedule_id !== access.schedule_id ||
        existing.payer_id !== access.payer_id ||
        existing.rail !== v.rail
      )
        throw new ConflictException('Mandate idempotency key was reused with different details');
      if (
        existing.status === 'created' &&
        existing.authorization_url &&
        (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now())
      )
        return {
          setupId: existing.id,
          status: existing.status,
          authorizationUrl: existing.authorization_url,
          expiresAt: existing.expires_at,
        };
      throw new ConflictException('This mandate setup attempt is no longer reusable');
    }

    const returnToken = token();
    const setup = await this.db.tx(async (c) => {
      // Serialize registration for this fee schedule. Without a transaction
      // lock, two different idempotency keys can both pass the open-setup
      // check and create duplicate bank authorization requests.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [access.schedule_id]);
      const concurrentDuplicate = (
        await c.query(
          'SELECT id FROM payment_mandate_setup_requests WHERE tenant_id=$1 AND idempotency_key=$2',
          [access.tenant_id, v.idempotencyKey],
        )
      ).rows[0];
      if (concurrentDuplicate)
        throw new ConflictException('Mandate setup request is already in progress');

      const activeMandate = (
        await c.query(
          `SELECT id,status FROM payment_mandates
           WHERE schedule_id=$1 AND status='active'
           ORDER BY last_event_at DESC LIMIT 1`,
          [access.schedule_id],
        )
      ).rows[0];
      if (activeMandate) throw new ConflictException('An active mandate already exists');

      const open = (
        await c.query(
          `SELECT id,status FROM payment_mandate_setup_requests
           WHERE schedule_id=$1 AND status IN('requested','created','uncertain')
           ORDER BY created_at DESC LIMIT 1`,
          [access.schedule_id],
        )
      ).rows[0];
      // Expiry of the bank authorization URL is not proof that the mandate
      // failed. Keep every non-terminal setup blocking replacement until a
      // verified provider result or independently approved reconciliation.
      if (open) throw new ConflictException('A mandate setup is already in progress');

      return (
        await c.query(
          `INSERT INTO payment_mandate_setup_requests(
             schedule_id,payer_id,idempotency_key,provider,rail,return_token_hash
           ) VALUES($1,$2,$3,$4,$5,$6)
           RETURNING id,schedule_id,payer_id,rail,status,created_at`,
          [
            access.schedule_id,
            access.payer_id,
            v.idempotencyKey,
            provider,
            v.rail,
            digest(returnToken),
          ],
        )
      ).rows[0];
    });

    const returnUrl =
      process.env.SITE_URL!.replace(/\/$/, '') +
      '/mandate/return/' +
      encodeURIComponent(returnToken) +
      '/';
    const requestBody = JSON.stringify({
      merchantSetupId: setup.id,
      scheduleId: access.schedule_id,
      payerReference: access.payer_id,
      accountReference: access.account_reference,
      rail: v.rail,
      currency: access.currency,
      maxAmountMinor: Number(access.total_amount_minor),
      returnUrl,
      metadata: { scheduleId: access.schedule_id, mandateSetupId: setup.id },
    });

    let providerResult: z.infer<typeof providerMandateResponseSchema>;
    try {
      const response = await fetch(createUrl, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: 'Bearer ' + secret,
          'Content-Type': 'application/json',
          'Idempotency-Key': v.idempotencyKey,
        },
        body: requestBody,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error('PROVIDER_HTTP_' + response.status);
      providerResult = providerMandateResponseSchema.parse(await response.json());
      safeProviderUrl(providerResult.authorizationUrl, 'Provider authorization URL');
    } catch {
      await this.db.tx(async (c) => {
        await c.query(
          `UPDATE payment_mandate_setup_requests
           SET status='uncertain',failure_code='PROVIDER_CREATE_UNCERTAIN',updated_at=now()
           WHERE id=$1 AND status='requested'`,
          [setup.id],
        );
        await this.db.audit(
          c,
          'payer:' + access.payer_id,
          'fees.mandate_setup.uncertain',
          setup.id,
          {
            code: 'PROVIDER_CREATE_UNCERTAIN',
            rail: v.rail,
          },
        );
      });
      throw new BadGatewayException(
        'Mandate creation outcome is uncertain. Do not submit another registration; contact support for provider reconciliation.',
      );
    }

    const created = await this.db.tx(async (c) => {
      const row = (
        await c.query(
          `UPDATE payment_mandate_setup_requests
           SET provider_reference=$2,authorization_url=$3,status='created',
               expires_at=coalesce($4::timestamptz,now()+interval '30 minutes'),updated_at=now()
           WHERE id=$1 AND status='requested'
           RETURNING id,status,authorization_url,expires_at,provider_reference`,
          [
            setup.id,
            providerResult.providerReference,
            providerResult.authorizationUrl,
            providerResult.expiresAt || null,
          ],
        )
      ).rows[0];
      if (!row) {
        // A verified bank callback may activate the mandate before the
        // provider's create-request HTTP response reaches this process.
        // Respect that signed outcome; never revert an active mandate.
        const current = (
          await c.query(
            `SELECT id,status,provider_reference,authorization_url,expires_at
             FROM payment_mandate_setup_requests
             WHERE id=$1 AND tenant_id=$2 AND schedule_id=$3 AND payer_id=$4
             FOR UPDATE`,
            [setup.id, access.tenant_id, access.schedule_id, access.payer_id],
          )
        ).rows[0];
        if (!current || current.provider_reference !== providerResult.providerReference)
          throw new ConflictException('Mandate setup state changed before provider response');

        if (current.status === 'active') {
          // The return page reads verified state, not a browser-side
          // assumption. No second bank authorization is necessary.
          return { ...current, authorization_url: returnUrl };
        }
        if (current.status === 'created' && !current.authorization_url) {
          // A signed pending callback correlated the reference before the
          // hosted authorization URL arrived. Fill only the missing URL.
          const pending = (
            await c.query(
              `UPDATE payment_mandate_setup_requests
               SET authorization_url=$2,expires_at=coalesce($3::timestamptz,now()+interval '30 minutes'),
                   updated_at=now()
               WHERE id=$1 AND status='created' AND provider_reference=$4
                 AND authorization_url IS NULL
               RETURNING id,status,authorization_url,expires_at`,
              [
                setup.id,
                providerResult.authorizationUrl,
                providerResult.expiresAt || null,
                providerResult.providerReference,
              ],
            )
          ).rows[0];
          if (pending) return pending;
        }
        throw new ConflictException('Mandate setup state changed before provider response');
      }
      await this.db.audit(c, 'payer:' + access.payer_id, 'fees.mandate_setup.created', setup.id, {
        rail: v.rail,
        providerReference: providerResult.providerReference,
      });
      return row;
    });

    return {
      setupId: created.id,
      status: created.status,
      authorizationUrl: created.authorization_url,
      expiresAt: created.expires_at,
    };
  }
}

@Controller('v1/mandate-return')
export class MandateReturnController {
  constructor(@Inject(Db) private db: Db) {}

  @Get(':token')
  async status(@Param('token') rawToken: string) {
    if (!/^[A-Za-z0-9_-]{30,100}$/.test(rawToken))
      throw new ConflictException('Mandate return token is invalid');
    const row = (
      await this.db.query(
        `SELECT r.id,r.rail,r.status,r.failure_code,r.expires_at,r.created_at,r.updated_at,
                s.account_reference
         FROM payment_mandate_setup_requests r
         JOIN fee_schedules s ON s.id=r.schedule_id
         WHERE r.return_token_hash=$1`,
        [digest(rawToken)],
      )
    )[0];
    if (!row) throw new ConflictException('Mandate return token is invalid');
    return row;
  }
}

@Controller('v1/admin/fees')
@UseGuards(AuthGuard)
@Roles('owner')
export class AutopayAdminController {
  constructor(@Inject(Db) private db: Db) {}

  @Get('mandate-setups')
  setups(@Req() req: AuthedRequest) {
    return this.db.query(
      `SELECT r.id,r.schedule_id,r.rail,r.provider,r.provider_reference,r.status,
              r.failure_code,r.expires_at,r.created_at,r.updated_at,s.account_reference
       FROM payment_mandate_setup_requests r
       JOIN fee_schedules s ON s.id=r.schedule_id
       WHERE r.tenant_id=$1
       ORDER BY CASE WHEN r.status='uncertain' THEN 0 ELSE 1 END,
                r.created_at DESC LIMIT 300`,
      [req.actor.tenantId],
    );
  }

  @Get('mandate-reconciliation-cases')
  reconciliationCases(@Req() req: AuthedRequest) {
    return this.db.query(
      `SELECT c.id,c.setup_id,c.provider_case_reference,c.evidence_summary,
              c.status,c.created_at,c.updated_at,r.schedule_id,r.rail,
              r.status AS mandate_setup_status,s.account_reference
       FROM mandate_reconciliation_cases c
       JOIN payment_mandate_setup_requests r
         ON r.id=c.setup_id AND r.tenant_id=c.tenant_id
       JOIN fee_schedules s ON s.id=r.schedule_id AND s.tenant_id=c.tenant_id
       WHERE c.tenant_id=$1 ORDER BY c.created_at DESC LIMIT 300`,
      [req.actor.tenantId],
    );
  }

  @Post('mandate-setups/:setupId/reconciliation')
  async openReconciliationCase(
    @Req() req: AuthedRequest,
    @Param('setupId') setupId: string,
    @Body() body: unknown,
  ) {
    const uuid = z.uuid().parse(setupId);
    const input = z
      .object({
        providerCaseReference: z.string().trim().regex(/^[A-Za-z0-9._:-]{3,120}$/),
        evidenceSummary: z.enum([
          'provider_inquiry_opened',
          'provider_reference_not_returned',
          'provider_status_not_confirmed',
        ]),
      })
      .strict()
      .parse(body);
    return this.db.tx(async (c) => {
      const setup = (
        await c.query(
          `SELECT id,status FROM payment_mandate_setup_requests
           WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
          [uuid, req.actor.tenantId],
        )
      ).rows[0];
      if (!setup) throw new ConflictException('Mandate setup is not in this workspace');
      if (setup.status !== 'uncertain')
        throw new ConflictException('Only uncertain mandate setups need this investigation');
      const existing = (
        await c.query(
          'SELECT id FROM mandate_reconciliation_cases WHERE setup_id=$1 AND tenant_id=$2',
          [uuid, req.actor.tenantId],
        )
      ).rows[0];
      if (existing) throw new ConflictException('A reconciliation case already exists');
      const row = (
        await c.query(
          `INSERT INTO mandate_reconciliation_cases(
             tenant_id,setup_id,provider_case_reference,evidence_summary,created_by
           ) VALUES($1,$2,$3,$4,$5)
           RETURNING id,setup_id,provider_case_reference,evidence_summary,status,created_at`,
          [
            req.actor.tenantId,
            uuid,
            input.providerCaseReference,
            input.evidenceSummary,
            req.actor.id,
          ],
        )
      ).rows[0];
      await this.db.audit(c, req.actor.id, 'fees.mandate_reconciliation.opened', row.id, {
        setupId: uuid,
        evidenceSummary: input.evidenceSummary,
      });
      // Deliberately do not change the mandate status or permit another create call.
      return row;
    });
  }

  @Get('checkout-sessions')
  checkouts(@Req() req: AuthedRequest) {
    // Read-only financial reconciliation queue. Never expose hosted checkout
    // URLs, return tokens or sensitive provider credentials to staff.
    return this.db.query(
      `SELECT c.id,c.schedule_id,c.installment_id,c.provider,
              c.provider_reference,c.amount_minor,c.currency,c.status,
              c.failure_code,c.expires_at,c.created_at,
              s.account_reference,i.sequence
       FROM payment_checkout_sessions c
       JOIN fee_schedules s ON s.id=c.schedule_id AND s.tenant_id=c.tenant_id
       JOIN fee_installments i ON i.id=c.installment_id AND i.tenant_id=c.tenant_id
       WHERE c.tenant_id=$1
       ORDER BY CASE WHEN c.status='uncertain' THEN 0 ELSE 1 END,
                c.created_at DESC LIMIT 300`,
      [req.actor.tenantId],
    );
  }

  @Get('autopay-attempts')
  attempts(@Req() req: AuthedRequest) {
    return this.db.query(
      `SELECT a.id,a.schedule_id,a.installment_id,a.mandate_id,a.provider,
              a.provider_reference,a.amount_minor,a.currency,a.attempt_no,a.status,
              a.failure_code,a.next_retry_at,a.submitted_at,a.completed_at,a.created_at,
              s.account_reference,i.sequence,i.due_date
       FROM autopay_debit_attempts a
       JOIN fee_schedules s ON s.id=a.schedule_id
       JOIN fee_installments i ON i.id=a.installment_id
       WHERE a.tenant_id=$1
       ORDER BY CASE WHEN a.status='uncertain' THEN 0 ELSE 1 END,
                a.created_at DESC LIMIT 500`,
      [req.actor.tenantId],
    );
  }
}
