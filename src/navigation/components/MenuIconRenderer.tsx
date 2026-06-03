import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

const menuStyle: Record<string, string> = {
  dashboard: 'from-sky-500/24 via-blue-500/16 to-cyan-400/22',
  guias: 'from-violet-500/24 via-indigo-500/16 to-blue-400/22',
  integracoes: 'from-cyan-500/24 via-sky-500/16 to-blue-500/22',
  empresas: 'from-emerald-500/24 via-teal-500/16 to-cyan-400/22',
  'fator-r': 'from-amber-400/30 via-orange-400/18 to-rose-400/20',
  classifica: 'from-fuchsia-500/24 via-violet-500/16 to-indigo-500/22',
  whatsapp: 'from-green-500/24 via-emerald-500/16 to-teal-400/22',
  configuracoes: 'from-slate-500/20 via-blue-500/12 to-slate-400/18',
};

export function MenuIconRenderer({ Icon, active, menuId }: { Icon: LucideIcon; active?: boolean; menuId: string }) {
  return (
    <span
      className={cn(
        'relative flex h-11 w-11 items-center justify-center rounded-[20px] border transition-all duration-300',
        active
          ? `border-white/70 bg-gradient-to-br ${menuStyle[menuId] ?? 'from-primary/20 to-accent/20'} text-primary shadow-[inset_0_1px_8px_rgba(255,255,255,0.58),0_10px_26px_-18px_rgba(37,99,235,0.95)]`
          : 'border-white/45 bg-white/36 text-foreground/54 hover:border-white/65 hover:bg-white/55 hover:text-primary',
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}
