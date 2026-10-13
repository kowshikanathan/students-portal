import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EnachDashboard } from '../../apps/web/src/components/admin/enach-dashboard';
import { allowedAdminAreas, canViewAdminArea } from '../../apps/web/src/components/admin/access';

test('Dodo eNACH dashboard uses existing mandate controls and never suggests a live bank is connected', () => {
  const html = renderToStaticMarkup(
    createElement(EnachDashboard, { openFeeOperations: () => {} }),
  );
  assert.match(html, /Dodo · eNACH operations/);
  assert.match(html, /eNACH &amp; AutoPay dashboard/);
  assert.match(html, /Mandates \(0\)/);
  assert.match(html, /Setup attempts \(0\)/);
  assert.match(html, /Automatic debits \(0\)/);
  assert.match(html, /Settlements \(0\)/);
  assert.match(html, /Checkouts \(0\)/);
  assert.match(html, /Create payer profile/);
  assert.match(html, /Create fee schedule/);
  assert.match(html, /Reconciliation and evidence review/);
  assert.match(html, /Live eNACH authorization is unavailable/);
});

test('eNACH dashboard follows the existing owner-only fee operations authorization', () => {
  assert.ok(canViewAdminArea('owner', 'fees'));
  assert.ok(canViewAdminArea('owner', 'enach'));
  assert.ok(allowedAdminAreas.owner.includes('enach'));
  for (const role of ['editor', 'sales', 'analyst', 'visitor']) {
    assert.equal(canViewAdminArea(role, 'enach'), false);
  }
});
