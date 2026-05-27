import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

const menuStyle: Record<string, string> = {
  dashboard: 'from-amber-400/30 via-red-400/20 to-lime-400/30',
  guias: 'from-green-400/30 via-blue-500/20 to-yellow-400/30',
  integracoes: 'from-pink-400/35 via-fuchsia-500/20 to-rose-300/30',
  empresas: 'from-cyan-400/30 via-blue-500/20 to-indigo-400/30',
  configuracoes: 'from-violet-400/30 via-indigo-500/20 to-slate-400/30',
};

export function MenuIconRenderer({ Icon, active, menuId }: { Icon: LucideIcon; active?: boolean; menuId: string }) {
  return (
    <span
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-2xl border transition-all duration-300',
        active
          ? `bg-gradient-to-br ${menuStyle[menuId] ?? 'from-primary/20 to-accent/20'} text-foreground border-white/50 shadow-[inset_0_1px_8px_rgba(255,255,255,0.4),0_6px_20px_-12px_rgba(0,0,0,0.7)]`
          : 'border-white/15 bg-white/[0.03] text-foreground/45 hover:border-white/30 hover:text-foreground/80',
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}
