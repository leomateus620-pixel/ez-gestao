export type FatorRStatus = 'critical' | 'attention' | 'safe' | 'not_applicable' | 'parse_error' | 'unknown';

export interface FatorRParseResult {
  companyName: string | null;
  cnpj: string | null;
  cnpjBase: string | null;
  cnpjIsPartial: boolean;
  period: string | null;
  rpa: number | null;
  rbt12: number | null;
  payroll12: number | null;
  fatorR: number | null;
  fatorRPercent: number | null;
  anexo: string | null;
  dasTotal: number | null;
  paymentRecognized: boolean | null;
  notApplicable: boolean;
  status: FatorRStatus;
  shouldSendEmail: boolean;
  alertReason: string | null;
  sourceFileName: string;

  // Backward-compatible aliases used by the current UI and Edge Functions.
  fatorRValue: number | null;
  declaredFatorRValue: number | null;
  declaredFatorRPercent: number | null;
  computedFatorRValue: number | null;
  computedFatorRPercent: number | null;
  payroll12m: number | null;
  revenue12m: number | null;
  referenceMonth: number | null;
  referenceYear: number | null;
  folhaAusente: boolean;
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

const formatCnpjBase = (digits: string | null) => {
  if (!digits || digits.length < 8) return null;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}`;
};

const deriveCnpjBase = (cnpj: string | null) => {
  const digits = cnpj?.replace(/\D/g, '') ?? '';
  return formatCnpjBase(digits.slice(0, 8));
};

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
    if (establishment?.[1]) return { cnpj: establishment[1], cnpjBase: deriveCnpjBase(establishment[1]), cnpjIsPartial: false };
  }
  for (const line of lines) {
    const full = line.match(/\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}\b/);
    if (full?.[0]) return { cnpj: full[0], cnpjBase: deriveCnpjBase(full[0]), cnpjIsPartial: false };
  }
  for (const line of lines) {
    const basic = line.match(/CNPJ\s+B[aá]sico\s*:\s*(\d{2}\.?\d{3}\.?\d{3})\b/i);
    if (basic?.[1]) return { cnpj: basic[1], cnpjBase: deriveCnpjBase(basic[1]), cnpjIsPartial: true };
  }
  return { cnpj: null, cnpjBase: null, cnpjIsPartial: false };
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
      ? { referenceMonth: second, referenceYear: first, period: `${String(second).padStart(2, '0')}/${first}` }
      : { referenceMonth: first, referenceYear: second, period: `${String(first).padStart(2, '0')}/${second}` };
  }

  const apuracaoCode = text.match(/Informa[cç][oõ]es\s+da\s+Apura[cç][aã]o\s+\d{8}(20\d{2})(0[1-9]|1[0-2])\d{3}/i);
  if (apuracaoCode) {
    const referenceYear = Number(apuracaoCode[1]);
    const referenceMonth = Number(apuracaoCode[2]);
    return { referenceMonth, referenceYear, period: `${String(referenceMonth).padStart(2, '0')}/${referenceYear}` };
  }

  const named = text.match(new RegExp(`(${Object.keys(monthNames).join('|')})\\s*(?:de|/)\\s*(20\\d{2})`, 'i'));
  if (named) {
    const referenceMonth = monthNames[named[1].toLowerCase()];
    const referenceYear = Number(named[2]);
    return { referenceMonth, referenceYear, period: `${String(referenceMonth).padStart(2, '0')}/${referenceYear}` };
  }
  return { referenceMonth: null, referenceYear: null, period: null };
}

const valuesAfterMarker = (windowText: string, marker: RegExp | string) => {
  if (typeof marker === 'string') {
    const index = windowText.toLocaleLowerCase('pt-BR').indexOf(marker.toLocaleLowerCase('pt-BR'));
    return moneyValues(index >= 0 ? windowText.slice(index + marker.length) : windowText);
  }
  const match = marker.exec(windowText);
  return moneyValues(match?.index !== undefined ? windowText.slice(match.index + match[0].length) : windowText);
};

export function extractRpa(lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const windowText = `${lines[index]} ${lines[index + 1] ?? ''}`;
    if (!/Receita\s+Bruta\s+do\s+PA\s*\(RPA\)/i.test(windowText)) continue;
    const values = valuesAfterMarker(windowText, /\(RPA\)[^0-9]*/i);
    if (values.length >= 3) return values[2];
    if (values.length > 0) return values[0];
  }
  return null;
}

export function extractRbt12(lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const windowText = `${lines[index]} ${lines[index + 1] ?? ''}`;
    if (/RBT12p/i.test(windowText)) continue;
    if (!/(?:\bRBT12\b|\(RBT12\))/i.test(windowText)) continue;
    const values = valuesAfterMarker(windowText, /\(?RBT12\)?/i);
    if (values.length >= 3) return values[2];
    if (values.length > 0) return values[0];
  }
  return null;
}

export function extractFs12(lines: string[]) {
  let folhaAusente = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (!/2\.3(?:\.1)?\)?\s*(?:Total\s+de\s+)?Folhas?\s+de\s+Sal[aá]rios\s+Anteriores/i.test(lines[index])) continue;
    const windowText = lines.slice(index, index + 4).join(' ');
    if (/Nenhuma/i.test(windowText)) {
      folhaAusente = true;
      break;
    }
  }

  const taxLine = /ISS|INSS|CPP|\bDAS\b|Tributo|D[eé]bito|Total\s+Geral|Anexo\s+[IVX]+|Al[ií]quota|Receita\s+Bruta/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/2\.3\.1\)?\s*Total\s+de\s+Folhas?\s+de\s+Sal[aá]rios\s+Anteriores/i.test(line)) continue;
    const markerIndex = line.search(/\(R\$\)/i);
    if (markerIndex >= 0) {
      const values = moneyValues(line.slice(markerIndex));
      if (values.length > 0) return { payroll12m: values[0], folhaAusente: false };
    }
    const sameLine = moneyValues(line);
    if (sameLine.length > 0) return { payroll12m: sameLine[0], folhaAusente: false };
    for (let nextIndex = index + 1; nextIndex < Math.min(index + 3, lines.length); nextIndex += 1) {
      const next = lines[nextIndex];
      if (!next.trim()) continue;
      if (taxLine.test(next)) break;
      const values = moneyValues(next);
      if (values.length > 0) return { payroll12m: values[0], folhaAusente: false };
      break;
    }
  }

  return { payroll12m: null, folhaAusente };
}

export function extractFatorR(lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const windowText = `${lines[index]} ${lines[index + 1] ?? ''}`;
    const match = windowText.match(/Fator\s*r\s*=\s*(N[aã]o\s+se\s+aplica|\d{1,3}(?:[\.,]\d{1,4})?\s*%?)(?:\s*-\s*Anexo\s+([IVXLCDM]+))?/i);
    if (!match?.[1]) continue;
    if (/n[aã]o\s+se\s+aplica/i.test(match[1])) return { fatorRValue: null, notApplicable: true, anexo: null };
    return { fatorRValue: parseBrazilianDecimal(match[1]), notApplicable: false, anexo: match[2] ?? null };
  }
  return { fatorRValue: null, notApplicable: false, anexo: null };
}

export function extractDasTotal(lines: string[]) {
  for (const line of lines) {
    if (!/Principal/i.test(line) || !/\bTotal\b/i.test(line)) continue;
    const values = moneyValues(line);
    if (values.length > 0) return values[values.length - 1];
  }
  for (let index = 0; index < lines.length; index += 1) {
    if (!/IRPJ\s+CSLL\s+COFINS.*\bTotal\b/i.test(lines[index])) continue;
    const values = moneyValues(lines[index + 1] ?? '');
    if (values.length > 0) return values[values.length - 1];
  }
  return null;
}

export function extractPaymentRecognized(lines: string[]) {
  const text = lines.join(' ');
  if (/N[aã]o\s+foi\s+reconhecido\s+pagamento/i.test(text)) return false;
  if (/pagamento\s+(?:foi\s+)?(?:reconhecido|confirmado)|DAS\s+(?:pago|quitado)/i.test(text)) return true;
  return null;
}

export function extractActivitySubjectToFatorR(lines: string[]) {
  const text = lines.join(' ');
  if (/N[aã]o\s+sujeitos?\s+ao\s+fator\s*[“"']?r/i.test(text)) return false;
  if (/Sujeitos?\s+ao\s+fator\s*[“"']?r/i.test(text)) return true;
  return null;
}

export function classifyFatorR(input: number | null | Pick<FatorRParseResult, 'fatorRValue' | 'notApplicable'>): FatorRStatus {
  if (typeof input === 'object' && input !== null && input.notApplicable) return 'not_applicable';
  const value = typeof input === 'object' && input !== null ? input.fatorRValue : input;
  if (value === null || !Number.isFinite(value)) return 'parse_error';
  if (value <= FATOR_R_CRITICAL_THRESHOLD) return 'critical';
  if (value <= FATOR_R_ATTENTION_THRESHOLD) return 'attention';
  return 'safe';
}

export function getFatorRRecommendation(status: FatorRStatus) {
  if (status === 'critical') return 'Indice critico: revisar imediatamente pro-labore, folha e encargos para buscar Fator R acima de 28%.';
  if (status === 'attention') return 'Indice em atencao: alerta preventivo para avaliar pro-labore/folha antes do fechamento.';
  if (status === 'safe') return 'Fator R acima da faixa de atencao; manter acompanhamento mensal.';
  if (status === 'not_applicable') return 'Este PGDAS informa que o Fator R nao se aplica para esta apuracao.';
  return 'Nao foi possivel processar este PDF.';
}

const getAlertReason = (status: FatorRStatus, fatorRValue: number | null) => {
  if (status === 'critical') {
    if (fatorRValue !== null && fatorRValue < FATOR_R_CRITICAL_THRESHOLD) return 'Fator R abaixo do limite minimo de 28%.';
    return 'Fator R no limite minimo de 28%.';
  }
  if (status === 'attention') return 'Fator R menor ou igual a 32% e proximo do limite minimo de 28%.';
  if (status === 'not_applicable') return 'Atividade nao sujeita ao Fator R nesta apuracao.';
  if (status === 'safe') return null;
  return 'Nao foi possivel identificar o Fator R no PGDAS.';
};

export function parsePgdasFatorR(rawText: string, fileName = ''): FatorRParseResult {
  const lines = splitPdfLines(`${fileName}\n${rawText}`);
  const warnings: string[] = [];
  const companyName = extractCompanyName(lines);
  const { cnpj, cnpjBase, cnpjIsPartial } = extractCnpj(lines);
  const { referenceMonth, referenceYear, period } = extractReferencePeriod(lines);
  const rpa = extractRpa(lines);
  const revenue12m = extractRbt12(lines);
  let { payroll12m, folhaAusente } = extractFs12(lines);
  const declared = extractFatorR(lines);
  const dasTotal = extractDasTotal(lines);
  const paymentRecognized = extractPaymentRecognized(lines);
  const activitySubjectToFatorR = extractActivitySubjectToFatorR(lines);

  if (payroll12m !== null && revenue12m !== null && revenue12m > 0 && payroll12m > revenue12m) {
    warnings.push('FS12 capturado era maior que RBT12; valor descartado por indicar captura de tributo/total incorreto.');
    payroll12m = null;
  }

  const computedFatorRValue = payroll12m !== null && revenue12m !== null && revenue12m > 0 ? payroll12m / revenue12m : null;
  const fatorRValue = declared.fatorRValue ?? computedFatorRValue;
  const notApplicable = declared.notApplicable;

  if (!companyName) warnings.push('Empresa nao identificada automaticamente.');
  if (!cnpjBase) warnings.push('CNPJ basico nao identificado automaticamente.');
  if (cnpjIsPartial) warnings.push('Apenas CNPJ basico identificado; estabelecimento nao foi encontrado.');
  if (!referenceMonth || !referenceYear) warnings.push('Periodo de apuracao nao identificado automaticamente.');
  if (rpa === null) warnings.push('Receita Bruta do PA (RPA) nao identificada.');
  if (revenue12m === null) warnings.push('RBT12 nao identificado na secao de receita bruta acumulada.');
  if (payroll12m === null && !folhaAusente && !notApplicable) warnings.push('FS12 nao identificado na secao 2.3.1 de folhas de salarios anteriores.');
  if (declared.fatorRValue === null && !notApplicable && computedFatorRValue === null) warnings.push('Fator R nao identificado e calculo por FS12/RBT12 indisponivel.');
  if (declared.fatorRValue !== null && computedFatorRValue !== null && Math.abs(declared.fatorRValue - computedFatorRValue) > 0.005) {
    warnings.push('Fator R declarado difere do calculo interno; provavel arredondamento/criterio do PGDAS.');
  }

  const status = notApplicable ? 'not_applicable' : classifyFatorR(fatorRValue);
  const fieldsFound = [
    companyName,
    cnpjBase,
    period,
    rpa !== null,
    revenue12m !== null,
    dasTotal !== null,
    paymentRecognized !== null,
    declared.fatorRValue !== null || notApplicable || computedFatorRValue !== null,
  ].filter(Boolean).length;
  const confidence = status === 'parse_error'
    ? Math.min(0.68, 0.25 + fieldsFound * 0.05)
    : Math.min(0.98, Math.max(0.9, 0.62 + fieldsFound * 0.045));

  const source = declared.fatorRValue !== null && computedFatorRValue !== null
    ? 'declared_pgdas_and_computed_check'
    : declared.fatorRValue !== null
      ? 'declared_pgdas'
      : computedFatorRValue !== null
        ? 'computed_from_fs12_rbt12'
        : notApplicable
          ? 'declared_pgdas_not_applicable'
          : 'parse_error';

  const shouldSendEmail = (status === 'attention' || status === 'critical') && confidence >= 0.75;
  const alertReason = getAlertReason(status, fatorRValue);
  const fatorRPercent = fatorRValue !== null ? Number((fatorRValue * 100).toFixed(6)) : null;
  const declaredFatorRPercent = declared.fatorRValue !== null ? Number((declared.fatorRValue * 100).toFixed(6)) : null;
  const computedFatorRPercent = computedFatorRValue !== null ? Number((computedFatorRValue * 100).toFixed(6)) : null;

  return {
    companyName,
    cnpj,
    cnpjBase,
    cnpjIsPartial,
    period,
    rpa,
    rbt12: revenue12m,
    payroll12: payroll12m,
    fatorR: fatorRValue,
    fatorRPercent,
    anexo: declared.anexo,
    dasTotal,
    paymentRecognized,
    notApplicable,
    status,
    shouldSendEmail,
    alertReason,
    sourceFileName: fileName,
    fatorRValue,
    declaredFatorRValue: declared.fatorRValue,
    declaredFatorRPercent,
    computedFatorRValue,
    computedFatorRPercent,
    payroll12m,
    revenue12m,
    referenceMonth,
    referenceYear,
    folhaAusente,
    shouldAlert: shouldSendEmail,
    confidence,
    warnings,
    metadata: {
      source,
      declaredFatorR: declared.fatorRValue,
      computedFatorR: computedFatorRValue,
      rpa,
      rbt12: revenue12m,
      payroll12: payroll12m,
      anexo: declared.anexo,
      dasTotal,
      paymentRecognized,
      activitySubjectToFatorR,
      folhaAusente,
      cnpjIsPartial,
    },
  };
}

export const parseFatorRFromText = parsePgdasFatorR;
