import type { CNDTipo } from './types';

export type ConnectorType = 'api_direta' | 'browser_headless' | 'integracao_assistida' | 'upload_manual';
export type ConnectorStatus = 'ativo' | 'inativo' | 'manutencao' | 'erro';
export type RunStatus = 'agendado' | 'executando' | 'sucesso' | 'falha' | 'revisao' | 'timeout';
export type ExceptionStatus = 'pendente' | 'em_analise' | 'resolvida' | 'descartada';
export type ConfidenceLevel = 'alta' | 'media' | 'baixa';
export type RunStepEtapa = 'autenticacao' | 'consulta' | 'captura' | 'parsing' | 'persistencia';

export type ExceptionTipologia =
  | 'cnpj_inconsistente'
  | 'pdf_ausente'
  | 'validade_ambigua'
  | 'portal_indisponivel'
  | 'captcha_bloqueante'
  | 'documento_incompativel'
  | 'baixa_confianca'
  | 'erro_parsing'
  | 'falha_integracao'
  | 'dado_cadastral_insuficiente'
  | 'certidao_positiva'
  | 'retorno_inesperado';

export const tipologiaLabels: Record<ExceptionTipologia, string> = {
  cnpj_inconsistente: 'CNPJ Inconsistente',
  pdf_ausente: 'PDF Ausente',
  validade_ambigua: 'Validade Ambígua',
  portal_indisponivel: 'Portal Indisponível',
  captcha_bloqueante: 'CAPTCHA Bloqueante',
  documento_incompativel: 'Doc. Incompatível',
  baixa_confianca: 'Baixa Confiança',
  erro_parsing: 'Erro de Parsing',
  falha_integracao: 'Falha Integração',
  dado_cadastral_insuficiente: 'Dado Insuficiente',
  certidao_positiva: 'Certidão Positiva',
  retorno_inesperado: 'Retorno Inesperado',
};

export interface Connector {
  id: string;
  nome: string;
  tipo: ConnectorType;
  orgao: CNDTipo;
  status: ConnectorStatus;
  versao: string;
  ultimoTeste: string;
  taxaSucesso: number;
  tempoMedio: number;
  config: Record<string, unknown>;
  descricao: string;
}

export interface ConnectorRunStep {
  id: string;
  runId: string;
  etapa: RunStepEtapa;
  status: 'sucesso' | 'falha' | 'pulado' | 'executando';
  inicio: string;
  fim: string | null;
  detalhes: string;
}

export interface ConnectorRun {
  id: string;
  connectorId: string;
  empresaId: string;
  cndItemId: string | null;
  status: RunStatus;
  inicioExecucao: string;
  fimExecucao: string | null;
  tentativa: number;
  duracao: number | null;
  resultadoBruto: string;
  statusNormalizado: string;
  confianca: ConfidenceLevel;
  evidencias: string[];
  erroDetalhes: string | null;
  steps: ConnectorRunStep[];
}

export interface ExceptionItem {
  id: string;
  runId: string;
  empresaId: string;
  cndItemId: string | null;
  motivo: string;
  criticidade: 'critica' | 'alta' | 'media' | 'baixa';
  statusExcecao: ExceptionStatus;
  acaoSugerida: string;
  criadoEm: string;
  resolvidoEm: string | null;
  resolvidoPor: string | null;
  // Fase 2 refinement fields
  tipologia: ExceptionTipologia;
  tentativas: number;
  slaHoras: number;
  responsavel: string | null;
  cnpj: string;
  cndTipo: string;
  connectorNome: string;
}

export interface CaptureResult {
  cnpjConsultado: string;
  tipoCertidao: CNDTipo;
  orgaoEmissor: string;
  statusBruto: string;
  statusNormalizado: string;
  dataEmissao: string | null;
  dataValidade: string | null;
  numeroCertidao: string | null;
  protocolo: string | null;
  hashDocumento: string | null;
  nomeArquivo: string | null;
  conectorUtilizado: string;
  confianca: ConfidenceLevel;
  necessitaRevisao: boolean;
  motivoExcecao: string | null;
}

export interface AutomationBatch {
  id: string;
  agendadoPara: string;
  empresaIds: string[];
  status: 'agendado' | 'executando' | 'concluido' | 'parcial' | 'falha';
  progressoAtual: number;
  totalItems: number;
}

export interface IntegrationHealthLog {
  id: string;
  connectorId: string;
  timestamp: string;
  status: 'ok' | 'degradado' | 'indisponivel';
  latencia: number;
  detalhes: string;
}

export interface RetryPolicy {
  maxTentativas: number;
  intervaloBase: number;
  backoffMultiplier: number;
  timeoutSegundos: number;
}

export interface SchedulingRule {
  connectorId: string;
  cndTipo: CNDTipo;
  intervaloHoras: number;
  diasAntesVencimento: number;
  prioridade: number;
}

export interface AutomationState {
  connectors: Connector[];
  runs: ConnectorRun[];
  exceptions: ExceptionItem[];
  batches: AutomationBatch[];
  healthLogs: IntegrationHealthLog[];
  schedulingRules: SchedulingRule[];
  retryPolicies: Record<string, RetryPolicy>;
}
