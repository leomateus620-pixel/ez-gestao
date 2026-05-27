import { Bell, LogOut, Search, User2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DynamicIslandPanel } from '@/navigation/components/DynamicIslandPanel';
import { ContextualQuickActions } from '@/navigation/components/ContextualQuickActions';
import { resolveContextualMenu, type MenuCounters } from '@/navigation/engine/contextual-menu-engine';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNavigationUiState } from '@/navigation/state/NavigationStateProvider';
import { useAuth } from '@/auth/AuthProvider';

export function SmartTopbar({ counters }: { counters: MenuCounters }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const { activeTopbarPanel, setActiveTopbarPanel } = useNavigationUiState();
  const model = resolveContextualMenu({ pathname: location.pathname, isMobile: false, counters });

  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/60 px-4 py-3 backdrop-blur-xl">
      <DynamicIslandPanel className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 rounded-[28px] px-5 py-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.12em] text-foreground/45">Contexto ativo</p>
          <p className="truncate text-sm font-semibold">{model.activeMenuId ? model.visiblePrimary.find((m) => m.id === model.activeMenuId)?.label : 'Painel'}</p>
        </div>

        <div className="hidden xl:block"><ContextualQuickActions actions={model.quickActions} /></div>

        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setActiveTopbarPanel(activeTopbarPanel === 'search' ? undefined : 'search')} aria-label="Busca global"><Search className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="relative" onClick={() => setActiveTopbarPanel(activeTopbarPanel === 'notifications' ? undefined : 'notifications')} aria-label="Notificações"><Bell className="h-4 w-4" />{counters.alerts > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />}</Button>
          <Button size="icon" variant="ghost" onClick={() => setActiveTopbarPanel(activeTopbarPanel === 'profile' ? undefined : 'profile')} aria-label="Perfil"><User2 className="h-4 w-4" /></Button>
        </div>
      </DynamicIslandPanel>

      {activeTopbarPanel && (
        <div className="mx-auto mt-2 flex max-w-[1240px] justify-end">
          <DynamicIslandPanel className="w-[360px]">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground/50">{activeTopbarPanel}</p>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setActiveTopbarPanel(undefined)}><X className="h-4 w-4" /></Button>
            </div>

            {activeTopbarPanel === 'search' && (
              <div className="space-y-2">
                <input className="h-10 w-full rounded-xl border border-white/20 bg-white/[0.03] px-3 text-sm outline-none ring-primary/40 focus:ring-2" placeholder="Buscar em dashboard, guias, empresas e integrações..." />
                <p className="text-xs text-foreground/55">Dica: você pode digitar nome da empresa, CNPJ ou módulo.</p>
              </div>
            )}

            {activeTopbarPanel === 'notifications' && (
              <div className="space-y-2">
                <p className="text-sm">Você tem <strong>{counters.alerts}</strong> alertas pendentes.</p>
                <Button size="sm" variant="secondary" onClick={() => navigate('/alertas')}>Abrir central de alertas</Button>
              </div>
            )}

            {activeTopbarPanel === 'profile' && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">{session?.user.email}</p>
                <p className="text-xs text-foreground/60">Administrador</p>
                <Button variant="outline" className="w-full justify-start" onClick={() => signOut()}><LogOut className="mr-2 h-4 w-4" />Sair</Button>
              </div>
            )}
          </DynamicIslandPanel>
        </div>
      )}
    </header>
  );
}
