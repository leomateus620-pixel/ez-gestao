import { useState } from 'react';
import {
  AlertTriangle, Bell, Bot, Building2, CalendarDays, ChevronDown, FileText,
  FolderSync, LayoutDashboard, ListChecks, Plug, ScrollText, Search, Send,
  Settings, ShieldCheck,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { useDataStore } from '@/data/DataProvider';
import { useAutomation } from '@/data/AutomationProvider';
import { useGuides } from '@/features/guias/GuideProvider';
import { useFeatureFlag } from '@/features/consulta/hooks/useLookup';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/BrandLogo';

const primaryItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Guias', url: '/guias/fila', icon: FolderSync },
  { title: 'Empresas', url: '/empresas', icon: Building2 },
  { title: 'Integracoes', url: '/integracoes', icon: Plug },
  { title: 'Configuracoes', url: '/configuracoes', icon: Settings },
];

const guideItems = [
  { title: 'Fila', url: '/guias/fila', icon: FileText },
  { title: 'Enviadas', url: '/guias/enviadas', icon: Send },
  { title: 'Excecoes', url: '/guias/excecoes', icon: AlertTriangle },
];

const legacyItems = [
  { title: 'Central CND', url: '/automacao', icon: Bot },
  { title: 'Agenda', url: '/agenda', icon: CalendarDays },
  { title: 'Certidoes', url: '/certidoes', icon: ShieldCheck },
  { title: 'Documentos', url: '/documentos', icon: FileText },
  { title: 'Envios antigos', url: '/envios', icon: Send },
  { title: 'Execucoes', url: '/execucoes', icon: ListChecks },
  { title: 'Conectores', url: '/legado/integracoes', icon: Plug },
  { title: 'Exceções CND', url: '/excecoes', icon: AlertTriangle },
  { title: 'Alertas', url: '/alertas', icon: Bell },
  { title: 'Logs', url: '/logs', icon: ScrollText },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { state: dataState } = useDataStore();
  const { pendingExceptions } = useAutomation();
  const { metrics } = useGuides();
  const { data: consultaFlag } = useFeatureFlag('consulta_publica_enabled');
  const [legacyOpen, setLegacyOpen] = useState(false);
  const alertasNaoLidos = dataState.alertas.filter((entry) => !entry.lido && !entry.resolvido).length;

  const renderItem = (item: { title: string; url: string; icon: React.ElementType }, badge?: number) => {
    const active = item.url === '/' ? location.pathname === '/' : location.pathname.startsWith(item.url);
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild isActive={active}>
          <NavLink
            to={item.url}
            end={item.url === '/'}
            className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-sidebar-foreground/78 transition-all duration-200 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            activeClassName="bg-[hsla(var(--sidebar-active-bg))] text-sidebar-accent-foreground font-semibold shadow-sm ring-1 ring-sidebar-primary/18"
          >
            {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-sidebar-primary/85 to-accent/80" />}
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.title}</span>}
            {!collapsed && badge !== undefined && badge > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                {badge}
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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 p-1 shadow-lg shadow-primary/15 backdrop-blur-xl">
            <BrandLogo className="h-full w-full" />
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <h1 className="text-sm font-bold tracking-tight text-sidebar-foreground">EZ Gestão</h1>
              <p className="text-[10px] text-[hsl(var(--text-tertiary))]">Envio automático de guias</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <Separator className="mx-4 w-auto bg-sidebar-border/60" />
      <SidebarContent className="px-2 pt-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[hsl(var(--text-tertiary))]">{!collapsed ? 'Principal' : ''}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {primaryItems.map((item) => renderItem(item, item.title === 'Guias' ? metrics.waiting : undefined))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[hsl(var(--text-tertiary))]">{!collapsed ? 'Guias' : ''}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {guideItems.map((item) => renderItem(item, item.title === 'Excecoes' ? metrics.reviewing : undefined))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Collapsible open={legacyOpen} onOpenChange={setLegacyOpen}>
          <SidebarGroup>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[hsl(var(--text-tertiary))] hover:text-sidebar-foreground/78">
                {!collapsed && <span>Consulta CND (legado)</span>}
                {!collapsed && <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', legacyOpen && 'rotate-180')} />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-0.5">
                  {legacyItems.map((item) => renderItem(
                    item,
                    item.title === 'Exceções CND' ? pendingExceptions : item.title === 'Alertas' ? alertasNaoLidos : undefined,
                  ))}
                  {!!consultaFlag?.enabled && (
                    <>
                      {renderItem({ title: 'Consulta pública', url: '/consulta', icon: Search })}
                      {renderItem({ title: 'Historico', url: '/consulta/historico', icon: ListChecks })}
                    </>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

      </SidebarContent>
      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="rounded-xl border border-sidebar-border/50 bg-[hsla(var(--surface-readable-muted))] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--text-tertiary))]">Pipeline</p>
            <p className="mt-1 text-xs text-sidebar-foreground/78">{metrics.healthyConnectors}/4 conectores ativos</p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
