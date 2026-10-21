import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReceiptEmail } from '../../apps/api/src/email';

test('receipt email renders configured templates as plain text from supplied records', () => {
  const message = renderReceiptEmail(
    {
      subject_line: 'Receipt {{receipt_number}}',
      greeting_text: 'Dear {{parent_name}}',
      body_template: '{{student_name}} paid {{amount}} on {{date}}. {{transaction_id}}',
    },
    {
      receipt_number: 'RCP-TEST',
      parent_name: 'Synthetic Parent',
      student_name: 'Synthetic Student',
      amount: 'INR 100.00',
      date: '21/10/2026',
      transaction_id: 'TEST-123',
    },
  );
  assert.equal(message.subject, 'Receipt RCP-TEST');
  assert.match(message.text, /Synthetic Student paid INR 100.00/);
  assert.ok(!message.text.includes('{{'));
});
