import { useMemo, useState, useCallback } from 'react';
import { Play, RefreshCw, Zap, CheckCircle2, XCircle, AlertTriangle, Clock, TrendingUp, Shield, Pause, ShieldAlert } from 'lucide-react';
import { useAutomation } from '@/data/AutomationProvider';
import { useDataStore } from '@/data/DataProvider';
import { useAutomationJobs } from '@/hooks/useAutomationJobs';
import { getConnectorHealth } from '@/lib/connector-registry';
import { getAllCircuitBreakers } from '@/lib/automation-resilience';
import { PageHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';
import { ConnectorHealthCard } from '@/components/ConnectorHealthCard';
import { RunStatusBadge } from '@/components/RunStatusBadge';
import { RiskCard } from '@/components/RiskCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { tipologiaLabels, type ExceptionTipologia } from '@/data/automation-types';

export default function Automacao() {
  const { state, pendingExceptions, criticalExceptions, unstableConnectors, exceptionsByTipologia } = useAutomation();
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
      pendentes: pendingExceptions,
      agendados: state.batches.filter(b => b.status === 'agendado').length,
    };
  }, [state.runs, state.batches, today, pendingExceptions]);

  const riskMetrics = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const empresasDesatualizadas = dataState.empresas.filter(e => {
      const runs = state.runs.filter(r => r.empresaId === e.id);
      if (runs.length === 0) return true;
      const lastRun = Math.max(...runs.map(r => new Date(r.inicioExecucao).getTime()));
      return lastRun < sevenDaysAgo;
    }).length;

    const cndsVencidasSemColeta = dataState.cnds.filter(c => c.status === 'vencida').length;

    return { empresasDesatualizadas, cndsVencidasSemColeta };
  }, [dataState.empresas, dataState.cnds, state.runs]);

  const productivity = useMemo(() => {
    const allRuns = state.runs.filter(r => r.status !== 'agendado');
    if (allRuns.length === 0) return { autoRate: 0, avgDuration: 0 };
    const autoResolved = allRuns.filter(r => r.status === 'sucesso' && r.confianca === 'alta').length;
    const avgDuration = allRuns.reduce((sum, r) => sum + (r.duracao || 0), 0) / allRuns.length;
    return { autoRate: Math.round((autoResolved / allRuns.length) * 100), avgDuration };
  }, [state.runs]);

  const topTipologias = useMemo(() => {
    return Object.entries(exceptionsByTipologia)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [exceptionsByTipologia]);

  const conectoresAtivos = useMemo(() =>
    state.connectors.filter(c => c.status === 'ativo')
  , [state.connectors]);

  const circuitBreakers = useMemo(() =>
    getAllCircuitBreakers().filter(cb => cb.estado !== 'closed')
  , [state.runs]);

  const recentRuns = useMemo(() =>
    [...state.runs].sort((a, b) => new Date(b.inicioExecucao).getTime() - new Date(a.inicioExecucao).getTime()).slice(0, 6)
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
      <PageHeader title="Central de Automação" subtitle="Motor de coleta inteligente e monitoramento operacional">
        <Button size="sm" variant="outline" onClick={() => navigate('/excecoes')} className="gap-1.5">
          <AlertTriangle className="h-4 w-4" />
          Exceções ({metrics.pendentes})
        </Button>
        <Button size="sm" onClick={handleExecutarLote} disabled={running} className="gap-1.5">
          {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Executando...' : 'Executar Lote'}
        </Button>
      </PageHeader>

      {/* Bloco 1 — Visão Operacional do Dia */}
      <div>
        <h2 className="section-title mb-3">Visão Operacional do Dia</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard title="Coletas Hoje" value={metrics.total} icon={Zap} />
          <MetricCard title="Sucesso" value={metrics.sucesso} icon={CheckCircle2} color="success" />
          <MetricCard title="Falhas" value={metrics.falha} icon={XCircle} color={metrics.falha > 0 ? 'destructive' : 'primary'} />
          <MetricCard title="Revisão" value={metrics.revisao} icon={AlertTriangle} color={metrics.revisao > 0 ? 'warning' : 'primary'} />
          <MetricCard title="Exceções" value={metrics.pendentes} icon={AlertTriangle} color={metrics.pendentes > 0 ? 'destructive' : 'primary'} />
          <MetricCard title="Agendados" value={metrics.agendados} icon={Clock} color="info" />
        </div>
      </div>

      {/* Bloco 2 — Visão de Risco */}
      <div>
        <h2 className="section-title mb-3">Visão de Risco</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <RiskCard
            title="Exceções Críticas"
            value={criticalExceptions.length}
            subtitle="Requerem ação imediata"
            variant="critical"
            onClick={() => navigate('/excecoes')}
          />
          <RiskCard
            title="CNDs Vencidas"
            value={riskMetrics.cndsVencidasSemColeta}
            subtitle="Sem coleta recente"
            variant="warning"
            onClick={() => navigate('/certidoes')}
          />
          <RiskCard
            title="Conectores Instáveis"
            value={unstableConnectors.length}
            subtitle="Taxa < 80% ou em erro"
            variant={unstableConnectors.length > 0 ? 'warning' : 'neutral'}
            onClick={() => navigate('/integracoes')}
          />
          <RiskCard
            title="Empresas Desatualizadas"
            value={riskMetrics.empresasDesatualizadas}
            subtitle="Sem coleta há >7 dias"
            variant={riskMetrics.empresasDesatualizadas > 0 ? 'info' : 'neutral'}
            onClick={() => navigate('/empresas')}
          />
        </div>
      </div>

      {/* Bloco 3 — Gargalos + Bloco 4 — Produtividade */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h2 className="section-title mb-3">Gargalos</h2>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] text-foreground/50 mb-2">Tempo Médio por Conector</p>
              <div className="space-y-2">
                {state.connectors.filter(c => c.status === 'ativo' && c.tempoMedio > 0).sort((a, b) => b.tempoMedio - a.tempoMedio).map(c => (
                  <div key={c.id} className="flex items-center gap-2">
                    <span className="text-[11px] text-foreground/60 w-28 truncate">{c.nome}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${c.tempoMedio > 10 ? 'bg-destructive' : c.tempoMedio > 5 ? 'bg-warning' : 'bg-success'}`}
                        style={{ width: `${Math.min((c.tempoMedio / 20) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-foreground/70 w-10 text-right">{c.tempoMedio.toFixed(1)}s</span>
                  </div>
                ))}
              </div>
            </div>
            {topTipologias.length > 0 && (
              <div>
                <p className="text-[11px] text-foreground/50 mb-2">Top Exceções por Tipo</p>
                <div className="space-y-1.5">
                  {topTipologias.map(([tipo, count]) => (
                    <div key={tipo} className="flex items-center justify-between text-[11px]">
                      <span className="text-foreground/60">{tipologiaLabels[tipo as ExceptionTipologia]}</span>
                      <span className="font-semibold text-foreground/80">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="section-title mb-3">Produtividade</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Shield className="h-4 w-4 text-success" />
              </div>
              <p className="text-2xl font-bold text-foreground">{productivity.autoRate}%</p>
              <p className="text-[10px] text-foreground/45">Automação sem intervenção</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold text-foreground">{productivity.avgDuration.toFixed(1)}s</p>
              <p className="text-[10px] text-foreground/45">Tempo médio de execução</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[11px] text-foreground/50 mb-2">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={handleExecutarLote} disabled={running}>
                <Play className="h-3 w-3" /> Executar Lote
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => navigate('/excecoes')}>
                <AlertTriangle className="h-3 w-3" /> Exceções Críticas
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                <Pause className="h-3 w-3" /> Pausar Automação
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Saúde dos Conectores — Circuit Breakers */}
      {circuitBreakers.length > 0 && (
        <div>
          <h2 className="section-title mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" /> Proteção Ativa
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {circuitBreakers.map(cb => {
              const conn = state.connectors.find(c => c.id === cb.connectorId);
              return (
                <div key={cb.connectorId} className="glass-card p-4 border-l-2 border-l-warning">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{conn?.nome || cb.connectorId}</span>
                    <span className={`status-badge border text-[10px] ${
                      cb.estado === 'open' ? 'bg-destructive/15 text-destructive border-destructive/30' : 'bg-warning/15 text-warning border-warning/30'
                    }`}>
                      {cb.estado === 'open' ? 'Aberto' : 'Testando'}
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground/50">{cb.falhasConsecutivas} falhas consecutivas</p>
                  {cb.proximoTeste && (
                    <p className="text-[10px] text-foreground/40 mt-1">
                      Próximo teste: {new Date(cb.proximoTeste).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Conectores Ativos */}
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

      {/* Execuções Recentes */}
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
              <div key={run.id} className="data-row" onClick={() => navigate(`/execuções/${run.id}`)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <RunStatusBadge status={run.status} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{empresa?.nomeFantasia || run.empresaId}</p>
                    <p className="text-[11px] text-foreground/50">{connector?.nome || run.connectorId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-foreground/50">
                  {run.erroDetalhes && (
                    <span className="text-destructive/70 truncate max-w-[200px] hidden lg:inline">{run.erroDetalhes}</span>
                  )}
                  {run.duracao && <span>{run.duracao.toFixed(1)}s</span>}
                  <span>{new Date(run.inicioExecucao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Próximos Lotes */}
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
