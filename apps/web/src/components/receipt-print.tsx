'use client';
export function ReceiptPrint() {
  return (
    <button type="button" className="button primary no-print" onClick={() => window.print()}>
      Print / Save PDF
    </button>
  );
}
