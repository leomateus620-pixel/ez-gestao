import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Empresas = lazy(() => import('./pages/Empresas'));
const EmpresaDetalhe = lazy(() => import('./pages/EmpresaDetalhe'));
const Agenda = lazy(() => import('./pages/Agenda'));
const Certidoes = lazy(() => import('./pages/Certidoes'));
const Documentos = lazy(() => import('./pages/Documentos'));
const Envios = lazy(() => import('./pages/Envios'));
const Alertas = lazy(() => import('./pages/Alertas'));
const Logs = lazy(() => import('./pages/Logs'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const Automacao = lazy(() => import('./pages/Automacao'));
const Execucoes = lazy(() => import('./pages/Execucoes'));
const ExecucaoDetalhe = lazy(() => import('./pages/ExecucaoDetalhe'));
const Integracoes = lazy(() => import('./pages/Integracoes'));
const Excecoes = lazy(() => import('./pages/Excecoes'));
const Guias = lazy(() => import('./pages/guias/Guias'));
const GuiaDetalhe = lazy(() => import('./pages/guias/GuiaDetalhe'));
const IntegracoesGuias = lazy(() => import('./pages/guias/IntegracoesGuias'));
const ConsultaIndex = lazy(() => import('./pages/consulta/ConsultaIndex'));
const ConsultaHistorico = lazy(() => import('./pages/consulta/ConsultaHistorico'));
const ConsultaExcecoes = lazy(() => import('./pages/consulta/ConsultaExcecoes'));
const ConsultaSaude = lazy(() => import('./pages/consulta/ConsultaSaude'));
const ConsultaRelatorio = lazy(() => import('./pages/consulta/ConsultaRelatorio'));
const NotFound = lazy(() => import('./pages/NotFound'));

const queryClient = new QueryClient();

function AuthenticatedApp() {
  const { session, isLoading } = useAuth();
  if (isLoading) {
    return <div className="liquid-stage flex min-h-screen items-center justify-center text-sm text-foreground/60">Verificando sessao...</div>;
  }
  if (!session) {
    return <Routes><Route path="*" element={<Login />} /></Routes>;
  }

  return (
    <DataProvider>
      <AutomationProvider>
        <GuideProvider>
          <AppLayout>
            <ErrorBoundary>
              <Suspense fallback={<div className="py-20 text-center text-sm text-foreground/55">Carregando modulo...</div>}>
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
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AuthenticatedApp />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
