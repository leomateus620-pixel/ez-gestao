import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useDataStore } from '@/data/DataProvider';
import { useAutomation } from '@/data/AutomationProvider';
import { useGuides } from '@/features/guias/GuideProvider';
import { NavigationStateProvider, useNavigationUiState } from '@/navigation/state/NavigationStateProvider';
import { SmartSidebar } from '@/navigation/components/SmartSidebar';
import { SmartTopbar } from '@/navigation/components/SmartTopbar';

function ShellContent({ children }: { children: React.ReactNode }) {
  const { state } = useDataStore();
  const { pendingExceptions } = useAutomation();
  const { metrics } = useGuides();
  const containerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { closeAllPanels } = useNavigationUiState();

  const counters = useMemo(
    () => ({
      guidesWaiting: metrics.waiting,
      guideExceptions: metrics.reviewing,
      alerts: state.alertas.filter((a) => !a.lido && !a.resolvido).length,
      legacyExceptions: pendingExceptions,
    }),
    [metrics.waiting, metrics.reviewing, pendingExceptions, state.alertas],
  );

  useEffect(() => {
    closeAllPanels();
  }, [location.pathname, closeAllPanels]);

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAllPanels();
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        closeAllPanels();
      }
    };

    document.addEventListener('keydown', onKeydown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [closeAllPanels]);

  return (
    <div ref={containerRef} className="min-h-screen flex w-full">
      <SmartSidebar counters={counters} />
      <div className="flex min-w-0 flex-1 flex-col">
        <SmartTopbar counters={counters} />
        <main className="liquid-stage flex-1 overflow-auto p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function SmartNavigationShell({ children }: { children: React.ReactNode }) {
  return (
    <NavigationStateProvider>
      <ShellContent>{children}</ShellContent>
    </NavigationStateProvider>
  );
}
