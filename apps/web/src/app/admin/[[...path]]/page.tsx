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
  return <AdminShell initialArea={path?.[0] === 'enach' ? 'enach' : 'overview'} />;
}
