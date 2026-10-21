import 'reflect-metadata';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Db } from '../../apps/api/src/db';
import { FeeOperationsController } from '../../apps/api/src/fees';
import type { AuthedRequest } from '../../apps/api/src/auth';
import { SandboxEnachController, submitSandboxDebit } from '../../apps/api/src/sandbox-enach';
import { tick } from '../../apps/worker/src/main';
import { AuthGuard } from '../../apps/api/src/auth';
import { Reflector } from '@nestjs/core';
import { digest, keyed } from '../../packages/core/src/security';
import { FinanceBulkController } from '../../apps/api/src/finance-bulk';
import { StudentPortalController } from '../../apps/api/src/portal';
import { AcademicOperationsController } from '../../apps/api/src/academic';
import { FeePlanController } from '../../apps/api/src/fee-plans';
import { encrypt, token } from '../../packages/core/src/security';

const db = new Db();
const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const finance = new FeeOperationsController(db);
const studentId = randomUUID();
const scheduleId = randomUUID();
const installmentId = randomUUID();
const tenantId = randomUUID();
const actorId = randomUUID();
const req = { actor: { id: actorId, tenantId } } as AuthedRequest;

before(async () => {
  process.env.AUTOPAY_PROVIDER_MODE = 'sandbox';
  assert.equal(process.env.DEPLOYMENT_MODE, 'test', 'Use an isolated test database');
  await owner.query(
    `INSERT INTO users(id,email,password_hash,totp_secret,role) VALUES($1,$2,'synthetic-test-only','synthetic-test-only','owner')`,
    [actorId, actorId + '@example.invalid'],
  );
  await owner.query(
    `INSERT INTO tenants(id,slug,display_name) VALUES($1,$2,'Synthetic Finance Institute')`,
    [tenantId, 'test-' + tenantId],
  );
  await owner.query(
    `INSERT INTO academic_students(id,tenant_id,student_reference,full_name,created_by) VALUES($1,$2,'ANANT-TEST','Anant',$3)`,
    [studentId, tenantId, actorId],
  );
  const planId = randomUUID();
  await owner.query(
    `INSERT INTO fee_plan_versions(id,tenant_id,plan_key,version,name,status,created_by) VALUES($1,$2,'synthetic-plan',1,'Synthetic Master','effective',$3)`,
    [planId, tenantId, actorId],
  );
  await owner.query(
    `INSERT INTO fee_schedules(id,tenant_id,account_reference,total_amount_minor,gross_amount_minor,concession_amount_minor,status,created_by) VALUES($1,$2,'ANANT-TEST',9000500,10000500,1000000,'active',$3)`,
    [scheduleId, tenantId, actorId],
  );
  await owner.query(
    `INSERT INTO fee_installments(id,tenant_id,schedule_id,sequence,due_date,amount_minor) VALUES($1,$2,$3,1,current_date+1,2200000)`,
    [installmentId, tenantId, scheduleId],
  );
  await owner.query(
    `INSERT INTO fee_installments(tenant_id,schedule_id,sequence,due_date,amount_minor) VALUES($1,$2,2,current_date+31,6800500)`,
    [tenantId, scheduleId],
  );
  await owner.query(
    `INSERT INTO student_fee_plan_assignments(tenant_id,student_id,plan_id,schedule_id,created_by) VALUES($1,$2,$3,$4,$5)`,
    [tenantId, studentId, planId, scheduleId, actorId],
  );
});
after(async () => {
  await db.onModuleDestroy();
  await owner.end();
});

test('student portal requires a revocable schedule-bound credential and scopes receipts to that student', async () => {
  const portal = new StudentPortalController(db);
  await assert.rejects(
    portal.login({ studentReference: 'ANANT-TEST', identifier: 'x'.repeat(40) }, {
      cookie() {},
    } as any),
    /Invalid or expired/,
  );
  const payerId = randomUUID(),
    accessToken = token();
  await owner.query(
    `INSERT INTO fee_payers(id,tenant_id,account_reference,encrypted_profile,preferred_channel,created_by) VALUES($1,$2,$3,$4,'email',$5)`,
    [
      payerId,
      tenantId,
      'ANANT-TEST',
      encrypt({ displayName: 'Synthetic Parent', email: 'parent@example.invalid' }),
      actorId,
    ],
  );
  await owner.query('UPDATE fee_schedules SET payer_id=$1 WHERE id=$2', [payerId, scheduleId]);
  await owner.query(
    `INSERT INTO payer_access_tokens(tenant_id,schedule_id,token_hash,expires_at,created_by) VALUES($1,$2,$3,now()+interval '1 day',$4)`,
    [tenantId, scheduleId, digest(accessToken), actorId],
  );
  const login = await portal.login({ studentReference: 'ANANT-TEST', identifier: accessToken }, {
    cookie() {},
  } as any);
  const request = { headers: { authorization: 'Bearer ' + login.token } } as any;
  const profile = await portal.me(request);
  assert.equal(profile.student.id, studentId);
  assert.equal(profile.summary.outstandingMinor, '9000500');
  await assert.rejects(portal.getReceipt(request, 'RCP-NOT-OWNED'), /Receipt not found/);
  await owner.query('UPDATE payer_access_tokens SET revoked_at=now() WHERE token_hash=$1', [
    digest(accessToken),
  ]);
  await assert.rejects(portal.me(request), /expired or invalid/);
});

test('dashboard and student summary share net payable, paid and outstanding', async () => {
  const dashboard = await finance.dashboard(req);
  const profile = await finance.student(req, studentId);
  assert.equal(dashboard.net_payable_minor, '9000500');
  assert.equal(dashboard.paid_minor, '0');
  assert.equal(dashboard.outstanding_minor, '9000500');
  assert.equal(String(profile.summary.net_payable_minor), dashboard.net_payable_minor);
  assert.equal(String(profile.summary.outstanding_minor), dashboard.outstanding_minor);
});

