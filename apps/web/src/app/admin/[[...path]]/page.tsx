import { AdminShell } from '@/components/admin/shell';

export const metadata = {
  title: 'Dodo | Institution Console',
  robots: { index: false, follow: false },
};

export default async function Admin({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  if (path?.[0] === 'students') {
    const rawId = path[1] ? decodeURIComponent(path[1]) : undefined;
    const studentId = !rawId || rawId === 'undefined' ? undefined : rawId;
    return <AdminShell initialArea="academic" studentId={studentId} />;
  }
  if (path?.[0] === 'fees') {
    const target = path[1];
    return (
      <AdminShell
        initialArea="fees"
        initialFeeTarget={
          target === 'payer' || target === 'schedule' || target === 'reconciliation' ? target : null
        }
      />
    );
  }
  return <AdminShell initialArea={path?.[0] || 'overview'} />;
}
