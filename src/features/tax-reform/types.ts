export type TaxRegime = 'simples_nacional' | 'lucro_presumido';
export type MainActivity = 'comercio' | 'industria' | 'servicos' | 'misto';

export type AnalysisStatus =
  | 'cadastro_iniciado'
  | 'questionario_pendente'
  | 'aguardando_documentos'
  | 'documentos_anexados'
  | 'analise_concluida'
  | 'necessita_revisao_manual';

export type ReadingStatus = 'aguardando_leitura' | 'lido' | 'erro_leitura' | 'nao_processavel';
export type RiskLevel = 'baixo_risco' | 'risco_medio' | 'alto_risco' | 'dados_insuficientes';
export type Recommendation =
  | 'permanecer_simples'
  | 'avaliar_lucro_presumido'
  | 'permanecer_lucro_presumido'
  | 'avaliar_simples_nacional'
  | 'analise_manual_necessaria';
export type FinalDecision =
  | ''
  | 'permanecer_regime_atual'
  | 'migrar_para_simples'
  | 'migrar_para_lucro_presumido'
  | 'rodar_simulacao_detalhada'
  | 'coletar_dados_adicionais';

export type TaxReformAlertType = 'commercial_risk' | 'likely_simples' | 'missing_documents' | 'manual_review';
export type TaxReformAlertSeverity = 'info' | 'warning' | 'critical';

export type AnswerValue = string | number | string[] | null | undefined;
export type AnswerMap = Record<string, AnswerValue>;

export type UploadStatus = 'enviado' | 'erro_upload';
export type ConfidenceLevel = 'baixa' | 'media' | 'alta';

export interface TaxReformCompany {
  id: string;
  companyName: string;
  cnpj: string;
  currentTaxRegime: TaxRegime;
  mainActivity: MainActivity;
  responsibleUser: string;
  rbt12?: number;
  projectedRevenue?: number;
  effectiveTaxRate?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxReformAnalysis {
  id: string;
  companyId: string;
  analysisYear: number;
  status: AnalysisStatus;
  answers: AnswerMap;
  scoreTotal: number;
  scoreClients: number;
  scoreCosts: number;
  scoreCurrentTax: number;
  riskLevel: RiskLevel;
  recommendation: Recommendation;
  automaticSummary: string;
  manualOpinion: string;
  finalDecision: FinalDecision;
  confidenceLevel?: ConfidenceLevel;
  confidenceReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxReformDocument {
  id: string;
  companyId: string;
  analysisId: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  readingStatus: ReadingStatus;
  extractedSummary?: string;
  extractionError?: string;
  storageBucket?: string;
  storagePath?: string;
  uploadStatus?: UploadStatus;
  uploadError?: string;
  uploadedBy?: string;
  extractionConfidence?: number;
  documentConfidenceWeight?: number;
  uploadedAt: string;
  updatedAt: string;
}

export interface TaxReformAlert {
  alertType: TaxReformAlertType;
  severity: TaxReformAlertSeverity;
  title: string;
  message: string;
}

export interface TaxReformAlertRecord extends TaxReformAlert {
  id: string;
  analysisId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreBreakdown {
  total: number;
  clients: number;
  costs: number;
  currentTax: number;
  riskLevel: RiskLevel;
  recommendation: Recommendation;
  summary: string;
  alerts: TaxReformAlert[];
  answeredRequired: number;
  insufficientData: boolean;
  missingRequiredData: string[];
}

export interface DocumentLike {
  documentType: string;
  readingStatus?: ReadingStatus;
  uploadStatus?: UploadStatus;
  storagePath?: string | null;
}

export interface TaxReformStore {
  companies: TaxReformCompany[];
  analyses: TaxReformAnalysis[];
  documents: TaxReformDocument[];
  alerts: TaxReformAlertRecord[];
}
