import type { AnswerMap, TaxReformDocument } from '../types';
import { toNumber } from '../score';
import type { ReconciliationAlert, TaxReformExtractedValues } from './types';

function readDocuments(documents: TaxReformDocument[]) {
  return documents.filter((doc) => doc.readingStatus === 'lido' && doc.extractedValues && (doc.extractionConfidence ?? 0) >= 0.45);
}

export function aggregateExtractedValues(documents: TaxReformDocument[]): TaxReformExtractedValues {
  const aggregated: TaxReformExtractedValues = { warnings: [] };
  const priorities: Record<string, string[]> = {
    effectiveTaxRate: ['pgdas'],
    grossRevenue12m: ['pgdas'],
    monthlyRevenue: ['pgdas'],
    dasTotal: ['pgdas'],
    rba: ['pgdas'],
    rbaa: ['pgdas'],
    simplesLimit: ['pgdas'],
    simplesLimitUsagePercent: ['pgdas'],
    sublimitUsagePercent: ['pgdas'],
    nearSimplesLimit: ['pgdas'],
    factorRStatus: ['pgdas'],
    shouldCalculateFactorR: ['pgdas'],
    revenue: ['pgdas', 'dre', 'balancete'],
    grossRevenue: ['dre', 'balancete'],
    serviceRevenue: ['dre', 'balancete'],
    simplesNacionalExpense: ['dre', 'balancete'],
    netRevenue: ['dre', 'balancete'],
    serviceCosts: ['dre', 'balancete'],
    grossProfit: ['dre', 'balancete'],
    netProfit: ['dre', 'balancete'],
    grossMargin: ['dre', 'balancete'],
    netMargin: ['dre', 'balancete'],
    annualEffectiveTaxRate: ['dre', 'balancete'],
    annualPayrollFromDre: ['dre', 'balancete'],
    payrollPercentFromDre: ['dre', 'balancete'],
    inputCostPercent: ['dre', 'balancete', 'fornecedores'],
    payrollPercent: ['folha_pagamento', 'dre', 'balancete'],
    grossPayroll: ['folha_pagamento'],
    netPayroll: ['folha_pagamento'],
    salaryTotal: ['folha_pagamento'],
    inssValue: ['folha_pagamento'],
    fgtsValue: ['folha_pagamento'],
    irrfValue: ['folha_pagamento'],
    employeesCount: ['folha_pagamento'],
    assetsTotal: ['balancete', 'dre'],
    equity: ['balancete', 'dre'],
    afac: ['balancete', 'dre'],
    b2bPercent: ['faturamento_cliente'],
    b2cPercent: ['faturamento_cliente'],
    governmentPercent: ['faturamento_cliente'],
    top10ClientsConcentration: ['faturamento_cliente'],
    supplierRegimeDetected: ['fornecedores', 'balancete'],
  };
  const docs = readDocuments(documents);
  const fields = new Set<string>();
  docs.forEach((doc) => Object.keys(doc.extractedValues ?? {}).forEach((field) => fields.add(field)));
  fields.forEach((field) => {
    if (field === 'warnings' || field === 'confidence') return;
    const ranked = [...docs].sort((a, b) => {
      const priority = priorities[field] ?? [];
      const aPriority = priority.indexOf(a.documentType);
      const bPriority = priority.indexOf(b.documentType);
      const normalizedA = aPriority === -1 ? 99 : aPriority;
      const normalizedB = bPriority === -1 ? 99 : bPriority;
      if (normalizedA !== normalizedB) return normalizedA - normalizedB;
      return (b.extractionConfidence ?? 0) - (a.extractionConfidence ?? 0);
    });
    const selected = ranked.find((doc) => (doc.extractedValues as Record<string, unknown> | undefined)?.[field] !== undefined);
    if (selected?.extractedValues) (aggregated as Record<string, unknown>)[field] = (selected.extractedValues as Record<string, unknown>)[field];
  });
  const confidenceValues = docs.map((doc) => doc.extractionConfidence ?? doc.extractedValues?.confidence ?? 0).filter((value) => value > 0);
  aggregated.confidence = confidenceValues.length ? Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(2)) : 0;
  aggregated.warnings = docs.flatMap((doc) => doc.extractedValues?.warnings ?? []);
  return aggregated;
}

