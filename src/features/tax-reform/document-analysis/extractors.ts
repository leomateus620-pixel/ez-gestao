import { clampConfidence, extractNumberAfterLabel, normalizeNumber, pushFinding, summarizeExtractedValues } from './normalize';
import type { TaxReformDocumentExtraction, TaxReformDocumentFinding, TaxReformExtractedValues } from './types';

const linesOf = (text: string) => text.replace(/\r/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
const contains = (text: string, words: string[]) => words.some((word) => new RegExp(word, 'i').test(text));

function confidenceFromFindings(findings: TaxReformDocumentFinding[], base = 0.35) {
  if (!findings.length) return 0;
  return clampConfidence(Math.min(0.95, base + findings.length * 0.1));
}

function extractDre(text: string, documentType: string): TaxReformDocumentExtraction {
  const findings: TaxReformDocumentFinding[] = [];
  const warnings: string[] = [];
  const revenue = extractNumberAfterLabel(text, ['receita bruta', 'receita operacional bruta', 'faturamento bruto', 'vendas brutas']);
  const netRevenue = extractNumberAfterLabel(text, ['receita líquida', 'receita liquida']);
  const inputCost = extractNumberAfterLabel(text, ['cmv', 'cpv', 'custo dos serviços', 'custo dos servicos', 'custos dos produtos', 'custo mercadorias']);
  const grossProfit = extractNumberAfterLabel(text, ['lucro bruto', 'resultado bruto']);
  const operatingExpenses = extractNumberAfterLabel(text, ['despesas operacionais', 'despesa operacional']);
  const payroll = extractNumberAfterLabel(text, ['folha', 'salários', 'salarios', 'encargos sociais', 'pró-labore', 'pro-labore']);
  const netProfit = extractNumberAfterLabel(text, ['lucro líquido', 'lucro liquido', 'resultado líquido', 'resultado liquido']);
  const revenueBase = revenue ?? netRevenue;
  const values: TaxReformExtractedValues = { revenue: revenueBase, netProfit, operatingExpenses };
  if (revenueBase && inputCost !== undefined) values.inputCostPercent = Number(((Math.abs(inputCost) / revenueBase) * 100).toFixed(2));
  if (revenueBase && payroll !== undefined) values.payrollPercent = Number(((Math.abs(payroll) / revenueBase) * 100).toFixed(2));
  if (revenueBase && grossProfit !== undefined) values.grossMargin = Number(((grossProfit / revenueBase) * 100).toFixed(2));
  pushFinding(findings, documentType, 'revenue', revenueBase, 0.8, 'DRE', 'Receita identificada por rótulos de receita/faturamento.');
  pushFinding(findings, documentType, 'inputCostPercent', values.inputCostPercent, 0.78, 'DRE', 'Percentual calculado a partir de CMV/CPV/custos sobre receita.');
  pushFinding(findings, documentType, 'payrollPercent', values.payrollPercent, 0.65, 'DRE', 'Percentual calculado a partir de folha/salários/encargos sobre receita.');
  pushFinding(findings, documentType, 'grossMargin', values.grossMargin, 0.7, 'DRE', 'Margem bruta calculada a partir do lucro bruto.');
  pushFinding(findings, documentType, 'operatingExpenses', operatingExpenses, 0.7, 'DRE');
  pushFinding(findings, documentType, 'netProfit', netProfit, 0.75, 'DRE');
  if (!revenueBase) warnings.push('Receita não localizada no DRE.');
  const confidence = confidenceFromFindings(findings, 0.35);
  return { documentType, values: { ...values, warnings, confidence }, findings, summary: summarizeExtractedValues(values), confidence, warnings };
}

function extractPgdas(text: string, documentType: string): TaxReformDocumentExtraction {
  const findings: TaxReformDocumentFinding[] = [];
  const warnings: string[] = [];
  const values: TaxReformExtractedValues = {
    grossRevenue12m: extractNumberAfterLabel(text, ['rbt12', 'receita bruta acumulada', 'receita bruta total dos últimos 12 meses', 'receita bruta total dos ultimos 12 meses']),
    revenue: extractNumberAfterLabel(text, ['receita mensal', 'receita do período', 'receita do periodo', 'receita bruta do pa']),
    effectiveTaxRate: extractNumberAfterLabel(text, ['alíquota efetiva', 'aliquota efetiva', 'alíquota', 'aliquota']),
    taxRegimeDetected: contains(text, ['simples nacional', 'pgdas']) ? 'simples_nacional' : undefined,
    hasSt: contains(text, ['substituição tributária', 'substituicao tributaria', '\\bST\\b']) || undefined,
    hasMonophasic: contains(text, ['monofásic', 'monofasic']) || undefined,
    hasExportation: contains(text, ['exportação', 'exportacao']) || undefined,
  };
  pushFinding(findings, documentType, 'grossRevenue12m', values.grossRevenue12m, 0.9, 'PGDAS', 'RBT12 identificado no demonstrativo oficial.');
  pushFinding(findings, documentType, 'revenue', values.revenue, 0.85, 'PGDAS', 'Receita mensal/período identificada.');
  pushFinding(findings, documentType, 'effectiveTaxRate', values.effectiveTaxRate, 0.9, 'PGDAS', 'Alíquota efetiva identificada no PGDAS.');
  pushFinding(findings, documentType, 'taxRegimeDetected', values.taxRegimeDetected, 0.9, 'PGDAS');
  pushFinding(findings, documentType, 'hasSt', values.hasSt, 0.65, 'PGDAS');
  pushFinding(findings, documentType, 'hasMonophasic', values.hasMonophasic, 0.65, 'PGDAS');
  pushFinding(findings, documentType, 'hasExportation', values.hasExportation, 0.65, 'PGDAS');
  if (values.effectiveTaxRate === undefined) warnings.push('Alíquota efetiva não localizada no PGDAS.');
  const confidence = confidenceFromFindings(findings, 0.45);
  return { documentType, values: { ...values, warnings, confidence }, findings, summary: summarizeExtractedValues(values), confidence, warnings };
}

function extractClientRevenue(text: string, documentType: string): TaxReformDocumentExtraction {
  const findings: TaxReformDocumentFinding[] = [];
  const warnings: string[] = [];
  const rows = linesOf(text);
  let total = 0;
  let b2b = 0;
  let b2c = 0;
  let government = 0;
  const amounts: number[] = [];
  rows.forEach((row) => {
    const cols = row.split(/[;,\t]/).map((col) => col.trim()).filter(Boolean);
    const amount = [...cols].reverse().map(normalizeNumber).find((value) => value !== undefined);
    if (!amount) return;
    total += amount;
    amounts.push(amount);
    const lowered = row.toLowerCase();
    const hasCnpj = /\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/.test(row);
    const hasCpf = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(row);
    if (contains(lowered, ['governo', 'prefeitura', 'estado', 'município', 'municipio', 'união', 'uniao'])) government += amount;
    else if (hasCnpj || contains(lowered, [' ltda', ' s/a', ' sa ', 'eireli', 'empresa', 'industria', 'comercio'])) b2b += amount;
    else if (hasCpf || contains(lowered, ['consumidor final', 'pessoa física', 'pessoa fisica', 'cpf'])) b2c += amount;
  });
  const values: TaxReformExtractedValues = {};
  if (total > 0) {
    values.revenue = Number(total.toFixed(2));
    values.b2bPercent = Number(((b2b / total) * 100).toFixed(2));
    values.b2cPercent = Number(((b2c / total) * 100).toFixed(2));
    values.governmentPercent = Number(((government / total) * 100).toFixed(2));
    const top10 = amounts.sort((a, b) => b - a).slice(0, 10).reduce((sum, value) => sum + value, 0);
    values.top10ClientsConcentration = Number(((top10 / total) * 100).toFixed(2));
  }
  pushFinding(findings, documentType, 'revenue', values.revenue, 0.75, 'Faturamento por cliente');
  pushFinding(findings, documentType, 'b2bPercent', values.b2bPercent, 0.75, 'Faturamento por cliente', 'Percentual estimado por CNPJ e marcadores de pessoa jurídica.');
  pushFinding(findings, documentType, 'b2cPercent', values.b2cPercent, 0.7, 'Faturamento por cliente', 'Percentual estimado por CPF/consumidor final.');
  pushFinding(findings, documentType, 'governmentPercent', values.governmentPercent, 0.7, 'Faturamento por cliente');
  pushFinding(findings, documentType, 'top10ClientsConcentration', values.top10ClientsConcentration, 0.8, 'Faturamento por cliente');
  if (!total) warnings.push('Não foi possível identificar valores por cliente.');
  const confidence = confidenceFromFindings(findings, 0.35);
  return { documentType, values: { ...values, warnings, confidence }, findings, summary: summarizeExtractedValues(values), confidence, warnings };
}

function extractBalanceteOrSupplier(text: string, documentType: string): TaxReformDocumentExtraction {
  const base = documentType === 'fornecedores' ? 'Fornecedores' : documentType === 'folha_pagamento' ? 'Folha' : 'Balancete';
  const findings: TaxReformDocumentFinding[] = [];
  const warnings: string[] = [];
  const revenue = extractNumberAfterLabel(text, ['receitas', 'receita', 'faturamento']);
  const costs = extractNumberAfterLabel(text, ['custos', 'cmv', 'compras', 'fornecedores']);
  const payroll = extractNumberAfterLabel(text, ['folha', 'salários', 'salarios', 'encargos', 'pró-labore', 'pro-labore']);
  const expenses = extractNumberAfterLabel(text, ['despesas', 'despesas operacionais']);
  const result = extractNumberAfterLabel(text, ['resultado', 'lucro líquido', 'lucro liquido']);
  const values: TaxReformExtractedValues = { revenue, operatingExpenses: expenses, netProfit: result };
  if (revenue && costs !== undefined) values.inputCostPercent = Number(((Math.abs(costs) / revenue) * 100).toFixed(2));
  if (revenue && payroll !== undefined) values.payrollPercent = Number(((Math.abs(payroll) / revenue) * 100).toFixed(2));
  if (contains(text, ['lucro real'])) values.supplierRegimeDetected = 'lucro_real';
  else if (contains(text, ['lucro presumido'])) values.supplierRegimeDetected = 'lucro_presumido';
  else if (contains(text, ['simples nacional'])) values.supplierRegimeDetected = 'simples_nacional';
  pushFinding(findings, documentType, 'revenue', values.revenue, 0.7, base);
  pushFinding(findings, documentType, 'inputCostPercent', values.inputCostPercent, 0.7, base);
  pushFinding(findings, documentType, 'payrollPercent', values.payrollPercent, 0.7, base);
  pushFinding(findings, documentType, 'supplierRegimeDetected', values.supplierRegimeDetected, 0.55, base);
  pushFinding(findings, documentType, 'operatingExpenses', expenses, 0.6, base);
  if (!findings.length) warnings.push('Campos decisivos não localizados no documento.');
  const confidence = confidenceFromFindings(findings, 0.3);
  return { documentType, values: { ...values, warnings, confidence }, findings, summary: summarizeExtractedValues(values), confidence, warnings };
}

export function extractTaxReformDocumentFromText(documentType: string, text: string): TaxReformDocumentExtraction {
  if (!text.trim()) {
    return { documentType, values: { warnings: ['Arquivo sem texto extraível.'], confidence: 0 }, findings: [], summary: 'Arquivo sem texto extraível para leitura automática.', confidence: 0, warnings: ['Arquivo sem texto extraível.'] };
  }
  if (documentType === 'dre') return extractDre(text, documentType);
  if (documentType === 'pgdas') return extractPgdas(text, documentType);
  if (documentType === 'faturamento_cliente') return extractClientRevenue(text, documentType);
  if (['balancete', 'fornecedores', 'folha_pagamento'].includes(documentType)) return extractBalanceteOrSupplier(text, documentType);
  if (['vendas_cfop', 'nfse'].includes(documentType)) {
    const extraction = extractPgdas(text, documentType);
    extraction.values.hasIssRetido = contains(text, ['iss retido']) || undefined;
    pushFinding(extraction.findings, documentType, 'hasIssRetido', extraction.values.hasIssRetido, 0.65, documentType.toUpperCase());
    extraction.summary = summarizeExtractedValues(extraction.values);
    return extraction;
  }
  return extractBalanceteOrSupplier(text, documentType);
}
