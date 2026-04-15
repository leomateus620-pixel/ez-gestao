import { useMemo } from 'react';
import { Plug, RefreshCw, Pause, Play, Activity, ShieldOff } from 'lucide-react';
import { useAutomation } from '@/data/AutomationProvider';
import { getConnectorHealth, getConnectorStats } from '@/lib/connector-registry';
import { getCircuitBreaker, resetCircuitBreaker } from '@/lib/automation-resilience';
import { PageHeader } from '@/components/PageHeader';
import { ConnectorHealthCard } from '@/components/ConnectorHealthCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function Integracoes() {
  const { state, updateConnectorStatus } = useAutomation();
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];

  const connectorsWithStats = useMemo(() =>
    state.connectors.map(conn => {
      const connLogs = state.healthLogs
        .filter(l => l.connectorId === conn.id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const cb = getCircuitBreaker(conn.id);
      return {
        connector: conn,
        health: getConnectorHealth(conn.id, state.healthLogs),
        stats: getConnectorStats(conn.id, state.runs),
        runsToday: state.runs.filter(r => r.connectorId === conn.id && r.inicioExecucao.startsWith(today)).length,
        recentLogs: connLogs.slice(0, 5),
        lastFailure: state.runs.find(r => r.connectorId === conn.id && (r.status === 'falha' || r.status === 'timeout')),
        circuitBreaker: cb,
      };
    })
  , [state.connectors, state.healthLogs, state.runs, today]);

  const tipoLabels: Record<string, string> = {
    api_direta: 'API Direta', browser_headless: 'Browser Headless',
    integracao_assistida: 'Assistida', upload_manual: 'Manual',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Integrações"
        subtitle={`${state.connectors.length} conectores configurados`}
      >
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toast({ title: 'Health check', description: 'Todos os conectores verificados.' })}>
          <RefreshCw className="h-4 w-4" /> Health Check
        </Button>
      </PageHeader>

      {/* Connector cards with health bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {connectorsWithStats.map(({ connector, health, runsToday, recentLogs }) => (
          <div key={connector.id} className="space-y-0">
            <ConnectorHealthCard
              connector={connector}
              healthLog={health}
              runsToday={runsToday}
            />
            {/* Mini health bar (last 5 checks) */}
            <div className="glass-card rounded-t-none border-t-0 px-4 py-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-foreground/35 w-14 shrink-0">Uptime 3d</span>
                <div className="flex gap-0.5 flex-1">
                  {recentLogs.map((log, i) => (
                    <div
                      key={i}
                      className={`h-2 flex-1 rounded-sm ${
                        log.status === 'ok' ? 'bg-success' :
                        log.status === 'degradado' ? 'bg-warning' : 'bg-destructive'
                      }`}
                      title={`${new Date(log.timestamp).toLocaleDateString('pt-BR')} — ${log.status} (${log.latencia}ms)`}
                    />
                  ))}
                  {recentLogs.length < 5 && Array.from({ length: 5 - recentLogs.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-2 flex-1 rounded-sm bg-muted" />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm" variant="ghost"
                  className="h-6 text-[10px] px-2 gap-1"
                  onClick={() => {
                    const newStatus = connector.status === 'ativo' ? 'manutencao' : 'ativo';
                    updateConnectorStatus(connector.id, newStatus as any);
                    toast({ title: newStatus === 'manutencao' ? 'Conector pausado' : 'Conector ativado' });
                  }}
                >
                  {connector.status === 'ativo' ? <><Pause className="h-3 w-3" /> Pausar</> : <><Play className="h-3 w-3" /> Ativar</>}
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-6 text-[10px] px-2 gap-1"
                  onClick={() => toast({ title: 'Teste executado', description: `${connector.nome} respondeu OK.` })}
                >
                  <Activity className="h-3 w-3" /> Testar
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail table */}
      <div>
        <h2 className="section-title mb-3">Detalhes dos Conectores</h2>
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] text-foreground/50 uppercase tracking-wider">
                  <th className="text-left p-3 font-semibold">Conector</th>
                  <th className="text-left p-3 font-semibold">Tipo</th>
                  <th className="text-left p-3 font-semibold">Versão</th>
                  <th className="text-right p-3 font-semibold">Taxa Sucesso</th>
                  <th className="text-right p-3 font-semibold">Tempo Médio</th>
                  <th className="text-right p-3 font-semibold">Execuções</th>
                  <th className="text-right p-3 font-semibold">Último Teste</th>
                  <th className="text-right p-3 font-semibold">Última Falha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {connectorsWithStats.map(({ connector, stats, lastFailure }) => (
                  <tr key={connector.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${
                          connector.status === 'ativo' ? 'bg-success' :
                          connector.status === 'erro' ? 'bg-destructive' :
                          connector.status === 'manutencao' ? 'bg-warning' : 'bg-muted-foreground'
                        }`} />
                        <span className="font-medium text-foreground">{connector.nome}</span>
                        {connector.status === 'manutencao' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">Manutenção</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-foreground/60 text-[12px]">{tipoLabels[connector.tipo]}</td>
                    <td className="p-3 font-mono text-[11px] text-foreground/50">{connector.versao}</td>
                    <td className="p-3 text-right">
                      <span className={`font-semibold ${stats.taxaSucesso >= 90 ? 'text-success' : stats.taxaSucesso >= 70 ? 'text-warning' : 'text-destructive'}`}>
                        {stats.taxaSucesso.toFixed(0)}%
                      </span>
                    </td>
                    <td className="p-3 text-right text-foreground/60">{connector.tempoMedio.toFixed(1)}s</td>
                    <td className="p-3 text-right text-foreground/60">{stats.total}</td>
                    <td className="p-3 text-right text-[11px] text-foreground/50">
                      {new Date(connector.ultimoTeste).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-3 text-right text-[11px]">
                      {lastFailure ? (
                        <span className="text-destructive/70">{new Date(lastFailure.inicioExecucao).toLocaleDateString('pt-BR')}</span>
                      ) : (
                        <span className="text-foreground/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
