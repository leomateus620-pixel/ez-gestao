import { CheckCircle2, XCircle, SkipForward, Loader2 } from 'lucide-react';
import type { ConnectorRunStep } from '@/data/automation-types';

interface ExecutionTimelineProps {
  steps: ConnectorRunStep[];
}

const etapaLabels: Record<string, string> = {
  autenticacao: 'Autenticação',
  consulta: 'Consulta',
  captura: 'Captura',
  parsing: 'Parsing',
  persistencia: 'Persistência',
};

const statusIcons = {
  sucesso: CheckCircle2,
  falha: XCircle,
  pulado: SkipForward,
  executando: Loader2,
};

const statusColors = {
  sucesso: 'text-success',
  falha: 'text-destructive',
  pulado: 'text-muted-foreground',
  executando: 'text-primary animate-spin',
};

export function ExecutionTimeline({ steps }: ExecutionTimelineProps) {
  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const Icon = statusIcons[step.status];
        const color = statusColors[step.status];
        const isLast = i === steps.length - 1;

        return (
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`p-1 rounded-full ${
                step.status === 'sucesso' ? 'bg-success/10' :
                step.status === 'falha' ? 'bg-destructive/10' :
                'bg-muted'
              }`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              {!isLast && (
                <div className={`w-px flex-1 min-h-[24px] ${
                  step.status === 'sucesso' ? 'bg-success/30' :
                  step.status === 'falha' ? 'bg-destructive/30' :
                  'bg-border'
                }`} />
              )}
            </div>
            <div className={`pb-4 flex-1 ${isLast ? 'pb-0' : ''}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{etapaLabels[step.etapa] || step.etapa}</p>
                {step.inicio && step.fim && (
                  <span className="text-[10px] text-foreground/40">
                    {Math.round((new Date(step.fim).getTime() - new Date(step.inicio).getTime()) / 1000)}s
                  </span>
                )}
              </div>
              {step.detalhes && (
                <p className="text-[11px] text-foreground/50 mt-0.5">{step.detalhes}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
