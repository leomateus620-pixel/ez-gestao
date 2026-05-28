/* eslint-disable no-useless-escape */
export interface FatorRParseResult {
  fatorRValue: number | null;
  fatorRPercent: number | null;
  payroll12m: number | null;
  revenue12m: number | null;
  referenceMonth: number | null;
  referenceYear: number | null;
  companyName: string | null;
  cnpj: string | null;
  confidence: number;
  warnings: string[];
}

export type FatorRStatus = 'critical' | 'attention' | 'safe' | 'unknown';

export const FATOR_R_CRITICAL_THRESHOLD = 0.28;
export const FATOR_R_ATTENTION_THRESHOLD = 0.32;

const monthNames: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const parseBrazilianNumber = (value?: string | null) => {
  if (!value) return null;
  const cleaned = value.trim().replace(/R\$\s*/i, '').replace(/\s/g, '');
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const raw = Number(normalized.replace('%', ''));
  return Number.isNaN(raw) ? null : raw;
};

export const pctToDecimal = (value: string) => {
  const raw = parseBrazilianNumber(value);
  if (raw === null) return null;
  return value.includes('%') || raw > 1 ? raw / 100 : raw;
};

export function classifyFatorR(value: number | null): FatorRStatus {
  if (value === null || !Number.isFinite(value)) return 'unknown';
  if (value <= FATOR_R_CRITICAL_THRESHOLD) return 'critical';
  if (value <= FATOR_R_ATTENTION_THRESHOLD) return 'attention';
  return 'safe';
}

export function getFatorRRecommendation(status: FatorRStatus) {
  if (status === 'critical') return 'Índice crítico: revisar imediatamente pró-labore, folha e encargos para buscar Fator R acima de 28%.';
  if (status === 'attention') return 'Índice em atenção: disparar alerta preventivo e avaliar aumento de pró-labore/folha antes do fechamento.';
  if (status === 'safe') return 'Índice acima da zona de atenção, mantendo acompanhamento mensal.';
  return 'Fator R não identificado com confiança suficiente; revisar o PDF manualmente.';
}

function extractReferencePeriod(text: string) {
  const numeric = text.match(/(?:per[ií]odo\s*(?:de\s*)?apura[cç][aã]o|\bpa\b|compet[eê]ncia|refer[eê]ncia)[^\d]{0,20}(0?[1-9]|1[0-2])[\/\-_\s](20\d{2})/i)
    || text.match(/(?:per[ií]odo\s*(?:de\s*)?apura[cç][aã]o|\bpa\b|compet[eê]ncia|refer[eê]ncia)[^\d]{0,20}(20\d{2})[\/\-_\s](0?[1-9]|1[0-2])/i)
    || text.match(/(20\d{2})[\/\-_\s](0?[1-9]|1[0-2])/) 
    || text.match(/(0?[1-9]|1[0-2])[\/\-_\s](20\d{2})/);

  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    return first > 12
      ? { referenceYear: first, referenceMonth: second }
      : { referenceMonth: first, referenceYear: second };
  }

  const named = text.match(new RegExp(`(${Object.keys(monthNames).join('|')})\\s*(?:de|/)\\s*(20\\d{2})`, 'i'));
  if (named) {
    return { referenceMonth: monthNames[named[1].toLowerCase()], referenceYear: Number(named[2]) };
  }

  return { referenceMonth: null, referenceYear: null };
}

function extractCompanyName(text: string) {
  const patterns = [
    /(?:raz[aã]o\s*social|nome\s*empresarial)\s*[:\-]?\s*([^\n]{3,120})/i,
    /(?:contribuinte)\s*[:\-]?\s*([^\n]{3,120})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern)?.[1];
    if (match) return normalizeWhitespace(match).replace(/\s*CNPJ\b.*$/i, '').trim();
  }
  return null;
}

export function parseFatorRFromText(rawText: string, fileName = ''): FatorRParseResult {
  const text = `${fileName}\n${rawText}`;
  const compact = normalizeWhitespace(text);
  const warnings: string[] = [];

  const cnpj = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/)?.[0] ?? null;
  const fatorMatch = compact.match(/fator\s*r(?:\s*apurado)?[^\d]{0,40}(\d{1,3}(?:[\.,]\d{1,4})?\s*%?|0[\.,]\d{1,4})/i)
    || compact.match(/percentual\s*(?:do\s*)?fator\s*r[^\d]{0,40}(\d{1,3}(?:[\.,]\d{1,4})?\s*%?|0[\.,]\d{1,4})/i);
  const fs12Match = compact.match(/(?:FS12|folha\s+de\s+sal[aá]rios|folha\s+dos\s+12\s+meses)[^\d]{0,40}(?:R\$\s*)?(\d[\d\.,]*)/i);
  const rbt12Match = compact.match(/(?:RBT12|receita\s+bruta\s+acumulada|receita\s+bruta\s+dos\s+12\s+meses)[^\d]{0,40}(?:R\$\s*)?(\d[\d\.,]*)/i);

  const fatorRValue = fatorMatch ? pctToDecimal(fatorMatch[1]) : null;
  if (fatorRValue === null) warnings.push('Fator R não identificado com alta confiança.');

  const { referenceMonth, referenceYear } = extractReferencePeriod(compact);
  if (!referenceMonth || !referenceYear) warnings.push('Período de apuração não identificado automaticamente.');

  const payroll12m = parseBrazilianNumber(fs12Match?.[1]);
  const revenue12m = parseBrazilianNumber(rbt12Match?.[1]);
  const confidence = fatorRValue === null ? 0.35 : fs12Match || rbt12Match ? 0.92 : 0.8;

  return {
    fatorRValue,
    fatorRPercent: fatorRValue !== null ? fatorRValue * 100 : null,
    payroll12m,
    revenue12m,
    referenceMonth,
    referenceYear,
    companyName: extractCompanyName(text),
    cnpj,
    confidence,
    warnings,
  };
}
