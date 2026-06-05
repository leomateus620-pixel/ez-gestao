import { Shield, ShieldAlert, ShieldQuestion } from 'lucide-react';
import type { ConfidenceLevel } from '@/data/automation-types';

interface ConfidenceBreakdownProps {
  confianca: ConfidenceLevel;
  scores?: {
    cnpjMatch: boolean;
    validadePresente: boolean;
    numeroDocumento: boolean;
    tipoMatch: boolean;
    orgaoMatch: boolean;
    textoClaro: boolean;
  };
}

const defaultScores = {
  alta: { cnpjMatch: true, validadePresente: true, numeroDocumento: true, tipoMatch: true, orgaoMatch: true, textoClaro: true },
  media: { cnpjMatch: true, validadePresente: true, numeroDocumento: false, tipoMatch: true, orgaoMatch: true, textoClaro: false },
  baixa: { cnpjMatch: true, validadePresente: false, numeroDocumento: false, tipoMatch: false, orgaoMatch: true, textoClaro: false },
};

const criteriaLabels: Record<string, string> = {
  cnpjMatch: 'CNPJ consistente',
  validadePresente: 'Validade clara',
  numeroDocumento: 'Nº do documento',
  tipoMatch: 'Tipo correto',
  orgaoMatch: 'Órgão correto',
  textoClaro: 'Texto legível',
};

const levelConfig: Record<ConfidenceLevel, { icon: typeof Shield; label: string; color: string; bg: string; barColor: string }> = {
  alta: { icon: Shield, label: 'Alta Confiança', color: 'text-success', bg: 'bg-success/10', barColor: 'bg-success' },
  media: { icon: ShieldQuestion, label: 'Média Confiança', color: 'text-warning', bg: 'bg-warning/10', barColor: 'bg-warning' },
  baixa: { icon: ShieldAlert, label: 'Baixa Confiança', color: 'text-destructive', bg: 'bg-destructive/10', barColor: 'bg-destructive' },
};

export function ConfidenceBreakdown({ confianca, scores }: ConfidenceBreakdownProps) {
  const s = scores || defaultScores[confianca];
  const cfg = levelConfig[confianca];
  const Icon = cfg.icon;
  const total = Object.values(s).filter(Boolean).length;
  const max = Object.values(s).length;
  const pct = Math.round((total / max) * 100);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`p-2 rounded-lg ${cfg.bg}`}>
          <Icon className={`h-4 w-4 ${cfg.color}`} />
        </div>
        <div>
          <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</p>
          <p className="text-[10px] text-foreground/72">{total}/{max} critérios atendidos</p>
        </div>
        <div className="ml-auto text-right">
          <p className={`text-lg font-bold ${cfg.color}`}>{pct}%</p>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
        <div className={`h-full rounded-full ${cfg.barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>

      <div className="space-y-1.5">
        {Object.entries(s).map(([key, passed]) => (
          <div key={key} className="flex items-center justify-between text-[11px]">
            <span className="text-foreground/72">{criteriaLabels[key] || key}</span>
            <span className={passed ? 'text-success font-medium' : 'text-destructive/70 font-medium'}>
              {passed ? '✓' : '✗'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
