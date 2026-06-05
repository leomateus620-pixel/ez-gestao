import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

const menuStyle: Record<string, string> = {
  dashboard: 'from-brand-orange-light/28 via-primary/18 to-brand-metal-blue/18',
  guias: 'from-brand-orange-light/24 via-primary/16 to-brand-metal-blue/16',
  integracoes: 'from-brand-metal-blue/24 via-primary/14 to-brand-orange-light/18',
  empresas: 'from-brand-orange-light/22 via-primary/14 to-emerald-500/14',
  'fator-r': 'from-brand-orange-light/32 via-primary/20 to-brand-orange-deep/18',
  classifica: 'from-brand-orange-light/22 via-primary/14 to-brand-metal-blue/20',
  whatsapp: 'from-brand-orange-light/20 via-primary/14 to-emerald-500/16',
  configuracoes: 'from-brand-metal-light/26 via-primary/12 to-brand-metal-blue/18',
};

export function MenuIconRenderer({ Icon, active, menuId }: { Icon: LucideIcon; active?: boolean; menuId: string }) {
  return (
    <span
      className={cn(
        'relative flex h-11 w-11 items-center justify-center rounded-[20px] border transition-all duration-300',
        active
          ? `border-white/80 bg-gradient-to-br ${menuStyle[menuId] ?? 'from-primary/20 to-accent/20'} text-primary shadow-[inset_0_1px_8px_rgba(255,255,255,0.62),0_10px_26px_-18px_hsl(var(--brand-warm-shadow))]`
          : 'border-white/55 bg-white/42 text-foreground/58 hover:border-primary/22 hover:bg-brand-warm-surface/68 hover:text-primary',
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}