test('student pages return the real total even beyond the final page', async () => {
  const page = await finance.students(req, { page: 2, pageSize: 1 });
  assert.equal(page.total, 1);
  assert.deepEqual(page.rows, []);
  const search = await finance.students(req, { search: 'Anant' });
  assert.equal(search.total, 1);
  assert.equal(String(search.rows[0].net_payable_minor), '9000500');
  assert.equal((await finance.students(req, { search: '%' })).total, 0);
});

test('student detail and financial records never cross tenant boundaries', async () => {
  const other = { actor: { id: actorId, tenantId: randomUUID() } } as AuthedRequest;
  await assert.rejects(finance.student(other, studentId), /Student not found/);
  assert.equal(
    (await finance.studentRecords(other, studentId, { section: 'installments' })).total,
    0,
  );
  assert.equal((await finance.dashboard(other)).outstanding_minor, '0');
});

test('prepayments update the existing ledger, receipt and remaining installment balance', async () => {
  const input = {
    installmentId,
    idempotencyKey: randomUUID(),
    providerReference: 'TEST-' + randomUUID(),
    amountMinor: 1000000,
    currency: 'INR',
    evidenceNote: 'Synthetic early payment',
  };
  const payment = await finance.recordPayment(input, req);
  assert.ok(payment.receipt.receipt_number);
  const replay = await finance.recordPayment(input, req);
  assert.equal(replay.id, payment.id);
  assert.ok(replay.receipt.receipt_number);
  await assert.rejects(
    finance.recordPayment({ ...input, evidenceNote: 'A different transaction note' }, req),
    /different payment/,
  );
  const installments = await finance.studentRecords(req, studentId, { section: 'installments' });
  assert.equal(String(installments.rows[0].remaining_minor), '1200000');
  const profile = await finance.student(req, studentId);
  assert.equal(String(profile.summary.paid_minor), '1000000');
  assert.equal(String(profile.summary.outstanding_minor), '8000500');
  const dashboard = await finance.dashboard(req);
  assert.equal(dashboard.outstanding_minor, String(profile.summary.outstanding_minor));
  const receipts = await finance.studentRecords(req, studentId, { section: 'receipts' });
  assert.equal(receipts.total, 1);
});

test('cash prepayment is receipted and sandbox debit collects only the remaining balance', async () => {
  const sandbox = new SandboxEnachController(db);
  const registration = {
    scheduleId,
    idempotencyKey: randomUUID(),
    holderName: 'Synthetic Anant',
    sandboxConsent: true,
  };
  const mandate = await sandbox.register(req, registration);
  assert.equal(mandate.accepted, true);
  assert.equal((await sandbox.register(req, registration)).duplicate, true);
  const cash = await finance.recordPayment(
    {
      installmentId,
      idempotencyKey: randomUUID(),
      providerReference: 'CASH-' + randomUUID(),
      amountMinor: 200000,
      currency: 'INR',
      evidenceNote: 'Synthetic cash receipt',
      directPayment: { mode: 'cash', transactionDate: '2026-10-21' },
    },
    req,
  );
  const immutable = (
    await owner.query('SELECT snapshot FROM fee_receipts WHERE payment_id=$1', [cash.id])
  ).rows[0].snapshot;
  assert.equal(immutable.directPayment.mode, 'cash');
  const debit = { installmentId, idempotencyKey: randomUUID(), outcome: 'successful' };
  assert.equal((await sandbox.debit(req, debit)).status, 'successful');
  await sandbox.debit(req, debit);
  const installment = (
    await owner.query('SELECT * FROM fee_installments WHERE id=$1', [installmentId])
  ).rows[0];
  assert.equal(installment.paid_amount_minor, '2200000');
  assert.equal(installment.status, 'paid');
  const payments = await owner.query(
    `SELECT amount_minor FROM payment_records WHERE tenant_id=$1 AND provider='sandbox_enach'`,
    [tenantId],
  );
  assert.equal(payments.rowCount, 1);
  assert.equal(payments.rows[0].amount_minor, '1000000');
  const settlement = await owner.query(
    `SELECT * FROM reconciliation_entries WHERE tenant_id=$1 AND status='matched'`,
    [tenantId],
  );
  assert.equal(settlement.rowCount, 1);
  assert.deepEqual(
    (await owner.query('SELECT snapshot FROM fee_receipts WHERE payment_id=$1', [cash.id])).rows[0]
      .snapshot,
    immutable,
  );
  await assert.rejects(
    sandbox.debit(req, { ...debit, idempotencyKey: randomUUID() }),
    /no remaining balance/,
  );
});

test('failed sandbox collection can be retried without a duplicate payment', async () => {
  const sandbox = new SandboxEnachController(db);
  const second = (
    await owner.query('SELECT id FROM fee_installments WHERE schedule_id=$1 AND sequence=2', [
      scheduleId,
    ])
  ).rows[0].id;
  assert.equal(
    (
      await sandbox.debit(req, {
        installmentId: second,
        idempotencyKey: randomUUID(),
        outcome: 'failed',
      })
    ).status,
    'failed',
  );
  const profile = await finance.student(req, studentId);
  assert.equal(String(profile.summary.outstanding_minor), '6800500');
  const retry = { installmentId: second, idempotencyKey: randomUUID(), outcome: 'successful' };
  await Promise.all([sandbox.debit(req, retry), sandbox.debit(req, retry)]);
  assert.equal(String((await finance.student(req, studentId)).summary.outstanding_minor), '0');
  assert.equal((await finance.dashboard(req)).paid_minor, '9000500');
  const count = (
    await owner.query(
      `SELECT count(*)::int AS count FROM payment_records WHERE installment_id=$1`,
      [second],
    )
  ).rows[0].count;
  assert.equal(count, 1);
});

