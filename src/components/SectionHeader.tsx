import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, icon: Icon, children, className }: SectionHeaderProps) {
  return (
    <div className={cn('section-header', className)}>
      <h3 className="section-title flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        {title}
      </h3>
      {children}
    </div>
  );
}
