import { menuRegistry, type MenuItemConfig, type QuickAction } from '@/navigation/menu-registry';

export interface MenuCounters {
  guidesWaiting: number;
  guideExceptions: number;
  alerts: number;
  legacyExceptions: number;
}

export interface NavigationContextInput {
  pathname: string;
  isMobile: boolean;
  counters: MenuCounters;
}

export interface ContextualMenuResult {
  activeMenuId?: string;
  visiblePrimary: MenuItemConfig[];
  contextualChildren: MenuItemConfig[];
  legacy: MenuItemConfig[];
  quickActions: QuickAction[];
}

const topLevel = menuRegistry.filter((item) => item.group === 'principal');

export function resolveContextualMenu(context: NavigationContextInput): ContextualMenuResult {
  const active = menuRegistry.find((item) => item.route === '/' ? context.pathname === '/' : context.pathname.startsWith(item.route));
  const activeTop = active?.parent ? menuRegistry.find((item) => item.id === active.parent) : active;

  const visiblePrimary = [...topLevel].sort((a, b) => priorityScore(a.priority) - priorityScore(b.priority));
  const contextualChildren = activeTop?.children
    ? activeTop.children.map((id) => menuRegistry.find((item) => item.id === id)).filter(Boolean) as MenuItemConfig[]
    : [];

  const quickActions = activeTop?.quickActions ?? [];
  const legacy = menuRegistry.filter((item) => item.group === 'legacy');

  return {
    activeMenuId: activeTop?.id,
    visiblePrimary,
    contextualChildren,
    legacy,
    quickActions,
  };
}

function priorityScore(priority: MenuItemConfig['priority']) {
  if (priority === 'high') return 0;
  if (priority === 'medium') return 1;
  return 2;
}
