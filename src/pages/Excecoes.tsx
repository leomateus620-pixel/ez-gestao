import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAutomation } from '@/data/AutomationProvider';
import { useDataStore } from '@/data/DataProvider';
import { PageHeader } from '@/components/PageHeader';
import { ExceptionCard } from '@/components/ExceptionCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

export default function Excecoes() {
  const { state, resolveException, requeueException, discardException } = useAutomation();
  const { state: dataState } = useDataStore();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('ativas');
  const [criticidadeFilter, setCriticidadeFilter] = useState<string>('todas');

  const filtered = useMemo(() => {
    let exc = [...state.exceptions].sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
    if (statusFilter === 'ativas') exc = exc.filter(e => e.statusExcecao === 'pendente' || e.statusExcecao === 'em_analise');
    else if (statusFilter !== 'todas') exc = exc.filter(e => e.statusExcecao === statusFilter);
    if (criticidadeFilter !== 'todas') exc = exc.filter(e => e.criticidade === criticidadeFilter);
    return exc;
  }, [state.exceptions, statusFilter, criticidadeFilter]);

  const pendingCount = state.exceptions.filter(e => e.statusExcecao === 'pendente' || e.statusExcecao === 'em_analise').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Fila de Exceções"
        subtitle={`${pendingCount} exceções pendentes de ${state.exceptions.length} total`}
        icon={<AlertTriangle className="h-6 w-6 text-warning" />}
      />

      <div className="filter-bar flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativas">Ativas</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="em_analise">Em Análise</SelectItem>
            <SelectItem value="resolvida">Resolvidas</SelectItem>
            <SelectItem value="descartada">Descartadas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={criticidadeFilter} onValueChange={setCriticidadeFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="critica">Crítica</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <AlertTriangle className="h-10 w-10 text-foreground/20 mx-auto mb-3" />
          <p className="text-foreground/50 text-sm">Nenhuma exceção encontrada</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(exc => {
            const empresa = dataState.empresas.find(e => e.id === exc.empresaId);
            const connector = state.connectors.find(c => {
              const run = state.runs.find(r => r.id === exc.runId);
              return run && c.id === run.connectorId;
            });
            return (
              <ExceptionCard
                key={exc.id}
                exception={exc}
                empresaNome={empresa?.nomeFantasia}
                connectorNome={connector?.nome}
                onResolve={() => {
                  resolveException(exc.id, 'admin');
                  toast({ title: 'Exceção resolvida' });
                }}
                onRequeue={() => {
                  requeueException(exc.id);
                  toast({ title: 'Exceção reenfileirada' });
                }}
                onDiscard={() => {
                  discardException(exc.id);
                  toast({ title: 'Exceção descartada' });
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
