import {
  LayoutDashboard, Building2, CalendarDays, ShieldCheck,
  FileText, Send, Bell, ScrollText, Settings, Bot, ListChecks, Plug, AlertTriangle
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { useDataStore } from '@/data/DataProvider';
import { useAutomation } from '@/data/AutomationProvider';
import { Separator } from '@/components/ui/separator';

const mainMenuItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Empresas', url: '/empresas', icon: Building2 },
  { title: 'Agenda', url: '/agenda', icon: CalendarDays },
  { title: 'Certidões', url: '/certidoes', icon: ShieldCheck },
  { title: 'Documentos', url: '/documentos', icon: FileText },
  { title: 'Envios', url: '/envios', icon: Send },
  { title: 'Alertas', url: '/alertas', icon: Bell },
];

const automationMenuItems = [
  { title: 'Central', url: '/automacao', icon: Bot },
  { title: 'Execuções', url: '/execucoes', icon: ListChecks },
  { title: 'Integrações', url: '/integracoes', icon: Plug },
  { title: 'Exceções', url: '/excecoes', icon: AlertTriangle },
];

const systemMenuItems = [
  { title: 'Logs', url: '/logs', icon: ScrollText },
  { title: 'Configurações', url: '/configuracoes', icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { state: dataState } = useDataStore();
  const { pendingExceptions } = useAutomation();
  const alertasNaoLidos = dataState.alertas.filter(a => !a.lido && !a.resolvido).length;

  const renderMenuItem = (item: { title: string; url: string; icon: React.ElementType }, badgeCount?: number) => {
    const isActive = item.url === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.url);

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={isActive}>
          <NavLink
            to={item.url}
            end={item.url === '/'}
            className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-sidebar-foreground/70 transition-all duration-200 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold shadow-sm"
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-gradient-to-b from-primary to-accent" />
            )}
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.title}</span>}
            {badgeCount !== undefined && badgeCount > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground shadow-sm shadow-destructive/30">
                {badgeCount}
              </span>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold text-xs shrink-0 shadow-lg shadow-primary/20">
            CND
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <h1 className="text-sm font-bold text-sidebar-foreground tracking-tight">CND Manager</h1>
              <p className="text-[10px] text-sidebar-foreground/50">Gestão de Certidões</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <Separator className="mx-4 w-auto bg-sidebar-border/60" />

      <SidebarContent className="px-2 pt-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-[0.15em] font-semibold">
            {!collapsed ? 'Menu Principal' : ''}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {mainMenuItems.map((item) =>
                renderMenuItem(item, item.title === 'Alertas' ? alertasNaoLidos : undefined)
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-[0.15em] font-semibold">
            {!collapsed ? 'Automação' : ''}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {automationMenuItems.map((item) =>
                renderMenuItem(item, item.title === 'Exceções' ? pendingExceptions : undefined)
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-[0.15em] font-semibold">
            {!collapsed ? 'Sistema' : ''}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {systemMenuItems.map((item) => renderMenuItem(item))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="rounded-lg bg-sidebar-accent/40 border border-sidebar-border/50 p-3 animate-fade-in">
            <p className="text-[10px] font-semibold text-sidebar-foreground/50 uppercase tracking-widest">Fase 2</p>
            <p className="text-xs text-sidebar-foreground/65 mt-0.5">v2.0.0 — Automação Ativa</p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
