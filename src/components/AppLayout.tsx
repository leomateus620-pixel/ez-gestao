import { SmartNavigationShell } from '@/navigation/components/SmartNavigationShell';

interface AppLayoutProps { children: React.ReactNode }

export function AppLayout({ children }: AppLayoutProps) {
  return <SmartNavigationShell>{children}</SmartNavigationShell>;
}
