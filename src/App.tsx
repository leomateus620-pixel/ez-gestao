import { Suspense, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppLayout } from '@/components/AppLayout';
import { DataProvider } from '@/data/DataProvider';
import { AutomationProvider } from '@/data/AutomationProvider';
import { GuideProvider } from '@/features/guias/GuideProvider';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { lazyRetry } from '@/lib/lazy-retry';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import Login from './pages/Login';

const Dashboard = lazyRetry(() => import('./pages/Dashboard'));
const Empresas = lazyRetry(() => import('./pages/Empresas'));
const EmpresaDetalhe = lazyRetry(() => import('./pages/EmpresaDetalhe'));
const Agenda = lazyRetry(() => import('./pages/Agenda'));
const Certidoes = lazyRetry(() => import('./pages/Certidoes'));
const Documentos = lazyRetry(() => import('./pages/Documentos'));
const Envios = lazyRetry(() => import('./pages/Envios'));
const Alertas = lazyRetry(() => import('./pages/Alertas'));
const Logs = lazyRetry(() => import('./pages/Logs'));
const Configuracoes = lazyRetry(() => import('./pages/Configuracoes'));
const Automacao = lazyRetry(() => import('./pages/Automacao'));
const Execucoes = lazyRetry(() => import('./pages/Execucoes'));
const ExecucaoDetalhe = lazyRetry(() => import('./pages/ExecucaoDetalhe'));
const Integracoes = lazyRetry(() => import('./pages/Integracoes'));
const Excecoes = lazyRetry(() => import('./pages/Excecoes'));
const Guias = lazyRetry(() => import('./pages/guias/Guias'));
const GuiaDetalhe = lazyRetry(() => import('./pages/guias/GuiaDetalhe'));
const IntegracoesGuias = lazyRetry(() => import('./pages/guias/IntegracoesGuias'));
const ConsultaIndex = lazyRetry(() => import('./pages/consulta/ConsultaIndex'));
const ConsultaHistorico = lazyRetry(() => import('./pages/consulta/ConsultaHistorico'));
const ConsultaExcecoes = lazyRetry(() => import('./pages/consulta/ConsultaExcecoes'));
const ConsultaSaude = lazyRetry(() => import('./pages/consulta/ConsultaSaude'));
const ConsultaRelatorio = lazyRetry(() => import('./pages/consulta/ConsultaRelatorio'));
const NotFound = lazyRetry(() => import('./pages/NotFound'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 1 },
  },
});

function LoadingFallback({ message = 'Carregando modulo...' }: { message?: string }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setStuck(true), 8000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="liquid-stage flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      <p className="text-sm text-foreground/60">{message}</p>
      {stuck && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-foreground/50">Esta demorando mais que o normal.</p>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => window.location.reload()}>
            <RefreshCw className="h-3.5 w-3.5" /> Recarregar
          </Button>
        </div>
      )}
    </div>
  );
}

function ProvidersBoundary({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  return (
    <ErrorBoundary
      label="providers"
      onReset={() => client.resetQueries()}
    >
      {children}
    </ErrorBoundary>
  );
}

function AuthenticatedApp() {
  const { session, isLoading, error, retry } = useAuth();
  if (isLoading) {
    return <LoadingFallback message="Verificando sessao..." />;
  }
  if (error && !session) {
    return (
      <div className="liquid-stage flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
          <RefreshCw className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-base font-semibold">Nao conseguimos iniciar o app</h2>
        <p className="max-w-md text-sm text-foreground/60">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={retry}>Tentar novamente</Button>
          <Button size="sm" onClick={() => window.location.reload()}>Recarregar</Button>
        </div>
      </div>
    );
  }
  if (!session) {
    return <Routes><Route path="*" element={<Login />} /></Routes>;
  }

  return (
    <ProvidersBoundary>
      <DataProvider>
        <AutomationProvider>
          <GuideProvider>
            <AppLayout>
              <ErrorBoundary label="route">
                <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/guias" element={<Guias view="fila" />} />
                  <Route path="/guias/fila" element={<Guias view="fila" />} />
                  <Route path="/guias/enviadas" element={<Guias view="enviadas" />} />
                  <Route path="/guias/excecoes" element={<Guias view="excecoes" />} />
                  <Route path="/guias/:id" element={<GuiaDetalhe />} />
                  <Route path="/empresas" element={<Empresas />} />
                  <Route path="/empresas/:id" element={<EmpresaDetalhe />} />
                  <Route path="/integracoes" element={<IntegracoesGuias />} />
                  <Route path="/configuracoes" element={<Configuracoes />} />
                  <Route path="/agenda" element={<Agenda />} />
                  <Route path="/certidoes" element={<Certidoes />} />
                  <Route path="/documentos" element={<Documentos />} />
                  <Route path="/envios" element={<Envios />} />
                  <Route path="/alertas" element={<Alertas />} />
                  <Route path="/logs" element={<Logs />} />
                  <Route path="/automacao" element={<Automacao />} />
                  <Route path="/execucoes" element={<Execucoes />} />
                  <Route path="/execucoes/:id" element={<ExecucaoDetalhe />} />
                  <Route path="/legado/integracoes" element={<Integracoes />} />
                  <Route path="/excecoes" element={<Excecoes />} />
                  <Route path="/consulta" element={<ConsultaIndex />} />
                  <Route path="/consulta/historico" element={<ConsultaHistorico />} />
                  <Route path="/consulta/excecoes" element={<ConsultaExcecoes />} />
                  <Route path="/consulta/saude" element={<ConsultaSaude />} />
                  <Route path="/consulta/relatorios/:id" element={<ConsultaRelatorio />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
              </ErrorBoundary>
            </AppLayout>
          </GuideProvider>
        </AutomationProvider>
      </DataProvider>
    </ProvidersBoundary>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary label="root" fullScreen>
          <AuthProvider>
            <AuthenticatedApp />
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
