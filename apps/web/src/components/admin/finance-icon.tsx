const paths: Record<string, string> = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  academic:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  installments:
    'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2 M8 14h2 M14 14h2 M8 18h2',
  payments: 'M3 5h18v14H3z M3 9h18 M7 15h4',
  settlements: 'M3 10h18 M5 10v8 M10 10v8 M15 10v8 M20 10v8 M2 21h20 M12 2l10 6H2z',
  enach: 'M20 7a8 8 0 0 0-14-2L3 8 M3 3v5h5 M4 17a8 8 0 0 0 14 2l3-3 M21 21v-5h-5',
  cashflow: 'M3 3v18h18 M7 14l4-4 4 3 6-7',
  overdue: 'M12 8v5 M12 17h.01 M12 3L2 21h20z',
  reports: 'M14 2H4v20h16V8z M14 2v6h6 M8 12h8 M8 16h8',
  bulk: 'M8 3h13v13 M3 8h13v13H3z M7 14h5 M9.5 11.5v5',
  tenant: 'M4 22V3h12v19 M16 9h4v13 M8 7h4 M8 11h4 M8 15h4 M8 22v-3h4v3',
  groups: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  users: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
};
export function FinanceIcon({ name }: { name: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.overview} />
    </svg>
  );
}
