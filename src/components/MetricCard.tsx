import { GlassCard } from './GlassCard';
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

export function MetricCard({ title, value, icon: Icon, trend, color = 'primary', onClick }: MetricCardProps) {
  return (
    <GlassCard hover className={cn('cursor-default', onClick && 'cursor-pointer')} onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
          {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
        </div>
        <div className={cn('rounded-xl p-2.5', colorMap[color])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </GlassCard>
  );
}
