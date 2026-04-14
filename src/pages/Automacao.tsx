import { useMemo, useState, useCallback } from 'react';
import { Play, RefreshCw, Zap, CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { useAutomation } from '@/data/AutomationProvider';
import { useDataStore } from '@/data/DataProvider';
import { useAutomationJobs } from '@/hooks/useAutomationJobs';
import { getConnectorHealth } from '@/lib/connector-registry';
import { PageHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';
import { ConnectorHealthCard } from '@/components/ConnectorHealthCard';
import { RunStatusBadge } from '@/components/RunStatusBadge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

export default function Automacao() {
  const { state } = useAutomation();
  const { state: dataState } = useDataStore();
  const { executarLoteColeta } = useAutomationJobs();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const metrics = useMemo(() => {
    const todayRuns = state.runs.filter(r => r.inicioExecucao.startsWith(today));
    return {
      total: todayRuns.length,
      sucesso: todayRuns.filter(r => r.status === 'sucesso').length,
      falha: todayRuns.filter(r => r.status === 'falha' || r.status === 'timeout').length,
      revisao: todayRuns.filter(r => r.status === 'revisao').length,
      pendentes: state.exceptions.filter(e => e.statusExcecao === 'pendente').length,
      agendados: state.batches.filter(b => b.status === 'agendado').length,
    };
  }, [state.runs, state.exceptions, state.batches, today]);

  const conectoresAtivos = useMemo(() =>
    state.connectors.filter(c => c.status === 'ativo')
  , [state.connectors]);

  const recentRuns = useMemo(() =>
    [...state.runs].sort((a, b) => new Date(b.inicioExecucao).getTime() - new Date(a.inicioExecucao).getTime()).slice(0, 8)
  , [state.runs]);

  const handleExecutarLote = useCallback(async () => {
    setRunning(true);
    try {
      const results = await executarLoteColeta();
      const ok = results.filter(r => r.sucesso).length;
      toast({ title: 'Lote executado', description: `${ok}/${results.length} coletas com sucesso.` });
    } catch {
      toast({ title: 'Erro', description: 'Falha ao executar lote.', variant: 'destructive' });
    }
    setRunning(false);
  }, [executarLoteColeta, toast]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Central de Automação" subtitle="Motor de coleta inteligente e monitoramento de conectores">
        <Button size="sm" variant="outline" onClick={() => navigate('/excecoes')} className="gap-1.5">
          <AlertTriangle className="h-4 w-4" />
          Exceções ({metrics.pendentes})
        </Button>
        <Button size="sm" onClick={handleExecutarLote} disabled={running} className="gap-1.5">
          {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Executando...' : 'Executar Lote'}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Coletas Hoje" value={metrics.total} icon={Zap} />
        <MetricCard title="Sucesso" value={metrics.sucesso} icon={CheckCircle2} color="success" />
        <MetricCard title="Falhas" value={metrics.falha} icon={XCircle} color={metrics.falha > 0 ? 'destructive' : 'primary'} />
        <MetricCard title="Revisão" value={metrics.revisao} icon={AlertTriangle} color={metrics.revisao > 0 ? 'warning' : 'primary'} />
        <MetricCard title="Exceções" value={metrics.pendentes} icon={AlertTriangle} color={metrics.pendentes > 0 ? 'destructive' : 'primary'} />
        <MetricCard title="Agendados" value={metrics.agendados} icon={Clock} color="info" />
      </div>

      <div>
        <h2 className="section-title mb-3">Conectores Ativos</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {conectoresAtivos.map(conn => {
            const health = getConnectorHealth(conn.id, state.healthLogs);
            const runsToday = state.runs.filter(r => r.connectorId === conn.id && r.inicioExecucao.startsWith(today)).length;
            return (
              <ConnectorHealthCard
                key={conn.id}
                connector={conn}
                healthLog={health}
                runsToday={runsToday}
                onClick={() => navigate('/integracoes')}
              />
            );
          })}
        </div>
      </div>

      <div>
        <div className="section-header">
          <h2 className="section-title">Execuções Recentes</h2>
          <Button size="sm" variant="ghost" onClick={() => navigate('/execucoes')} className="text-[11px]">
            Ver todas →
          </Button>
        </div>
        <div className="glass-card divide-y divide-border">
          {recentRuns.map(run => {
            const empresa = dataState.empresas.find(e => e.id === run.empresaId);
            const connector = state.connectors.find(c => c.id === run.connectorId);
            return (
              <div key={run.id} className="data-row" onClick={() => navigate(`/execucoes/${run.id}`)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <RunStatusBadge status={run.status} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{empresa?.nomeFantasia || run.empresaId}</p>
                    <p className="text-[11px] text-foreground/50">{connector?.nome || run.connectorId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-foreground/50">
                  {run.duracao && <span>{run.duracao.toFixed(1)}s</span>}
                  <span>{new Date(run.inicioExecucao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="section-title mb-3">Próximos Lotes</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {state.batches.filter(b => b.status === 'agendado' || b.status === 'executando').map(batch => (
            <div key={batch.id} className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`status-badge border ${
                  batch.status === 'executando' ? 'bg-primary/15 text-primary border-primary/30 animate-pulse-soft' : 'bg-info/15 text-info border-info/30'
                }`}>
                  {batch.status === 'executando' ? 'Em execução' : 'Agendado'}
                </span>
                <span className="text-[10px] text-foreground/40">
                  {new Date(batch.agendadoPara).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground">{batch.totalItems} empresas</p>
              {batch.status === 'executando' && (
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(batch.progressoAtual / batch.totalItems) * 100}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
