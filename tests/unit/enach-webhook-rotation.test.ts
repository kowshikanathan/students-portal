import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { PaymentProviderController } from '../../apps/api/src/payment-provider';

const current = 'current-eNACH-webhook-rotation-secret-'.repeat(3);
const previous = 'previous-eNACH-webhook-rotation-secret-'.repeat(3);
const payload = {
  eventId: 'enach-rotation-event-001',
  type: 'payment_failed' as const,
  installmentId: 'b274d80b-3601-49c2-a54b-ff9b5b8da03d',
  providerReference: 'enach-rotation-debit-001',
  amountMinor: 5000,
  currency: 'INR' as const,
  reasonCode: 'BANK_DECLINED',
  occurredAt: '2026-10-12T10:00:00Z',
};

test('eNACH webhook key rollover accepts only configured current or previous key', async () => {
  const previousEnvironment = {
    mode: process.env.PAYMENT_PROVIDER_MODE,
    name: process.env.PAYMENT_PROVIDER_NAME,
    active: process.env.PAYMENT_WEBHOOK_SECRET,
    old: process.env.PAYMENT_WEBHOOK_PREVIOUS_SECRET,
  };
  process.env.PAYMENT_PROVIDER_MODE = 'signed_hmac';
  process.env.PAYMENT_PROVIDER_NAME = 'qa_enach_gateway';
  process.env.PAYMENT_WEBHOOK_SECRET = current;
  process.env.PAYMENT_WEBHOOK_PREVIOUS_SECRET = previous;
  const rawBody = Buffer.from(JSON.stringify(payload));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const calls: string[] = [];
  const connection = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes('SELECT s.tenant_id'))
        return { rows: [{ tenant_id: 'tenant-test' }], rowCount: 1 };
      if (sql.includes('INSERT INTO payment_provider_events'))
        return { rows: [{ id: 'rotation-event' }], rowCount: 1 };
      if (sql.includes('UPDATE payment_checkout_sessions')) return { rows: [], rowCount: 0 };
      if (sql.includes('UPDATE autopay_debit_attempts')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
  };
  const db = {
    tx: async (callback: (c: typeof connection) => Promise<unknown>) => callback(connection),
    audit: async () => undefined,
  };
  const controller = new PaymentProviderController(db as never);
  const sign = (secret: string) =>
    createHmac('sha256', secret).update(timestamp).update('.').update(rawBody).digest('hex');
  try {
    for (const key of [current, previous]) {
      calls.length = 0;
      const accepted = await controller.webhook(
        { rawBody } as never,
        payload,
        sign(key),
        timestamp,
      );
      assert.equal(accepted.code, 'UNMATCHED_PAYMENT_FAILURE');
      assert.ok(calls.some((sql) => sql.includes('INSERT INTO payment_provider_events')));
    }
    calls.length = 0;
    await assert.rejects(
      controller.webhook(
        { rawBody } as never,
        payload,
        sign('unconfigured-webhook-signing-key-'.repeat(3)),
        timestamp,
      ),
      /Webhook signature is invalid/,
    );
    assert.equal(calls.length, 0, 'invalid signature must be denied before database activity');

    delete process.env.PAYMENT_WEBHOOK_PREVIOUS_SECRET;
    calls.length = 0;
    await assert.rejects(
      controller.webhook({ rawBody } as never, payload, sign(previous), timestamp),
      /Webhook signature is invalid/,
    );
    assert.equal(calls.length, 0, 'retired secret must stop working immediately');
  } finally {
    for (const [name, value] of [
      ['PAYMENT_PROVIDER_MODE', previousEnvironment.mode],
      ['PAYMENT_PROVIDER_NAME', previousEnvironment.name],
      ['PAYMENT_WEBHOOK_SECRET', previousEnvironment.active],
      ['PAYMENT_WEBHOOK_PREVIOUS_SECRET', previousEnvironment.old],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
