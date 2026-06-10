import type { TaxReformAnalysis } from './types';

const timeValue = (value?: string) => (value ? new Date(value).getTime() : 0);

export function getCompanyAnalysisHistory(companyId: string, analyses: TaxReformAnalysis[]) {
  return analyses
    .filter((analysis) => analysis.companyId === companyId)
    .sort((left, right) => (
      right.analysisYear - left.analysisYear ||
      timeValue(right.updatedAt) - timeValue(left.updatedAt) ||
      timeValue(right.createdAt) - timeValue(left.createdAt)
    ));
}

export function getLatestAnalysisForCompany(companyId: string, analyses: TaxReformAnalysis[]) {
  return getCompanyAnalysisHistory(companyId, analyses)[0] ?? null;
}