test('different students keep independent Flex schedules and financial history', async () => {
  const pair = [];
  const plan = (
    await owner.query('SELECT plan_id FROM student_fee_plan_assignments WHERE student_id=$1', [
      studentId,
    ])
  ).rows[0].plan_id;
  for (const [name, downPayment, count] of [
    ['Student A', 1000000, 3],
    ['Student B', 500000, 5],
  ] as const) {
    const student = randomUUID(),
      schedule = randomUUID();
    await owner.query(
      `INSERT INTO academic_students(id,tenant_id,student_reference,full_name,created_by) VALUES($1,$2,$3,$4,$5)`,
      [student, tenantId, student, name, actorId],
    );
    await owner.query(
      `INSERT INTO fee_schedules(id,tenant_id,account_reference,total_amount_minor,status,created_by) VALUES($1,$2,$3,7000000,'active',$4)`,
      [schedule, tenantId, student, actorId],
    );
    await owner.query(
      `INSERT INTO student_fee_plan_assignments(tenant_id,student_id,plan_id,schedule_id,created_by) VALUES($1,$2,$3,$4,$5)`,
      [tenantId, student, plan, schedule, actorId],
    );
    await owner.query(
      `INSERT INTO fee_installments(tenant_id,schedule_id,sequence,due_date,amount_minor,paid_amount_minor,status) VALUES($1,$2,1,current_date-1,$3,$3,'paid')`,
      [tenantId, schedule, downPayment],
    );
    await owner.query(
      `INSERT INTO fee_installments(tenant_id,schedule_id,sequence,due_date,amount_minor) VALUES($1,$2,2,current_date+30,$3)`,
      [tenantId, schedule, 7000000 - downPayment],
    );
    const dates = (
      await owner.query(
        `SELECT (current_date+n*30)::text AS day FROM generate_series(1,$1::int) n`,
        [count],
      )
    ).rows;
    const installments = dates.map((row) => ({
      dueDate: row.day,
      amountMinor: (7000000 - downPayment) / count,
    }));
    await finance.editFlex(req, schedule, {
      version: 1,
      reason: 'Synthetic student customization',
      installments,
    });
    pair.push({ student, schedule });
  }
  const a = await finance.flexSchedule(req, pair[0]!.schedule);
  const b = await finance.flexSchedule(req, pair[1]!.schedule);
  assert.equal(a.installments.length, 4);
  assert.equal(b.installments.length, 6);
  assert.equal(a.installments[0].paid_amount_minor, 1000000);
  assert.equal(b.installments[0].paid_amount_minor, 500000);
  const before = await owner.query(
    `SELECT id,snapshot FROM fee_receipts WHERE tenant_id=$1 ORDER BY id`,
    [tenantId],
  );
  const modified = b.installments
    .filter((i: any) => i.editable)
    .map((i: any, n: number) => ({
      dueDate: String(i.due_date).slice(0, 10),
      amountMinor: Number(i.amount_minor) + (n === 0 ? 10000 : n === 1 ? -10000 : 0),
    }));
  await finance.editFlex(req, pair[1]!.schedule, {
    version: b.version,
    reason: 'Rebalance future installments',
    installments: modified,
  });
  assert.deepEqual(await finance.flexSchedule(req, pair[0]!.schedule), a);
  assert.deepEqual(
    (
      await owner.query(`SELECT id,snapshot FROM fee_receipts WHERE tenant_id=$1 ORDER BY id`, [
        tenantId,
      ])
    ).rows,
    before.rows,
  );
  await assert.rejects(
    finance.editFlex(req, pair[1]!.schedule, {
      version: b.version,
      reason: 'Stale version rejection',
      installments: modified,
    }),
    /Schedule changed/,
  );
  await assert.rejects(
    finance.editFlex(req, pair[1]!.schedule, {
      version: b.version + 1,
      reason: 'Invalid total rejection',
      installments: [{ ...modified[0], amountMinor: 1 }],
    }),
    /reconcile/,
  );
});

test('every operational finance list returns bounded pages and a real total', async () => {
  for (const kind of [
    'installments',
    'payments',
    'settlements',
    'debits',
    'reconciliation',
    'overdue',
  ]) {
    const result = await finance.financeRecords(req, { kind, pageSize: 1 });
    assert.ok(result.rows.length <= 1);
    assert.ok(result.total >= result.rows.length);
    assert.equal(
      (await finance.financeRecords(req, { kind, search: 'no-matching-reference' })).total,
      0,
    );
  }
});

test('automatic sandbox queue recalculates prepayments and cancels zero balances', async () => {
  const sandbox = new SandboxEnachController(db);
  for (const payAll of [false, true]) {
    const schedule = randomUUID(),
      installment = randomUUID();
    await owner.query(
      `INSERT INTO fee_schedules(id,tenant_id,account_reference,total_amount_minor,status,created_by) VALUES($1,$2,$3,1000000,'active',$4)`,
      [schedule, tenantId, 'AUTO-' + schedule, actorId],
    );
    await owner.query(
      `INSERT INTO fee_installments(id,tenant_id,schedule_id,sequence,due_date,amount_minor) VALUES($1,$2,$3,1,current_date,1000000)`,
      [installment, tenantId, schedule],
    );
    await sandbox.register(req, {
      scheduleId: schedule,
      idempotencyKey: randomUUID(),
      holderName: 'Synthetic Automatic Payer',
      sandboxConsent: true,
    });
    await tick(db);
    const attempt = (
      await owner.query(
        `SELECT * FROM autopay_debit_attempts WHERE installment_id=$1 AND status='queued'`,
        [installment],
      )
    ).rows[0];
    assert.ok(attempt);
    await finance.recordPayment(
      {
        installmentId: installment,
        idempotencyKey: randomUUID(),
        providerReference: 'PREPAY-' + randomUUID(),
        amountMinor: payAll ? 1000000 : 200000,
        currency: 'INR',
        evidenceNote: 'Synthetic prepayment after queuing',
      },
      req,
    );
    await submitSandboxDebit(db, attempt.id);
    const updated = (
      await owner.query('SELECT * FROM autopay_debit_attempts WHERE id=$1', [attempt.id])
    ).rows[0];
    assert.equal(updated.status, payAll ? 'cancelled' : 'confirmed');
    if (!payAll) assert.equal(updated.amount_minor, '800000');
    else
      assert.equal(
        (
          await owner.query(
            `SELECT id FROM payment_records WHERE installment_id=$1 AND provider='sandbox_enach'`,
            [installment],
          )
        ).rowCount,
        0,
      );
  }
});

