import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { encrypt, digest, token } from '../../packages/core/src/security';
import AxeBuilder from '@axe-core/playwright';

test('parent confirms linked student, registers eNACH and receives a real sandbox payment receipt', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  expect(process.env.DEPLOYMENT_MODE).toBe('test');
  const db = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  const student = randomUUID(),
    schedule = randomUUID(),
    payer = randomUUID(),
    plan = randomUUID(),
    reference = 'PARENT-' + randomUUID(),
    code = token();
  try {
    const actor = (
      await db.query(
        "SELECT m.user_id,m.tenant_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.email=$1 AND m.role_key='owner' AND m.status='active' LIMIT 1",
        [process.env.OWNER_EMAIL],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO academic_students(id,tenant_id,student_reference,full_name,email,phone,created_by) VALUES($1,$2,$3,'Synthetic Parent UI Student','student@example.invalid','+919999999998',$4)",
      [student, actor.tenant_id, reference, actor.user_id],
    );
    await db.query(
      "INSERT INTO fee_payers(id,tenant_id,account_reference,encrypted_profile,preferred_channel,created_by) VALUES($1,$2,$3,$4,'email',$5)",
      [
        payer,
        actor.tenant_id,
        reference,
        encrypt({
          displayName: 'Synthetic Parent',
          email: 'parent@example.invalid',
          phone: '+919999999998',
        }),
        actor.user_id,
      ],
    );
    await db.query(
      "INSERT INTO fee_plan_versions(id,tenant_id,plan_key,version,name,status,created_by) VALUES($1,$2,$3,1,'Synthetic Parent Master','effective',$4)",
      [plan, actor.tenant_id, reference, actor.user_id],
    );
    await db.query(
      "INSERT INTO fee_schedules(id,tenant_id,account_reference,total_amount_minor,status,payer_id,created_by) VALUES($1,$2,$3,2200000,'active',$4,$5)",
      [schedule, actor.tenant_id, reference, payer, actor.user_id],
    );
    await db.query(
      'INSERT INTO fee_installments(tenant_id,schedule_id,sequence,due_date,amount_minor) VALUES($1,$2,1,current_date+1,2200000)',
      [actor.tenant_id, schedule],
    );
    await db.query(
      'INSERT INTO student_fee_plan_assignments(tenant_id,student_id,plan_id,schedule_id,created_by) VALUES($1,$2,$3,$4,$5)',
      [actor.tenant_id, student, plan, schedule, actor.user_id],
    );
    await db.query(
      "INSERT INTO payer_access_tokens(tenant_id,schedule_id,token_hash,expires_at,created_by) VALUES($1,$2,$3,now()+interval '1 day',$4)",
      [actor.tenant_id, schedule, digest(code), actor.user_id],
    );
    await page.goto('/portal/');
    await page.getByLabel('Enrollment / Student ID').fill(reference);
    await page.getByLabel('Institution-issued Access Code').fill(code);
    await page.getByRole('button', { name: 'Access Student Portal' }).click();
    await expect(page.getByRole('button', { name: 'Setup New Payment Plan' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
    ).toBe(true);
    await page.getByRole('button', { name: 'Setup New Payment Plan' }).click();
    const setup = page.getByRole('region', { name: 'New payment plan setup' });
    await expect(setup.getByRole('heading', { name: 'Select Institute' })).toBeVisible();
    await setup.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      setup.getByRole('heading', { name: 'Institute & Student Information' }),
    ).toBeVisible();
    await setup.getByRole('button', { name: 'Continue', exact: true }).click();
    await setup.getByRole('button', { name: 'Confirm & Continue' }).click();
    await expect(page.getByLabel('Payer Name')).toHaveValue('Synthetic Parent');
    await page.getByLabel('Account Number').fill('000000000001');
    await page.getByRole('checkbox').check();
    const register = page.getByRole('button', { name: 'Register eNACH', exact: true });
    await register.scrollIntoViewIfNeeded();
    if (info.project.name === 'mobile-chromium') await register.tap();
    else await register.click();
    await expect(
      page.getByText('eNACH Registration Successful · Mandate Active', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Payment Complete', exact: true })).toHaveCount(
      0,
    );
    await page
      .getByRole('button', { name: 'Simulate Successful eNACH Debit', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Payment Complete', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'View Receipt', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Payment receipt' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
    ).toBe(true);
    await page.screenshot({ path: 'test-results/parent-onboarding-receipt.png', fullPage: true });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  } finally {
    await db.end();
  }
});
