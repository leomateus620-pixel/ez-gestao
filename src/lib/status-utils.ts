import { differenceInDays, parseISO, isToday } from 'date-fns';
import type { CNDStatus, CNDItem, Empresa, Documento, Envio, LogAcesso, Alerta, DashboardMetrics, EmpresaResumo, AlertaTipo, AlertaPrioridade } from '@/data/types';

export function calcularStatusCND(dataVencimento: string | null, _temPdf: boolean): CNDStatus {
  if (!dataVencimento) return 'pendente';

  const vencimento = parseISO(dataVencimento);
  const hoje = new Date();
  const dias = differenceInDays(vencimento, hoje);

  if (dias < 0) return 'vencida';
  if (dias === 0) return 'vencendo';
  if (dias <= 7) return 'vencendo';
  return 'valida';
}

export function recalcularTodosStatus(cnds: CNDItem[]): CNDItem[] {
  return cnds.map(cnd => {
    if (cnd.status === 'erro' || cnd.status === 'nao_aplicavel') return cnd;
    if (!cnd.dataVencimento && !cnd.dataEmissao) return { ...cnd, status: 'pendente' as CNDStatus };
    const newStatus = calcularStatusCND(cnd.dataVencimento, !!cnd.arquivoId);
    return { ...cnd, status: newStatus };
  });
}

export function gerarAlertasAutomaticos(cnds: CNDItem[], empresas: Empresa[], alertasExistentes: Alerta[]): Alerta[] {
  const novos: Alerta[] = [];
  const existingKeys = new Set(alertasExistentes.filter(a => !a.resolvido).map(a => `${a.empresaId}-${a.cndItemId}-${a.tipo}`));

  cnds.forEach(cnd => {
    const empresa = empresas.find(e => e.id === cnd.empresaId);
    if (!empresa || empresa.status !== 'ativa') return;

    const alertConfigs: { condition: boolean; tipo: AlertaTipo; prioridade: AlertaPrioridade; label: string }[] = [];

    if (cnd.dataVencimento) {
      const dias = differenceInDays(parseISO(cnd.dataVencimento), new Date());
      if (dias < 0) alertConfigs.push({ condition: true, tipo: 'vencido', prioridade: 'critica', label: `vencida há ${Math.abs(dias)} dias` });
      else if (dias === 0) alertConfigs.push({ condition: true, tipo: 'vencimento_hoje', prioridade: 'critica', label: 'vence hoje' });
      else if (dias <= 1) alertConfigs.push({ condition: true, tipo: 'vencimento_1d', prioridade: 'critica', label: 'vence amanhã' });
      else if (dias <= 3) alertConfigs.push({ condition: true, tipo: 'vencimento_3d', prioridade: 'alta', label: `vence em ${dias} dias` });
      else if (dias <= 7) alertConfigs.push({ condition: true, tipo: 'vencimento_7d', prioridade: 'alta', label: `vence em ${dias} dias` });
    }

    if (!cnd.arquivoId && cnd.dataVencimento) {
      alertConfigs.push({ condition: true, tipo: 'sem_pdf', prioridade: 'media', label: 'sem PDF anexado' });
    }

    alertConfigs.forEach(cfg => {
      if (!cfg.condition) return;
      const key = `${cnd.empresaId}-${cnd.id}-${cfg.tipo}`;
      if (existingKeys.has(key)) return;
      existingKeys.add(key);

      const tipoLabel = cnd.tipo.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      novos.push({
        id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        empresaId: cnd.empresaId,
        cndItemId: cnd.id,
        tipo: cfg.tipo,
        prioridade: cfg.prioridade,
        titulo: `${tipoLabel} ${cfg.label} - ${empresa.nomeFantasia}`,
        descricao: `Certidão ${tipoLabel} da ${empresa.nomeFantasia} ${cfg.label}.`,
        lido: false,
        resolvido: false,
        snoozedAte: null,
        criadoEm: new Date().toISOString().split('T')[0],
      });
    });
  });

  return novos;
}

export function consolidarDashboard(
  empresas: Empresa[],
  cnds: CNDItem[],
  _docs: Documento[],
  envios: Envio[],
  _logs: LogAcesso[]
): DashboardMetrics {
  const vencidas = cnds.filter(c => c.status === 'vencida').length;
  const vencendo = cnds.filter(c => c.status === 'vencendo').length;
  const pendentes = cnds.filter(c => c.status === 'pendente').length;
  const validas = cnds.filter(c => c.status === 'valida').length;
  const erros = cnds.filter(c => c.status === 'erro').length;
  const enviados = envios.length;
  const acessosPendentes = envios.filter(e => e.status === 'enviado').length;
  const empresasCriticas = new Set(
    cnds.filter(c => c.status === 'vencida').map(c => c.empresaId)
  ).size;

  return { vencidas, vencendo, pendentes, validas, erros, totalCNDs: cnds.length, enviados, acessosPendentes, empresasCriticas };
}

export function calcularResumoEmpresa(empresaId: string, cnds: CNDItem[]): EmpresaResumo {
  const items = cnds.filter(c => c.empresaId === empresaId);
  const vencidas = items.filter(c => c.status === 'vencida').length;
  const vencendo = items.filter(c => c.status === 'vencendo').length;
  const validas = items.filter(c => c.status === 'valida').length;
  const pendentes = items.filter(c => c.status === 'pendente' || c.status === 'erro').length;
  const total = items.length;
  const score = vencidas * 3 + vencendo * 2 + pendentes;
  const pctValid = total > 0 ? Math.round((validas / total) * 100) : 100;
  return { total, vencidas, vencendo, validas, pendentes, score, pctValid };
}

export function getStatusColor(status: CNDStatus | string): string {
  switch (status) {
    case 'valida': return 'bg-success/15 text-success border-success/30';
    case 'vencendo': return 'bg-warning/15 text-warning border-warning/30';
    case 'vencida': return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'pendente': return 'bg-info/15 text-info border-info/30';
    case 'erro': return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'nao_aplicavel': return 'bg-muted text-muted-foreground border-border';
    case 'enviado': return 'bg-info/15 text-info border-info/30';
    case 'entregue': return 'bg-success/15 text-success border-success/30';
    case 'lido': return 'bg-success/15 text-success border-success/30';
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
