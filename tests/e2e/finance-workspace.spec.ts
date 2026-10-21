import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { authenticator } from 'otplib';
import { randomUUID, createHmac } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

test('finance workspace supports direct payment and sandbox collection', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'One isolated financial mutation scenario.');
  test.setTimeout(90000);
  page.on('pageerror', (error) => console.error('Finance UI error:', error.message));
  expect(process.env.DEPLOYMENT_MODE).toBe('test');
  const db = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  const studentId = randomUUID(),
    scheduleId = randomUUID(),
    planId = randomUUID();
  const reference = 'UI-' + randomUUID().slice(0, 8);
  try {
    const owner = (
      await db.query(
        `SELECT u.id,m.tenant_id FROM users u JOIN memberships m ON m.user_id=u.id AND m.role_key='owner' JOIN tenants t ON t.id=m.tenant_id WHERE u.email=$1 AND m.status='active' AND t.status<>'archived' ORDER BY t.display_name LIMIT 1`,
        [process.env.OWNER_EMAIL],
      )
    ).rows[0];
    await db.query('UPDATE users SET last_totp_step=0 WHERE id=$1', [owner.id]);
    await db.query('UPDATE rate_limits SET count=0 WHERE key=$1', [
      'login:' +
        createHmac('sha256', process.env.SESSION_SECRET!)
          .update(process.env.OWNER_EMAIL!.toLowerCase())
          .digest('hex'),
    ]);
    await db.query(
      `INSERT INTO academic_students(id,tenant_id,student_reference,full_name,created_by) VALUES($1,$2,$3,'Synthetic UI Student',$4)`,
      [studentId, owner.tenant_id, reference, owner.id],
    );
    await db.query(
      `INSERT INTO fee_plan_versions(id,tenant_id,plan_key,version,name,status,created_by) VALUES($1,$2,$3,1,'Synthetic UI Master','effective',$4)`,
      [planId, owner.tenant_id, reference, owner.id],
    );
    await db.query(
      `INSERT INTO fee_schedules(id,tenant_id,account_reference,total_amount_minor,status,created_by) VALUES($1,$2,$3,9000500,'active',$4)`,
      [scheduleId, owner.tenant_id, reference, owner.id],
    );
    await db.query(
      `INSERT INTO fee_installments(tenant_id,schedule_id,sequence,due_date,amount_minor) VALUES($1,$2,1,current_date+1,2200000),($1,$2,2,current_date+31,6800500)`,
      [owner.tenant_id, scheduleId],
    );
    await db.query(
      `INSERT INTO student_fee_plan_assignments(tenant_id,student_id,plan_id,schedule_id,created_by) VALUES($1,$2,$3,$4,$5)`,
      [owner.tenant_id, studentId, planId, scheduleId, owner.id],
    );
    await page.goto('/admin/');
    await page.getByLabel('Staff email').fill(process.env.OWNER_EMAIL!);
    await page.getByLabel('Password', { exact: true }).fill(process.env.OWNER_PASSWORD!);
    await page
      .getByLabel('Authenticator code')
      .fill(authenticator.generate(process.env.OWNER_TOTP_SECRET!));
    await page.getByRole('button', { name: 'Sign in securely' }).click();
    await expect(
      page.getByRole('heading', { name: 'Finance operations', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Finance navigation' })
        .getByText('Content & publishing'),
    ).toHaveCount(0);
    await page.screenshot({ path: 'test-results/finance-dashboard.png', fullPage: true });
    await page.getByRole('button', { name: 'Students', exact: true }).click();
    await page.getByLabel('Search students').fill(reference);
    await expect(page.getByRole('link', { name: 'Synthetic UI Student' })).toHaveCount(1);
    await page.getByRole('link', { name: 'Synthetic UI Student' }).click();
    await expect(
      page.getByRole('heading', { name: 'Synthetic UI Student', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Student financial sections' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Add Direct Payment', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('combobox', { name: 'Installment', exact: true })
      .selectOption({ index: 1 });
    await dialog.getByLabel('Amount (INR)').fill('12000');
    await expect(dialog.getByLabel('Bank name')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Record payment & issue receipt' }).click();
    await expect(page.getByText('Payment recorded and receipt issued.')).toBeVisible();
    await expect(page.getByText('₹78,005.00', { exact: true })).toHaveCount(2);
    await page
      .getByRole('navigation', { name: 'Student financial sections' })
      .getByRole('button', { name: 'Flex / eNACH', exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Fee schedule', exact: true })
      .selectOption(scheduleId);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Register sandbox mandate', exact: true }).click();
    await expect(page.getByText('Sandbox mandate activated.')).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Installment', exact: true })
      .selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Simulate collection', exact: true }).click();
    await expect(page.getByText('Sandbox debit successful.')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Student financial sections' })
      .getByRole('button', { name: 'Receipts', exact: true })
      .click();
    await expect(page.getByRole('cell', { name: /RCP-/ })).toHaveCount(2);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations.map((v) => v.id)).toEqual([]);
    await page.screenshot({ path: 'test-results/student-financial-profile.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('navigation', { name: 'Student financial sections' }),
    ).toBeVisible();
    await page.screenshot({
      path: 'test-results/student-financial-profile-mobile.png',
      fullPage: true,
    });
    const session = await (await page.request.get('/api/v1/auth/me')).json();
    const portalResponse = await page.request.post(
      `/api/v1/admin/fees/schedules/${scheduleId}/payer-link`,
      {
        headers: { 'X-CSRF-Token': session.csrf },
        data: { expiresHours: 24, paymentMode: 'flexible', allowCustomAmount: true },
      },
    );
    expect(portalResponse.status()).toBe(201);
    const portal = await portalResponse.json();
    await page.goto(portal.path);
    await expect(page.getByText('Sandbox account: simulated collections')).toBeVisible();
    await expect(page.getByRole('link', { name: 'View / print receipt' })).toHaveCount(2);
    await page.screenshot({ path: 'test-results/parent-portal-mobile.png', fullPage: true });
    await page.getByRole('link', { name: 'View / print receipt' }).first().click();
    await expect(page.getByRole('heading', { name: 'Payment receipt', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print / Save PDF' })).toBeVisible();
    await page.screenshot({ path: 'test-results/parent-receipt-mobile.png', fullPage: true });
  } finally {
    await db.end();
  }
});
