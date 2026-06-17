// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any, no-control-regex, no-useless-escape */
// Shared helpers for fiscal guide identification, validation and safe routing.

export type TipoGuia = 'das' | 'fgts' | 'daf' | 'darf' | 'gps_inss' | 'iss' | 'icms' | 'outros';
export type FieldStatus = 'valid' | 'dubious' | 'missing' | 'invalid';
export type CnpjRole = 'contribuinte' | 'emissor' | 'terceiro' | 'desconhecido';
export type ReviewLevel = 'none' | 'quick' | 'full';
export type DecisionRoute =
  | 'nao_identificada'
  | 'duplicada'
  | 'revisao_manual'
  | 'quarentena'
  | 'pronta_envio'
  | 'erro';

export interface GuideExtraction {
  text: string;
  pageCount: number;
  hasTextLayer: boolean;
  extractionMethod: string;
}

export interface ClassifyResult {
  tipo: TipoGuia;
  label: string;
  confidence: number;
  matchedKeywords: string[];
  competingTypes?: Array<{ tipo: TipoGuia; score: number; label: string }>;
}

export interface FieldEvidence<T = string | number | null> {
  value: T;
  confidence: number;
  source: string;
  method: string;
  justification: string;
  status: FieldStatus;
  raw?: string | null;
  occurrences?: string[];
}

export interface CnpjCandidate {
  value: string;
  formatted: string;
  valid: boolean;
  role: CnpjRole;
  confidence: number;
  source: string;
  context: string;
}

export interface GuideMetadata {
  cnpjCandidates: string[];
  allCnpjCandidates: CnpjCandidate[];
  invalidCnpjCandidates: string[];
  primaryCnpj: string | null;
  cnpjAmbiguous: boolean;
  razaoSocial: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor: number | null;
  valorRaw: string | null;
  codigoBarras: string | null;
  identificador: string | null;
  fields: {
    cnpj: FieldEvidence<string | null>;
    tipo_guia: FieldEvidence<TipoGuia | null>;
    competencia: FieldEvidence<string | null>;
    vencimento: FieldEvidence<string | null>;
    valor: FieldEvidence<number | null>;
  };
}

export interface ExtractionIssue {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  field?: string;
}

export interface GuideAnalysis {
  extraction?: GuideExtraction;
  metadata: GuideMetadata;
  classification: ClassifyResult;
  fieldConfidence: {
    cnpj: number;
    tipo: number;
    competencia: number;
    vencimento: number;
    valor: number;
  };
  overallConfidence: number;
  issues: ExtractionIssue[];
}

interface ExtractorResult {
  tipo: TipoGuia;
  label: string;
  confidence: number;
  matchedKeywords: string[];
  score: number;
  fields: Partial<GuideMetadata['fields']> & {
    codigoBarras?: FieldEvidence<string | null>;
    identificador?: FieldEvidence<string | null>;
  };
}

type FieldName = 'competencia' | 'vencimento' | 'valor';

export const MIN_TEXT_LENGTH = 40;
export const MIN_CONFIDENCE_AUTO_DISPATCH = 0.92;
export const MIN_CONFIDENCE_FAST_REVIEW = 0.85;
export const MAX_EMAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const TYPE_LABELS: Record<TipoGuia, string> = {
  das: 'DAS',
  fgts: 'FGTS Digital',
  daf: 'DAF',
  darf: 'DARF',
  gps_inss: 'GPS/INSS',
  iss: 'ISS',
  icms: 'ICMS',
  outros: 'Outros',
};

const REQUIRED_TEMPLATE_PLACEHOLDERS = ['EMPRESA', 'CNPJ', 'TIPO_GUIA', 'COMPETENCIA', 'VENCIMENTO', 'VALOR'];

const validField = <T>(
  value: T,
  confidence: number,
  source: string,
  method: string,
  justification: string,
  raw?: string | null,
  occurrences?: string[],
): FieldEvidence<T> => ({
  value,
  confidence: clampScore(confidence),
  source,
  method,
  justification,
  status: 'valid',
  raw,
  occurrences,
});

const missingField = <T = null>(source: string, method: string, justification: string): FieldEvidence<T | null> => ({
  value: null,
  confidence: 0,
  source,
  method,
  justification,
  status: 'missing',
});

const invalidField = <T = null>(value: T | null, source: string, method: string, justification: string): FieldEvidence<T | null> => ({
  value,
  confidence: 0,
  source,
  method,
  justification,
  status: 'invalid',
});

