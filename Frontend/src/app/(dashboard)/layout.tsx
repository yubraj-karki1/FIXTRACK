import { DashboardLayout } from '@/components/FixTrackScreens';

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
