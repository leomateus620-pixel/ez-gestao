import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DynamicIslandPanel } from '@/navigation/components/DynamicIslandPanel';
import { MenuIconRenderer } from '@/navigation/components/MenuIconRenderer';
import { resolveContextualMenu, type MenuCounters } from '@/navigation/engine/contextual-menu-engine';
import { useNavigationUiState } from '@/navigation/state/NavigationStateProvider';
import { menuRegistry } from '@/navigation/menu-registry';
import { cn } from '@/lib/utils';

export function SmartSidebar({ counters }: { counters: MenuCounters }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hoveredMenuId, setHoveredMenuId, expandedMenuId, setExpandedMenuId } = useNavigationUiState();
  const model = resolveContextualMenu({ pathname: location.pathname, isMobile: false, counters });

  const previewId = expandedMenuId ?? hoveredMenuId;
  const preview = useMemo(() => menuRegistry.find((item) => item.id === previewId), [previewId]);

  return (
    <aside className="relative w-[86px] border-r border-border/40 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%),rgba(4,7,15,0.45)] px-3 py-4 backdrop-blur-xl">
      <nav aria-label="Navegação principal" className="space-y-2.5">
        {model.visiblePrimary.map((item) => {
          const active = model.activeMenuId === item.id;
          return (
            <div key={item.id} onMouseEnter={() => setHoveredMenuId(item.id)} onMouseLeave={() => setHoveredMenuId(undefined)}>
              <button
                onClick={() => {
                  setExpandedMenuId(expandedMenuId === item.id ? undefined : item.id);
                  navigate(item.route);
                }}
                onFocus={() => setHoveredMenuId(item.id)}
                className={cn('relative w-full rounded-2xl p-1.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60', active ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-white/[0.04]')}
                aria-label={item.a11yLabel}
                aria-pressed={active}
              >
                <MenuIconRenderer Icon={item.icon} active={active} menuId={item.id} />
              </button>
            </div>
          );
        })}
      </nav>

      {preview && (
        <DynamicIslandPanel className="absolute left-[86px] top-4 z-40 w-[320px] animate-in fade-in zoom-in-95 duration-200">
          <p className="text-sm font-semibold tracking-tight">{preview.label}</p>
          <p className="mt-0.5 text-xs text-foreground/65">{preview.shortDescription}</p>
          {!!preview.children?.length && (
            <div className="mt-3 grid gap-1.5">
              {preview.children.map((childId) => {
                const child = menuRegistry.find((entry) => entry.id === childId);
                if (!child) return null;
                const isActive = location.pathname.startsWith(child.route);
                return (
                  <button
                    key={child.id}
                    onClick={() => navigate(child.route)}
                    className={cn('flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50', isActive ? 'bg-primary/15 text-foreground ring-1 ring-primary/30' : 'bg-white/[0.02] text-foreground/70 hover:bg-white/[0.06]')}
                  >
                    <span>{child.label}</span>
                    {child.badgeKey && counters[child.badgeKey] > 0 && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px]">{counters[child.badgeKey]}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {!!model.legacy.length && (
            <div className="mt-3 border-t border-white/10 pt-2">
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">Legado</p>
              {model.legacy.map((legacy) => (
                <button
                  key={legacy.id}
                  onClick={() => navigate(legacy.route)}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-foreground/60 transition hover:bg-white/[0.05] hover:text-foreground/80"
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
