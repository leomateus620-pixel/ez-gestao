import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, className }: EmptyStateProps) {
  return (
    <div className={cn('glass-card flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 mb-4">
        <Icon className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-1.5 max-w-xs">{description}</p>}
      {actionLabel && onAction && (
        <Button size="sm" className="mt-4 gap-1.5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
