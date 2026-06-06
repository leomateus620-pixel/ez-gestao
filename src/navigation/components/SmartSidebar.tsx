import { startTransition, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DynamicIslandPanel } from '@/navigation/components/DynamicIslandPanel';
import { MenuIconRenderer } from '@/navigation/components/MenuIconRenderer';
import { resolveContextualMenu, routeMatchesPath, type MenuCounters } from '@/navigation/engine/contextual-menu-engine';
import { useNavigationUiState } from '@/navigation/state/NavigationStateProvider';
import { menuRegistry } from '@/navigation/menu-registry';
import { preloadRoute } from '@/navigation/route-preload';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/BrandLogo';
import { useIsMobile } from '@/hooks/use-mobile';

const menuAccent: Record<string, string> = {
  dashboard: 'from-brand-orange-deep/90 via-sidebar-primary/85 to-brand-orange-light/75',
  guias: 'from-brand-orange-deep/86 via-sidebar-primary/74 to-brand-metal-blue/70',
  empresas: 'from-brand-orange-deep/82 via-sidebar-primary/70 to-emerald-500/68',
  integracoes: 'from-brand-metal-blue/82 via-sidebar-primary/64 to-brand-orange-light/70',
  'fator-r': 'from-brand-orange-deep/88 via-sidebar-primary/76 to-brand-orange-light/72',
  classifica: 'from-brand-orange-deep/84 via-sidebar-primary/70 to-brand-metal-blue/72',
  envios: 'from-brand-orange-deep/80 via-sidebar-primary/66 to-sky-500/66',
  alertas: 'from-rose-500/82 via-sidebar-primary/68 to-brand-orange-light/70',
  whatsapp: 'from-brand-orange-deep/82 via-sidebar-primary/68 to-emerald-500/66',
  configuracoes: 'from-brand-warm-shadow/86 via-brand-orange-deep/72 to-brand-metal-blue/72',
};

export function SmartSidebar({ counters }: { counters: MenuCounters }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { hoveredMenuId, setHoveredMenuId, closeAllPanels } = useNavigationUiState();
  const model = resolveContextualMenu({ pathname: location.pathname, isMobile, counters });
  const navigatingToRef = useRef<string>();

  const preview = useMemo(() => menuRegistry.find((item) => item.id === hoveredMenuId), [hoveredMenuId]);
  const navigateTo = useCallback((route: string) => {
    if (location.pathname === route || navigatingToRef.current === route) {
      closeAllPanels();
      return;
    }

    navigatingToRef.current = route;
    preloadRoute(route);
    closeAllPanels();
    startTransition(() => {
      navigate(route);
      window.setTimeout(() => {
        if (navigatingToRef.current === route) navigatingToRef.current = undefined;
      }, 350);
    });
  }, [closeAllPanels, location.pathname, navigate]);
  const previewRoute = useCallback((menuId: string, route: string) => {
    setHoveredMenuId(menuId);
    preloadRoute(route);
  }, [setHoveredMenuId]);

  return (
    <aside
      className="relative sticky top-0 z-50 h-screen w-[92px] shrink-0 border-r border-sidebar-border/70 bg-[linear-gradient(180deg,hsl(var(--brand-warm-canvas)/0.84),hsl(var(--brand-warm-surface)/0.66)),radial-gradient(circle_at_50%_0%,hsl(var(--brand-orange-light)/0.10),transparent_44%),radial-gradient(circle_at_50%_100%,hsl(var(--brand-metal-blue)/0.08),transparent_48%)] px-3 py-4 shadow-[inset_-1px_0_0_rgba(255,255,255,0.78),0_20px_60px_-44px_hsl(var(--brand-warm-shadow))] backdrop-blur-2xl"
      onMouseLeave={() => setHoveredMenuId(undefined)}
    >
      <div className="mb-5 flex justify-center">
        <BrandLogo className="h-10 w-10" />
      </div>

      <nav aria-label="Navegação principal" className="max-h-[calc(100vh-6.25rem)] space-y-2.5 overflow-y-auto pr-1">
        {model.visiblePrimary.map((item) => {
          const active = model.activeMenuId === item.id;
          const accent = menuAccent[item.id] ?? 'from-primary to-accent';
          return (
            <div key={item.id} onMouseEnter={() => previewRoute(item.id, item.route)}>
              <button
                type="button"
                onClick={() => navigateTo(item.route)}
                onFocus={() => previewRoute(item.id, item.route)}
                className={cn(
                  'group relative w-full rounded-[22px] p-1.5 transition-[background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                  active ? 'bg-[hsla(var(--sidebar-active-bg))] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_12px_26px_-24px_hsla(var(--sidebar-active-glow))] ring-1 ring-sidebar-primary/18' : 'hover:bg-[hsla(var(--surface-readable-muted))] hover:shadow-sm',
                )}
                aria-label={item.a11yLabel}
                aria-current={active ? 'page' : undefined}
                aria-pressed={active}
                title={item.label}
              >
                <span className={cn('absolute -left-1.5 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary opacity-0 transition', active && 'opacity-75')} />
                <span className={cn('absolute inset-1 rounded-[18px] bg-[hsla(var(--sidebar-active-halo))] opacity-0 blur-md transition', active ? 'opacity-100' : 'group-hover:opacity-70')} />
                <MenuIconRenderer Icon={item.icon} active={active} />
                {item.badgeKey && counters[item.badgeKey] > 0 && <span className="absolute right-1 top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">{counters[item.badgeKey]}</span>}
              </button>
            </div>
          );
        })}
      </nav>

      {preview && !isMobile && (
        <DynamicIslandPanel className="absolute left-[92px] top-4 z-[70] w-[340px] animate-in fade-in zoom-in-95 duration-200 p-4">
          <div className="flex items-start gap-3">
            <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-[0_12px_26px_-18px_hsl(var(--brand-warm-shadow))]', menuAccent[preview.id] ?? 'from-primary to-accent')}>
              <preview.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold tracking-tight text-foreground">{preview.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground/82">{preview.shortDescription}</p>
            </div>
          </div>

          {!!preview.children?.length && (
            <div className="mt-3 grid gap-1.5">
              {preview.children.map((childId) => {
                const child = menuRegistry.find((entry) => entry.id === childId);
                if (!child) return null;
                const isActive = routeMatchesPath(location.pathname, child.route);
                return (
                  <button
                    key={child.id}
                    type="button"
                    onMouseEnter={() => preloadRoute(child.route)}
                    onFocus={() => preloadRoute(child.route)}
                    onClick={() => navigateTo(child.route)}
                    className={cn('flex items-center justify-between rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50', isActive ? 'border-sidebar-primary/24 bg-[hsla(var(--sidebar-active-bg))] text-foreground' : 'border-border/70 bg-[hsla(var(--surface-readable))] text-[hsl(var(--text-secondary))] hover:border-sidebar-primary/20 hover:bg-[hsla(var(--surface-readable-muted))]')}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span>{child.label}</span>
                    {child.badgeKey && counters[child.badgeKey] > 0 && <span className="rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] font-semibold text-sidebar-accent-foreground">{counters[child.badgeKey]}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </DynamicIslandPanel>
      )}
    </aside>
  );
}
