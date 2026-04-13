import { cn } from '@/lib/utils';

interface HealthRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
}

export function HealthRing({ percentage, size = 80, strokeWidth = 6, className, label }: HealthRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  
  const color = percentage >= 80 ? 'hsl(var(--success))' : 
                percentage >= 50 ? 'hsl(var(--warning))' : 
                'hsl(var(--destructive))';

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold tracking-tight">{percentage}%</span>
        {label && <span className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</span>}
      </div>
    </div>
  );
}
