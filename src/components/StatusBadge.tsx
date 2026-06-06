import { cn } from '@/lib/utils';
import { getStatusColor, getEmpresaStatusColor, getAlertaPrioridadeColor } from '@/lib/status-utils';
import { getStatusLabel } from '@/lib/formatters';

interface StatusBadgeProps {
  status: string;
  variant?: 'status' | 'empresa' | 'prioridade';
  className?: string;
  dot?: boolean;
}

export function StatusBadge({ status, variant = 'status', className, dot = true }: StatusBadgeProps) {
  const colorFn = variant === 'empresa' ? getEmpresaStatusColor :
                  variant === 'prioridade' ? getAlertaPrioridadeColor :
                  getStatusColor;

  const isPulsing = status === 'critica' || status === 'erro' || status === 'falhou';

  return (
    <span className={cn('status-badge border', colorFn(status), className)}>
      {dot && (
        <span className={cn(
          'h-1.5 w-1.5 rounded-full shrink-0',
          status === 'entregue' || status === 'lido' || status === 'ativa' || status === 'enviada' ? 'bg-success' :
          status === 'pausada' || status === 'alta' || status === 'revisao' ? 'bg-warning' :
          status === 'erro' || status === 'critica' || status === 'falhou' ? 'bg-destructive' :
          'bg-muted-foreground',
          isPulsing && 'animate-pulse-soft'
        )} />
      )}
      {getStatusLabel(status)}
    </span>
  );
}
