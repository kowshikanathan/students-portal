import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EnachDashboard } from '../../apps/web/src/components/admin/enach-dashboard';

const render = (page: string) =>
  renderToStaticMarkup(createElement(EnachDashboard, { page, openFeeOperations: () => {} }));

test('overview only shows collection intelligence, without unrelated forms', () => {
  const html = render('overview');
  assert.match(html, /Collection overview/);
  assert.doesNotMatch(html, /id="enach-custom-fields"|id="enach-reports"|Mandate record views/);
});

test('custom fields and reports have separate focused pages', () => {
  const fields = render('custom-fields');
  assert.match(fields, /id="enach-custom-fields"/);
  assert.doesNotMatch(fields, /id="enach-reports"|Collection overview/);
  const reports = render('reports');
  assert.match(reports, /id="enach-reports"/);
  assert.doesNotMatch(reports, /id="enach-custom-fields"|Collection overview/);
});

test('automatic debit page explains its provider requirement without claiming activation', () => {
  const html = render('debits');
  assert.match(html, /Connect a provider to enable AutoPay/);
  assert.match(html, /Provider not connected/);
  assert.doesNotMatch(html, /id="enach-reports"|id="enach-custom-fields"|Mandate record views/);
});
