import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/shell';

export const metadata = {
  title: 'Dodo | Owner Console',
  robots: { index: false, follow: false },
};

export default async function Admin({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  if (path?.[0] === 'enach') redirect('/enach/');
  if (path?.[0] === 'fees') {
    const target = path[1];
    return (
      <AdminShell
        initialArea="fees"
        initialFeeTarget={
          target === 'payer' || target === 'schedule' || target === 'reconciliation'
            ? target
            : null
        }
      />
    );
  }
  return <AdminShell />;
}
