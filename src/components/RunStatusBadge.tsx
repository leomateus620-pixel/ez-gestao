import type { RunStatus } from '@/data/automation-types';

interface RunStatusBadgeProps {
  status: RunStatus;
  className?: string;
}

const config: Record<RunStatus, { label: string; classes: string; pulse?: boolean }> = {
  agendado: { label: 'Agendado', classes: 'bg-info/15 text-info border-info/30' },
  executando: { label: 'Executando', classes: 'bg-primary/15 text-primary border-primary/30', pulse: true },
  sucesso: { label: 'Sucesso', classes: 'bg-success/15 text-success border-success/30' },
  falha: { label: 'Falha', classes: 'bg-destructive/15 text-destructive border-destructive/30' },
  revisao: { label: 'Revisão', classes: 'bg-warning/15 text-warning border-warning/30' },
  timeout: { label: 'Timeout', classes: 'bg-destructive/15 text-destructive border-destructive/30' },
  cancelado: { label: 'Cancelado', classes: 'bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30' },
  bloqueado: { label: 'Bloqueado', classes: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export function RunStatusBadge({ status, className = '' }: RunStatusBadgeProps) {
  const c = config[status];
  return (
    <span className={`status-badge border ${c.classes} ${c.pulse ? 'animate-pulse-soft' : ''} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        status === 'sucesso' ? 'bg-success' :
        status === 'falha' || status === 'timeout' ? 'bg-destructive' :
        status === 'executando' ? 'bg-primary' :
        status === 'revisão' ? 'bg-warning' : 'bg-info'
      }`} />
      {c.label}
    </span>
  );
}
