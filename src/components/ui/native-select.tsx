import * as React from 'react';
import { cn } from '@/lib/utils';

export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn('native-select', className)} {...props}>
    {children}
  </select>
));
NativeSelect.displayName = 'NativeSelect';

export { NativeSelect };
