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
  primary: 'text-primary bg-primary/10',
  destructive: 'text-destructive bg-destructive/10',
  warning: 'text-warning bg-warning/10',
  success: 'text-success bg-success/10',
  info: 'text-info bg-info/10',
  accent: 'text-accent bg-accent/10',
};

const accentMap = {
  primary: 'group-hover:shadow-primary/10',
  destructive: 'group-hover:shadow-destructive/10',
  warning: 'group-hover:shadow-warning/10',
  success: 'group-hover:shadow-success/10',
  info: 'group-hover:shadow-info/10',
  accent: 'group-hover:shadow-accent/10',
};

export function MetricCard({ title, value, icon: Icon, trend, color = 'primary', onClick }: MetricCardProps) {
  return (
    <div
      className={cn(
        'metric-card group',
        onClick ? 'cursor-pointer' : 'cursor-default',
        accentMap[color]
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--text-tertiary))]">{title}</p>
        <div className={cn('rounded-xl p-2.5', colorMap[color])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
        {trend && <p className="text-[11px] text-[hsl(var(--text-tertiary))] mt-1">{trend}</p>}
      </div>
    </div>
  );
}
