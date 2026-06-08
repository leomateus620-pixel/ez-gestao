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
const CLICK_COLLAPSE_DELAY_MS = 240;
const LEAVE_COLLAPSE_DELAY_MS = 220;

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
  const collapseTimerRef = useRef<number>();
  const mountedRef = useRef(true);

  const clearScheduledPreload = useCallback(() => {
    if (preloadTimerRef.current !== undefined) {
      window.clearTimeout(preloadTimerRef.current);
      preloadTimerRef.current = undefined;
    }
  }, []);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current !== undefined) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = undefined;
    }
  }, []);

  const applyCollapsedState = useCallback(() => {
    if (!mountedRef.current) return;

    clearScheduledPreload();
    hoveredMenuIdRef.current = undefined;
    setIsExpanded((current) => (current ? false : current));
    setHoveredMenuId(undefined);
  }, [clearScheduledPreload, setHoveredMenuId]);

  const scheduleCollapse = useCallback((delayMs: number) => {
    clearCollapseTimer();
    collapseTimerRef.current = window.setTimeout(() => {
      collapseTimerRef.current = undefined;
      applyCollapsedState();
    }, delayMs);
  }, [applyCollapsedState, clearCollapseTimer]);

  const expandSidebar = useCallback(() => {
    clearCollapseTimer();
    setIsExpanded((current) => (current ? current : true));
  }, [clearCollapseTimer]);

  const collapseSidebar = useCallback(() => {
    scheduleCollapse(LEAVE_COLLAPSE_DELAY_MS);
  }, [scheduleCollapse]);

  const navigateTo = useCallback((route: string) => {
    clearScheduledPreload();

    if (location.pathname === route || navigatingToRef.current === route) {
      closeAllPanels();
      scheduleCollapse(CLICK_COLLAPSE_DELAY_MS);
      return;
    }

    navigatingToRef.current = route;
    closeAllPanels();
    scheduleCollapse(CLICK_COLLAPSE_DELAY_MS);
    startTransition(() => {
      navigate(route);
    });
  }, [clearScheduledPreload, closeAllPanels, location.pathname, navigate, scheduleCollapse]);

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

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearScheduledPreload();
      clearCollapseTimer();
    };
  }, [clearCollapseTimer, clearScheduledPreload]);

  return (
    <aside
      className={cn(
        'relative sticky top-0 z-50 h-[100dvh] shrink-0 overflow-hidden border-r border-sidebar-border/70 bg-[linear-gradient(180deg,hsl(var(--brand-warm-canvas)/0.88),hsl(var(--brand-warm-surface)/0.70)),radial-gradient(circle_at_48%_0%,hsl(var(--brand-orange-light)/0.12),transparent_46%),radial-gradient(circle_at_50%_100%,hsl(var(--brand-metal-blue)/0.09),transparent_50%)] shadow-[inset_-1px_0_0_rgba(255,255,255,0.78),0_20px_60px_-44px_hsl(var(--brand-warm-shadow))] backdrop-blur-2xl transition-[width,padding,box-shadow,background-color] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] will-change-[width]',
        isExpanded
          ? 'w-[280px] px-4 py-5 duration-300 shadow-[inset_-1px_0_0_rgba(255,255,255,0.88),0_28px_82px_-42px_hsl(var(--brand-warm-shadow))]'
          : 'w-[92px] px-3 py-4 duration-500',
      )}
      onMouseEnter={expandSidebar}
      onMouseLeave={collapseSidebar}
      onTouchStart={expandSidebar}
      aria-label="Menu lateral principal"
      data-testid="smart-sidebar"
      data-expanded={isExpanded}
    >
      <div className={cn('mb-5 flex transition-[justify-content,padding] duration-300', isExpanded ? 'justify-start px-2' : 'justify-center px-0')}>
        <BrandLogo className="h-10 w-10 shrink-0" />
      </div>

      <nav aria-label="Navegação principal" className={cn('max-h-[calc(100dvh-6.25rem)] overflow-y-auto overflow-x-hidden transition-[padding] duration-300', isExpanded ? 'space-y-3 pr-1.5' : 'space-y-2.5 pr-1')}>
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
                  'group relative flex h-12 w-full items-center overflow-hidden rounded-[22px] p-1.5 text-left transition-[background-color,box-shadow,padding,gap,height] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99]',
                  isExpanded ? 'h-[52px] gap-3.5 pr-3.5' : 'justify-center',
                  active ? 'bg-[hsla(var(--sidebar-active-bg))] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_14px_30px_-24px_hsla(var(--sidebar-active-glow))] ring-1 ring-sidebar-primary/18' : 'hover:bg-[hsla(var(--surface-readable-muted))] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_10px_24px_-24px_hsl(var(--brand-warm-shadow))]',
                )}
                aria-label={item.a11yLabel}
                aria-current={active ? 'page' : undefined}
                aria-pressed={active}
                title={item.label}
              >
                <span className={cn('absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary opacity-0 transition duration-300', active && 'opacity-75')} />
                <span className={cn('absolute inset-1 rounded-[18px] bg-[hsla(var(--sidebar-active-halo))] opacity-0 blur-md transition', active ? 'opacity-100' : 'group-hover:opacity-70')} />
                <span className="relative z-10 shrink-0">
                  <MenuIconRenderer Icon={item.icon} active={active} />
                </span>
                <span
                  className={cn(
                    'relative z-10 min-w-0 flex-1 whitespace-nowrap font-display text-[0.92rem] font-bold tracking-[-0.02em] text-[hsl(var(--text-primary))] transition-[opacity,transform,max-width] ease-out',
                    isExpanded ? 'max-w-[184px] translate-x-0 opacity-100 delay-75 duration-300' : 'max-w-0 -translate-x-1.5 opacity-0 duration-500',
                  )}
                >
                  {item.label}
                </span>
                {item.badgeKey && counters[item.badgeKey] > 0 && (
                  <span className={cn('z-20 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white shadow-sm transition-[opacity,transform,top,right] duration-300', isExpanded ? 'relative translate-x-0 opacity-100' : 'absolute right-1 top-1 translate-x-0 opacity-100')}>
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
