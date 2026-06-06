export function getStatusColor(status: string): string {
  switch (status) {
    case 'enviado':
    case 'pendente':
    case 'aguardando':
      return 'bg-info/15 text-info border-info/30';
    case 'entregue':
    case 'lido':
    case 'enviada':
    case 'aceito':
      return 'bg-success/15 text-success border-success/30';
    case 'erro':
    case 'falhou':
      return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'revisao':
    case 'enviando':
      return 'bg-warning/15 text-warning border-warning/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function getEmpresaStatusColor(status: string): string {
  switch (status) {
    case 'ativa':
      return 'bg-success/15 text-success border-success/30';
    case 'pausada':
      return 'bg-warning/15 text-warning border-warning/30';
    case 'arquivada':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function getAlertaPrioridadeColor(prioridade: string): string {
  switch (prioridade) {
    case 'critica':
      return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'alta':
      return 'bg-warning/15 text-warning border-warning/30';
    case 'media':
      return 'bg-info/15 text-info border-info/30';
    case 'baixa':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}
