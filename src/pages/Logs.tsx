import { useState, useMemo, useEffect } from 'react';
import { useDataStore } from '@/data/DataProvider';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { formatDateTime } from '@/lib/formatters';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, ScrollText, Send, Eye, Download, Mail, Clock, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const acaoIcons: Record<string, typeof Send> = { envio: Send, abertura: Mail, visualizacao: Eye, download: Download };
const acaoLabels: Record<string, string> = { envio: 'Envio', abertura: 'Abertura', visualizacao: 'Visualização', download: 'Download' };
const acaoColors: Record<string, string> = { envio: 'bg-primary border-primary', abertura: 'bg-warning border-warning', visualizacao: 'bg-info border-info', download: 'bg-success border-success' };

const ITEMS_PER_PAGE = 30;

export default function Logs() {
  const navigate = useNavigate();
  const { state, enableLogs, enableAuditTrail } = useDataStore();
  useEffect(() => { enableLogs(); enableAuditTrail(); }, [enableLogs, enableAuditTrail]);
  const [busca, setBusca] = useState('');
  const [filtroAcao, setFiltroAcao] = useState('todos');
  const [page, setPage] = useState(1);

  const logsFiltrados = useMemo(() => {
    return state.logs.filter(l => {
      const empresa = state.empresas.find(e => e.id === l.empresaId);
      const matchBusca = !busca || empresa?.nomeFantasia.toLowerCase().includes(busca.toLowerCase()) || l.usuario.toLowerCase().includes(busca.toLowerCase());
      const matchAcao = filtroAcao === 'todos' || l.acao === filtroAcao;
      return matchBusca && matchAcao;
    }).sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());
  }, [state.logs, state.empresas, busca, filtroAcao]);

  const paginatedLogs = useMemo(() => logsFiltrados.slice(0, page * ITEMS_PER_PAGE), [logsFiltrados, page]);
  const hasMore = paginatedLogs.length < logsFiltrados.length;

  const grouped = useMemo(() => {
    const groups: Record<string, typeof paginatedLogs> = {};
    paginatedLogs.forEach(log => {
      const dateKey = format(parseISO(log.dataHora), 'dd MMM yyyy', { locale: ptBR });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(log);
    });
    return groups;
  }, [paginatedLogs]);

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Logs de Acesso" subtitle="Rastreamento de envios, acessos e leituras" />

      <Tabs defaultValue="logs">
        <TabsList className="bg-muted/30 p-1">
          <TabsTrigger value="logs" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <ScrollText className="h-3.5 w-3.5" /> Logs ({state.logs.length})
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Shield className="h-3.5 w-3.5" /> Auditoria ({state.auditTrail.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-4 mt-4">
          <div className="filter-bar">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar empresa ou usuário..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 bg-transparent" />
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
          </div>

          {logsFiltrados.length === 0 ? (
            <EmptyState icon={ScrollText} title="Nenhum log encontrado" description="Tente ajustar os filtros." />
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([dateKey, logs]) => (
                <div key={dateKey}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-semibold text-foreground/55 uppercase tracking-wider">{dateKey}</span>
                    <div className="flex-1 h-px bg-border/60" />
                  </div>
                  <div className="relative border-l-2 border-border/60 ml-4 space-y-2.5">
                    {logs.map(log => {
                      const empresa = state.empresas.find(e => e.id === log.empresaId);
                      const Icon = acaoIcons[log.acao] || ScrollText;
                      return (
                        <div key={log.id} className="relative pl-7">
                          <div className={cn('absolute -left-[5px] top-3 h-2.5 w-2.5 rounded-full', acaoColors[log.acao] || 'bg-muted-foreground')} />
                          <div className="glass-card-subtle p-3.5 hover:shadow-sm transition-all">
                            <div className="flex items-start gap-3">
                              <Icon className="h-4 w-4 text-foreground/50 shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{log.detalhes}</p>
                                <div className="flex flex-wrap gap-x-3 text-[11px] text-foreground/60 mt-0.5">
                                  <span className="cursor-pointer hover:underline" onClick={() => navigate(`/empresas/${log.empresaId}`)}>{empresa?.nomeFantasia}</span>
                                  <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium">{acaoLabels[log.acao]}</span>
                                  <span>{log.usuario}</span>
                                  {log.canal && <span className="capitalize">{log.canal}</span>}
                                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDateTime(log.dataHora)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Carregar mais</Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit" className="space-y-2 mt-4">
          {state.auditTrail.length === 0 ? (
            <EmptyState icon={Shield} title="Nenhum registro de auditoria" description="Ações realizadas no sistema aparecerão aqui." />
          ) : (
            [...state.auditTrail].reverse().map(entry => (
              <div key={entry.id} className="glass-card-subtle p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{entry.details}</p>
                    <div className="flex gap-3 text-[11px] text-foreground/60 mt-0.5">
                      <span className="capitalize">{entry.action}</span>
                      <span className="capitalize">{entry.entityType}</span>
                      <span>{entry.userId}</span>
                      <span>{new Date(entry.timestamp).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
