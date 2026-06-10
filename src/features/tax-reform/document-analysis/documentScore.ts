import type { AnswerMap, TaxReformCompany, TaxReformDocument } from '../types';
import { toPercentBucket } from './normalize';
import { aggregateExtractedValues } from './reconcile';
import type { TaxReformAnalysisInput, TaxReformDocumentFinding, TaxReformExtractedValues } from './types';

function operationsFromExtracted(values: TaxReformExtractedValues, current: AnswerMap[string]) {
  const operations = Array.isArray(current) ? [...current] : [];
  const push = (condition: boolean | undefined, value: string) => {
    if (condition && !operations.includes(value)) operations.push(value);
  };
  push(values.hasMonophasic, 'produtos_monofasicos');
  push(values.hasSt, 'substituicao_tributaria');
  push(values.hasIssRetido, 'iss_retido');
  push(values.hasExportation, 'exportacao');
  return operations.length ? operations : current;
}

export function buildTaxReformAnalysisInput({
  company,
  answers,
  documents = [],
  extractedValues,
}: {
  company?: TaxReformCompany | null;
  answers: AnswerMap;
  documents?: TaxReformDocument[];
  extractedValues?: TaxReformExtractedValues;
}): TaxReformAnalysisInput {
  const readDocuments = documents.filter((doc) => doc.readingStatus === 'lido' && (doc.extractionConfidence ?? 0) >= 0.45);
  const aggregated = extractedValues ?? aggregateExtractedValues(readDocuments);
  const adjustedAnswers: AnswerMap = { ...answers };

  if ((aggregated.confidence ?? 0) >= 0.45) {
    if (aggregated.effectiveTaxRate !== undefined) adjustedAnswers.effective_tax_rate = aggregated.effectiveTaxRate;
    if (aggregated.inputCostPercent !== undefined) adjustedAnswers.inputs_revenue_percent = toPercentBucket(aggregated.inputCostPercent) ?? adjustedAnswers.inputs_revenue_percent;
    if (aggregated.payrollPercent !== undefined) adjustedAnswers.payroll_revenue_percent = aggregated.payrollPercent;
    if (aggregated.b2bPercent !== undefined) adjustedAnswers.sales_b2b_percent = aggregated.b2bPercent;
    if (aggregated.b2cPercent !== undefined) adjustedAnswers.sales_b2c_percent = aggregated.b2cPercent;
    if (aggregated.governmentPercent !== undefined) adjustedAnswers.sales_government_percent = aggregated.governmentPercent;
    if (aggregated.top10ClientsConcentration !== undefined) adjustedAnswers.top_clients_over_50 = aggregated.top10ClientsConcentration >= 50 ? 'sim' : 'nao';
    if (aggregated.supplierRegimeDetected !== undefined) adjustedAnswers.supplier_regime = aggregated.supplierRegimeDetected;
    adjustedAnswers.relevant_operations = operationsFromExtracted(aggregated, adjustedAnswers.relevant_operations);
  }

  const findings: TaxReformDocumentFinding[] = readDocuments.flatMap((doc) => doc.extractedFindings ?? []);
  return {
    company,
    answers,
    documents,
    adjustedAnswers,
    extractedValues: aggregated,
    findings,
    documentConfidence: aggregated.confidence ?? 0,
    hasReadDocuments: readDocuments.length > 0,
  };
}
