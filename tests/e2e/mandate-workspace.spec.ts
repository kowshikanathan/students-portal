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

  // The dedicated Dodo eNACH area must be independently navigable without
  // creating a second financial service or provider authorization path.
  await expect(
    page.getByRole('button', { name: 'eNACH & AutoPay', exact: true }),
  ).toHaveCount(0);
  await page.goto('/enach/');
  await expect(page).toHaveURL(/\/enach\/?$/);
  await expect(page.locator('.admin-logo')).toContainText('Dodo eNACH');
  await expect(page.getByRole('navigation', { name: 'eNACH navigation' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'eNACH & AutoPay dashboard' }),
  ).toBeVisible();
  const dedicated = page.getByRole('region', {
    name: 'Mandate and recurring collections workspace',
  });
  await dedicated.getByRole('button', { name: /^Settlements \\(/ }).click();
  await expect(dedicated.getByLabel('Search settlements')).toBeVisible();
  await dedicated.getByRole('button', { name: /^Setup attempts \\(/ }).click();
  await expect(dedicated.getByLabel('Search setup attempts')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'eNACH & AutoPay dashboard' })).toBeVisible();
  // Responsive audit: the dedicated dashboard and its controls must fit
  // desktop, tablet and mobile viewports without clipping or overlap.
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const measured = await page.locator('.admin-main').evaluate((main) => {
      const rect = main.getBoundingClientRect();
      const body = main.ownerDocument.body;
      return {
        mainWidth: rect.width,
        viewportWidth: main.ownerDocument.documentElement.clientWidth,
        bodyWidth: body.scrollWidth,
        mainContentWidth: main.scrollWidth,
      };
    });
    expect(measured.bodyWidth, 'page must not overflow at ' + width).toBeLessThanOrEqual(
      measured.viewportWidth + 2,
    );
    expect(
      measured.mainContentWidth,
      'eNACH fields and cards must fit the admin content at ' + width,
    ).toBeLessThanOrEqual(measured.mainWidth + 2);
    await expect(dedicated.getByRole('button', { name: /^Mandates \\(/ })).toBeVisible();
    await dedicated.getByRole('button', { name: /^Automatic debits \\(/ }).click();
    await expect(dedicated.getByLabel('Search automatic debits')).toBeVisible();
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole('button', { name: 'Create fee schedule' }).click();
  await expect(page).toHaveURL(/\/admin\/fees\/schedule\/?$/);
  await expect(page.getByRole('heading', { name: 'Create fee schedule' })).toBeVisible();

  // Return to Studio and verify that no eNACH menu item appears there.
  await page.goto('/admin/');
  await expect(page.getByRole('navigation', { name: 'Owner navigation' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Owner navigation' }).getByText('eNACH & AutoPay'),
  ).toHaveCount(0);

  // The mandate workspace must remain functional if an unrelated dashboard
  // endpoint is temporarily unavailable.
  let failCommunicationsOnce = true;
  await page.route('**/api/v1/admin/fees/communications', async (route) => {
    if (!failCommunicationsOnce) {
      await route.continue();
      return;
    }
    failCommunicationsOnce = false;
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
  // Mandate controls must precede the long payer/schedule forms and occupy
  // the main content width, not a buried half-width summary column.
  const workspaceBounds = await workspace.boundingBox();
  const scheduleFormBounds = await page
    .getByRole('heading', { name: 'Create fee schedule' })
    .boundingBox();
  expect(workspaceBounds).not.toBeNull();
  expect(scheduleFormBounds).not.toBeNull();
  expect(workspaceBounds!.y).toBeLessThan(scheduleFormBounds!.y);
  await expect(workspace.getByRole('button', { name: /^Mandates \(/ })).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^Setup attempts \(/ })).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^Automatic debits \(/ })).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^Settlements \(/ })).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^Checkouts \(/ })).toBeVisible();

  await page.getByRole('button', { name: 'Retry loading fee data' }).click();
  await expect(page.getByText(/Some fee data could not load: communications/)).toBeHidden();

  await workspace.getByRole('button', { name: /^Settlements \(/ }).click();
  await expect(workspace.getByLabel('Search settlements')).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^Settlements \(/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await workspace.getByRole('button', { name: /^Automatic debits \(/ }).click();
  await expect(workspace.getByLabel('Search automatic debits')).toBeVisible();
  await workspace.getByRole('button', { name: /^Checkouts \(/ }).click();
  await expect(workspace.getByLabel('Search checkouts')).toBeVisible();
  await workspace.getByRole('button', { name: /^Mandates \(/ }).click();
  await expect(workspace.getByLabel('Search mandates')).toBeVisible();

  await workspace.getByRole('button', { name: /^Setup attempts \(/ }).click();
  await expect(workspace.getByLabel('Search setup attempts')).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Refresh records' })).toBeEnabled();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
});
