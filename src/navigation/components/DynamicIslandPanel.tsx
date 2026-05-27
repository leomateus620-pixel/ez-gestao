import { cn } from '@/lib/utils';

export function DynamicIslandPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-[24px] border border-white/30 bg-gradient-to-br from-background/95 via-background/85 to-muted/80 px-3 py-2 shadow-[0_10px_45px_-20px_rgba(0,0,0,0.75)] backdrop-blur-2xl transition-all duration-300',
        className,
      )}
    >
      {children}
    </div>
  );
}
