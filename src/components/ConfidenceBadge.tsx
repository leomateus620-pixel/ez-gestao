import { Shield, ShieldAlert, ShieldQuestion } from 'lucide-react';
import type { ConfidenceLevel } from '@/data/automation-types';

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  className?: string;
}

const config: Record<ConfidenceLevel, { icon: typeof Shield; label: string; classes: string }> = {
  alta: { icon: Shield, label: 'Alta', classes: 'bg-success/15 text-success border-success/30' },
  media: { icon: ShieldQuestion, label: 'Média', classes: 'bg-warning/15 text-warning border-warning/30' },
  baixa: { icon: ShieldAlert, label: 'Baixa', classes: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export function ConfidenceBadge({ level, className = '' }: ConfidenceBadgeProps) {
  const c = config[level];
  const Icon = c.icon;
  return (
    <span className={`status-badge border ${c.classes} ${className}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}
