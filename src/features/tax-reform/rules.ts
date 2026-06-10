import type { AnswerMap, AnswerValue, DocumentLike, MainActivity, Recommendation, RiskLevel, ScoreBreakdown, TaxReformAlert, TaxReformDocument, TaxRegime } from './types';
import { buildTaxReformAlerts } from './alerts';
import { buildTaxReformAnalysisInput } from './document-analysis/documentScore';
import { reconcileQuestionnaireWithDocuments } from './document-analysis/reconcile';
import { buildRecommendationSummary, buildTaxReformRecommendation } from './recommendation';
import {
  calculateScoreParts,
  classifyTaxReformRisk,
  countAnsweredRequiredQuestions,
  getMissingDocumentTypes,
  getMissingRequiredData,
  REQUIRED_DOCUMENT_TYPES,
  REQUIRED_QUESTION_KEYS,
} from './score';

export type {
  AnswerMap,
  AnswerValue,
  DocumentLike,
  MainActivity,
  Recommendation,
  RiskLevel,
  ScoreBreakdown,
  TaxReformAlert,
  TaxRegime,
} from './types';

export {
  getCompanyAnalysisHistory,
  getLatestAnalysisForCompany,
} from './history';

export {
  getMissingDocumentTypes,
  getMissingRequiredData,
  REQUIRED_DOCUMENT_TYPES,
  REQUIRED_QUESTION_KEYS,
} from './score';

export interface TaxReformScoreOptions {
  mainActivity?: MainActivity | null;
  requireDocuments?: boolean;
  requireMainActivity?: boolean;
}

export function calculateTaxReformScore(
  currentRegime: TaxRegime | null | undefined,
  answers: AnswerMap,
  documents: DocumentLike[] = [],
  options: TaxReformScoreOptions = {},
): ScoreBreakdown {
  const analysisInput = buildTaxReformAnalysisInput({ answers, documents: documents as TaxReformDocument[] });
  const reconciliationAlerts = reconcileQuestionnaireWithDocuments(answers, documents as TaxReformDocument[]);
  const hasCriticalDivergence = reconciliationAlerts.some((alert) => alert.manualReviewRecommended);
  const scoreParts = calculateScoreParts(currentRegime, analysisInput.adjustedAnswers);
  const missingRequiredData = getMissingRequiredData({
    currentRegime,
    mainActivity: options.mainActivity,
    answers: analysisInput.adjustedAnswers,
    documents,
    requireDocuments: options.requireDocuments ?? false,
    requireMainActivity: options.requireMainActivity ?? Boolean(options.mainActivity),
  });
  const blockingMissingData = missingRequiredData.filter((key) => !key.startsWith('documento:'));
  const insufficientData = blockingMissingData.length > 0 || hasCriticalDivergence;
  const riskLevel = classifyTaxReformRisk(scoreParts.total, insufficientData);
  const recommendation = buildTaxReformRecommendation({
    currentRegime,
    answers: analysisInput.adjustedAnswers,
    total: scoreParts.total,
    riskLevel,
  });
  const alerts = buildTaxReformAlerts({ answers: analysisInput.adjustedAnswers, documents, insufficientData });
  if (reconciliationAlerts.length > 0) {
    const hasCritical = reconciliationAlerts.some((alert) => alert.severity === 'critical');
    alerts.push({
      alertType: 'document_divergence',
      severity: hasCritical ? 'critical' : 'warning',
      title: hasCritical ? 'Divergência crítica entre documentos e questionário' : 'Divergência entre documentos e questionário',
      message: reconciliationAlerts.map((alert) => `${alert.title}: ${alert.message}`).join(' '),
    });
  }

  return {
    total: scoreParts.total,
    clients: scoreParts.clients,
    costs: scoreParts.costs,
    currentTax: scoreParts.currentTax,
    riskLevel,
    recommendation,
    summary: buildRecommendationSummary(currentRegime, recommendation, scoreParts.total, riskLevel),
    alerts,
    answeredRequired: countAnsweredRequiredQuestions(answers),
    insufficientData,
    missingRequiredData,
  };
}
