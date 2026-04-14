import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Bell, Search } from 'lucide-react';
import { mockAlertas } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';

const routeNames: Record<string, string> = {
  '/': 'Dashboard',
  '/empresas': 'Empresas',
  '/agenda': 'Agenda',
  '/certidoes': 'Certidões',
  '/documentos': 'Documentos',
  '/envios': 'Envios',
  '/alertas': 'Alertas',
  '/logs': 'Logs',
  '/configuracoes': 'Configurações',
};

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const alertasNaoLidos = mockAlertas.filter(a => !a.lido && !a.resolvido).length;
  const navigate = useNavigate();
  const location = useLocation();

  const basePath = '/' + (location.pathname.split('/')[1] || '');
  const currentRoute = routeNames[basePath] || '';

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 backdrop-blur-xl px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              {currentRoute && (
                <div className="hidden sm:flex items-center gap-2 text-sm">
                  <span className="text-foreground/40">/</span>
                  <span className="font-medium text-foreground/80">{currentRoute}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="hidden md:flex gap-2 text-xs text-foreground/55 h-8 px-3 border border-border/50 bg-muted/30">
                <Search className="h-3.5 w-3.5" />
                <span>Buscar...</span>
                <kbd className="ml-2 pointer-events-none inline-flex h-5 items-center rounded border border-border/50 bg-muted px-1.5 font-mono text-[10px] text-foreground/40">⌘K</kbd>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9"
                onClick={() => navigate('/alertas')}
              >
                <Bell className="h-4 w-4" />
                {alertasNaoLidos > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-sm shadow-destructive/30">
                    {alertasNaoLidos}
                  </span>
                )}
              </Button>

              <div className="flex items-center gap-2.5 pl-3 ml-1 border-l border-border/50">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-xs font-bold text-primary ring-2 ring-primary/10">
                  AS
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-semibold leading-none">Ana Silva</p>
                  <p className="text-[10px] text-foreground/50 mt-0.5">Administrador</p>
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 scrollbar-thin">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
