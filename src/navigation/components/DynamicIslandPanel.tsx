import { cn } from '@/lib/utils';

export function DynamicIslandPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[30px] border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(248,250,255,0.96)_52%,rgba(241,245,255,0.94))] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.98),inset_0_-1px_0_rgba(219,226,239,0.62),0_18px_55px_-28px_rgba(15,23,42,0.68),0_0_0_1px_rgba(255,255,255,0.58)] backdrop-blur-md transition-all duration-300 before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-white/90 after:pointer-events-none after:absolute after:-right-12 after:-top-16 after:h-32 after:w-32 after:rounded-full after:bg-primary/10 after:blur-2xl',
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
