import type { TaxReformDocumentFinding, TaxReformExtractedValues } from './types';

const moneyRegex = /-?\d{1,3}(?:\.\d{3})*(?:,\d{2})|-?\d+(?:[,.]\d{2})?/;

export function normalizeNumber(value: string | number | undefined | null): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (!value) return undefined;
  const cleaned = value
    .replace(/R\$|%/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function extractNumberAfterLabel(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const regex = new RegExp(`${label}[^\\d-]{0,80}(${moneyRegex.source})`, 'i');
    const match = text.match(regex);
    const value = normalizeNumber(match?.[1]);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function toPercentBucket(value?: number) {
  if (value === undefined) return undefined;
  if (value <= 20) return 'ate_20';
  if (value <= 40) return '21_40';
  if (value <= 60) return '41_60';
  return 'acima_60';
}

export function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

export function pushFinding(
  findings: TaxReformDocumentFinding[],
  documentType: string,
  field: string,
  value: string | number | boolean | undefined,
  confidence: number,
  sourceLabel?: string,
  explanation?: string,
) {
  if (value === undefined || value === '') return;
  findings.push({ documentType, field, value, confidence: clampConfidence(confidence), sourceLabel, explanation });
}

export function summarizeExtractedValues(values: TaxReformExtractedValues) {
  const parts: string[] = [];
  if (values.revenue !== undefined) parts.push(`receita ${values.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  if (values.grossRevenue12m !== undefined) parts.push(`RBT12 ${values.grossRevenue12m.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  if (values.effectiveTaxRate !== undefined) parts.push(`alíquota efetiva ${values.effectiveTaxRate}%`);
  if (values.inputCostPercent !== undefined) parts.push(`custos/insumos ${values.inputCostPercent}%`);
  if (values.payrollPercent !== undefined) parts.push(`folha ${values.payrollPercent}%`);
  if (values.b2bPercent !== undefined) parts.push(`B2B ${values.b2bPercent}%`);
  if (values.b2cPercent !== undefined) parts.push(`B2C ${values.b2cPercent}%`);
  if (values.top10ClientsConcentration !== undefined) parts.push(`top 10 clientes ${values.top10ClientsConcentration}%`);
  return parts.length ? `Dados extraídos: ${parts.join('; ')}.` : 'Nenhum campo tributário decisivo foi identificado com segurança no documento.';
}
