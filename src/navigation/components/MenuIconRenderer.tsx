import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export function MenuIconRenderer({ Icon, active }: { Icon: LucideIcon; active?: boolean }) {
  return (
    <span
      className={cn(
        'relative flex h-11 w-11 items-center justify-center rounded-[20px] border transition-all duration-300',
        active
          ? `border-sidebar-primary/18 bg-[linear-gradient(145deg,hsla(var(--surface-readable)),hsla(var(--sidebar-active-halo)))] text-sidebar-primary shadow-[inset_0_1px_8px_rgba(255,255,255,0.54),0_8px_20px_-18px_hsla(var(--sidebar-active-glow))]`
          : 'border-white/60 bg-[hsla(var(--surface-readable-muted))] text-[hsl(var(--text-tertiary))] hover:border-sidebar-primary/20 hover:bg-[hsla(var(--surface-readable))] hover:text-sidebar-primary',
      )}
    >
      <Icon className="h-[18px] w-[18px] stroke-[2.1]" />
    </span>
  );
}
