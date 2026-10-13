import { AdminShell } from '@/components/admin/shell';

export const metadata = {
  title: 'Dodo eNACH | Mandates & AutoPay',
  robots: { index: false, follow: false },
};

export default function EnachApp() {
  return <AdminShell standaloneEnach initialArea="enach" />;
}
