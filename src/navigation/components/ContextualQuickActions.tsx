import { Button } from '@/components/ui/button';
import type { QuickAction } from '@/navigation/menu-registry';
import { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';

export function ContextualQuickActions({ actions }: { actions: QuickAction[] }) {
  const navigate = useNavigate();
  if (!actions.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button key={action.id} size="sm" variant={action.intent === 'primary' ? 'default' : 'secondary'} onClick={() => action.route && startTransition(() => navigate(action.route))} className="h-8 rounded-full px-3 text-xs">
          {action.label}
        </Button>
      ))}
    </div>
  );
}
