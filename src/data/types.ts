export type EmpresaStatus = 'ativa' | 'pausada' | 'arquivada';
export type RegimeTributario = 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei';

export type CNDTipo = 'receita_federal' | 'fgts' | 'sefaz' | 'municipal' | 'trabalhista' | 'personalizada';
export type CNDStatus = 'valida' | 'vencendo' | 'vencida' | 'pendente' | 'erro' | 'nao_aplicavel';

export type CanalEnvio = 'email' | 'whatsapp';
export type EnvioStatus = 'enviado' | 'entregue' | 'lido' | 'erro' | 'pendente';
export type AlertaPrioridade = 'critica' | 'alta' | 'media' | 'baixa';
export type AlertaTipo = 'vencimento_7d' | 'vencimento_3d' | 'vencimento_1d' | 'vencimento_hoje' | 'vencido' | 'sem_pdf' | 'checklist_incompleto';

export interface Empresa {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  regimeTributario: RegimeTributario;
  municipio: string;
  estado: string;
  responsavelInterno: string;
  responsavelCliente: string;
  emailPrincipal: string;
  whatsappPrincipal: string;
  observacoes: string;
  status: EmpresaStatus;
  criadoEm: string;
  atualizadoEm: string;
}

export interface CNDItem {
  id: string;
  empresaId: string;
  tipo: CNDTipo;
  status: CNDStatus;
  dataEmissao: string | null;
  dataVencimento: string | null;
  origem: string;
  arquivoId: string | null;
  observacao: string;
  responsavel: string;
  historico: CNDHistorico[];
}

export interface CNDHistorico {
  id: string;
  data: string;
  acao: string;
  usuario: string;
  detalhes: string;
}

export interface Documento {
  id: string;
  empresaId: string;
  cndItemId: string | null;
  nome: string;
  tipo: CNDTipo;
  dataUpload: string;
  responsavel: string;
  validade: string | null;
  observacao: string;
  versao: number;
  tamanho: string;
  url: string;
}

export interface Envio {
  id: string;
  empresaId: string;
  canal: CanalEnvio;
  destinatario: string;
  assunto: string;
  mensagem: string;
  documentoIds: string[];
  status: EnvioStatus;
  dataEnvio: string;
  usuario: string;
}

export interface Alerta {
  id: string;
  empresaId: string;
  cndItemId: string | null;
  tipo: AlertaTipo;
  prioridade: AlertaPrioridade;
  titulo: string;
  descricao: string;
  lido: boolean;
  resolvido: boolean;
  snoozedAte: string | null;
  criadoEm: string;
}

export interface LogAcesso {
  id: string;
  empresaId: string;
  envioId: string | null;
  documentoId: string | null;
  acao: 'envio' | 'abertura' | 'visualizacao' | 'download';
  canal: CanalEnvio | null;
  usuario: string;
  destinatario: string | null;
  dataHora: string;
  detalhes: string;
}

export interface DashboardMetrics {
  vencidas: number;
  vencendo: number;
  pendentes: number;
  validas: number;
  erros: number;
  totalCNDs: number;
  enviados: number;
  acessosPendentes: number;
  empresasCriticas: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  entityType: 'empresa' | 'cnd' | 'documento' | 'envio' | 'alerta' | 'log';
  entityId: string;
  details: string;
  metadata?: Record<string, unknown>;
}

export interface EmpresaResumo {
  total: number;
  vencidas: number;
  vencendo: number;
  validas: number;
  pendentes: number;
  score: number;
  pctValid: number;
}