test('uncertain sandbox outcomes block duplicate collection and require an audited decision', async () => {
  const sandbox = new SandboxEnachController(db),
    schedule = randomUUID(),
    installment = randomUUID();
  await owner.query(
    `INSERT INTO fee_schedules(id,tenant_id,account_reference,total_amount_minor,status,created_by) VALUES($1,$2,$3,1000000,'active',$4)`,
    [schedule, tenantId, 'UNCERTAIN-' + schedule, actorId],
  );
  await owner.query(
    `INSERT INTO fee_installments(id,tenant_id,schedule_id,sequence,due_date,amount_minor) VALUES($1,$2,$3,1,current_date+1,1000000)`,
    [installment, tenantId, schedule],
  );
  await sandbox.register(req, {
    scheduleId: schedule,
    idempotencyKey: randomUUID(),
    holderName: 'Synthetic Uncertain Payer',
    sandboxConsent: true,
  });
  await sandbox.debit(req, {
    installmentId: installment,
    idempotencyKey: randomUUID(),
    outcome: 'uncertain',
  });
  await assert.rejects(
    sandbox.debit(req, {
      installmentId: installment,
      idempotencyKey: randomUUID(),
      outcome: 'successful',
    }),
    /existing debit/,
  );
  await assert.rejects(
    finance.recordPayment(
      {
        installmentId: installment,
        idempotencyKey: randomUUID(),
        providerReference: 'BLOCKED-' + randomUUID(),
        amountMinor: 1,
        currency: 'INR',
        evidenceNote: 'Synthetic conflicting payment',
      },
      req,
    ),
    /processing/,
  );
  const attempt = (
    await owner.query(`SELECT id FROM autopay_debit_attempts WHERE installment_id=$1`, [
      installment,
    ])
  ).rows[0];
  await sandbox.resolve(req, attempt.id, {
    outcome: 'failed',
    reason: 'Synthetic sandbox inquiry found no debit',
  });
  await sandbox.recovery(req, attempt.id, {
    status: 'contacted',
    reason: 'Synthetic follow-up note',
  });
  await sandbox.debit(req, {
    installmentId: installment,
    idempotencyKey: randomUUID(),
    outcome: 'successful',
  });
  const recovered = (
    await owner.query('SELECT recovery_status FROM autopay_debit_attempts WHERE id=$1', [
      attempt.id,
    ])
  ).rows[0];
  assert.equal(recovered.recovery_status, 'resolved');
});

test('published finance roles apply to the active tenant and explicit denies override writes', async () => {
  const token = randomUUID(),
    csrf = keyed('csrf:' + token);
  await owner.query(
    `INSERT INTO memberships(tenant_id,user_id,role_key,status) VALUES($1,$2,'viewer','active')`,
    [tenantId, actorId],
  );
  await owner.query(
    `INSERT INTO sessions(user_id,token_hash,csrf_hash,tenant_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour')`,
    [actorId, digest(token), digest(csrf), tenantId],
  );
  const guard = new AuthGuard(db, new Reflector());
  const request: any = {
    cookies: { jodo_session: token },
    method: 'GET',
    path: '/v1/admin/fees/dashboard',
    headers: { 'x-csrf-token': csrf },
    route: { path: '/v1/admin/fees/dashboard' },
  };
  const context: any = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function example() {},
    getClass: () => class Example {},
  };
  assert.equal(await guard.canActivate(context), true);
  assert.equal(request.actor.tenantRole, 'viewer');
  request.method = 'POST';
  request.path = '/v1/admin/fees/payments/external-confirmation';
  await assert.rejects(guard.canActivate(context), /cannot perform/);
  await owner.query(
    `UPDATE tenant_roles SET grants='["fee.read","payment.evidence.record"]',explicit_denies='["payment.evidence.record"]' WHERE tenant_id=$1 AND role_key='viewer' AND status='published'`,
    [tenantId],
  );
  await assert.rejects(guard.canActivate(context), /cannot perform/);
  await owner.query(
    `UPDATE tenant_roles SET explicit_denies='[]' WHERE tenant_id=$1 AND role_key='viewer' AND status='published'`,
    [tenantId],
  );
  assert.equal(await guard.canActivate(context), true);
  request.path = '/v1/admin/content';
  await assert.rejects(guard.canActivate(context), /cannot perform/);
});

