import { useState, useMemo } from 'react';
import { mockLogs, mockEmpresas } from '@/data/mockData';
import { GlassCard } from '@/components/GlassCard';
import { formatDateTime } from '@/lib/formatters';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ScrollText, Send, Eye, Download, Mail, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const acaoIcons = {
  envio: Send,
  abertura: Mail,
  visualizacao: Eye,
  download: Download,
};

const acaoLabels: Record<string, string> = {
  envio: 'Envio',
  abertura: 'Abertura',
  visualizacao: 'Visualização',
  download: 'Download',
};

export default function Logs() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [filtroAcao, setFiltroAcao] = useState('todos');

  const logsFiltrados = useMemo(() => {
    return mockLogs.filter(l => {
      const empresa = mockEmpresas.find(e => e.id === l.empresaId);
      const matchBusca = !busca || empresa?.nomeFantasia.toLowerCase().includes(busca.toLowerCase()) || l.usuario.toLowerCase().includes(busca.toLowerCase());
      const matchAcao = filtroAcao === 'todos' || l.acao === filtroAcao;
      return matchBusca && matchAcao;
    }).sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());
  }, [busca, filtroAcao]);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Logs de Acesso</h1>
        <p className="text-sm text-muted-foreground mt-1">Rastreamento de envios, acessos e leituras</p>
      </div>

      <GlassCard className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empresa ou usuário..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
          </div>
          <Select value={filtroAcao} onValueChange={setFiltroAcao}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as ações</SelectItem>
              <SelectItem value="envio">Envio</SelectItem>
              <SelectItem value="abertura">Abertura</SelectItem>
              <SelectItem value="visualizacao">Visualização</SelectItem>
              <SelectItem value="download">Download</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      <div className="relative border-l-2 border-border ml-4 space-y-3 py-2">
        {logsFiltrados.map(log => {
          const empresa = mockEmpresas.find(e => e.id === log.empresaId);
          const Icon = acaoIcons[log.acao] || ScrollText;
          return (
            <div key={log.id} className="relative pl-8">
              <div className={cn('absolute -left-[9px] top-2 flex h-4 w-4 items-center justify-center rounded-full border-2 bg-background',
                log.acao === 'envio' ? 'border-primary' :
                log.acao === 'download' ? 'border-success' : 'border-info'
              )} />
              <GlassCard className="p-3">
                <div className="flex items-start gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{log.detalhes}</p>
                    <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground mt-0.5">
                      <span className="cursor-pointer hover:underline" onClick={() => navigate(`/empresas/${log.empresaId}`)}>{empresa?.nomeFantasia}</span>
                      <span>{acaoLabels[log.acao]}</span>
                      <span>{log.usuario}</span>
                      {log.canal && <span className="capitalize">{log.canal}</span>}
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDateTime(log.dataHora)}</span>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>
          );
        })}
        {logsFiltrados.length === 0 && (
          <div className="pl-8">
            <GlassCard className="text-center py-12">
              <ScrollText className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum log encontrado</p>
            </GlassCard>
          </div>
        )}
      </div>
    </div>
  );
}
