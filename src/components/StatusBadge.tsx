import { cn } from '@/lib/utils';
import { getStatusColor, getEmpresaStatusColor, getAlertaPrioridadeColor } from '@/lib/status-utils';
import { getStatusLabel } from '@/lib/formatters';

interface StatusBadgeProps {
  status: string;
  variant?: 'cnd' | 'empresa' | 'prioridade';
  className?: string;
  dot?: boolean;
}

export function StatusBadge({ status, variant = 'cnd', className, dot = true }: StatusBadgeProps) {
  const colorFn = variant === 'empresa' ? getEmpresaStatusColor :
                  variant === 'prioridade' ? getAlertaPrioridadeColor :
                  getStatusColor;

  return (
    <span className={cn('status-badge border', colorFn(status), className)}>
      {dot && (
        <span className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'valida' || status === 'ativa' ? 'bg-success' :
          status === 'vencendo' || status === 'pausada' || status === 'alta' ? 'bg-warning' :
          status === 'vencida' || status === 'erro' || status === 'critica' ? 'bg-destructive' :
          'bg-muted-foreground'
        )} />
      )}
      {getStatusLabel(status)}
    </span>
  );
}
