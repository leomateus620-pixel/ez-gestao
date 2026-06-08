import { cn } from '@/lib/utils';
import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hover?: boolean;
  variant?: 'default' | 'elevated' | 'subtle' | 'critical';
}

const variantClasses = {
  default: 'glass-card',
  elevated: 'glass-card-elevated',
  subtle: 'glass-card-subtle',
  critical: 'glass-card-critical',
};

export function GlassCard({ children, className, hover = false, variant = 'default', ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        variantClasses[variant],
        'p-5',
        hover && 'transition-transform hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_18px_42px_-32px_hsl(var(--brand-warm-shadow)/0.36)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
