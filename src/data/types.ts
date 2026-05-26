export type EmpresaStatus = 'ativa' | 'pausada' | 'arquivada';
export type RegimeTributario = 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei';

export type CNDTipo = 'receita_federal' | 'fgts' | 'sefaz' | 'municipal' | 'trabalhista' | 'personalizada';
export type CNDStatus = 'valida' | 'vencendo' | 'vencida' | 'pendente' | 'erro' | 'nao_aplicavel';

export type CanalEnvio = 'email' | 'whatsapp';
export type CanalPreferido = CanalEnvio | null;
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
  canalPreferido: CanalPreferido;
  emailValidado: boolean;
  whatsappOptInAt: string | null;
  comunicacaoAtiva: boolean;
  saudacaoGuia: string;
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

export type GuiaStatus = 'aguardando' | 'lendo' | 'ocr' | 'identificada' | 'enviando' | 'enviada' | 'erro' | 'revisao';
export type MatchSource = 'filename' | 'pdf_text' | 'ocr' | 'multiple' | 'none';
export type DispatchStatus = 'pendente' | 'aceito' | 'entregue' | 'falhou';
export type IntegrationProvider = 'google_drive' | 'gmail' | 'twilio_whatsapp' | 'google_vision';
export type IntegrationHealth = 'desconectado' | 'configurado' | 'ativo' | 'erro';
export type GuideExceptionType =
  | 'unsupported_file'
  | 'cnpj_ambiguous'
  | 'source_conflict'
  | 'low_ocr_confidence'
  | 'company_not_found'
  | 'channel_missing'
  | 'invalid_email'
  | 'whatsapp_consent_missing'
  | 'integration_inactive'
  | 'dispatch_failed'
  | 'delivery_failed'
  | 'ocr_unavailable'
  | 'ocr_failed'
  | 'drive_download_failed'
  | 'drive_move_failed';

export interface Guia {
  id: string;
  driveFileId: string;
  fileName: string;
  mimeType: string;
  sha256: string | null;
  status: GuiaStatus;
  matchSource: MatchSource;
  cnpjDetectado: string | null;
  empresaId: string | null;
  tipoGuia: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor: number | null;
  textoExtraidoPreview: string | null;
  ocrConfidence: number | null;
  pastaAtual: 'a_enviar' | 'enviados';
  providerError: string | null;
  receivedAt: string;
  processedAt: string | null;
  sentAt: string | null;
}

export interface GuiaEnvio {
  id: string;
  guiaId: string;
  empresaId: string;
  canal: CanalEnvio;
  destinatario: string;
  assunto: string | null;
  mensagemPreview: string;
  templateSid: string | null;
  providerMessageId: string | null;
  status: DispatchStatus;
  submittedAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
}

export interface GuiaExcecao {
  id: string;
  guiaId: string | null;
  exceptionType: GuideExceptionType | string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'ignored';
  reason: string;
  actionRecommended: string;
  createdAt: string;
}

export interface GuiaEvento {
  id: string;
  guiaId: string;
  eventType: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  createdAt: string;
}

export interface IntegracaoGuia {
  provider: IntegrationProvider;
  displayName: string;
  status: IntegrationHealth;
  sourceFolderId: string | null;
  sentFolderId: string | null;
  senderIdentity: string | null;
  scheduleMinutes: number;
  lastCheckAt: string | null;
  lastError: string | null;
}
