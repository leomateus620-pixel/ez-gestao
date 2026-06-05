import { AlertTriangle, TrendingDown, Clock, Wifi } from 'lucide-react';

interface RiskCardProps {
  title: string;
  value: number;
  subtitle: string;
  variant: 'critical' | 'warning' | 'info' | 'neutral';
  onClick?: () => void;
}

const variantConfig = {
  critical: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
  warning: { icon: TrendingDown, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
  info: { icon: Clock, color: 'text-info', bg: 'bg-info/10', border: 'border-info/20' },
  neutral: { icon: Wifi, color: 'text-foreground/60', bg: 'bg-muted', border: 'border-border' },
};

export function RiskCard({ title, value, subtitle, variant, onClick }: RiskCardProps) {
  const cfg = variantConfig[variant];
  const Icon = cfg.icon;

  return (
    <div
      className={`glass-card p-4 border ${cfg.border} cursor-pointer hover:scale-[1.02] transition-all`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className={`p-2 rounded-lg ${cfg.bg}`}>
          <Icon className={`h-4 w-4 ${cfg.color}`} />
        </div>
        <span className={`text-2xl font-bold ${value > 0 ? cfg.color : 'text-foreground/30'}`}>{value}</span>
      </div>
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="text-[10px] text-foreground/45 mt-0.5">{subtitle}</p>
    </div>
  );
}