test('scholarship adjustments survive Flex customization and successful debits settle the net amount', async () => {
  const sandbox = new SandboxEnachController(db),
    schedule = randomUUID();
  await owner.query(
    `INSERT INTO fee_schedules(id,tenant_id,account_reference,total_amount_minor,status,created_by) VALUES($1,$2,$3,1000000,'active',$4)`,
    [schedule, tenantId, 'SCHOLARSHIP-' + schedule, actorId],
  );
  await owner.query(
    `INSERT INTO fee_installments(tenant_id,schedule_id,sequence,due_date,amount_minor,adjustment_amount_minor) VALUES($1,$2,1,current_date+30,1000000,100000)`,
    [tenantId, schedule],
  );
  const dates = (
    await owner.query(`SELECT (current_date+n*30)::text AS day FROM generate_series(1,2) n`)
  ).rows;
  await finance.editFlex(req, schedule, {
    version: 1,
    reason: 'Customize a scholarship-adjusted schedule',
    installments: [
      { dueDate: dates[0].day, amountMinor: 400000 },
      { dueDate: dates[1].day, amountMinor: 500000 },
    ],
  });
  const plan = await finance.flexSchedule(req, schedule);
  assert.equal(
    plan.installments.reduce(
      (sum: number, row: any) =>
        sum + Number(row.amount_minor) - Number(row.adjustment_amount_minor),
      0,
    ),
    900000,
  );
  assert.equal(
    plan.installments.reduce(
      (sum: number, row: any) => sum + Number(row.adjustment_amount_minor),
      0,
    ),
    100000,
  );
  await sandbox.register(req, {
    scheduleId: schedule,
    idempotencyKey: randomUUID(),
    holderName: 'Synthetic Scholarship Payer',
    sandboxConsent: true,
  });
  for (const installment of plan.installments)
    await sandbox.debit(req, {
      installmentId: installment.id,
      idempotencyKey: randomUUID(),
      outcome: 'successful',
    });
  const result = (
    await owner.query('SELECT * FROM finance_schedule_balances WHERE schedule_id=$1', [schedule])
  ).rows[0];
  assert.equal(result.net_payable_minor, '900000');
  assert.equal(result.paid_minor, '900000');
  assert.equal(result.outstanding_minor, '0');
  assert.equal(
    (await owner.query('SELECT status FROM fee_schedules WHERE id=$1', [schedule])).rows[0].status,
    'completed',
  );
});

test('sandbox mandate lifecycle supports created, pending, rejected, cancelled, expired and active', async () => {
  const sandbox = new SandboxEnachController(db),
    schedule = randomUUID();
  await owner.query(
    `INSERT INTO fee_schedules(id,tenant_id,account_reference,total_amount_minor,status,created_by) VALUES($1,$2,$3,1000000,'active',$4)`,
    [schedule, tenantId, 'LIFECYCLE-' + schedule, actorId],
  );
  await owner.query(
    `INSERT INTO fee_installments(tenant_id,schedule_id,sequence,due_date,amount_minor) VALUES($1,$2,1,current_date+10,1000000)`,
    [tenantId, schedule],
  );
  await sandbox.register(req, {
    scheduleId: schedule,
    idempotencyKey: randomUUID(),
    holderName: 'Synthetic Lifecycle Payer',
    sandboxConsent: true,
  });
  const mandate = (
    await owner.query('SELECT id FROM payment_mandates WHERE schedule_id=$1', [schedule])
  ).rows[0];
  for (const state of ['created', 'pending', 'rejected', 'cancelled', 'expired', 'active']) {
    assert.equal(
      (
        await sandbox.changeMandateState(req, mandate.id, {
          state,
          reason: 'Synthetic lifecycle simulation',
        })
      ).status,
      state,
    );
  }
  const mode = process.env.DEPLOYMENT_MODE;
  try {
    process.env.DEPLOYMENT_MODE = 'production';
    await assert.rejects(
      sandbox.changeMandateState(req, mandate.id, {
        state: 'cancelled',
        reason: 'Production tooling must be blocked',
      }),
      /not enabled/,
    );
  } finally {
    process.env.DEPLOYMENT_MODE = mode;
  }
});

test('untargeted advance payments allocate oldest first, replay safely and roll back on conflicting collections', async () => {
  const student = randomUUID(),
    schedule = randomUUID(),
    plan = (
      await owner.query('SELECT plan_id FROM student_fee_plan_assignments WHERE student_id=$1', [
        studentId,
      ])
    ).rows[0].plan_id;
  await owner.query(
    `INSERT INTO academic_students(id,tenant_id,student_reference,full_name,created_by) VALUES($1,$2,$3,'Synthetic Advance Student',$4)`,
    [student, tenantId, student, actorId],
  );
  await owner.query(
    `INSERT INTO fee_schedules(id,tenant_id,account_reference,total_amount_minor,status,created_by) VALUES($1,$2,$3,3000000,'active',$4)`,
    [schedule, tenantId, 'ADV-' + schedule, actorId],
  );
  await owner.query(
    `INSERT INTO student_fee_plan_assignments(tenant_id,student_id,plan_id,schedule_id,created_by) VALUES($1,$2,$3,$4,$5)`,
    [tenantId, student, plan, schedule, actorId],
  );
  await owner.query(
    `INSERT INTO fee_installments(tenant_id,schedule_id,sequence,due_date,amount_minor) VALUES($1,$2,1,current_date-1,1000000),($1,$2,2,current_date+10,1000000),($1,$2,3,current_date+20,1000000)`,
    [tenantId, schedule],
  );
  const input = {
    idempotencyKey: randomUUID(),
    providerReference: 'ADVANCE-' + randomUUID(),
    amountMinor: 1500000,
    currency: 'INR',
    evidenceNote: 'Synthetic advance payment',
    directPayment: { mode: 'cash', transactionDate: '2026-10-21' },
  };
  const result = await finance.recordAdvance(req, student, input);
  assert.equal(result.payments.length, 2);
  const replay = await finance.recordAdvance(req, student, input);
  assert.equal(replay.replayed, true);
  let rows = (
    await owner.query('SELECT * FROM fee_installments WHERE schedule_id=$1 ORDER BY sequence', [
      schedule,
    ])
  ).rows;
  assert.deepEqual(
    rows.map((i) => i.paid_amount_minor),
    ['1000000', '500000', '0'],
  );
  await assert.rejects(
    finance.recordAdvance(req, student, { ...input, idempotencyKey: randomUUID(), amountMinor: 1 }),
    /already recorded/,
  );
  const sandbox = new SandboxEnachController(db);
  await sandbox.register(req, {
    scheduleId: schedule,
    idempotencyKey: randomUUID(),
    holderName: 'Synthetic Advance Payer',
    sandboxConsent: true,
  });
  await sandbox.debit(req, {
    installmentId: rows[2].id,
    idempotencyKey: randomUUID(),
    outcome: 'uncertain',
  });
  const second = {
    ...input,
    idempotencyKey: randomUUID(),
    providerReference: 'ADVANCE-' + randomUUID(),
  };
  await assert.rejects(finance.recordAdvance(req, student, second), /processing/);
  assert.equal(String((await finance.student(req, student)).summary.paid_minor), '1500000');
  assert.equal(
    (await owner.query('SELECT id FROM payment_records WHERE schedule_id=$1', [schedule])).rowCount,
    2,
  );
  const attempt = (
    await owner.query('SELECT id FROM autopay_debit_attempts WHERE installment_id=$1', [rows[2].id])
  ).rows[0];
  await sandbox.resolve(req, attempt.id, {
    outcome: 'failed',
    reason: 'Synthetic inquiry allows direct repayment',
  });
  await finance.recordAdvance(req, student, second);
  assert.equal(String((await finance.student(req, student)).summary.outstanding_minor), '0');
  assert.equal(
    (
      await owner.query('SELECT recovery_status FROM autopay_debit_attempts WHERE id=$1', [
        attempt.id,
      ])
    ).rows[0].recovery_status,
    'resolved',
  );
});

