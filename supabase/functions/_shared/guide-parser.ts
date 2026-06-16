// deno-lint-ignore-file no-explicit-any
// Helpers compartilhados para identificação e classificação de guias fiscais (PDFs).

export type TipoGuia = 'das' | 'fgts' | 'daf' | 'darf' | 'gps_inss' | 'iss' | 'icms' | 'outros';

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
}

export interface GuideMetadata {
  cnpjCandidates: string[];
  razaoSocial: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor: number | null;
  valorRaw: string | null;
  codigoBarras: string | null;
  identificador: string | null;
}

export interface GuideAnalysis {
  extraction: GuideExtraction;
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
}

export const MIN_TEXT_LENGTH = 40;
export const MIN_CONFIDENCE_AUTO_DISPATCH = 0.75;

export function normalizeCnpj(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

export function validCnpj(value: string): boolean {
  const c = normalizeCnpj(value);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dig = (base: string, w: number[]) => {
    const t = w.reduce((s, weight, i) => s + Number(base[i]) * weight, 0);
    const r = t % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dig(c.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = dig(c.slice(0, 12) + d1, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return c.endsWith(`${d1}${d2}`);
}

export function findCnpjCandidates(text: string): string[] {
  const matches = text.match(/\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/\s-]?\d{4}[-\s]?\d{2}/g) || [];
  const all = [...new Set(matches.map(normalizeCnpj))]
    .filter((c) => c.length === 14 && !/^(\d)\1+$/.test(c));
  return all.filter(validCnpj);
}

const TIPO_GUIA_RULES: Array<{ tipo: TipoGuia; label: string; keywords: RegExp[]; weight: number }> = [
  { tipo: 'das', label: 'DAS', weight: 1.0, keywords: [
    /\bdas\b/i, /documento\s+de\s+arrecada(?:c|ç)(?:a|ã)o\s+do\s+simples/i,
    /simples\s+nacional/i, /\bpgdas/i,
  ]},
  { tipo: 'fgts', label: 'FGTS', weight: 1.0, keywords: [
    /\bfgts\s+digital\b/i, /guia\s+do\s+fgts/i, /\bfgts\b/i,
    /fundo\s+de\s+garantia/i,
  ]},
  { tipo: 'darf', label: 'DARF', weight: 1.0, keywords: [
    /\bdarf\b/i, /documento\s+de\s+arrecada(?:c|ç)(?:a|ã)o\s+de\s+receitas\s+federais/i,
    /receita\s+federal\s+do\s+brasil/i,
  ]},
  { tipo: 'daf', label: 'DAF', weight: 1.0, keywords: [
    /\bdaf\b/i, /documento\s+de\s+arrecada(?:c|ç)(?:a|ã)o\s+federal/i,
  ]},
  { tipo: 'gps_inss', label: 'GPS/INSS', weight: 1.0, keywords: [
    /\bgps\b/i, /guia\s+da\s+previd(?:e|ê)ncia\s+social/i,
    /\binss\b/i, /previd(?:e|ê)ncia\s+social/i,
  ]},
  { tipo: 'icms', label: 'ICMS', weight: 1.0, keywords: [
    /\bicms\b/i, /imposto\s+sobre\s+circula(?:c|ç)(?:a|ã)o/i,
    /\bgnre\b/i,
  ]},
  { tipo: 'iss', label: 'ISS', weight: 1.0, keywords: [
    /\biss\b/i, /imposto\s+sobre\s+servi(?:c|ç)os/i, /\bissqn\b/i,
    /nota\s+fiscal\s+de\s+servi(?:c|ç)os\s+eletr(?:o|ô)nica/i,
  ]},
];

export function classifyGuideType(text: string): ClassifyResult {
  const scores = new Map<TipoGuia, { score: number; matches: string[]; label: string }>();
  for (const rule of TIPO_GUIA_RULES) {
    let hits = 0;
    const matched: string[] = [];
    for (const kw of rule.keywords) {
      const m = text.match(kw);
      if (m) { hits += 1; matched.push(m[0]); }
    }
    if (hits > 0) {
      scores.set(rule.tipo, { score: hits * rule.weight, matches: matched, label: rule.label });
    }
  }
  if (scores.size === 0) {
    return { tipo: 'outros', label: 'Outros', confidence: 0.2, matchedKeywords: [] };
  }
  const sorted = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  const [top, info] = sorted[0];
  const second = sorted[1]?.[1].score ?? 0;
  // Confiança: forte se >=2 keywords e gap >= 2 sobre segundo lugar
  const gap = info.score - second;
  const confidence = Math.min(1, 0.55 + Math.min(0.3, info.score * 0.12) + Math.min(0.15, gap * 0.05));
  return { tipo: top, label: info.label, confidence: Number(confidence.toFixed(2)), matchedKeywords: info.matches };
}

export function extractMetadata(text: string): GuideMetadata {
  const cnpjs = findCnpjCandidates(text);

  const competencia = (text.match(/(?:compet[eê]ncia|per[ií]odo\s+de\s+apura(?:c|ç)(?:a|ã)o|per[ií]odo)\s*[:\-]?\s*(\d{2}\/\d{4})/i)?.[1])
    || (text.match(/\b(\d{2}\/\d{4})\b/)?.[1])
    || null;

  const dueRaw = text.match(/(?:vencimento|venc\.|data\s+de\s+vencimento|pagar\s+at[eé])\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;
  const vencimento = dueRaw ? dueRaw.split('/').reverse().join('-') : null;

  const valorRaw = text.match(/(?:valor\s+total\s+(?:do\s+documento|a\s+pagar)?|valor\s+do\s+documento|total\s+a\s+pagar|valor)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i)?.[1]
    || text.match(/R\$\s*([\d.]+,\d{2})/)?.[1]
    || null;
  const valor = valorRaw ? Number(valorRaw.replace(/\./g, '').replace(',', '.')) : null;

  // Código de barras (47 ou 48 dígitos com pontos/espaços)
  const barrasMatch = text.match(/\b(\d{5}[.\s]?\d{5}\s?\d{5}[.\s]?\d{6}\s?\d{5}[.\s]?\d{6}\s?\d\s?\d{14})/);
  const codigoBarras = barrasMatch?.[1]?.replace(/\D/g, '') || null;

  const identificador = text.match(/(?:n[uú]mero\s+do\s+documento|n[uú]mero\s+da\s+guia|identificador|c[oó]digo\s+de\s+barras)\s*[:\-]?\s*([A-Z0-9.\-\/]{6,})/i)?.[1] || null;

  // Razão social - heurística simples (primeira linha com >= 3 palavras em caixa alta perto do CNPJ)
  let razaoSocial: string | null = null;
  if (cnpjs.length > 0) {
    const cnpjFmt = cnpjs[0];
    const idx = text.toUpperCase().indexOf(cnpjFmt.slice(-4));
    if (idx > 0) {
      const around = text.slice(Math.max(0, idx - 200), idx);
      const linha = around.split(/[\n\r]/).reverse().find((l) => l.trim().length > 8 && !/cnpj/i.test(l));
      razaoSocial = linha?.trim().slice(0, 120) || null;
    }
  }

  return {
    cnpjCandidates: cnpjs,
    razaoSocial,
    competencia,
    vencimento,
    valor,
    valorRaw,
    codigoBarras,
    identificador,
  };
}

export function calculateConfidence(metadata: GuideMetadata, classification: ClassifyResult, cnpjMatchedCompany: boolean) {
  const cnpj = cnpjMatchedCompany ? 1.0 : (metadata.cnpjCandidates.length === 1 ? 0.6 : 0.0);
  const tipo = classification.confidence;
  const competencia = metadata.competencia ? 1.0 : 0.0;
  const vencimento = metadata.vencimento ? 1.0 : 0.0;
  const valor = metadata.valor != null ? 1.0 : 0.0;
  const overall = (cnpj * 0.40) + (tipo * 0.20) + (competencia * 0.15) + (vencimento * 0.15) + (valor * 0.10);
  return {
    fieldConfidence: { cnpj, tipo, competencia, vencimento, valor },
    overallConfidence: Number(overall.toFixed(2)),
  };
}

/** Hash determinístico para detecção de duplicidade */
export async function dedupHash(parts: { cnpj: string; tipo: string; competencia: string | null; vencimento: string | null; valor: number | null }): Promise<string> {
  const raw = `${parts.cnpj}|${parts.tipo}|${parts.competencia || ''}|${parts.vencimento || ''}|${parts.valor ?? ''}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\[([A-Z_]+)\]/g, (m, key) => data[key] ?? m);
}

export function buildTemplateData(args: {
  empresa: string; cnpj: string; tipoGuia: string;
  competencia: string | null; vencimento: string | null; valor: number | null;
}): Record<string, string> {
  const fmtDate = (iso: string | null) => iso ? iso.split('-').reverse().join('/') : '—';
  const fmtVal = (v: number | null) => v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : '—';
  return {
    EMPRESA: args.empresa,
    CNPJ: args.cnpj,
    TIPO_GUIA: args.tipoGuia.toUpperCase(),
    COMPETENCIA: args.competencia || '—',
    VENCIMENTO: fmtDate(args.vencimento),
    VALOR: fmtVal(args.valor),
  };
}

export function slugifyEmpresa(razao: string, cnpj: string): string {
  const clean = razao.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return `${clean} — ${cnpj}`;
}

export function competenciaToFolder(competencia: string | null, vencimento: string | null): string {
  if (competencia && /^\d{2}\/\d{4}$/.test(competencia)) {
    const [m, y] = competencia.split('/');
    return `${y}-${m}`;
  }
  if (vencimento && /^\d{4}-\d{2}-\d{2}$/.test(vencimento)) {
    return vencimento.slice(0, 7);
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}