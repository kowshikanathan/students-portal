import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MandateWorkspace } from '../../apps/web/src/components/admin/mandate-workspace';

const emptyData = {
  mandates: [],
  setups: [],
  debits: [],
  settlements: [],
  checkouts: [],
};

test('mandate dashboard renders five accessible interactive views and refresh action', () => {
  const html = renderToStaticMarkup(
    createElement(MandateWorkspace, {
      data: emptyData,
      schedules: [],
      providerMode: 'disabled',
      readOnly: false,
      onRefresh: async () => {},
      onPayerLink: async () => '/payer/safe/',
    }),
  );
  for (const label of [
    'Mandates (0)',
    'Setup attempts (0)',
    'Automatic debits (0)',
    'Settlements (0)',
    'Checkouts (0)',
  ]) {
    assert.ok(html.includes(label), label);
  }
  assert.ok(html.includes('Refresh records'));
  assert.ok(html.includes('No mandates found'));
  assert.ok(html.includes('Live eNACH authorization is unavailable'));
  assert.ok(!html.includes('Generate payer link'));
});

test('active payer schedule renders a controlled authorization link action', () => {
  const html = renderToStaticMarkup(
    createElement(MandateWorkspace, {
      data: {
        ...emptyData,
        mandates: [
          { id: 'm1', account_reference: 'FEE-1001', status: 'active', rail: 'enach' },
        ],
      },
      schedules: [
        { id: 's1', account_reference: 'FEE-1001', payer_id: 'p1', status: 'active' },
      ],
      providerMode: 'mandate_api',
      providerName: 'approved-provider',
      readOnly: false,
      onRefresh: async () => {},
      onPayerLink: async () => '/payer/safe/',
    }),
  );
  assert.ok(html.includes('Generate payer link'));
  assert.ok(html.includes('View details'));
  assert.ok(html.includes('FEE-1001'));
  assert.ok(html.includes('eNACH'));
  assert.ok(html.includes('enabled by configuration'));
});

test('read-only institution cannot create payer portal links', () => {
  const html = renderToStaticMarkup(
    createElement(MandateWorkspace, {
      data: emptyData,
      schedules: [
        { id: 's1', account_reference: 'FEE-1001', payer_id: 'p1', status: 'active' },
      ],
      readOnly: true,
      onRefresh: async () => {},
      onPayerLink: async () => { throw new Error('Should never be called'); },
    }),
  );
  assert.match(html, /disabled=""[^>]*>Generate payer link/);
  assert.ok(html.includes('institution is read-only'));
});
