import type { TaxReformDocumentFinding, TaxReformExtractedValues } from './types';

const moneyRegex = /-?\d{1,3}(?:\.\d{3})*(?:,\d{2})|-?\d+(?:[,.]\d{2})?/;
const parenMoneyRegex = /\(?-?\d{1,3}(?:\.\d{3})*(?:,\d{2})\)?|\(?-?\d+(?:[,.]\d{2})?\)?/;

export function normalizeNumber(value: string | number | undefined | null): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (!value) return undefined;
  const trimmed = value.trim();
  const negativeByParen = /^\(.+\)$/.test(trimmed);
  const cleaned = trimmed
    .replace(/^\(|\)$/g, '')
    .replace(/R\$|%/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return undefined;
  return negativeByParen ? -Math.abs(parsed) : parsed;
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

/**
 * Constrói um mapa label→valor para documentos contábeis onde o rótulo
 * fica em uma linha e o valor numérico aparece na linha seguinte
 * (formato típico das DREs/Balanços extraídos do JB Contábil).
 * Linhas que contêm um label E um número também são capturadas.
 */
export function buildLineLabelValueMap(text: string): Array<{ label: string; value: number; lineIndex: number }> {
  const rawLines = text.replace(/\r/g, '\n').split('\n').map((line) => line.trim());
  const out: Array<{ label: string; value: number; lineIndex: number }> = [];
  const isNumericLine = (line: string) => {
    if (!line) return false;
    const stripped = line.replace(/[()\s.,\-\d]/g, '');
    return stripped.length === 0 && /\d/.test(line);
  };
  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    if (!line) continue;
    if (isNumericLine(line)) continue;
    // Pattern A: label only → value on next non-blank numeric line
    if (!/\d/.test(line)) {
      for (let j = i + 1; j < Math.min(rawLines.length, i + 4); j += 1) {
        const next = rawLines[j];
        if (!next) continue;
        if (isNumericLine(next)) {
          const value = normalizeNumber(next);
          if (value !== undefined) out.push({ label: line, value, lineIndex: i });
          break;
        }
        if (/\d/.test(next)) break; // next non-numeric textual line — give up
      }
      continue;
    }
    // Pattern B: label and value on same line
    const m = line.match(new RegExp(`^(.+?)[\\s:]+(${parenMoneyRegex.source})\\s*$`));
    if (m) {
      const value = normalizeNumber(m[2]);
      const label = m[1].trim();
      if (value !== undefined && label && !/^\d/.test(label)) out.push({ label, value, lineIndex: i });
    }
  }
  return out;
}

const normalizeLabel = (label: string) => label
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s./()-]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

export function findValueByLabels(
  map: Array<{ label: string; value: number; lineIndex: number }>,
  labels: string[],
  options: { exact?: boolean; fromLine?: number; toLine?: number } = {},
): number | undefined {
  const targets = labels.map(normalizeLabel);
  const filtered = map.filter((entry) => {
    if (options.fromLine !== undefined && entry.lineIndex < options.fromLine) return false;
    if (options.toLine !== undefined && entry.lineIndex > options.toLine) return false;
    return true;
  });
  for (const target of targets) {
    for (const entry of filtered) {
      const norm = normalizeLabel(entry.label);
      const matches = options.exact ? norm === target : norm.includes(target);
      if (matches) return entry.value;
    }
  }
  return undefined;
}

/**
 * Localiza o índice de linha de um marcador de seção (heading).
 * Retorna -1 se não encontrar.
 */
export function findSectionLine(text: string, markers: string[]): number {
  const lines = text.replace(/\r/g, '\n').split('\n').map((line) => normalizeLabel(line));
  for (let i = 0; i < lines.length; i += 1) {
    if (markers.some((marker) => lines[i].includes(normalizeLabel(marker)))) return i;
  }
  return -1;
}

/** Lista todos os valores numéricos (R$/percent) presentes em uma string. */
export function extractAllNumbers(text: string): number[] {
  const result: number[] = [];
  const re = new RegExp(parenMoneyRegex.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const value = normalizeNumber(match[0]);
    if (value !== undefined) result.push(value);
  }
  return result;
}

/** Extrai o primeiro CNPJ no formato XX.XXX.XXX/XXXX-XX do texto. */
export function extractCnpj(text: string): string | undefined {
  const m = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  return m?.[0];
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
