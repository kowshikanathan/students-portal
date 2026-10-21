import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { authenticator } from 'otplib';

test('mandate operations has navigable working record views', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'Run one isolated owner workflow.');
  test.setTimeout(90000);
  expect(process.env.DEPLOYMENT_MODE).toBe('test');

  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    await pool.query('UPDATE users SET last_totp_step=0 WHERE email=$1', [process.env.OWNER_EMAIL]);
  } finally {
    await pool.end();
  }

  await page.goto('/admin/');
  await page.getByLabel('Staff email').fill(process.env.OWNER_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.OWNER_PASSWORD!);
  await page
    .getByLabel('Authenticator code')
    .fill(authenticator.generate(process.env.OWNER_TOTP_SECRET!));
  await page.route('**/api/v1/auth/login', async (route) => {
    const remaining = 30000 - (Date.now() % 30000);
    if (remaining < 8000) await new Promise((resolve) => setTimeout(resolve, remaining + 100));
    await route.continue({
      postData: JSON.stringify({
        ...route.request().postDataJSON(),
        otp: authenticator.generate(process.env.OWNER_TOTP_SECRET!),
      }),
    });
  });
  await page.getByRole('button', { name: 'Sign in securely' }).click();

  await expect(page.getByRole('navigation', { name: 'Finance navigation' })).toBeVisible({
    timeout: 30000,
  });
  await page.goto('/enach/');
  await expect(page).toHaveURL(/\/admin\/enach\/?$/);
  await expect(page.getByRole('navigation', { name: 'Finance navigation' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Flex / eNACH', exact: true, level: 1 }),
  ).toBeVisible();
  const workspace = page.getByRole('region', {
    name: 'Mandate and recurring collections workspace',
  });
  await expect(workspace.getByLabel('Search mandates')).toBeVisible();
  await workspace.getByRole('button', { name: /^Automatic debits/ }).click();
  await expect(workspace.getByLabel('Search automatic debits')).toBeVisible();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
});
