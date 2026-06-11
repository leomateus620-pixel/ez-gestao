import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export type TaxReformWizardHeaderStep = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function TaxReformWizardHeader({
  title,
  subtitle,
  statusLabel,
  progress,
  steps,
  currentStep,
  onStepChange,
}: {
  title: string;
  subtitle: string;
  statusLabel: string;
  progress: number;
  steps: TaxReformWizardHeaderStep[];
  currentStep: string;
  onStepChange: (step: string) => void;
}) {
  const currentIndex = steps.findIndex((item) => item.id === currentStep);
  return (
    <div className="tax-reform-glass-panel rounded-3xl p-4">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div><h2 className="font-display text-lg font-black">{title}</h2><p className="text-sm text-foreground">{subtitle}</p></div>
        <Badge>{statusLabel}</Badge>
      </div>
      <Progress value={progress} />
      <div className="mt-4 grid gap-2 md:grid-cols-5">
        {steps.map((item, index) => (
          <button key={item.id} type="button" onClick={() => onStepChange(item.id)} className={cn('tax-reform-action-button rounded-2xl border p-3 text-left text-xs font-black transition', currentStep === item.id ? 'border-primary bg-primary text-white shadow-lg shadow-primary/20' : index < currentIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-primary/15 bg-white/60 text-foreground hover:border-primary/30 hover:bg-primary/10')}>
            <item.icon className="mb-2 h-4 w-4" />{item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
