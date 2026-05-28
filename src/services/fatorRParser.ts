export type FatorRStatus = 'critical' | 'attention' | 'safe' | 'not_applicable' | 'unknown';

export interface FatorRParseResult {
  fatorRValue: number | null;
  fatorRPercent: number | null;
  declaredFatorRValue: number | null;
  declaredFatorRPercent: number | null;
  computedFatorRValue: number | null;
  computedFatorRPercent: number | null;
  payroll12m: number | null;
  revenue12m: number | null;
  referenceMonth: number | null;
  referenceYear: number | null;
  companyName: string | null;
  cnpj: string | null;
  cnpjIsPartial: boolean;
  folhaAusente: boolean;
  notApplicable: boolean;
  status: FatorRStatus;
  shouldAlert: boolean;
  confidence: number;
  warnings: string[];
  metadata: Record<string, unknown>;
}

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

const moneyPattern = /(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}|(?:R\$\s*)?\d+,\d{2}/g;
const cleanSpaces = (value: string) => value.replace(/[ \t\u00a0]+/g, ' ').trim();
const stripAfterKnownLabel = (value: string) => value
  .replace(/\s+(?:CNPJ\s+(?:B[aá]sico|Estabelecimento)|Per[ií]odo\s+de\s+Apura[cç][aã]o|PA|Data\b).*$/i, '')
  .trim();

export function normalizePdfText(text: string) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function splitPdfLines(text: string) {
  return normalizePdfText(text)
    .split('\n')
    .map(cleanSpaces)
    .filter(Boolean);
}

export function parseBrazilianMoney(value?: string | null) {
  if (!value) return null;
  const match = value.match(moneyPattern)?.[0] ?? value;
  const normalized = match.replace(/R\$\s*/i, '').replace(/\./g, '').replace(',', '.').replace(/\s/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBrazilianDecimal(value?: string | null) {
  if (!value) return null;
  const cleaned = value.replace('%', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return value.includes('%') || parsed > 1 ? parsed / 100 : parsed;
}

export const pctToDecimal = parseBrazilianDecimal;

const moneyValues = (value: string) => (value.match(moneyPattern) ?? [])
  .map(parseBrazilianMoney)
  .filter((item): item is number => item !== null);

export function extractCompanyName(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/Nome\s+Empresarial\s*:\s*(.+)$/i) || line.match(/Raz[aã]o\s+Social\s*:\s*(.+)$/i);
    if (match?.[1]) return stripAfterKnownLabel(cleanSpaces(match[1]));
  }
  for (const line of lines) {
    const match = line.match(/Contribuinte\s*:\s*(.+)$/i);
    if (match?.[1]) return stripAfterKnownLabel(cleanSpaces(match[1]));
  }
  return null;
}

export function extractCnpj(lines: string[]) {
  for (const line of lines) {
    const establishment = line.match(/CNPJ\s+Estabelecimento\s*:\s*(\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2})/i);
    if (establishment?.[1]) return { cnpj: establishment[1], cnpjIsPartial: false };
  }
  for (const line of lines) {
    const full = line.match(/\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}\b/);
    if (full?.[0]) return { cnpj: full[0], cnpjIsPartial: false };
  }
  for (const line of lines) {
    const basic = line.match(/CNPJ\s+B[aá]sico\s*:\s*(\d{2}\.?\d{3}\.?\d{3})\b/i);
    if (basic?.[1]) return { cnpj: basic[1], cnpjIsPartial: true };
  }
  return { cnpj: null, cnpjIsPartial: false };
}

