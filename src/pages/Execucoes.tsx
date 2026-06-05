import { useMemo, useState, useEffect } from 'react';
import { Eye, RotateCcw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAutomation } from '@/data/AutomationProvider';
import { useDataStore } from '@/data/DataProvider';
import { PageHeader } from '@/components/PageHeader';
import { RunStatusBadge } from '@/components/RunStatusBadge';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { ExecutionTimeline } from '@/components/ExecutionTimeline';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 15;

export default function Execucoes() {
  const { state, enableHeavyData } = useAutomation();
  useEffect(() => { enableHeavyData(); }, [enableHeavyData]);
  const { state: dataState } = useDataStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [connectorFilter, setConnectorFilter] = useState<string>('todos');
  const [empresaFilter, setEmpresaFilter] = useState<string>('todos');
  const [periodoFilter, setPeriodoFilter] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let runs = [...state.runs].sort((a, b) => new Date(b.inicioExecucao).getTime() - new Date(a.inicioExecucao).getTime());
    if (statusFilter !== 'todos') runs = runs.filter(r => r.status === statusFilter);
    if (connectorFilter !== 'todos') runs = runs.filter(r => r.connectorId === connectorFilter);
    if (empresaFilter !== 'todos') runs = runs.filter(r => r.empresaId === empresaFilter);
    if (periodoFilter !== 'todos') {
      const now = Date.now();
      const cutoff = periodoFilter === 'hoje' ? now - 86400000 : periodoFilter === '7d' ? now - 7 * 86400000 : now - 30 * 86400000;
      runs = runs.filter(r => new Date(r.inicioExecucao).getTime() > cutoff);
    }
    return runs;
  }, [state.runs, statusFilter, connectorFilter, empresaFilter, periodoFilter]);

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);

  const resetFilters = () => { setStatusFilter('todos'); setConnectorFilter('todos'); setEmpresaFilter('todos'); setPeriodoFilter('todos'); setPage(1); };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Execuções" subtitle={`${filtered.length} execuções registradas`} />

      <div className="filter-bar flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sucesso">Sucesso</SelectItem>
            <SelectItem value="falha">Falha</SelectItem>
            <SelectItem value="revisao">Revisão</SelectItem>
            <SelectItem value="timeout">Timeout</SelectItem>
            <SelectItem value="agendado">Agendado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={connectorFilter} onValueChange={v => { setConnectorFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Conector" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Conectores</SelectItem>
            {state.connectors.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={empresaFilter} onValueChange={v => { setEmpresaFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas Empresas</SelectItem>
            {dataState.empresas.map(e => (
              <SelectItem key={e.id} value={e.id}>{e.nomeFantasia}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodoFilter} onValueChange={v => { setPeriodoFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="hoje">Hoje</SelectItem>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
          </SelectContent>
        </Select>
        {(statusFilter !== 'todos' || connectorFilter !== 'todos' || empresaFilter !== 'todos' || periodoFilter !== 'todos') && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>Limpar filtros</Button>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] text-foreground/68 uppercase tracking-wider">
                <th className="text-left p-3 font-semibold">Empresa</th>
                <th className="text-left p-3 font-semibold">Conector</th>
                <th className="text-left p-3 font-semibold">Status</th>
                <th className="text-left p-3 font-semibold">Confiança</th>
                <th className="text-right p-3 font-semibold">Duração</th>
                <th className="text-right p-3 font-semibold">Tentativa</th>
                <th className="text-right p-3 font-semibold">Data</th>
                <th className="text-right p-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginated.map(run => {
                const empresa = dataState.empresas.find(e => e.id === run.empresaId);
                const connector = state.connectors.find(c => c.id === run.connectorId);
                const retryPolicy = state.retryPolicies[run.connectorId];
                const isExpanded = expandedRow === run.id;

                return (
                  <Collapsible key={run.id} open={isExpanded} onOpenChange={() => setExpandedRow(isExpanded ? null : run.id)} asChild>
                    <>
                      <tr className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExpandedRow(isExpanded ? null : run.id)}>
                        <td className="p-3">
                          <p className="font-medium text-foreground">{empresa?.nomeFantasia || run.empresaId}</p>
                          <p className="text-[10px] text-foreground/72">{empresa?.cnpj}</p>
                        </td>
                        <td className="p-3 text-foreground/70 text-[12px]">{connector?.nome}</td>
                        <td className="p-3"><RunStatusBadge status={run.status} /></td>
                        <td className="p-3"><ConfidenceBadge level={run.confianca} /></td>
                        <td className="p-3 text-right text-foreground/72 text-[12px]">{run.duracao ? `${run.duracao.toFixed(1)}s` : '—'}</td>
                        <td className="p-3 text-right text-foreground/72 text-[12px]">
                          {run.tentativa}{retryPolicy ? `/${retryPolicy.maxTentativas}` : ''}
                        </td>
                        <td className="p-3 text-right text-foreground/68 text-[11px]">
                          {new Date(run.inicioExecucao).toLocaleDateString('pt-BR')}
                          <br />
                          {new Date(run.inicioExecucao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <CollapsibleTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </Button>
                            </CollapsibleTrigger>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigate(`/execuções/${run.id}`)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      <CollapsibleContent asChild>
                        <tr>
                          <td colSpan={8} className="p-0">
                            <div className="p-4 bg-muted/20 border-t border-border/30">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-[11px] font-semibold text-foreground/72 mb-2">Timeline</p>
                                  {run.steps.length > 0 ? (
                                    <ExecutionTimeline steps={run.steps} />
                                  ) : (
                                    <p className="text-[11px] text-foreground/72 italic">Sem etapas (agendado)</p>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  {run.erroDetalhes && (
                                    <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                                      <p className="text-[11px] font-semibold text-destructive mb-1">Motivo da Falha</p>
                                      <p className="text-[11px] text-foreground/70">{run.erroDetalhes}</p>
                                    </div>
                                  )}
                                  <div className="p-3 rounded-lg bg-muted/50">
                                    <p className="text-[11px] font-semibold text-foreground/72 mb-1">Resultado</p>
                                    <p className="text-[11px] font-mono text-foreground/68">{run.resultadoBruto || '—'}</p>
                                    <p className="text-[11px] text-foreground/70 mt-1">→ {run.statusNormalizado || '—'}</p>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => toast({ title: 'Reprocessando...' })}>
                                      <RotateCcw className="h-3 w-3" /> Reprocessar
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => toast({ title: 'Enviado para exceção' })}>
                                      <AlertTriangle className="h-3 w-3" /> Criar Exceção
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => navigate(`/execuções/${run.id}`)}>
                                      Ver detalhe →
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {paginated.length < filtered.length && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Carregar mais</Button>
        </div>
      )}
    </div>
  );
}
