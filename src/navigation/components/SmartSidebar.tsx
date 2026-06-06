import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MenuIconRenderer } from '@/navigation/components/MenuIconRenderer';
import { resolveContextualMenu, type MenuCounters } from '@/navigation/engine/contextual-menu-engine';
import { useNavigationUiState } from '@/navigation/state/NavigationStateProvider';
import { preloadRoute } from '@/navigation/route-preload';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/BrandLogo';
import { useIsMobile } from '@/hooks/use-mobile';

const HOVER_PRELOAD_DELAY_MS = 140;

export function SmartSidebar({ counters }: { counters: MenuCounters }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { setHoveredMenuId, closeAllPanels } = useNavigationUiState();
  const [isExpanded, setIsExpanded] = useState(false);
  const model = resolveContextualMenu({ pathname: location.pathname, isMobile, counters });
  const navigatingToRef = useRef<string>();
  const hoveredMenuIdRef = useRef<string>();
  const preloadTimerRef = useRef<number>();

  const clearScheduledPreload = useCallback(() => {
    if (preloadTimerRef.current !== undefined) {
      window.clearTimeout(preloadTimerRef.current);
      preloadTimerRef.current = undefined;
    }
  }, []);

  const expandSidebar = useCallback(() => {
    setIsExpanded((current) => (current ? current : true));
  }, []);

  const collapseSidebar = useCallback(() => {
    clearScheduledPreload();
    hoveredMenuIdRef.current = undefined;
    setIsExpanded((current) => (current ? false : current));
    setHoveredMenuId(undefined);
  }, [clearScheduledPreload, setHoveredMenuId]);

  const navigateTo = useCallback((route: string) => {
    clearScheduledPreload();

    if (location.pathname === route || navigatingToRef.current === route) {
      closeAllPanels();
      setIsExpanded((current) => (current ? false : current));
      return;
    }

    navigatingToRef.current = route;
    closeAllPanels();
    setIsExpanded((current) => (current ? false : current));
    startTransition(() => {
      navigate(route);
    });
  }, [clearScheduledPreload, closeAllPanels, location.pathname, navigate]);

  const previewRoute = useCallback((menuId: string, route: string) => {
    expandSidebar();

    if (hoveredMenuIdRef.current !== menuId) {
      hoveredMenuIdRef.current = menuId;
      setHoveredMenuId(menuId);
    }

    clearScheduledPreload();
    preloadTimerRef.current = window.setTimeout(() => {
      preloadTimerRef.current = undefined;
      void preloadRoute(route)?.catch(() => undefined);
    }, HOVER_PRELOAD_DELAY_MS);
  }, [clearScheduledPreload, expandSidebar, setHoveredMenuId]);

  const previewPointerRoute = useCallback((event: PointerEvent<HTMLButtonElement>, menuId: string, route: string) => {
    if (event.pointerType === 'touch') return;
    previewRoute(menuId, route);
  }, [previewRoute]);

  useEffect(() => {
    navigatingToRef.current = undefined;
  }, [location.pathname]);

  useEffect(() => clearScheduledPreload, [clearScheduledPreload]);

  return (
    <aside
      className={cn(
        'relative sticky top-0 z-50 h-screen shrink-0 overflow-hidden border-r border-sidebar-border/70 bg-[linear-gradient(180deg,hsl(var(--brand-warm-canvas)/0.84),hsl(var(--brand-warm-surface)/0.66)),radial-gradient(circle_at_50%_0%,hsl(var(--brand-orange-light)/0.10),transparent_44%),radial-gradient(circle_at_50%_100%,hsl(var(--brand-metal-blue)/0.08),transparent_48%)] px-3 py-4 shadow-[inset_-1px_0_0_rgba(255,255,255,0.78),0_20px_60px_-44px_hsl(var(--brand-warm-shadow))] backdrop-blur-2xl transition-[width,box-shadow,background-color] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] will-change-[width]',
        isExpanded
          ? 'w-[264px] shadow-[inset_-1px_0_0_rgba(255,255,255,0.86),0_24px_72px_-42px_hsl(var(--brand-warm-shadow))]'
          : 'w-[92px]',
      )}
      onMouseEnter={expandSidebar}
      onMouseLeave={collapseSidebar}
      onTouchStart={expandSidebar}
      data-expanded={isExpanded}
    >
      <div className={cn('mb-5 flex transition-[justify-content] duration-300', isExpanded ? 'justify-start px-1' : 'justify-center')}>
        <BrandLogo className="h-10 w-10 shrink-0" />
      </div>

      <nav aria-label="Navegação principal" className="max-h-[calc(100vh-6.25rem)] space-y-2.5 overflow-y-auto overflow-x-hidden pr-1">
        {model.visiblePrimary.map((item) => {
          const active = model.activeMenuId === item.id;
          return (
            <div key={item.id}>
              <button
                type="button"
                onClick={() => navigateTo(item.route)}
                onFocus={() => previewRoute(item.id, item.route)}
                onPointerEnter={(event) => previewPointerRoute(event, item.id, item.route)}
                className={cn(
                  'group relative flex h-12 w-full items-center overflow-hidden rounded-[22px] p-1.5 text-left transition-[background-color,box-shadow,padding] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                  isExpanded ? 'gap-3 pr-3' : 'justify-center',
                  active ? 'bg-[hsla(var(--sidebar-active-bg))] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_12px_26px_-24px_hsla(var(--sidebar-active-glow))] ring-1 ring-sidebar-primary/18' : 'hover:bg-[hsla(var(--surface-readable-muted))] hover:shadow-sm',
                )}
                aria-label={item.a11yLabel}
                aria-current={active ? 'page' : undefined}
                aria-pressed={active}
                title={item.label}
              >
                <span className={cn('absolute -left-1.5 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary opacity-0 transition', active && 'opacity-75')} />
                <span className={cn('absolute inset-1 rounded-[18px] bg-[hsla(var(--sidebar-active-halo))] opacity-0 blur-md transition', active ? 'opacity-100' : 'group-hover:opacity-70')} />
                <span className="relative z-10 shrink-0">
                  <MenuIconRenderer Icon={item.icon} active={active} />
                </span>
                <span
                  className={cn(
                    'relative z-10 min-w-0 flex-1 whitespace-nowrap text-sm font-extrabold tracking-tight text-foreground transition-[opacity,transform,max-width] duration-300 ease-out',
                    isExpanded ? 'max-w-[170px] translate-x-0 opacity-100' : 'max-w-0 -translate-x-2 opacity-0',
                  )}
                >
                  {item.label}
                </span>
                {item.badgeKey && counters[item.badgeKey] > 0 && (
                  <span className={cn('relative z-20 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm transition-[opacity,transform] duration-200', isExpanded ? 'opacity-100' : 'absolute right-1 top-1 opacity-100')}>
                    {counters[item.badgeKey]}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