export function extractReferencePeriod(lines: string[]) {
  const text = lines.join(' ');
  const numeric = text.match(/Per[ií]odo\s+de\s+Apura[cç][aã]o\s*\(PA\)\s*:\s*(0?[1-9]|1[0-2])\/(20\d{2})/i)
    || text.match(/(?:\bPA\b|compet[eê]ncia|refer[eê]ncia)[^\d]{0,20}(0?[1-9]|1[0-2])[\/\-_\s](20\d{2})/i)
    || text.match(/(?:\bPA\b|compet[eê]ncia|refer[eê]ncia)[^\d]{0,20}(20\d{2})[\/\-_\s](0?[1-9]|1[0-2])/i);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    return first > 12
      ? { referenceMonth: second, referenceYear: first }
      : { referenceMonth: first, referenceYear: second };
  }

  const named = text.match(new RegExp(`(${Object.keys(monthNames).join('|')})\\s*(?:de|/)\\s*(20\\d{2})`, 'i'));
  if (named) return { referenceMonth: monthNames[named[1].toLowerCase()], referenceYear: Number(named[2]) };
  return { referenceMonth: null, referenceYear: null };
}

export function extractRbt12(lines: string[]) {
  for (const line of lines) {
    if (!/RBT12|Receita\s+bruta\s+acumulada\s+nos\s+doze\s+meses\s+anteriores\s+ao\s+PA/i.test(line)) continue;
    const afterMarker = line.includes('(RBT12)') ? line.slice(line.indexOf('(RBT12)') + '(RBT12)'.length) : line.replace(/^.*?RBT12\)?/i, '');
    const values = moneyValues(afterMarker);
    if (values.length >= 3) return values[2];
    if (values.length > 0) return values[0];
  }
  return null;
}

export function extractFs12(lines: string[]) {
  const folhaAusente = lines.some((line, index) => /2\.3\)?|Folhas?\s+de\s+Sal[aá]rios\s+Anteriores/i.test(line)
    && /Nenhuma/i.test(`${line} ${lines[index + 1] ?? ''}`));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/Total\s+de\s+Folhas?\s+de\s+Sal[aá]rios\s+Anteriores/i.test(line)) continue;
    const currentLineValues = moneyValues(line);
    const values = currentLineValues.length > 0 ? currentLineValues : moneyValues(lines[index + 1] ?? '');
    if (values.length > 0) return { payroll12m: values[values.length - 1], folhaAusente: false };
  }

  return { payroll12m: null, folhaAusente };
}

export function extractFatorR(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/Fator\s*r\s*=\s*(N[aã]o\s+se\s+aplica|\d{1,3}(?:[\.,]\d{1,4})?\s*%?)/i);
    if (!match?.[1]) continue;
    if (/n[aã]o\s+se\s+aplica/i.test(match[1])) return { fatorRValue: null, notApplicable: true };
    return { fatorRValue: parseBrazilianDecimal(match[1]), notApplicable: false };
  }
  return { fatorRValue: null, notApplicable: false };
}

export function classifyFatorR(input: number | null | Pick<FatorRParseResult, 'fatorRValue' | 'notApplicable'>): FatorRStatus {
  let value: number | null;
  if (typeof input === 'number') {
    value = input;
  } else if (input === null) {
    value = null;
  } else {
    if (input.notApplicable) return 'not_applicable';
    value = input.fatorRValue;
  }
  if (value === null || !Number.isFinite(value)) return 'unknown';
  if (value <= FATOR_R_CRITICAL_THRESHOLD) return 'critical';
  if (value <= FATOR_R_ATTENTION_THRESHOLD) return 'attention';
  return 'safe';
}

export function getFatorRRecommendation(status: FatorRStatus) {
  if (status === 'critical') return 'Índice crítico: revisar imediatamente pró-labore, folha e encargos para buscar Fator R acima de 28%.';
  if (status === 'attention') return 'Índice em atenção: disparar alerta preventivo e avaliar aumento de pró-labore/folha antes do fechamento.';
  if (status === 'safe') return 'Índice acima da zona de atenção, mantendo acompanhamento mensal.';
  if (status === 'not_applicable') return 'Este PGDAS informa que o Fator R não se aplica para esta apuração.';
  return 'Não foi possível extrair texto deste PDF. Verifique se o arquivo é um PGDAS válido ou consulte os logs da função.';
}

