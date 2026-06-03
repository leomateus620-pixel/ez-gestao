import { Activity, Wifi, WifiOff, AlertTriangle, Clock } from 'lucide-react';
import type { Connector, IntegrationHealthLog } from '@/data/automation-types';

interface ConnectorHealthCardProps {
  connector: Connector;
  healthLog: IntegrationHealthLog | null;
  runsToday?: number;
  onClick?: () => void;
}

export function ConnectorHealthCard({ connector, healthLog, runsToday = 0, onClick }: ConnectorHealthCardProps) {
  const statusConfig = {
    ativo: { icon: Wifi, color: 'text-success', bg: 'bg-success/10', label: 'Ativo' },
    inativo: { icon: WifiOff, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Inativo' },
    manutencao: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', label: 'Manutenção' },
    erro: { icon: WifiOff, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Erro' },
  };

  const healthConfig = {
    ok: { color: 'bg-success', label: 'Saudável' },
    degradado: { color: 'bg-warning', label: 'Degradado' },
    indisponivel: { color: 'bg-destructive', label: 'Indisponível' },
  };

  const s = statusConfig[connector.status];
  const h = healthLog ? healthConfig[healthLog.status] : null;
  const StatusIcon = s.icon;

  const tipoLabels: Record<string, string> = {
    api_direta: 'API Direta',
    browser_headless: 'Browser Headless',
    integracao_assistida: 'Assistida',
    upload_manual: 'Manual',
  };

  return (
    <div
      className="glass-card group cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_22px_48px_-34px_rgba(37,99,235,0.7)]"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`rounded-2xl border border-white/60 p-2 shadow-inner ${s.bg}`}>
            <StatusIcon className={`h-4 w-4 ${s.color}`} />
          </div>
          <div>
            <h3 className="font-display text-sm font-extrabold tracking-tight text-foreground">{connector.nome}</h3>
            <p className="text-[11px] text-foreground/50">{tipoLabels[connector.tipo]}</p>
          </div>
        </div>
        {h && (
          <span className={`h-2.5 w-2.5 rounded-full ${h.color} ${healthLog?.status === 'ok' ? 'animate-pulse-soft' : ''}`} />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl border border-white/50 bg-white/45 p-2 shadow-inner">
          <p className="text-lg font-bold text-foreground">{connector.taxaSucesso.toFixed(0)}%</p>
          <p className="text-[10px] text-foreground/50">Sucesso</p>
        </div>
        <div className="rounded-2xl border border-white/50 bg-white/45 p-2 shadow-inner">
          <p className="text-lg font-bold text-foreground">{connector.tempoMedio.toFixed(1)}s</p>
          <p className="text-[10px] text-foreground/50">Tempo</p>
        </div>
        <div className="rounded-2xl border border-white/50 bg-white/45 p-2 shadow-inner">
          <p className="text-lg font-bold text-foreground">{runsToday}</p>
          <p className="text-[10px] text-foreground/50">Hoje</p>
        </div>
      </div>

      {healthLog && (
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-foreground/40">
          <Clock className="h-3 w-3" />
          <span>Último check: {new Date(healthLog.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="mx-1">·</span>
          <span>{healthLog.latencia}ms</span>
        </div>
      )}

      <p className="mt-2 text-[10px] text-foreground/35 line-clamp-1">{connector.descricao}</p>
    </div>
  );
}