test('bulk finance previews, applies once and rolls back every row when a later schedule changed', async () => {
  const bulk = new FinanceBulkController(db),
    admin = { actor: { ...req.actor, tenantRole: 'owner' } } as AuthedRequest;
  const plan = randomUUID(),
    key = 'bulk-' + randomUUID(),
    students = [];
  await owner.query(
    `INSERT INTO fee_plan_versions(id,tenant_id,plan_key,version,name,status,created_by) VALUES($1,$2,$3,1,'Synthetic Bulk Master','effective',$4)`,
    [plan, tenantId, key, actorId],
  );
  await owner.query(
    `INSERT INTO fee_plan_components(tenant_id,plan_id,code,label,amount_minor) VALUES($1,$2,'tuition','Tuition',100000)`,
    [tenantId, plan],
  );
  await owner.query(
    `INSERT INTO fee_plan_installments(tenant_id,plan_id,sequence,due_date,amount_minor) VALUES($1,$2,1,current_date+30,100000)`,
    [tenantId, plan],
  );
  for (let index = 0; index < 2; index++) {
    const student = randomUUID(),
      reference = 'BULK-' + randomUUID();
    await owner.query(
      `INSERT INTO academic_students(id,tenant_id,student_reference,full_name,created_by) VALUES($1,$2,$3,'Synthetic Bulk Student',$4)`,
      [student, tenantId, reference, actorId],
    );
    students.push({ id: student, reference });
  }
  const before = (
    await owner.query('SELECT count(*)::int AS count FROM fee_schedules WHERE tenant_id=$1', [
      tenantId,
    ])
  ).rows[0].count;
  const preview = await bulk.preview(admin, {
    operation: 'assign_plan',
    reason: 'Synthetic fee assignment batch',
    rows: students.map((student) => ({
      studentReference: student.reference,
      planKey: key,
      accountReference: '',
    })),
  });
  assert.equal(preview.canApply, true);
  assert.equal(
    (
      await owner.query('SELECT count(*)::int AS count FROM fee_schedules WHERE tenant_id=$1', [
        tenantId,
      ])
    ).rows[0].count,
    before,
  );
  assert.equal((await bulk.apply(admin, { runId: preview.id })).status, 'applied');
  assert.equal((await bulk.apply(admin, { runId: preview.id })).replayed, true);
  assert.equal(
    (
      await owner.query('SELECT count(*)::int AS count FROM fee_schedules WHERE tenant_id=$1', [
        tenantId,
      ])
    ).rows[0].count,
    before + 2,
  );
  const schedules = await Promise.all(
    students.map(
      async (student) =>
        (
          await owner.query(
            'SELECT schedule_id FROM student_fee_plan_assignments WHERE student_id=$1 AND plan_id=$2',
            [student.id, plan],
          )
        ).rows[0].schedule_id,
    ),
  );
  const dates = (
    await owner.query(`SELECT (current_date+n)::text AS day FROM generate_series(35,95) n`)
  ).rows;
  const change = await bulk.preview(admin, {
    operation: 'update_due_date',
    reason: 'Synthetic due date batch',
    rows: students.map((student) => ({
      studentReference: student.reference,
      installmentSequence: 1,
      dueDate: dates[5].day,
    })),
  });
  assert.equal(change.canApply, true);
  const firstBefore = await finance.flexSchedule(req, schedules[0]);
  await finance.editFlex(req, schedules[1], {
    version: (await finance.flexSchedule(req, schedules[1])).version,
    reason: 'Concurrent synthetic finance edit',
    installments: [{ dueDate: dates[0].day, amountMinor: 100000 }],
  });
  const failed = await bulk.apply(admin, { runId: change.id });
  assert.equal(failed.status, 'failed');
  assert.deepEqual(await finance.flexSchedule(req, schedules[0]), firstBefore);
  assert.equal(failed.rows[0].status, 'not_applied');
  assert.equal(failed.rows[1].status, 'failed');
  assert.equal((await bulk.apply(admin, { runId: change.id })).replayed, true);
  const flex = await bulk.preview(admin, {
    operation: 'update_flex',
    reason: 'Synthetic custom future installments',
    rows: [
      {
        studentReference: students[0]!.reference,
        installments: [
          { dueDate: dates[25].day, amountMinor: 50000 },
          { dueDate: dates[55].day, amountMinor: 50000 },
        ],
      },
    ],
  });
  assert.equal(flex.canApply, true);
  assert.equal((await bulk.apply(admin, { runId: flex.id })).status, 'applied');
  assert.equal((await finance.flexSchedule(req, schedules[0])).installments.length, 2);
  const mandatesBefore = (
    await owner.query('SELECT count(*)::int AS count FROM payment_mandates WHERE tenant_id=$1', [
      tenantId,
    ])
  ).rows[0].count;
  const prepare = await bulk.preview(admin, {
    operation: 'prepare_enach',
    reason: 'Prepare synthetic registrations',
    rows: students.map((student) => ({
      studentReference: student.reference,
      accountReference: '',
    })),
  });
  assert.equal(prepare.canApply, true);
  assert.equal((await bulk.apply(admin, { runId: prepare.id })).rows[0].status, 'ready');
  assert.equal(
    (
      await owner.query('SELECT count(*)::int AS count FROM payment_mandates WHERE tenant_id=$1', [
        tenantId,
      ])
    ).rows[0].count,
    mandatesBefore,
  );
  const invalid = await bulk.preview(admin, {
    operation: 'assign_plan',
    reason: 'Validate unknown enrollment',
    rows: [{ studentReference: 'NOT-A-STUDENT', planKey: key }],
  });
  assert.equal(invalid.canApply, false);
  await assert.rejects(
    bulk.preview(
      { actor: { ...req.actor, tenantRole: 'viewer', permissions: ['fee.read'] } } as AuthedRequest,
      {
        operation: 'assign_plan',
        reason: 'Viewer cannot assign fees',
        rows: [{ studentReference: students[0]!.reference, planKey: key }],
      },
    ),
    /cannot perform/,
  );
});