export function parsePgdasFatorR(rawText: string, fileName = ''): FatorRParseResult {
  const lines = splitPdfLines(`${fileName}\n${rawText}`);
  const warnings: string[] = [];
  const companyName = extractCompanyName(lines);
  const { cnpj, cnpjIsPartial } = extractCnpj(lines);
  const { referenceMonth, referenceYear } = extractReferencePeriod(lines);
  const revenue12m = extractRbt12(lines);
  const { payroll12m, folhaAusente } = extractFs12(lines);
  const declared = extractFatorR(lines);
  const computedFatorRValue = payroll12m !== null && revenue12m !== null && revenue12m > 0 ? payroll12m / revenue12m : null;
  const fatorRValue = declared.fatorRValue ?? computedFatorRValue;
  const notApplicable = declared.notApplicable;

  if (!companyName) warnings.push('Empresa não identificada automaticamente.');
  if (!cnpj) warnings.push('CNPJ não identificado automaticamente.');
  if (cnpjIsPartial) warnings.push('Apenas CNPJ básico identificado; estabelecimento não foi encontrado.');
  if (!referenceMonth || !referenceYear) warnings.push('Período de apuração não identificado automaticamente.');
  if (revenue12m === null) warnings.push('RBT12 não identificado na seção de receita bruta acumulada.');
  if (payroll12m === null && !folhaAusente) warnings.push('FS12 não identificado na seção 2.3.1 de folhas de salários anteriores.');
  if (declared.fatorRValue === null && !notApplicable && computedFatorRValue === null) warnings.push('Fator R não identificado e cálculo por FS12/RBT12 indisponível.');
  if (declared.fatorRValue !== null && computedFatorRValue !== null && Math.abs(declared.fatorRValue - computedFatorRValue) > 0.005) {
    warnings.push('Fator R declarado difere do cálculo interno; provável arredondamento/critério do PGDAS.');
  }

  const status = notApplicable ? 'not_applicable' : classifyFatorR(fatorRValue);
  const highConfidenceFields = [companyName, cnpj, referenceMonth && referenceYear, revenue12m !== null, declared.fatorRValue !== null || notApplicable || computedFatorRValue !== null]
    .filter(Boolean).length;
  const confidence = notApplicable || declared.fatorRValue !== null
    ? Math.max(0.9, 0.72 + highConfidenceFields * 0.05)
    : computedFatorRValue !== null
      ? 0.86
      : 0.35;

  const source = declared.fatorRValue !== null && computedFatorRValue !== null
    ? 'declared_pgdas_and_computed_check'
    : declared.fatorRValue !== null
      ? 'declared_pgdas'
      : computedFatorRValue !== null
        ? 'computed_from_fs12_rbt12'
        : notApplicable
          ? 'declared_pgdas_not_applicable'
          : 'unknown';

  return {
    fatorRValue,
    fatorRPercent: fatorRValue !== null ? fatorRValue * 100 : null,
    declaredFatorRValue: declared.fatorRValue,
    declaredFatorRPercent: declared.fatorRValue !== null ? declared.fatorRValue * 100 : null,
    computedFatorRValue,
    computedFatorRPercent: computedFatorRValue !== null ? computedFatorRValue * 100 : null,
    payroll12m,
    revenue12m,
    referenceMonth,
    referenceYear,
    companyName,
    cnpj,
    cnpjIsPartial,
    folhaAusente,
    notApplicable,
    status,
    shouldAlert: (status === 'attention' || status === 'critical') && confidence >= 0.75,
    confidence: Math.min(confidence, 0.98),
    warnings,
    metadata: {
      source,
      declaredFatorR: declared.fatorRValue,
      computedFatorR: computedFatorRValue,
      folhaAusente,
      cnpjIsPartial,
    },
  };
}

export const parseFatorRFromText = parsePgdasFatorR;
