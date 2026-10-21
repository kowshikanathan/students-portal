/** Render institution templates from the immutable receipt snapshot. Delivery stays in the existing outbox worker. */
export function renderReceiptEmail(
  config: Record<string, unknown>,
  values: Record<string, string>,
) {
  const render = (value: unknown, fallback: string) =>
    String(value || fallback).replace(/{{([a-z_]+)}}/g, (_, key) => values[key] || '');
  return {
    senderName: render(
      config.sender_name || config.sender_display_name,
      '{{institution_name}} Finance',
    ),
    subject: render(
      config.subject_line || config.subject,
      'Payment Receipt {{receipt_number}} - {{institution_name}}',
    ),
    text: [
      render(config.greeting_text || config.greeting, 'Dear {{payer_name}},'),
      '',
      render(
        config.body_template || config.intro_message,
        'We have received {{amount}} for {{student_name}}. Receipt: {{receipt_number}}. Transaction: {{transaction_id}}. Date: {{payment_date}}.',
      ),
      render(config.confirmation_message, ''),
      render(config.support_details, ''),
      render(config.footer, ''),
    ].join('\n'),
  };
}
