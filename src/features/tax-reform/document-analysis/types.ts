import type { AnswerMap, TaxReformCompany, TaxReformDocument } from '../types';

export type TaxReformExtractedValues = {
  revenue?: number;
  projectedRevenue?: number;
  grossRevenue12m?: number;
  effectiveTaxRate?: number;
  taxRegimeDetected?: string;

  b2bPercent?: number;
  b2cPercent?: number;
  governmentPercent?: number;
  top10ClientsConcentration?: number;
  lucroRealClientsPercent?: number;

  inputCostPercent?: number;
  supplierRegimeDetected?: string;
  payrollPercent?: number;

  hasSt?: boolean;
  hasMonophasic?: boolean;
  hasIssRetido?: boolean;
  hasExportation?: boolean;

  netProfit?: number;
  grossMargin?: number;
  operatingExpenses?: number;

  warnings?: string[];
  confidence?: number;
};

export type TaxReformDocumentFinding = {
  documentType: string;
  field: string;
  value: string | number | boolean;
  confidence: number;
  sourceLabel?: string;
  explanation?: string;
};

export type TaxReformDocumentExtraction = {
  documentType: string;
  values: TaxReformExtractedValues;
  findings: TaxReformDocumentFinding[];
  summary: string;
  confidence: number;
  warnings: string[];
};

export type TaxReformAnalysisInput = {
  company?: TaxReformCompany | null;
  answers: AnswerMap;
  documents: TaxReformDocument[];
  adjustedAnswers: AnswerMap;
  extractedValues: TaxReformExtractedValues;
  findings: TaxReformDocumentFinding[];
  documentConfidence: number;
  hasReadDocuments: boolean;
};

export type ReconciliationAlert = {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  field?: string;
  manualReviewRecommended?: boolean;
};
