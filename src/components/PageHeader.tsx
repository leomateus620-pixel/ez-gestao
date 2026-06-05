import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, children, className }: PageHeaderProps) {
  return (
    <div className={cn('page-accent-panel flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="relative z-10 flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/60 text-sidebar-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_26px_-22px_hsl(var(--brand-warm-shadow)/0.55)] backdrop-blur-xl">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-sidebar-primary/80">Área de trabalho</p>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle max-w-3xl text-[hsl(var(--text-tertiary))]">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{children}</div>}
    </div>
  );
}
