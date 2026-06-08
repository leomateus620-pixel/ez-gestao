import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: string;
  color?: 'primary' | 'destructive' | 'warning' | 'success' | 'info' | 'accent';
  onClick?: () => void;
}

const colorMap = {
  primary: 'text-primary bg-primary/10 ring-primary/15',
  destructive: 'text-destructive bg-destructive/10 ring-destructive/15',
  warning: 'text-warning bg-warning/12 ring-warning/20',
  success: 'text-success bg-success/10 ring-success/15',
  info: 'text-info bg-info/10 ring-info/15',
  accent: 'text-accent bg-accent/10 ring-accent/15',
};

const accentMap = {
  primary: 'group-hover:border-primary/25',
  destructive: 'group-hover:border-destructive/25',
  warning: 'group-hover:border-warning/30',
  success: 'group-hover:border-success/25',
  info: 'group-hover:border-info/25',
  accent: 'group-hover:border-accent/25',
};

export function MetricCard({ title, value, icon: Icon, trend, color = 'primary', onClick }: MetricCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-[10rem] text-[11px] font-bold uppercase leading-snug tracking-[0.14em] text-[hsl(var(--text-tertiary))]">{title}</p>
        <div className={cn('rounded-xl p-2.5 ring-1', colorMap[color])}>
          <Icon className="h-4 w-4 stroke-[2.1]" />
        </div>
      </div>
      <div>
        <p data-metric-value className="font-display text-3xl font-bold tracking-[-0.04em] text-[hsl(var(--text-primary))] tabular-nums">{value}</p>
        {trend && <p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--text-tertiary))]">{trend}</p>}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cn('metric-card group w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0', accentMap[color])}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return <div className={cn('metric-card group', accentMap[color])}>{content}</div>;
}
