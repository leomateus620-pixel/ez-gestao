export type EmpresaStatus = 'ativa' | 'pausada' | 'arquivada';
export type RegimeTributario = 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei';

export type CanalEnvio = 'email' | 'whatsapp' | 'ambos';
export type CanalPreferido = CanalEnvio | null;
export type EnvioStatus = 'enviado' | 'entregue' | 'lido' | 'erro' | 'pendente';
export type AlertaPrioridade = 'critica' | 'alta' | 'media' | 'baixa';
export type AlertaTipo = 'guia' | 'integracao' | 'comunicacao' | 'sistema' | 'operacional';
export type DocumentoCategoria = 'guia' | 'nota_fiscal' | 'fator_r' | 'contrato' | 'comprovante' | 'outro';

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

export interface Documento {
  id: string;
  empresaId: string;
  nome: string;
  categoria: DocumentoCategoria;
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

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  entityType: 'empresa' | 'documento' | 'envio' | 'alerta' | 'log' | 'guia' | 'integracao';
  entityId: string;
  details: string;
  metadata?: Record<string, unknown>;
}

export type GuiaStatus = 'aguardando' | 'lendo' | 'identificada' | 'enviando' | 'enviada' | 'erro' | 'revisao' | 'pronta_envio' | 'nao_identificada' | 'duplicada';
export type MatchSource = 'filename' | 'pdf_text' | 'pdf_native' | 'multiple' | 'none';
export type DispatchStatus = 'pendente' | 'aceito' | 'entregue' | 'falhou';
export type IntegrationProvider = 'google_drive' | 'gmail' | 'twilio_whatsapp' | 'pdf_native_reader';
export type IntegrationHealth = 'desconectado' | 'configurado' | 'ativo' | 'erro';
export type GuideExceptionType =
  | 'unsupported_file'
  | 'cnpj_ambiguous'
  | 'filename_content_conflict'
  | 'pdf_without_text_layer'
  | 'pdf_text_extraction_failed'
  | 'insufficient_pdf_signals'
  | 'company_not_found'
  | 'company_inactive'
  | 'missing_email'
  | 'invalid_channel'
  | 'whatsapp_consent_missing'
  | 'integration_inactive'
  | 'dispatch_failed'
  | 'delivery_failed'
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
  paginaCount: number | null;
  extractionMethod: string | null;
  hasTextLayer: boolean | null;
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
