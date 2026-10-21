import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { AuthGuard, AuthedRequest, Roles } from './auth';

export const enachRecordTypes = [
  'mandates',
  'setups',
  'debits',
  'settlements',
  'checkouts',
] as const;
const recordType = z.enum(enachRecordTypes);
const definition = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
    label: z.string().trim().min(2).max(80),
    kind: z.enum(['text', 'number', 'date', 'choice']),
    options: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === 'choice' && value.options.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least one choice' });
    }
    if (new Set(value.options).size !== value.options.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Choices must be unique' });
    }
    if (value.kind !== 'choice' && value.options.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Choices only apply to choice fields',
      });
    }
  });
const recordValue = z
  .object({
    fieldId: z.uuid(),
    recordType,
    recordId: z.uuid(),
    value: z.string().trim().max(160),
  })
  .strict();

const sourceTables: Record<z.infer<typeof recordType>, string> = {
  mandates: 'payment_mandates',
  setups: 'payment_mandate_setup_requests',
  debits: 'autopay_debit_attempts',
  settlements: 'settlement_records',
  checkouts: 'payment_checkout_sessions',
};

export function validateEnachFieldValue(field: { kind: string; options: string[] }, value: string) {
  if (value.length > 160) throw new ConflictException('Field value is too long');
  if (
    value &&
    field.kind === 'date' &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(new Date(value + 'T00:00:00Z').valueOf()) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value)
  )
    throw new ConflictException('Enter a valid date (YYYY-MM-DD)');
  if (value && field.kind === 'number' && !/^-?\d{1,12}(\.\d{1,4})?$/.test(value))
    throw new ConflictException('Enter a valid number');
  if (value && field.kind === 'choice' && !field.options.includes(value))
    throw new ConflictException('Select a configured choice');
}

@Controller('v1/admin/enach')
@UseGuards(AuthGuard)
@Roles('owner')
export class EnachCustomFieldsController {
  constructor(@Inject(Db) private db: Db) {}

  @Get('fields')
  fields(@Req() req: AuthedRequest) {
    return this.db.query(
      `SELECT id,key,label,kind,options,created_at
       FROM enach_custom_fields WHERE tenant_id=$1
       ORDER BY created_at,id LIMIT 30`,
      [req.actor.tenantId],
    );
  }

  @Post('fields')
  async add(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = definition.parse(body);
    return this.db.tx(async (client) => {
      const count = await client.query(
        'SELECT count(*)::int AS total FROM enach_custom_fields WHERE tenant_id=$1',
        [req.actor.tenantId],
      );
      if (Number(count.rows[0]?.total) >= 30)
        throw new ConflictException('This workspace already has 30 eNACH fields');
      const rows = await client.query(
        `INSERT INTO enach_custom_fields
           (tenant_id,key,label,kind,options,created_by)
         VALUES($1,$2,$3,$4,$5::jsonb,$6)
         RETURNING id,key,label,kind,options,created_at`,
        [
          req.actor.tenantId,
          input.key,
          input.label,
          input.kind,
          JSON.stringify(input.options),
          req.actor.id,
        ],
      );
      await this.db.audit(client, req.actor.id, 'enach.field.created', rows.rows[0].id, {
        key: input.key,
        kind: input.kind,
      });
      return rows.rows[0];
    });
  }

  @Get('values/:recordType')
  async values(@Req() req: AuthedRequest, @Param('recordType') rawType: string) {
    const type = recordType.parse(rawType);
    return this.db.query(
      `SELECT v.field_id,v.record_id,v.value
       FROM enach_custom_values v
       JOIN enach_custom_fields f ON f.id=v.field_id AND f.tenant_id=v.tenant_id
       WHERE v.tenant_id=$1 AND v.record_type=$2
       ORDER BY v.updated_at DESC LIMIT 3000`,
      [req.actor.tenantId, type],
    );
  }

  @Post('values')
  async save(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = recordValue.parse(body);
    const table = sourceTables[input.recordType];
    return this.db.tx(async (client) => {
      const field = (
        await client.query(
          `SELECT kind,options FROM enach_custom_fields WHERE id=$1 AND tenant_id=$2`,
          [input.fieldId, req.actor.tenantId],
        )
      ).rows[0];
      if (!field) throw new ConflictException('Custom field does not exist in this workspace');
      validateEnachFieldValue(field, input.value);
      const record = (
        await client.query(`SELECT id FROM ${table} WHERE id=$1 AND tenant_id=$2`, [
          input.recordId,
          req.actor.tenantId,
        ])
      ).rows[0];
      if (!record) throw new ConflictException('Financial record does not exist in this workspace');
      if (!input.value) {
        await client.query(
          `DELETE FROM enach_custom_values
           WHERE tenant_id=$1 AND field_id=$2 AND record_type=$3 AND record_id=$4`,
          [req.actor.tenantId, input.fieldId, input.recordType, input.recordId],
        );
      } else {
        await client.query(
          `INSERT INTO enach_custom_values
            (tenant_id,field_id,record_type,record_id,value,updated_by)
           VALUES($1,$2,$3,$4,$5,$6)
           ON CONFLICT (tenant_id,field_id,record_type,record_id)
           DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [
            req.actor.tenantId,
            input.fieldId,
            input.recordType,
            input.recordId,
            input.value,
            req.actor.id,
          ],
        );
      }
      await this.db.audit(client, req.actor.id, 'enach.field.value.updated', input.recordId, {
        fieldId: input.fieldId,
        recordType: input.recordType,
        cleared: !input.value,
      });
      return { saved: true };
    });
  }
}
