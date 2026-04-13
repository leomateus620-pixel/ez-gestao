import { cn } from '@/lib/utils';

interface HealthBarProps {
  validas: number;
  vencendo: number;
  vencidas: number;
  pendentes?: number;
  total: number;
  className?: string;
  showLabels?: boolean;
}

export function HealthBar({ validas, vencendo, vencidas, pendentes = 0, total, className, showLabels = false }: HealthBarProps) {
  if (total === 0) return null;

  const pct = (v: number) => Math.round((v / total) * 100);

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {vencidas > 0 && (
          <div className="bg-destructive transition-all duration-500" style={{ width: `${pct(vencidas)}%` }} />
        )}
        {vencendo > 0 && (
          <div className="bg-warning transition-all duration-500" style={{ width: `${pct(vencendo)}%` }} />
        )}
        {pendentes > 0 && (
          <div className="bg-info transition-all duration-500" style={{ width: `${pct(pendentes)}%` }} />
        )}
        {validas > 0 && (
          <div className="bg-success transition-all duration-500" style={{ width: `${pct(validas)}%` }} />
        )}
      </div>
      {showLabels && (
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          {validas > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success" />{validas} válidas</span>}
          {vencendo > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-warning" />{vencendo} vencendo</span>}
          {vencidas > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-destructive" />{vencidas} vencidas</span>}
          {pendentes > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-info" />{pendentes} pendentes</span>}
        </div>
      )}
    </div>
  );
}
