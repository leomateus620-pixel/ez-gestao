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
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/60 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_30px_-18px_rgba(37,99,235,0.8)] backdrop-blur-xl">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary/70">Área de trabalho</p>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle max-w-3xl text-foreground/62">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{children}</div>}
    </div>
  );
}
