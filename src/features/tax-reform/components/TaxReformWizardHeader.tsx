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
    <div>
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div><h2 className="text-lg font-black">{title}</h2><p className="text-sm text-foreground/65">{subtitle}</p></div>
        <Badge>{statusLabel}</Badge>
      </div>
      <Progress value={progress} />
      <div className="mt-4 grid gap-2 md:grid-cols-5">
        {steps.map((item, index) => (
          <button key={item.id} type="button" onClick={() => onStepChange(item.id)} className={cn('rounded-2xl border p-3 text-left text-xs font-bold transition', currentStep === item.id ? 'border-primary bg-primary text-white shadow-lg' : index < currentIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-white/60 bg-white/45 text-foreground/70')}>
            <item.icon className="mb-2 h-4 w-4" />{item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