test('parent registration is replay-safe and only confirmed remaining balance becomes Payment Complete', async () => {
  const student = randomUUID(),
    schedule = randomUUID(),
    payer = randomUUID(),
    installment = randomUUID(),
    ref = 'PORTAL-' + randomUUID(),
    code = token();
  const plan = (
    await owner.query(
      "SELECT id FROM fee_plan_versions WHERE tenant_id=$1 AND status='effective' LIMIT 1",
      [tenantId],
    )
  ).rows[0].id;
  await owner.query(
    "INSERT INTO academic_students(id,tenant_id,student_reference,full_name,created_by) VALUES($1,$2,$3,'Synthetic Portal Student',$4)",
    [student, tenantId, ref, actorId],
  );
  await owner.query(
    "INSERT INTO fee_payers(id,tenant_id,account_reference,encrypted_profile,preferred_channel,created_by) VALUES($1,$2,$3,$4,'email',$5)",
    [
      payer,
      tenantId,
      ref,
      encrypt({
        displayName: 'Synthetic Parent',
        email: 'parent@example.invalid',
        phone: '+919999999998',
      }),
      actorId,
    ],
  );
  await owner.query(
    "INSERT INTO fee_schedules(id,tenant_id,account_reference,total_amount_minor,status,payer_id,created_by) VALUES($1,$2,$3,2200000,'active',$4,$5)",
    [schedule, tenantId, ref, payer, actorId],
  );
  await owner.query(
    'INSERT INTO fee_installments(id,tenant_id,schedule_id,sequence,due_date,amount_minor) VALUES($1,$2,$3,1,current_date+1,2200000)',
    [installment, tenantId, schedule],
  );
  await owner.query(
    'INSERT INTO student_fee_plan_assignments(tenant_id,student_id,plan_id,schedule_id,created_by) VALUES($1,$2,$3,$4,$5)',
    [tenantId, student, plan, schedule, actorId],
  );
  await owner.query(
    "INSERT INTO payer_access_tokens(tenant_id,schedule_id,token_hash,expires_at,created_by) VALUES($1,$2,$3,now()+interval '1 day',$4)",
    [tenantId, schedule, digest(code), actorId],
  );
  const portal = new StudentPortalController(db),
    login = await portal.login({ studentReference: ref, identifier: code }, { cookie() {} } as any),
    request = { headers: { authorization: 'Bearer ' + login.token } } as any;
  const input = {
    payerName: 'Synthetic Parent',
    payerEmail: 'parent@example.invalid',
    payerPhone: '+919999999998',
    bankName: 'Sandbox Bank',
    accountNumber: '000000000001',
    ifsc: 'SBIN0001234',
    consent: true,
  };
  const registration = await Promise.all([
    portal.registerEnach(request, input),
    portal.registerEnach(request, input),
  ]);
  assert.ok(registration.every((r) => r.status === 'active'));
  await finance.savePaymentFormConfig(req, {
    fields: [
      {
        key: 'payer_name',
        label: 'Payer Name',
        visible: true,
        required: true,
        editable: false,
        order: 1,
      },
      {
        key: 'payer_email',
        label: 'Payer Email',
        visible: true,
        required: false,
        editable: true,
        order: 2,
      },
      {
        key: 'payer_phone',
        label: 'Payer Phone',
        visible: true,
        required: false,
        editable: true,
        order: 3,
      },
    ],
    components: [],
    rules: { enable_enach: true, allow_payer_contact_editing: true },
    instructions: 'Synthetic test instructions',
  });
  await assert.rejects(
    portal.registerEnach(request, { ...input, payerName: 'Changed Payer' }),
    /read-only/,
  );
  assert.equal(
    (await portal.registerEnach(request, { ...input, payerEmail: '', payerPhone: '' })).status,
    'active',
  );

  assert.equal(
    (
      await owner.query('SELECT count(*)::int AS n FROM payment_mandates WHERE schedule_id=$1', [
        schedule,
      ])
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await owner.query('SELECT count(*)::int AS n FROM payment_records WHERE schedule_id=$1', [
        schedule,
      ])
    ).rows[0].n,
    0,
  );
  await finance.saveReceiptEmailConfig(req, {
    receipt_config: { receipt_heading: 'Original Receipt' },
    email_config: { subject_line: 'Original {{receipt_number}}' },
  });
  for (const amount of [1000000, 200000])
    await finance.recordPayment(
      {
        installmentId: installment,
        idempotencyKey: randomUUID(),
        providerReference: 'CASH-' + randomUUID(),
        amountMinor: amount,
        currency: 'INR',
        evidenceNote: 'Synthetic cash record',
        directPayment: { mode: 'cash', transactionDate: '2026-10-21' },
      },
      req,
    );
  const result = await portal.simulateDebit(request, { outcome: 'successful' });
  assert.equal(result.status, 'payment_complete');
  assert.equal(result.paymentComplete?.amountMinor, 1000000);
  const receipt = await portal.getReceipt(request, result.paymentComplete!.receiptNumber);
  assert.equal(receipt.snapshot.receiptConfig.receipt_heading, 'Original Receipt');
  await finance.saveReceiptEmailConfig(req, {
    receipt_config: { receipt_heading: 'Changed Receipt' },
    email_config: { subject_line: 'Changed' },
  });
  assert.equal(
    (await portal.getReceipt(request, result.paymentComplete!.receiptNumber)).snapshot.receiptConfig
      .receipt_heading,
    'Original Receipt',
  );
  await assert.rejects(
    portal.simulateDebit(request, { outcome: 'successful' }),
    /Active fee schedule|No payable/,
  );
  const otherPayment = (
    await owner.query(
      'SELECT r.receipt_number FROM fee_receipts r JOIN payment_records p ON p.id=r.payment_id WHERE p.schedule_id=$1 LIMIT 1',
      [scheduleId],
    )
  ).rows[0];
  await assert.rejects(
    portal.getReceipt(request, otherPayment.receipt_number),
    /Receipt not found/,
  );
  await portal.logout(request, { clearCookie() {} } as any);
  await assert.rejects(portal.me(request), /expired or invalid/);
});

