import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DynamicIslandPanel } from '@/navigation/components/DynamicIslandPanel';
import { MenuIconRenderer } from '@/navigation/components/MenuIconRenderer';
import { resolveContextualMenu, type MenuCounters } from '@/navigation/engine/contextual-menu-engine';
import { useNavigationUiState } from '@/navigation/state/NavigationStateProvider';
import { menuRegistry } from '@/navigation/menu-registry';
import { preloadRoute } from '@/navigation/route-preload';
import { cn } from '@/lib/utils';

const menuAccent: Record<string, string> = {
  dashboard: 'from-brand-orange-deep via-primary to-brand-orange-light',
  guias: 'from-brand-orange-deep via-primary to-brand-metal-blue',
  empresas: 'from-brand-orange-deep via-primary to-emerald-500',
  integracoes: 'from-brand-metal-blue via-primary to-brand-orange-light',
  'fator-r': 'from-brand-orange-deep via-primary to-brand-orange-light',
  classifica: 'from-brand-orange-deep via-primary to-brand-metal-blue',
  whatsapp: 'from-brand-orange-deep via-primary to-emerald-500',
  configuracoes: 'from-brand-warm-shadow via-brand-orange-deep to-brand-metal-blue',
  'legacy-consulta': 'from-brand-metal-blue via-primary to-brand-orange-light',
};

export function SmartSidebar({ counters }: { counters: MenuCounters }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hoveredMenuId, setHoveredMenuId, closeAllPanels } = useNavigationUiState();
  const model = resolveContextualMenu({ pathname: location.pathname, isMobile: false, counters });

  const preview = useMemo(() => menuRegistry.find((item) => item.id === hoveredMenuId), [hoveredMenuId]);
  const navigateTo = useCallback((route: string) => {
    preloadRoute(route);
    closeAllPanels();
    if (location.pathname !== route) navigate(route);
  }, [closeAllPanels, location.pathname, navigate]);
  const previewRoute = useCallback((menuId: string, route: string) => {
    setHoveredMenuId(menuId);
    preloadRoute(route);
  }, [setHoveredMenuId]);

  return (
    <aside className="relative z-50 w-[92px] border-r border-white/55 bg-[linear-gradient(180deg,hsl(var(--brand-warm-canvas)/0.76),hsl(var(--brand-warm-surface)/0.58)),radial-gradient(circle_at_50%_0%,hsl(var(--brand-orange-light)/0.18),transparent_44%),radial-gradient(circle_at_50%_100%,hsl(var(--brand-metal-blue)/0.10),transparent_48%)] px-3 py-4 shadow-[inset_-1px_0_0_rgba(255,255,255,0.78),0_20px_60px_-44px_hsl(var(--brand-warm-shadow))] backdrop-blur-2xl">
      <div className="mb-5 flex justify-center">
        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-brand-orange-deep via-primary to-brand-orange-light p-[1px] shadow-[0_16px_34px_-22px_hsl(var(--brand-warm-shadow))]">
          <div className="flex h-full w-full items-center justify-center rounded-2xl bg-white/72 text-[11px] font-black tracking-tight text-primary backdrop-blur-xl">EZ</div>
        </div>
      </div>

      <nav aria-label="Navegação principal" className="space-y-2.5">
        {model.visiblePrimary.map((item) => {
          const active = model.activeMenuId === item.id;
          const accent = menuAccent[item.id] ?? 'from-primary to-accent';
          return (
            <div key={item.id} onMouseEnter={() => previewRoute(item.id, item.route)} onMouseLeave={() => setHoveredMenuId(undefined)}>
              <button
                type="button"
                onClick={() => navigateTo(item.route)}
                onFocus={() => previewRoute(item.id, item.route)}
                className={cn(
                  'group relative w-full rounded-[22px] p-1.5 transition-[background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                  active ? 'bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_32px_-22px_hsl(var(--brand-warm-shadow))] ring-1 ring-primary/28' : 'hover:bg-brand-warm-surface/58 hover:shadow-sm',
                )}
                aria-label={item.a11yLabel}
                aria-current={active ? 'page' : undefined}
              >
                <span className={cn('absolute -left-1.5 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b opacity-0 transition', accent, active && 'opacity-100')} />
                <span className={cn('absolute inset-1 rounded-[18px] bg-gradient-to-br opacity-0 blur-md transition', accent, active ? 'opacity-24' : 'group-hover:opacity-14')} />
                <MenuIconRenderer Icon={item.icon} active={active} menuId={item.id} />
                {item.badgeKey && counters[item.badgeKey] > 0 && <span className="absolute right-1 top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">{counters[item.badgeKey]}</span>}
              </button>
            </div>
          );
        })}
      </nav>

      {preview && (
        <DynamicIslandPanel className="absolute left-[92px] top-4 z-[70] w-[340px] animate-in fade-in zoom-in-95 duration-200 p-4">
          <div className="flex items-start gap-3">
            <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', menuAccent[preview.id] ?? 'from-primary to-accent')}>
              <preview.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold tracking-tight text-foreground">{preview.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground/78">{preview.shortDescription}</p>
            </div>
          </div>
          {!!preview.children?.length && (
            <div className="mt-3 grid gap-1.5">
              {preview.children.map((childId) => {
                const child = menuRegistry.find((entry) => entry.id === childId);
                if (!child) return null;
                const isActive = location.pathname.startsWith(child.route);
                return (
                  <button
                    key={child.id}
                    type="button"
                    onMouseEnter={() => preloadRoute(child.route)}
                    onFocus={() => preloadRoute(child.route)}
                    onClick={() => navigateTo(child.route)}
                    className={cn('flex items-center justify-between rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50', isActive ? 'border-primary/30 bg-primary/12 text-foreground' : 'border-primary/10 bg-white/88 text-foreground/82 hover:border-primary/24 hover:bg-brand-warm-surface/78')}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span>{child.label}</span>
                    {child.badgeKey && counters[child.badgeKey] > 0 && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">{counters[child.badgeKey]}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {!!model.legacy.length && (
            <div className="mt-3 border-t border-primary/10 pt-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/58">Legado</p>
              {model.legacy.map((legacy) => (
                <button
                  key={legacy.id}
                  type="button"
                  onMouseEnter={() => preloadRoute(legacy.route)}
                  onFocus={() => preloadRoute(legacy.route)}
                  onClick={() => navigateTo(legacy.route)}
                  className="w-full rounded-xl px-2 py-1.5 text-left text-xs font-medium text-foreground/74 transition hover:bg-brand-warm-surface/78 hover:text-foreground/90"
                >
                  {legacy.label}
                </button>
              ))}
            </div>
          )}
        </DynamicIslandPanel>
      )}
    </aside>
  );
}
