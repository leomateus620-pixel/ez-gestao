import { useMemo, useState } from 'react';
import { ListChecks, RotateCcw, Eye, AlertTriangle } from 'lucide-react';
import { useAutomation } from '@/data/AutomationProvider';
import { useDataStore } from '@/data/DataProvider';
import { PageHeader } from '@/components/PageHeader';
import { RunStatusBadge } from '@/components/RunStatusBadge';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';

const PAGE_SIZE = 15;

export default function Execucoes() {
  const { state } = useAutomation();
  const { state: dataState } = useDataStore();
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [connectorFilter, setConnectorFilter] = useState<string>('todos');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let runs = [...state.runs].sort((a, b) => new Date(b.inicioExecucao).getTime() - new Date(a.inicioExecucao).getTime());
    if (statusFilter !== 'todos') runs = runs.filter(r => r.status === statusFilter);
    if (connectorFilter !== 'todos') runs = runs.filter(r => r.connectorId === connectorFilter);
    return runs;
  }, [state.runs, statusFilter, connectorFilter]);

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Execuções"
        subtitle={`${filtered.length} execuções registradas`}
      />

      <div className="filter-bar flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
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
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Conector" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {state.connectors.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] text-foreground/50 uppercase tracking-wider">
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
                return (
                  <tr key={run.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/execucoes/${run.id}`)}>
                    <td className="p-3">
                      <p className="font-medium text-foreground">{empresa?.nomeFantasia || run.empresaId}</p>
                      <p className="text-[10px] text-foreground/40">{empresa?.cnpj}</p>
                    </td>
                    <td className="p-3 text-foreground/70 text-[12px]">{connector?.nome}</td>
                    <td className="p-3"><RunStatusBadge status={run.status} /></td>
                    <td className="p-3"><ConfidenceBadge level={run.confianca} /></td>
                    <td className="p-3 text-right text-foreground/60 text-[12px]">{run.duracao ? `${run.duracao.toFixed(1)}s` : '—'}</td>
                    <td className="p-3 text-right text-foreground/60 text-[12px]">{run.tentativa}</td>
                    <td className="p-3 text-right text-foreground/50 text-[11px]">
                      {new Date(run.inicioExecucao).toLocaleDateString('pt-BR')}
                      <br />
                      {new Date(run.inicioExecucao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigate(`/execucoes/${run.id}`)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
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
