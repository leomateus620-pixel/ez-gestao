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

export type AnswerValue = string | number | string[] | null | undefined;
export type AnswerMap = Record<string, AnswerValue>;

export interface TaxReformCompany {
  id: string;
  companyName: string;
  cnpj: string;
  currentTaxRegime: TaxRegime;
  mainActivity: MainActivity;
  responsibleUser: string;
  analysisYear: number;
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
  finalDecision: string;
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
  uploadedAt: string;
}

export interface TaxReformAlert {
  alertType: 'commercial_risk' | 'likely_simples' | 'missing_documents' | 'manual_review';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
}

export interface TaxReformAlertRecord extends TaxReformAlert {
  id: string;
  analysisId: string;
  createdAt: string;
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
}

export interface DocumentLike {
  documentType: string;
}

export interface TaxReformStore {
  companies: TaxReformCompany[];
  analyses: TaxReformAnalysis[];
  documents: TaxReformDocument[];
  alerts: TaxReformAlertRecord[];
}
