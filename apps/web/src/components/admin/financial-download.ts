const escape = (value: unknown) =>
  String(value ?? '—')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** Print-ready standalone HTML; every record value is treated as plain text. */
export function downloadFinancialDocument(
  title: string,
  rows: Array<[string, unknown]>,
  filename: string,
) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><style>body{font:15px system-ui,sans-serif;color:#172b3a;max-width:800px;margin:48px auto;padding:24px}h1{font-size:26px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #dce3e8}th{width:40%;color:#526173}footer{margin-top:28px;font-size:12px;color:#526173}@media print{body{margin:0}}</style></head><body><h1>${escape(title)}</h1><table><tbody>${rows.map(([label, value]) => `<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`).join('')}</tbody></table><footer>Education fee account record. Print this document or save it as PDF from your browser.</footer></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace(/[^A-Za-z0-9._-]/g, '_') + '.html';
  link.click();
  URL.revokeObjectURL(url);
}
