import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export function MetricCardSkeleton() {
  return (
    <div className="glass-card p-5 min-h-[120px] flex flex-col justify-between">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-16 mt-2" />
      <Skeleton className="h-3 w-24 mt-2" />
    </div>
  );
}

export function ListRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-card-subtle p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TimelineSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="relative border-l-2 border-border/60 ml-4 space-y-4 py-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="relative pl-6">
          <Skeleton className="absolute -left-[5px] top-1.5 h-3 w-3 rounded-full" />
          <Skeleton className="h-4 w-64 mb-1" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <CardSkeleton />
      <ListRowSkeleton />
    </div>
  );
}