test('student onboarding explicitly reuses a linked parent and existing payer during Master assignment', async () => {
  const academic = new AcademicOperationsController(db),
    plans = new FeePlanController(db),
    reference = 'LINK-' + randomUUID();
  const first = await academic.createStudent(req, {
    studentReference: reference,
    fullName: 'Synthetic First Child',
    guardianName: 'Synthetic Linked Parent',
    guardianEmail: 'linked@example.invalid',
  });
  const guardian = (
    await owner.query('SELECT guardian_id FROM academic_guardian_links WHERE student_id=$1', [
      first.id,
    ])
  ).rows[0].guardian_id;
  const second = await academic.createStudent(req, {
    studentReference: reference + 'B',
    fullName: 'Synthetic Second Child',
    guardianId: guardian,
  });
  assert.equal(
    (
      await owner.query('SELECT guardian_id FROM academic_guardian_links WHERE student_id=$1', [
        second.id,
      ])
    ).rows[0].guardian_id,
    guardian,
  );
  const payer = (
    await owner.query('SELECT id FROM fee_payers WHERE tenant_id=$1 AND account_reference=$2', [
      tenantId,
      reference + 'B',
    ])
  ).rows[0].id;
  const plan = randomUUID();
  await owner.query(
    "INSERT INTO fee_plan_versions(id,tenant_id,plan_key,version,name,status,created_by) VALUES($1,$2,$3,1,'Synthetic Onboarding Plan','effective',$4)",
    [plan, tenantId, 'PLAN-' + plan, actorId],
  );
  await owner.query(
    "INSERT INTO fee_plan_components(tenant_id,plan_id,code,label,amount_minor) VALUES($1,$2,'tuition','Tuition',100000)",
    [tenantId, plan],
  );
  await owner.query(
    'INSERT INTO fee_plan_installments(tenant_id,plan_id,sequence,due_date,amount_minor) VALUES($1,$2,1,current_date+30,100000)',
    [tenantId, plan],
  );
  const assignment = await plans.assign(req, plan, { studentId: second.id });
  assert.equal(assignment.schedule.account_reference, reference + 'B');
  assert.equal(assignment.schedule.payer_id, payer);
  const installment = (
    await owner.query('SELECT id FROM fee_installments WHERE schedule_id=$1', [
      assignment.schedule.id,
    ])
  ).rows[0].id;
  const payment = await finance.recordPayment(
    {
      installmentId: installment,
      idempotencyKey: randomUUID(),
      providerReference: 'CONTACT-' + randomUUID(),
      amountMinor: 10000,
      currency: 'INR',
      evidenceNote: 'Synthetic transactional email receipt',
    },
    req,
  );
  const delivery = (
    await owner.query(
      'SELECT l.channel,l.kind,l.status FROM fee_communication_log l JOIN outbox o ON o.event_id=l.event_id WHERE o.aggregate_id=$1',
      [payment.id],
    )
  ).rows[0];
  assert.deepEqual(delivery, { channel: 'email', kind: 'receipt', status: 'pending' });
  await assert.rejects(
    academic.createStudent(req, {
      studentReference: 'OTHER-' + randomUUID(),
      fullName: 'Synthetic Other Child',
      guardianId: randomUUID(),
    }),
    /Linked parent is unavailable/,
  );
});
