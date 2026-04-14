import { useMemo } from 'react';
import { Plug, RefreshCw } from 'lucide-react';
import { useAutomation } from '@/data/AutomationProvider';
import { getConnectorHealth, getConnectorStats } from '@/lib/connector-registry';
import { PageHeader } from '@/components/PageHeader';
import { ConnectorHealthCard } from '@/components/ConnectorHealthCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function Integracoes() {
  const { state } = useAutomation();
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];

  const connectorsWithStats = useMemo(() =>
    state.connectors.map(conn => ({
      connector: conn,
      health: getConnectorHealth(conn.id, state.healthLogs),
      stats: getConnectorStats(conn.id, state.runs),
      runsToday: state.runs.filter(r => r.connectorId === conn.id && r.inicioExecucao.startsWith(today)).length,
    }))
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {connectorsWithStats.map(({ connector, health, stats, runsToday }) => (
          <ConnectorHealthCard
            key={connector.id}
            connector={connector}
            healthLog={health}
            runsToday={runsToday}
          />
        ))}
      </div>

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
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {connectorsWithStats.map(({ connector, stats }) => (
                  <tr key={connector.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${
                          connector.status === 'ativo' ? 'bg-success' :
                          connector.status === 'erro' ? 'bg-destructive' :
                          connector.status === 'manutencao' ? 'bg-warning' : 'bg-muted-foreground'
                        }`} />
                        <span className="font-medium text-foreground">{connector.nome}</span>
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
