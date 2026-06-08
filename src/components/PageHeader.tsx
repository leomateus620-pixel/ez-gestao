import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, eyebrow = 'Área de trabalho', icon: Icon = Sparkles, children, className }: PageHeaderProps) {
  return (
    <div className={cn('page-accent-panel flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="relative z-10 flex min-w-0 items-start gap-3.5">
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/65 bg-[hsla(var(--surface-panel-strong))] text-sidebar-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_12px_28px_-24px_hsl(var(--brand-warm-shadow))] backdrop-blur-xl">
          <Icon className="h-5 w-5 stroke-[2.1]" />
        </div>
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-sidebar-primary/80">
              {eyebrow}
            </p>
          )}
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle max-w-3xl">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{children}</div>}
    </div>
  );
}
