import { differenceInDays, parseISO, isToday } from 'date-fns';
import type { CNDStatus } from '@/data/types';

export function calcularStatusCND(dataVencimento: string | null, temPdf: boolean): CNDStatus {
  if (!dataVencimento) return temPdf ? 'pendente' : 'pendente';

  const vencimento = parseISO(dataVencimento);
  const hoje = new Date();
  const dias = differenceInDays(vencimento, hoje);

  if (dias < 0) return 'vencida';
  if (dias === 0) return 'vencendo';
  if (dias <= 7) return 'vencendo';
  return 'valida';
}

export function getStatusColor(status: CNDStatus | string): string {
  switch (status) {
    case 'valida': return 'bg-success/15 text-success border-success/30';
    case 'vencendo': return 'bg-warning/15 text-warning border-warning/30';
    case 'vencida': return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'pendente': return 'bg-info/15 text-info border-info/30';
    case 'erro': return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'nao_aplicavel': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

export function getEmpresaStatusColor(status: string): string {
  switch (status) {
    case 'ativa': return 'bg-success/15 text-success border-success/30';
    case 'pausada': return 'bg-warning/15 text-warning border-warning/30';
    case 'arquivada': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

export function getPrioridadeVencimento(dataVencimento: string | null): {
  label: string;
  color: string;
  urgencia: number;
} {
  if (!dataVencimento) return { label: 'Sem data', color: 'bg-muted text-muted-foreground', urgencia: 5 };

  const vencimento = parseISO(dataVencimento);
  const hoje = new Date();
  const dias = differenceInDays(vencimento, hoje);

  if (dias < 0) return { label: 'Vencido', color: 'bg-destructive text-destructive-foreground', urgencia: 0 };
  if (isToday(vencimento)) return { label: 'Vence hoje', color: 'bg-warning text-warning-foreground', urgencia: 1 };
  if (dias <= 3) return { label: `${dias}d restantes`, color: 'bg-warning/80 text-warning-foreground', urgencia: 2 };
  if (dias <= 7) return { label: `${dias}d restantes`, color: 'bg-info text-info-foreground', urgencia: 3 };
  return { label: 'Válido', color: 'bg-success text-success-foreground', urgencia: 4 };
}

export function getAlertaPrioridadeColor(prioridade: string): string {
  switch (prioridade) {
    case 'critica': return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'alta': return 'bg-warning/15 text-warning border-warning/30';
    case 'media': return 'bg-info/15 text-info border-info/30';
    case 'baixa': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}
