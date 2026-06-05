import { Bell, LogOut, Search, User2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DynamicIslandPanel } from '@/navigation/components/DynamicIslandPanel';
import { ContextualQuickActions } from '@/navigation/components/ContextualQuickActions';
import { resolveContextualMenu, type MenuCounters } from '@/navigation/engine/contextual-menu-engine';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNavigationUiState } from '@/navigation/state/NavigationStateProvider';
import { useAuth } from '@/auth/AuthProvider';

export function SmartTopbar({ counters, isHidden = false }: { counters: MenuCounters; isHidden?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const { activeTopbarPanel, setActiveTopbarPanel } = useNavigationUiState();
  const model = resolveContextualMenu({ pathname: location.pathname, isMobile: false, counters });
  const activeMenu = model.visiblePrimary.find((m) => m.id === model.activeMenuId);

  const shouldCollapse = isHidden && !activeTopbarPanel;

  return (
    <header
      className={cn(
        'sticky top-0 z-30 overflow-hidden border-b border-white/35 bg-background/50 px-4 backdrop-blur-2xl transition-[max-height,padding,opacity,transform] duration-300 ease-out will-change-transform',
        shouldCollapse
          ? 'max-h-0 -translate-y-4 py-0 opacity-0 pointer-events-none'
          : 'max-h-96 translate-y-0 py-3 opacity-100',
      )}
    >
      <DynamicIslandPanel className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden h-10 w-1.5 rounded-full bg-gradient-to-b from-primary via-blue-500 to-accent shadow-[0_0_24px_rgba(37,99,235,0.36)] sm:block" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/62">Contexto ativo</p>
            <p className="truncate font-display text-sm font-extrabold tracking-tight text-foreground">{activeMenu?.label ?? 'Painel'}</p>
          </div>
        </div>

        <div className="hidden xl:block"><ContextualQuickActions actions={model.quickActions} /></div>

        <div className="flex items-center gap-1 rounded-full border border-white/45 bg-white/35 p-1 shadow-inner backdrop-blur-xl">
          <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => setActiveTopbarPanel(activeTopbarPanel === 'search' ? undefined : 'search')} aria-label="Busca global"><Search className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="relative h-9 w-9 rounded-full" onClick={() => setActiveTopbarPanel(activeTopbarPanel === 'notifications' ? undefined : 'notifications')} aria-label="Notificações"><Bell className="h-4 w-4" />{counters.alerts > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-white bg-rose-500" />}</Button>
          <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => setActiveTopbarPanel(activeTopbarPanel === 'profile' ? undefined : 'profile')} aria-label="Perfil"><User2 className="h-4 w-4" /></Button>
        </div>
      </DynamicIslandPanel>

      {activeTopbarPanel && (
        <div className="mx-auto mt-2 flex max-w-[1240px] justify-end">
          <DynamicIslandPanel className="w-[360px] p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-primary/60">{activeTopbarPanel}</p>
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => setActiveTopbarPanel(undefined)}><X className="h-4 w-4" /></Button>
            </div>

            {activeTopbarPanel === 'search' && (
              <div className="space-y-2">
                <input className="h-10 w-full rounded-2xl border border-white/55 bg-white/55 px-3 text-sm outline-none ring-primary/40 backdrop-blur-xl focus:ring-2" placeholder="Buscar em dashboard, guias, empresas e integrações..." />
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
