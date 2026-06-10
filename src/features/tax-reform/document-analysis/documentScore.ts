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

function computeCrossDocPayroll(values: TaxReformExtractedValues): TaxReformExtractedValues {
  const out = { ...values };
  if (out.grossPayroll !== undefined && out.monthlyRevenue) {
    out.payrollPercentByMonthlyRevenue = Number(((out.grossPayroll / out.monthlyRevenue) * 100).toFixed(2));
    const withCharges = out.grossPayroll + (out.inssValue ?? 0) + (out.fgtsValue ?? 0);
    out.payrollWithChargesPercentByMonthlyRevenue = Number(((withCharges / out.monthlyRevenue) * 100).toFixed(2));
  }
  if (out.grossPayroll !== undefined && out.grossRevenue12m) {
    out.annualizedPayrollPercentByRbt12 = Number((((out.grossPayroll * 12) / out.grossRevenue12m) * 100).toFixed(2));
    const withCharges = out.grossPayroll + (out.inssValue ?? 0) + (out.fgtsValue ?? 0);
    out.annualizedPayrollWithChargesPercentByRbt12 = Number((((withCharges * 12) / out.grossRevenue12m) * 100).toFixed(2));
  }
  return out;
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
  const readDocuments = documents.filter((doc) => {
    if (doc.readingStatus !== 'lido') return false;
    const conf = doc.extractionConfidence ?? 0;
    // Folha exige confiança alta (≥ 0.7); demais tipos mantêm o piso histórico de 0.45.
    const min = doc.documentType === 'folha_pagamento' ? 0.7 : 0.45;
    return conf >= min;
  });
  const aggregatedRaw = extractedValues ?? aggregateExtractedValues(readDocuments);
  const aggregated = computeCrossDocPayroll(aggregatedRaw);
  const adjustedAnswers: AnswerMap = { ...answers };

  if ((aggregated.confidence ?? 0) >= 0.45) {
    if (aggregated.effectiveTaxRate !== undefined) adjustedAnswers.effective_tax_rate = aggregated.effectiveTaxRate;
    if (aggregated.inputCostPercent !== undefined) adjustedAnswers.inputs_revenue_percent = toPercentBucket(aggregated.inputCostPercent) ?? adjustedAnswers.inputs_revenue_percent;
    // Folha: prioriza folha mensal anualizada (mais recente) > folha da DRE > payrollPercent legado.
    const payrollPct = aggregated.annualizedPayrollWithChargesPercentByRbt12
      ?? aggregated.payrollPercentFromDre
      ?? aggregated.payrollPercent;
    if (payrollPct !== undefined) adjustedAnswers.payroll_revenue_percent = payrollPct;
    // Proximidade do limite do Simples — só preenchemos quando temos uso real.
    if (aggregated.nearSimplesLimit !== undefined) {
      adjustedAnswers.near_simples_limit = aggregated.nearSimplesLimit ? 'sim' : 'nao';
    }
    // NUNCA derivar perfil B2B/B2C/top10 a partir do balanço.
    // Esses campos só devem vir de faturamento_cliente (já tratados abaixo).
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