export function reconcileQuestionnaireWithDocuments(
  answers: AnswerMap,
  documentsOrValues: TaxReformDocument[] | TaxReformExtractedValues,
): ReconciliationAlert[] {
  const docs = Array.isArray(documentsOrValues) ? documentsOrValues : undefined;
  const extracted = docs ? aggregateExtractedValues(docs) : (documentsOrValues as TaxReformExtractedValues);
  const alerts: ReconciliationAlert[] = [];
  if (!extracted) return alerts;

  const add = (field: string, title: string, message: string, critical = false) => alerts.push({
    field,
    title,
    message,
    severity: critical ? 'critical' : 'warning',
    manualReviewRecommended: critical,
  });

  // -------- Cruzamentos documentais (independentes da confiança) --------
  if (docs && docs.length > 1) {
    const cnpjs = new Set(
      docs
        .map((doc) => (doc.extractedValues?.cnpj as string | undefined)?.replace(/\D/g, ''))
        .filter((cnpj): cnpj is string => Boolean(cnpj)),
    );
    if (cnpjs.size > 1) {
      add('cnpj', 'CNPJ divergente entre documentos', `Foram encontrados CNPJs diferentes nos documentos anexados (${cnpjs.size} valores distintos).`, true);
    }
  }

  const pgdas = docs?.find((doc) => doc.documentType === 'pgdas')?.extractedValues;
  const dre = docs?.find((doc) => doc.documentType === 'dre' || doc.documentType === 'balancete')?.extractedValues;

  if (pgdas?.rbaa && dre?.grossRevenue) {
    const diff = Math.abs(pgdas.rbaa - dre.grossRevenue) / pgdas.rbaa;
    if (diff > 0.01) {
      add('grossRevenue', 'Receita anual DRE diverge do RBAA do PGDAS',
        `DRE indica R$ ${dre.grossRevenue.toFixed(2)} e PGDAS (RBAA) indica R$ ${pgdas.rbaa.toFixed(2)}.`, true);
    }
  }

  if (pgdas?.effectiveTaxRate !== undefined && dre?.annualEffectiveTaxRate !== undefined) {
    const diff = Math.abs(pgdas.effectiveTaxRate - dre.annualEffectiveTaxRate);
    if (diff > 0.5) {
      add('annualEffectiveTaxRate', 'Alíquota anual da DRE diverge do PGDAS',
        `DRE: ${dre.annualEffectiveTaxRate}% · PGDAS: ${pgdas.effectiveTaxRate}%.`, false);
    }
  }

  // Folha DRE × Folha mensal anualizada — apenas coerência, nunca crítico.
  // (DRE inclui 13º, férias, FGTS, pró-labore → tende a ser maior.)

  if (extracted.confidence !== undefined && extracted.confidence < 0.35) return alerts;

  const answerB2b = toNumber(answers.sales_b2b_percent);
  if (extracted.b2bPercent !== undefined && answerB2b > 0 && Math.abs(extracted.b2bPercent - answerB2b) >= 30) {
    add('sales_b2b_percent', 'Divergência no perfil B2B', `Questionário informa B2B de ${answerB2b}%, mas documentos indicam ${extracted.b2bPercent}%.`, true);
  }

  const inputBucket = answers.inputs_revenue_percent;
  if (extracted.inputCostPercent !== undefined && inputBucket === 'ate_20' && extracted.inputCostPercent >= 50) {
    add('inputs_revenue_percent', 'Divergência em custos/insumos', `Questionário indica insumos até 20%, mas DRE/balancete aponta ${extracted.inputCostPercent}% da receita.`, true);
  }

  const answerRate = toNumber(answers.effective_tax_rate);
  if (extracted.effectiveTaxRate !== undefined && answerRate > 0 && Math.abs(extracted.effectiveTaxRate - answerRate) >= 5) {
    add('effective_tax_rate', 'Alíquota efetiva divergente', `Questionário informa ${answerRate}%, mas PGDAS indica ${extracted.effectiveTaxRate}%.`, false);
  }

  if (answers.clients_use_tax_credits === 'nao' && (extracted.b2bPercent ?? 0) >= 70) {
    add('clients_use_tax_credits', 'Risco comercial por clientes PJ', 'Documentos indicam alta participação B2B; confirme se clientes relevantes realmente não usam créditos.', false);
  }

  return alerts;
}