const dubiousField = <T>(
  value: T,
  confidence: number,
  source: string,
  method: string,
  justification: string,
  raw?: string | null,
  occurrences?: string[],
): FieldEvidence<T> => ({
  value,
  confidence: clampScore(confidence),
  source,
  method,
  justification,
  status: 'dubious',
  raw,
  occurrences,
});

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function normalizeText(text: string) {
  return (text || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeCnpj(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

export function formatCnpj(value: string): string {
  const c = normalizeCnpj(value);
  if (c.length !== 14) return value;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

export function validCnpj(value: string): boolean {
  const c = normalizeCnpj(value);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const digit = (base: string, weights: number[]) => {
    const total = weights.reduce((sum, weight, index) => sum + Number(base[index]) * weight, 0);
    const rest = total % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = digit(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digit(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c.endsWith(`${d1}${d2}`);
}

function classifyCnpjRole(context: string): { role: CnpjRole; confidence: number } {
  const lower = context.toLowerCase();
  if (/(contribuinte|cnpj do contribuinte|empregador|cnpj\/cpf do empregador|cpf\/cnpj do empregador|inscri[cç][aã]o do contribuinte|respons[aá]vel tribut[aá]rio)/i.test(lower)) {
    return { role: 'contribuinte', confidence: 0.95 };
  }
  if (/(receita federal|procuradoria|secretaria da fazenda|prefeitura|munic[ií]pio|caixa econ[oô]mica|minist[eé]rio|org[aã]o emissor|benefici[aá]rio)/i.test(lower)) {
    return { role: 'emissor', confidence: 0.62 };
  }
  if (/(tomador|prestador|terceiro|fornecedor|intermedi[aá]rio)/i.test(lower)) {
    return { role: 'terceiro', confidence: 0.55 };
  }
  return { role: 'desconhecido', confidence: 0.45 };
}

export function extractCnpjOccurrences(text: string): CnpjCandidate[] {
  const source = normalizeText(text);
  const regex = /\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/\s-]?\d{4}[-\s]?\d{2}/g;
  const byValue = new Map<string, CnpjCandidate>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const value = normalizeCnpj(match[0]);
    if (value.length !== 14) continue;
    const contextStart = Math.max(0, match.index - 90);
    const contextEnd = Math.min(source.length, match.index + match[0].length + 90);
    const context = source.slice(contextStart, contextEnd);
    const role = classifyCnpjRole(context);
    const candidate: CnpjCandidate = {
      value,
      formatted: formatCnpj(value),
      valid: validCnpj(value),
      role: role.role,
      confidence: role.confidence,
      source: 'texto_pdf_regex_cnpj',
      context,
    };
    const existing = byValue.get(value);
    if (!existing || candidate.confidence > existing.confidence) byValue.set(value, candidate);
  }
  return [...byValue.values()];
}

export function findCnpjCandidates(text: string): string[] {
  return extractCnpjOccurrences(text).filter((candidate) => candidate.valid).map((candidate) => candidate.value);
}

function buildCnpjField(candidates: CnpjCandidate[]): FieldEvidence<string | null> {
  const valid = candidates.filter((candidate) => candidate.valid);
  const invalid = candidates.filter((candidate) => !candidate.valid);
  if (valid.length === 0 && invalid.length > 0) {
    return invalidField(invalid[0].formatted, 'texto_pdf_regex_cnpj', 'cnpj_digit_check', 'CNPJ encontrado, mas digitos verificadores invalidos.');
  }
  if (valid.length === 0) {
    return missingField('texto_pdf_regex_cnpj', 'regex_cnpj', 'Nenhum CNPJ valido foi encontrado no texto do PDF.');
  }
  if (valid.length > 1) {
    return dubiousField(
      valid[0].value,
      0.45,
      'texto_pdf_regex_cnpj',
      'multi_cnpj_detection',
      'Mais de um CNPJ valido foi encontrado; envio automatico bloqueado.',
      valid.map((candidate) => candidate.formatted).join(', '),
      valid.map((candidate) => `${candidate.formatted} (${candidate.role})`),
    );
  }
  const only = valid[0];
  const confidence = only.role === 'contribuinte' ? 0.99 : 0.92;
  return validField(only.value, confidence, only.source, 'cnpj_digit_check', `CNPJ valido com papel ${only.role}.`, only.formatted);
}

const amountRegex = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i;

function parseMoney(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function findFirst(patterns: RegExp[], text: string): { value: string; raw: string; source: string } | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return { value: match[1], raw: match[0], source: pattern.source };
    }
  }
  return null;
}

function extractCompetencia(text: string, extraPatterns: RegExp[] = []): FieldEvidence<string | null> {
  const patterns = [
    ...extraPatterns,
    /(?:compet[eê]ncia|comp\.?|per[ií]odo\s+de\s+apura[cç][aã]o|per[ií]odo|refer[eê]ncia|pa)\s*[:\-]?\s*(\d{2}\/\d{4})/i,
    /\b(0[1-9]|1[0-2])\/(20\d{2})\b/i,
  ];
  const found = findFirst(patterns, text);
  if (!found) return missingField('texto_pdf_competencia', 'regex_competencia', 'Competencia nao encontrada.');
  const value = found.value.includes('/') ? found.value : `${found.value}/${found.raw.match(/20\d{2}/)?.[0] ?? ''}`;
  if (!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(value)) {
    return invalidField(value, 'texto_pdf_competencia', 'regex_competencia', 'Competencia fora do formato MM/AAAA.');
  }
  return validField(value, found.raw.toLowerCase().includes('compet') || found.raw.toLowerCase().includes('apura') ? 0.98 : 0.9, 'texto_pdf_competencia', 'regex_competencia', 'Competencia extraida do texto.', found.raw);
}

function toIsoDate(raw: string): string | null {
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() + 1 !== Number(month) || parsed.getUTCDate() !== Number(day)) return null;
  return iso;
}

function extractVencimento(text: string, extraPatterns: RegExp[] = []): FieldEvidence<string | null> {
  const patterns = [
    ...extraPatterns,
    /(?:vencimento|venc\.|data\s+de\s+vencimento|pagar\s+at[eé]|data\s+limite)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
    /\b(\d{2}\/\d{2}\/20\d{2})\b/i,
  ];
  const found = findFirst(patterns, text);
  if (!found) return missingField('texto_pdf_vencimento', 'regex_data', 'Vencimento nao encontrado.');
  const iso = toIsoDate(found.value);
  if (!iso) return invalidField(found.value, 'texto_pdf_vencimento', 'date_validation', 'Vencimento invalido.');
  const strongLabel = /(vencimento|venc\.|pagar|limite)/i.test(found.raw);
  return validField(iso, strongLabel ? 0.98 : 0.88, 'texto_pdf_vencimento', 'regex_data', 'Vencimento extraido do texto.', found.raw);
}

function extractValor(text: string, labels: RegExp[] = []): FieldEvidence<number | null> {
  const candidates: Array<{ value: number; raw: string; confidence: number; source: string }> = [];
  for (const label of labels) {
    const regex = new RegExp(`${label.source}\\s*[:\\-]?\\s*R?\\$?\\s*(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2})`, 'i');
    const match = text.match(regex);
    const value = parseMoney(match?.[1]);
    if (value != null) candidates.push({ value, raw: match![0], confidence: 0.98, source: label.source });
  }
  const genericPatterns = [
    /(?:valor\s+total\s+(?:do\s+documento|a\s+pagar|da\s+guia)?|total\s+a\s+pagar|valor\s+a\s+recolher|valor\s+do\s+documento)\s*[:\-]?\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i,
    /(?:valor)\s*[:\-]?\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i,
    /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i,
  ];
  for (const pattern of genericPatterns) {
    const match = text.match(pattern);
    const value = parseMoney(match?.[1]);
    if (value != null) candidates.push({ value, raw: match![0], confidence: pattern.source.includes('total') ? 0.94 : 0.82, source: pattern.source });
  }
  if (candidates.length === 0) return missingField('texto_pdf_valor', 'regex_monetario', 'Valor total nao encontrado.');
  candidates.sort((a, b) => b.confidence - a.confidence);
  const top = candidates[0];
  const distinct = [...new Set(candidates.map((candidate) => candidate.value.toFixed(2)))];
  if (distinct.length > 1 && top.confidence < 0.94) {
    return dubiousField(top.value, 0.78, 'texto_pdf_valor', 'regex_monetario', 'Multiplos valores monetarios encontrados sem rotulo forte de total.', top.raw, distinct);
  }
  return validField(top.value, top.confidence, 'texto_pdf_valor', 'regex_monetario', 'Valor total extraido com rotulo compativel.', top.raw);
}

function extractCodigoBarras(text: string): FieldEvidence<string | null> {
  const match = text.match(/\b(\d{5}[.\s]?\d{5}\s?\d{5}[.\s]?\d{6}\s?\d{5}[.\s]?\d{6}\s?\d\s?\d{14}|\d{44,48})\b/);
  const value = match?.[1]?.replace(/\D/g, '') || null;
  if (!value) return missingField('texto_pdf_codigo_barras', 'regex_codigo_barras', 'Codigo de barras nao encontrado.');
  return validField(value, value.length >= 44 ? 0.93 : 0.84, 'texto_pdf_codigo_barras', 'regex_codigo_barras', 'Codigo de barras/linha digitavel encontrado.', match?.[0] ?? value);
}

function extractIdentificador(text: string): FieldEvidence<string | null> {
  const match = text.match(/(?:n[uú]mero\s+do\s+documento|n[uú]mero\s+da\s+guia|identificador|c[oó]digo\s+de\s+barras|documento)\s*[:\-]?\s*([A-Z0-9.\-\/]{6,})/i);
  if (!match?.[1]) return missingField('texto_pdf_identificador', 'regex_identificador', 'Identificador da guia nao encontrado.');
  return validField(match[1], 0.88, 'texto_pdf_identificador', 'regex_identificador', 'Identificador extraido do texto.', match[0]);
}

function keywordScore(text: string, keywords: RegExp[]): { score: number; matches: string[] } {
  let score = 0;
  const matches: string[] = [];
  for (const keyword of keywords) {
    const match = text.match(keyword);
    if (match) {
      score += 1;
      matches.push(match[0]);
    }
  }
  return { score, matches };
}

function buildExtractor(
  tipo: TipoGuia,
  text: string,
  strongKeywords: RegExp[],
  auxKeywords: RegExp[],
  fieldHints: Partial<Record<FieldName, RegExp[]>> = {},
): ExtractorResult {
  const strong = keywordScore(text, strongKeywords);
  const aux = keywordScore(text, auxKeywords);
  const score = (strong.score * 3) + aux.score;
  const confidence = score === 0 ? 0 : clampScore(Math.min(0.99, 0.48 + (strong.score * 0.16) + (aux.score * 0.06)));
  return {
    tipo,
    label: TYPE_LABELS[tipo],
    confidence,
    matchedKeywords: [...strong.matches, ...aux.matches],
    score,
    fields: {
      competencia: extractCompetencia(text, fieldHints.competencia),
      vencimento: extractVencimento(text, fieldHints.vencimento),
      valor: extractValor(text, fieldHints.valor),
      codigoBarras: extractCodigoBarras(text),
      identificador: extractIdentificador(text),
    },
  };
}

export function extractDASData(text: string): ExtractorResult {
  return buildExtractor('das', text, [
    /\bdas\b/i,
    /documento\s+de\s+arrecada[cç][aã]o\s+do\s+simples/i,
    /simples\s+nacional/i,
  ], [
    /\bpgdas\b/i,
    /\bpa\b/i,
    /valor\s+total\s+do\s+documento/i,
  ], {
    competencia: [/PA\s*[:\-]?\s*(\d{2}\/\d{4})/i],
    valor: [/valor\s+total\s+do\s+documento/i, /total\s+a\s+pagar/i],
  });
}

export function extractFGTSDigitalData(text: string): ExtractorResult {
  return buildExtractor('fgts', text, [
    /\bfgts\s+digital\b/i,
    /guia\s+do\s+fgts\s+digital/i,
    /fundo\s+de\s+garantia/i,
  ], [
    /\bfgts\b/i,
    /empregador/i,
    /valor\s+a\s+recolher/i,
  ], {
    valor: [/valor\s+a\s+recolher/i, /total\s+a\s+recolher/i],
  });
}

export function extractDAFData(text: string): ExtractorResult {
  return buildExtractor('daf', text, [
    /\bdaf\b/i,
    /documento\s+de\s+arrecada[cç][aã]o\s+federal/i,
  ], [
    /regularize/i,
    /valor\s+total/i,
  ], {
    valor: [/valor\s+total/i, /total\s+a\s+pagar/i],
  });
}

export function extractDARFData(text: string): ExtractorResult {
  return buildExtractor('darf', text, [
    /\bdarf\b/i,
    /documento\s+de\s+arrecada[cç][aã]o\s+de\s+receitas\s+federais/i,
  ], [
    /receita\s+federal\s+do\s+brasil/i,
    /c[oó]digo\s+da\s+receita/i,
    /per[ií]odo\s+de\s+apura[cç][aã]o/i,
    /valor\s+principal/i,
    /valor\s+total/i,
  ], {
    competencia: [/per[ií]odo\s+de\s+apura[cç][aã]o\s*[:\-]?\s*(\d{2}\/\d{4})/i],
    valor: [/valor\s+total/i, /valor\s+principal/i],
  });
}

export function extractGPSINSSData(text: string): ExtractorResult {
  return buildExtractor('gps_inss', text, [
    /\bgps\b/i,
    /guia\s+da\s+previd[eê]ncia\s+social/i,
    /\binss\b/i,
  ], [
    /previd[eê]ncia\s+social/i,
    /compet[eê]ncia/i,
    /identificador/i,
  ], {
    valor: [/valor\s+do\s+inss/i, /valor\s+total/i],
  });
}

export function extractISSData(text: string): ExtractorResult {
  return buildExtractor('iss', text, [
    /\biss\b/i,
    /\bissqn\b/i,
    /imposto\s+sobre\s+servi[cç]os/i,
  ], [
    /nota\s+fiscal\s+de\s+servi[cç]os/i,
    /prefeitura/i,
    /tomador/i,
  ], {
    valor: [/valor\s+do\s+iss/i, /valor\s+total/i],
  });
}

export function extractICMSData(text: string): ExtractorResult {
  return buildExtractor('icms', text, [
    /\bicms\b/i,
    /imposto\s+sobre\s+circula[cç][aã]o/i,
    /\bgnre\b/i,
  ], [
    /receita\s+estadual/i,
    /secretaria\s+da\s+fazenda/i,
    /valor\s+principal/i,
  ], {
    valor: [/valor\s+total/i, /valor\s+principal/i],
  });
}

export function extractGenericGuideData(text: string): ExtractorResult {
  return buildExtractor('outros', text, [
    /guia\s+de\s+recolhimento/i,
    /documento\s+de\s+arrecada[cç][aã]o/i,
  ], [
    /compet[eê]ncia/i,
    /vencimento/i,
    /valor/i,
  ], {
    valor: [/valor\s+total/i, /total\s+a\s+pagar/i],
  });
}

function runExtractors(text: string): ExtractorResult[] {
  const normalized = normalizeText(text);
  return [
    extractDASData(normalized),
    extractFGTSDigitalData(normalized),
    extractDAFData(normalized),
    extractDARFData(normalized),
    extractGPSINSSData(normalized),
    extractISSData(normalized),
    extractICMSData(normalized),
    extractGenericGuideData(normalized),
  ].sort((a, b) => b.score - a.score);
}

export function classifyGuideType(text: string): ClassifyResult {
  const sorted = runExtractors(text);
  const top = sorted[0];
  const second = sorted.find((entry) => entry.tipo !== top.tipo);
  if (!top || top.score === 0) return { tipo: 'outros', label: TYPE_LABELS.outros, confidence: 0.2, matchedKeywords: [] };

  const gap = top.score - (second?.score ?? 0);
  let confidence = top.confidence;
  if (gap <= 1 && second && second.score > 0) confidence = Math.min(confidence, 0.84);
  if (['das', 'daf', 'darf'].includes(top.tipo) && second && ['das', 'daf', 'darf'].includes(second.tipo) && gap < 3) {
    confidence = Math.min(confidence, 0.83);
  }

  return {
    tipo: top.tipo,
    label: top.label,
    confidence: clampScore(confidence),
    matchedKeywords: top.matchedKeywords,
    competingTypes: sorted
      .filter((entry) => entry.score > 0)
      .slice(0, 3)
      .map((entry) => ({ tipo: entry.tipo, score: entry.score, label: entry.label })),
  };
}

function pickExtractor(text: string, classification: ClassifyResult): ExtractorResult {
  return runExtractors(text).find((entry) => entry.tipo === classification.tipo) ?? extractGenericGuideData(text);
}

function extractRazaoSocial(text: string, cnpj: string | null): string | null {
  if (!cnpj) return null;
  const normalized = normalizeText(text);
  const variants = [formatCnpj(cnpj), cnpj];
  const index = variants.map((variant) => normalized.indexOf(variant)).find((value) => value >= 0) ?? -1;
  if (index < 0) return null;
  const around = normalized.slice(Math.max(0, index - 220), index + 80);
  const lines = around.split(/(?:\s{2,}|[\r\n]+)/).map((line) => line.trim()).filter(Boolean);
  const candidate = lines.reverse().find((line) =>
    line.length >= 8 &&
    !/cnpj|cpf|receita|secretaria|documento|vencimento|valor/i.test(line) &&
    /[A-Z]{3,}/.test(line)
  );
  return candidate?.slice(0, 140) || null;
}

export function extractMetadata(text: string): GuideMetadata {
  const normalized = normalizeText(text);
  const cnpjOccurrences = extractCnpjOccurrences(normalized);
  const validCnpjs = cnpjOccurrences.filter((candidate) => candidate.valid);
  const invalidCnpjs = cnpjOccurrences.filter((candidate) => !candidate.valid).map((candidate) => candidate.value);
  const cnpjField = buildCnpjField(cnpjOccurrences);
  const primaryCnpj = validCnpjs.length === 1 ? validCnpjs[0].value : null;
  const classification = classifyGuideType(normalized);
  const extractor = pickExtractor(normalized, classification);
  const typeField: FieldEvidence<TipoGuia | null> = classification.confidence >= 0.92
    ? validField(classification.tipo, classification.confidence, 'guide_type_classifier', 'specialized_keyword_classifier', 'Tipo de guia classificado por extrator especializado.', classification.matchedKeywords.join(', '))
    : dubiousField(classification.tipo, classification.confidence, 'guide_type_classifier', 'specialized_keyword_classifier', 'Tipo de guia sem confianca suficiente para envio automatico.', classification.matchedKeywords.join(', '));

  const competencia = extractor.fields.competencia ?? extractCompetencia(normalized);
  const vencimento = extractor.fields.vencimento ?? extractVencimento(normalized);
  const valor = extractor.fields.valor ?? extractValor(normalized);
  const codigoBarras = extractor.fields.codigoBarras ?? extractCodigoBarras(normalized);
  const identificador = extractor.fields.identificador ?? extractIdentificador(normalized);

  return {
    cnpjCandidates: validCnpjs.map((candidate) => candidate.value),
    allCnpjCandidates: cnpjOccurrences,
    invalidCnpjCandidates: invalidCnpjs,
    primaryCnpj,
    cnpjAmbiguous: validCnpjs.length > 1,
    razaoSocial: extractRazaoSocial(normalized, primaryCnpj),
    competencia: competencia.value,
    vencimento: vencimento.value,
    valor: valor.value,
    valorRaw: valor.raw ?? null,
    codigoBarras: codigoBarras.value,
    identificador: identificador.value,
    fields: {
      cnpj: cnpjField,
      tipo_guia: typeField,
      competencia,
      vencimento,
      valor,
    },
  };
}

function compareCompetenciaVencimento(competencia: string | null, vencimento: string | null, tipo: TipoGuia): ExtractionIssue[] {
  if (!competencia || !vencimento) return [];
  const [monthText, yearText] = competencia.split('/');
  const compMonth = Number(monthText);
  const compYear = Number(yearText);
  const due = new Date(`${vencimento}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return [{ code: 'invalid_due_date', severity: 'error', message: 'Vencimento invalido.', field: 'vencimento' }];
  const dueIndex = due.getUTCFullYear() * 12 + due.getUTCMonth();
  const compIndex = compYear * 12 + (compMonth - 1);
  const diff = dueIndex - compIndex;
  const maxMonths = tipo === 'fgts' ? 2 : 3;
  if (diff < 0 || diff > maxMonths) {
    return [{
      code: 'competencia_due_inconsistent',
      severity: 'warning',
      message: 'Vencimento fora da janela esperada para a competencia e tipo de guia.',
      field: 'vencimento',
    }];
  }
  return [];
}

function barcodeAmount(text: string | null): number | null {
  const digits = (text || '').replace(/\D/g, '');
  if (digits.length < 44) return null;
  const amountDigits = digits.slice(-10);
  if (!/^\d{10}$/.test(amountDigits)) return null;
  const cents = Number(amountDigits);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return cents / 100;
}

export function collectValidationIssues(metadata: GuideMetadata, classification: ClassifyResult): ExtractionIssue[] {
  const issues: ExtractionIssue[] = [];
  if (metadata.invalidCnpjCandidates.length > 0 && metadata.cnpjCandidates.length === 0) {
    issues.push({ code: 'cnpj_invalid', severity: 'error', message: 'CNPJ encontrado com digitos verificadores invalidos.', field: 'cnpj' });
  }
  if (metadata.cnpjCandidates.length === 0) {
    issues.push({ code: 'cnpj_missing', severity: 'error', message: 'Nenhum CNPJ valido encontrado.', field: 'cnpj' });
  }
  if (metadata.cnpjCandidates.length > 1) {
    issues.push({ code: 'multiple_cnpj', severity: 'warning', message: 'Mais de um CNPJ valido encontrado no PDF.', field: 'cnpj' });
  }
  if (classification.confidence < MIN_CONFIDENCE_AUTO_DISPATCH) {
    issues.push({ code: 'guide_type_low_confidence', severity: 'warning', message: 'Tipo de guia abaixo do limite de automacao.', field: 'tipo_guia' });
  }
  for (const [field, evidence] of Object.entries(metadata.fields)) {
    if (evidence.status === 'missing') {
      issues.push({ code: `${field}_missing`, severity: 'warning', message: `Campo critico ausente: ${field}.`, field });
    }
    if (evidence.status === 'invalid') {
      issues.push({ code: `${field}_invalid`, severity: 'error', message: `Campo critico invalido: ${field}.`, field });
    }
    if (evidence.status === 'dubious') {
      issues.push({ code: `${field}_dubious`, severity: 'warning', message: `Campo critico duvidoso: ${field}.`, field });
    }
  }
  issues.push(...compareCompetenciaVencimento(metadata.competencia, metadata.vencimento, classification.tipo));
  const amountFromBarcode = barcodeAmount(metadata.codigoBarras);
  if (amountFromBarcode != null && metadata.valor != null && Math.abs(amountFromBarcode - metadata.valor) > 0.01) {
    issues.push({
      code: 'barcode_amount_mismatch',
      severity: 'warning',
      message: 'Valor extraido nao confere com valor inferido do codigo de barras.',
      field: 'valor',
    });
  }
  return issues;
}

export function calculateConfidence(metadata: GuideMetadata, classification: ClassifyResult, cnpjMatchedCompany: boolean) {
  const cnpj = cnpjMatchedCompany && metadata.fields.cnpj.status === 'valid' ? 1.0 : metadata.fields.cnpj.confidence;
  const tipo = classification.confidence;
  const competencia = metadata.fields.competencia.status === 'valid' ? metadata.fields.competencia.confidence : 0;
  const vencimento = metadata.fields.vencimento.status === 'valid' ? metadata.fields.vencimento.confidence : 0;
  const valor = metadata.fields.valor.status === 'valid' ? metadata.fields.valor.confidence : 0;
  const overall = (cnpj * 0.30) + (tipo * 0.20) + (competencia * 0.15) + (vencimento * 0.17) + (valor * 0.18);
  return {
    fieldConfidence: { cnpj, tipo, competencia, vencimento, valor },
    overallConfidence: Number(overall.toFixed(2)),
  };
}

export function analyzeGuideText(text: string, cnpjMatchedCompany = false): GuideAnalysis {
  const metadata = extractMetadata(text);
  const classification = classifyGuideType(text);
  const confidence = calculateConfidence(metadata, classification, cnpjMatchedCompany);
  return {
    metadata,
    classification,
    fieldConfidence: confidence.fieldConfidence,
    overallConfidence: confidence.overallConfidence,
    issues: collectValidationIssues(metadata, classification),
  };
}

export function guideReviewLevel(confidence: number): ReviewLevel {
  if (confidence >= MIN_CONFIDENCE_AUTO_DISPATCH) return 'none';
  if (confidence >= MIN_CONFIDENCE_FAST_REVIEW) return 'quick';
  return 'full';
}

export function hasCriticalFieldProblem(fields: Record<string, FieldEvidence<any>>) {
  return Object.values(fields).some((field) => field.status !== 'valid' || field.confidence < MIN_CONFIDENCE_AUTO_DISPATCH);
}

export async function dedupHash(parts: { cnpj: string; tipo: string; competencia: string | null; vencimento: string | null; valor: number | null }): Promise<string> {
  const raw = `${normalizeCnpj(parts.cnpj)}|${parts.tipo}|${parts.competencia || ''}|${parts.vencimento || ''}|${parts.valor == null ? '' : Number(parts.valor).toFixed(2)}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function probableDedupHash(parts: { cnpj: string; tipo: string; competencia: string | null }): Promise<string> {
  const raw = `${normalizeCnpj(parts.cnpj)}|${parts.tipo}|${parts.competencia || ''}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\[([A-Z_]+)\]/g, (match, key) => data[key] ?? match);
}

export function buildTemplateData(args: {
  empresa: string;
  cnpj: string;
  tipoGuia: string;
  competencia: string | null;
  vencimento: string | null;
  valor: number | null;
}): Record<string, string> {
  const fmtDate = (iso: string | null) => iso ? iso.split('-').reverse().join('/') : '';
  const fmtVal = (value: number | null) => value != null ? `R$ ${value.toFixed(2).replace('.', ',')}` : '';
  return {
    EMPRESA: args.empresa || '',
    CNPJ: formatCnpj(args.cnpj || ''),
    TIPO_GUIA: args.tipoGuia.toUpperCase(),
    COMPETENCIA: args.competencia || '',
    VENCIMENTO: fmtDate(args.vencimento),
    VALOR: fmtVal(args.valor),
  };
}

export function unresolvedPlaceholders(value: string | null | undefined): string[] {
  const matches = (value || '').match(/\[[A-Z_]+\]/g) || [];
  return [...new Set(matches)];
}

export function validateTemplateRender(args: {
  template: any;
  canal: 'email' | 'whatsapp';
  tipo: TipoGuia;
  renderedSubject: string | null;
  renderedBody: string;
}): string[] {
  const errors: string[] = [];
  if (!args.template || args.template.ativo === false) errors.push('template_inactive');
  if (args.template?.tipo_guia && args.template.tipo_guia !== args.tipo && args.template.tipo_guia !== 'outros') errors.push('template_type_mismatch');
  if (args.template?.canal && args.template.canal !== args.canal) errors.push('template_channel_mismatch');
  if (!args.renderedBody?.trim()) errors.push('template_body_empty');
  if (args.canal === 'email' && !args.renderedSubject?.trim()) errors.push('template_subject_empty');
  if (args.canal === 'whatsapp' && !args.template?.twilio_content_sid) errors.push('twilio_content_sid_missing');
  for (const placeholder of REQUIRED_TEMPLATE_PLACEHOLDERS) {
    const rawSubject = args.template?.assunto || '';
    const rawBody = args.template?.corpo || '';
    if (!rawSubject.includes(`[${placeholder}]`) && !rawBody.includes(`[${placeholder}]`)) {
      errors.push(`placeholder_${placeholder.toLowerCase()}_missing`);
    }
  }
  const unresolved = [...unresolvedPlaceholders(args.renderedSubject), ...unresolvedPlaceholders(args.renderedBody)];
  if (unresolved.length > 0) errors.push(`unresolved_placeholders:${unresolved.join(',')}`);
  return errors;
}

export function validateEmailAddress(value: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
}

export function normalizePhoneE164(value: string | null | undefined): string | null {
  const raw = (value || '').trim();
  if (/^\+[1-9]\d{7,14}$/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, '');
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return `+${digits}`;
  return null;
}

export function sanitizeDriveName(name: string, maxLength = 120): string {
  return (name || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim() || 'arquivo';
}

export function slugifyEmpresa(razao: string, cnpj: string): string {
  return sanitizeDriveName(`${razao} - ${formatCnpj(cnpj)}`, 90);
}

export function competenciaToFolder(competencia: string | null, vencimento: string | null): string {
  if (competencia && /^\d{2}\/\d{4}$/.test(competencia)) {
    const [month, year] = competencia.split('/');
    return `${year}-${month}`;
  }
  if (vencimento && /^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return vencimento.slice(0, 7);
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function buildGuideDriveFileName(args: {
  tipo: string;
  competencia: string | null;
  valor: number | null;
  originalName: string;
}): string {
  const value = args.valor == null ? 'valor-pendente' : `R$ ${args.valor.toFixed(2).replace('.', ',')}`;
  const base = `${args.tipo.toUpperCase()} - ${args.competencia || 'competencia-pendente'} - ${value} - ${args.originalName || 'guia.pdf'}`;
  return sanitizeDriveName(base, 150);
}
