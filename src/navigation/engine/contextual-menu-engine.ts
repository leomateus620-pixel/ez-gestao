import { menuRegistry, type MenuItemConfig, type QuickAction } from '@/navigation/menu-registry';

export interface MenuCounters {
  guidesWaiting: number;
  guideExceptions: number;
  alerts: number;
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
  quickActions: QuickAction[];
}

const topLevel = menuRegistry.filter((item) => item.group === 'principal');

export function routeMatchesPath(pathname: string, route: string) {
  if (route === '/') return pathname === '/';
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function resolveContextualMenu(context: NavigationContextInput): ContextualMenuResult {
  const active = [...menuRegistry]
    .filter((item) => routeMatchesPath(context.pathname, item.route))
    .sort((a, b) => b.route.length - a.route.length)[0];
  const activeTop = active?.parent ? menuRegistry.find((item) => item.id === active.parent) : active;

  const visiblePrimary = [...topLevel]
    .filter((item) => !context.isMobile || !item.visibilityRules?.mobileHidden)
    .sort((a, b) => priorityScore(a.priority) - priorityScore(b.priority));
  const contextualChildren = activeTop?.children
    ? activeTop.children.map((id) => menuRegistry.find((item) => item.id === id)).filter(Boolean) as MenuItemConfig[]
    : [];

  const quickActions = activeTop?.quickActions ?? [];

  return {
    activeMenuId: activeTop?.id,
    visiblePrimary,
    contextualChildren,
    quickActions,
  };
}

function priorityScore(priority: MenuItemConfig['priority']) {
  if (priority === 'high') return 0;
  if (priority === 'medium') return 1;
  return 2;
}
