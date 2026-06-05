import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { DataProvider } from "@/data/DataProvider";
import { AutomationProvider } from "@/data/AutomationProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import Empresas from "./pages/Empresas";
import EmpresaDetalhe from "./pages/EmpresaDetalhe";
import Agenda from "./pages/Agenda";
import Certidoes from "./pages/Certidoes";
import Documentos from "./pages/Documentos";
import Envios from "./pages/Envios";
import Alertas from "./pages/Alertas";
import Logs from "./pages/Logs";
import Configuracoes from "./pages/Configuracoes";
import Automacao from "./pages/Automacao";
import Execucoes from "./pages/Execucoes";
import ExecucaoDetalhe from "./pages/ExecucaoDetalhe";
import Integracoes from "./pages/Integracoes";
import Excecoes from "./pages/Excecoes";
import ConsultaIndex from "./pages/consulta/ConsultaIndex";
import ConsultaHistorico from "./pages/consulta/ConsultaHistorico";
import ConsultaExcecoes from "./pages/consulta/ConsultaExcecoes";
import ConsultaSaude from "./pages/consulta/ConsultaSaude";
import ConsultaRelatorio from "./pages/consulta/ConsultaRelatorio";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <DataProvider>
        <AutomationProvider>
          <BrowserRouter>
            <AppLayout>
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/empresas" element={<Empresas />} />
                  <Route path="/empresas/:id" element={<EmpresaDetalhe />} />
                  <Route path="/agenda" element={<Agenda />} />
                  <Route path="/certidoes" element={<Certidoes />} />
                  <Route path="/documentos" element={<Documentos />} />
                  <Route path="/envios" element={<Envios />} />
                  <Route path="/alertas" element={<Alertas />} />
                  <Route path="/logs" element={<Logs />} />
                  <Route path="/configuracoes" element={<Configuracoes />} />
                  <Route path="/automacao" element={<Automacao />} />
                  <Route path="/execucoes" element={<Execucoes />} />
                  <Route path="/execucoes/:id" element={<ExecucaoDetalhe />} />
                  <Route path="/integracoes" element={<Integracoes />} />
                  <Route path="/excecoes" element={<Excecoes />} />
                  <Route path="/consulta" element={<ConsultaIndex />} />
                  <Route path="/consulta/historico" element={<ConsultaHistorico />} />
                  <Route path="/consulta/excecoes" element={<ConsultaExcecoes />} />
                  <Route path="/consulta/saude" element={<ConsultaSaude />} />
                  <Route path="/consulta/relatorios/:id" element={<ConsultaRelatorio />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </ErrorBoundary>
            </AppLayout>
          </BrowserRouter>
        </AutomationProvider>
      </DataProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
