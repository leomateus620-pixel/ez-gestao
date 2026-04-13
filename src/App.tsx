import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
