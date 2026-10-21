import { test, expect } from '@playwright/test';
import { authenticator } from 'otplib';
import AxeBuilder from '@axe-core/playwright';

test('finance layout preserves navigation and supports narrow windows and onboarding', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop-chromium',
    'This scenario checks all viewport sizes in one authenticated session.',
  );
  test.setTimeout(240000);
  expect(['test', 'demo']).toContain(process.env.DEPLOYMENT_MODE);
  const response = await page.request.post('/api/v1/auth/login', {
    headers: { Origin: process.env.SITE_URL! },
    data: {
      email: process.env.OWNER_EMAIL,
      password: process.env.OWNER_PASSWORD,
      otp: authenticator.generate(process.env.OWNER_TOTP_SECRET!),
    },
  });
  expect(response.status()).toBe(201);
  const auth = await response.json();
  try {
    await page.goto('/admin/');
    await expect(
      page.getByRole('heading', { name: 'Finance operations', exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.finance-metric')).toHaveCount(12);
    for (const [width, height] of [
      [1440, 900],
      [992, 534],
      [768, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
      ).toBe(true);
      const cards = await page
        .locator('.finance-metrics-primary .finance-metric')
        .evaluateAll((elements) =>
          elements.map((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, width: r.width };
          }),
        );
      expect(
        cards.every((card) => card.left >= 0 && card.right <= width && card.width >= 120),
      ).toBe(true);
      if (width <= 850) {
        await page.getByRole('button', { name: 'Open finance navigation' }).click();
        await expect(page.getByRole('navigation', { name: 'Finance navigation' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('navigation', { name: 'Finance navigation' })).toBeHidden();
        await expect(page.getByRole('button', { name: 'Open finance navigation' })).toBeFocused();
      }
      await page.screenshot({ path: '.data/finance-dashboard-' + width + '.png', fullPage: true });
    }
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      accessibility.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    await page.setViewportSize({ width: 1280, height: 900 });
    const navigation = page.getByRole('navigation', { name: 'Finance navigation' });
    for (const [label, path] of [
      ['Students', 'students'],
      ['Installments', 'installments'],
      ['Payments', 'payments'],
      ['Settlements', 'settlements'],
      ['Flex / eNACH', 'enach'],
      ['Cashflow', 'cashflow'],
      ['Overdue', 'overdue'],
      ['Reports', 'reports'],
      ['Bulk Actions', 'bulk'],
      ['Institutes', 'tenant'],
      ['Groups / Classes', 'groups'],
      ['Users', 'users'],
      ['Settings', 'settings'],
    ]) {
      await navigation.getByRole('button', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp('/admin/' + path + '/?$'));
      await expect(page.getByRole('heading', { name: label, exact: true, level: 1 })).toBeVisible({
        timeout: 30000,
      });
      await expect(
        page.getByText('This page is temporarily unavailable.', { exact: true }),
      ).toHaveCount(0);
    }
    await navigation.getByRole('button', { name: 'Payments', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/payments\/?$/);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Payments', exact: true, level: 1 }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Finance navigation' })
      .getByRole('button', { name: 'Settlements', exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/settlements\/?$/);
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Payments', exact: true, level: 1 }),
    ).toBeVisible();
    await page.goto('/admin/');
    await page.getByRole('link', { name: '+ New Student', exact: true }).click();
    await expect(page.getByLabel('Enrollment / Student ID')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByLabel('Enrollment / Student ID')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open finance navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Finance navigation' })
      .getByRole('button', { name: 'Payments', exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/payments\/?$/);
    await expect(page.getByRole('navigation', { name: 'Finance navigation' })).toBeHidden();
    await page.locator('.finance-session-menu > summary').click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your institution workspace.', exact: true }),
    ).toBeVisible({ timeout: 30000 });
  } finally {
    await page.request
      .post('/api/v1/auth/logout', {
        timeout: 10000,
        headers: { Origin: process.env.SITE_URL!, 'X-CSRF-Token': auth.csrf },
        data: {},
      })
      .catch(() => undefined);
  }
});
