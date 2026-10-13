import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { authenticator } from 'otplib';

test('mandate operations has navigable working record views', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'Run one isolated owner workflow.');
  test.setTimeout(90000);
  expect(process.env.DEPLOYMENT_MODE).toBe('test');

  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    await pool.query('UPDATE users SET last_totp_step=0 WHERE email=$1', [
      process.env.OWNER_EMAIL,
    ]);
  } finally {
    await pool.end();
  }

  await page.goto('/admin/');
  await page.getByLabel('Staff email').fill(process.env.OWNER_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.OWNER_PASSWORD!);
  await page
    .getByLabel('Authenticator code')
    .fill(authenticator.generate(process.env.OWNER_TOTP_SECRET!));
  await page.getByRole('button', { name: 'Sign in securely' }).click();

  // The mandate workspace must remain functional if an unrelated dashboard
  // endpoint is temporarily unavailable.
  await page.route('**/api/v1/admin/fees/communications', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Synthetic communications outage' }),
    });
  });

  await page.getByRole('button', { name: 'Fee operations', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Mandates & AutoPay' }).click();

  const workspace = page.getByRole('region', {
    name: 'Mandate and recurring collections workspace',
  });
  await expect(page.getByText(/Some fee data could not load: communications/)).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^Mandates \(/ })).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^Setup attempts \(/ })).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^Automatic debits \(/ })).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^Settlements \(/ })).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^Checkouts \(/ })).toBeVisible();

  await workspace.getByRole('button', { name: /^Settlements \(/ }).click();
  await expect(workspace.getByLabel('Search settlements')).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^Settlements \(/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await workspace.getByRole('button', { name: /^Setup attempts \(/ }).click();
  await expect(workspace.getByLabel('Search setup attempts')).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Refresh records' })).toBeEnabled();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
});
