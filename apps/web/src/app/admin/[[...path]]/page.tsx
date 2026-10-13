import { AdminShell } from '@/components/admin/shell';
export const metadata = {
  title: 'Dodo | Owner Console',
  robots: { index: false, follow: false },
};
export default function Admin() {
  return <AdminShell />;
}
