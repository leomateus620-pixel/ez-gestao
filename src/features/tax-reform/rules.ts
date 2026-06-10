import type { AnswerMap, AnswerValue, DocumentLike, MainActivity, Recommendation, RiskLevel, ScoreBreakdown, TaxReformAlert, TaxRegime } from './types';
import { buildTaxReformAlerts } from './alerts';
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
  const scoreParts = calculateScoreParts(currentRegime, answers);
  const missingRequiredData = getMissingRequiredData({
    currentRegime,
    mainActivity: options.mainActivity,
    answers,
    documents,
    requireDocuments: options.requireDocuments ?? false,
    requireMainActivity: options.requireMainActivity ?? Boolean(options.mainActivity),
  });
  const insufficientData = missingRequiredData.length > 0;
  const riskLevel = classifyTaxReformRisk(scoreParts.total, insufficientData);
  const recommendation = buildTaxReformRecommendation({
    currentRegime,
    answers,
    total: scoreParts.total,
    riskLevel,
  });
  const alerts = buildTaxReformAlerts({ answers, documents, insufficientData });

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
