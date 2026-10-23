import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/shell';
import { mandateViews } from '@/components/admin/mandate-view-model';
export const metadata = { title: 'Dodo eNACH', robots: { index: false, follow: false } };
export default async function EnachSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (
    ![...mandateViews.map((item) => item.id), 'custom-fields', 'reports', 'recovery'].includes(
      section,
    )
  )
    notFound();
  return <AdminShell standaloneEnach initialArea="enach" {...({ initialEnachPage: section } as Record<string, unknown>)} />;
}
