import type { Empresa, Guia, IntegrationHealth, MatchSource } from '@/data/types';
import { validateCNPJ, validateEmail } from '@/lib/formatters';

/** Minimum text length (after normalization) considered usable for identification. */
export const MIN_PDF_TEXT_LENGTH = 40;

export function normalizeCnpj(value: string) {
  return (value || '').replace(/\D/g, '');
}

export function extractCnpjCandidates(value: string) {
  const matches = value.match(/\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[/\s-]?\d{4}[-\s]?\d{2}/g) || [];
  return [...new Set(matches.map(normalizeCnpj).filter(validateCNPJ))];
}

export function hasPdfSignals(text: string) {
  if (!text) return false;
  const due = /(?:vencimento|venc\.)\s*[:-]?\s*\d{2}\/\d{2}\/\d{4}/i.test(text);
  const amount = /(?:valor(?:\s+total)?|total)\s*[:-]?\s*R?\$?\s*[\d.]+,\d{2}/i.test(text);
  const kind = /\b(DAS|DARF|FGTS|INSS|ICMS|ISS|GPS|DAE)\b/i.test(text);
  // any two of: due/amount/kind are enough to trust the document
  return [due, amount, kind].filter(Boolean).length >= 2;
}

export interface IdentityResult {
  automatic: boolean;
  cnpj: string | null;
  empresa: Empresa | null;
  source: MatchSource;
  reason: string | null;
}

export function evaluateIdentity(
  fileName: string,
  text: string,
  companies: Empresa[],
): IdentityResult {
  const fileCandidates = extractCnpjCandidates(fileName);
  const textCandidates = extractCnpjCandidates(text);
  const candidates = [...new Set([...fileCandidates, ...textCandidates])];
  const trimmed = (text || '').trim();

  // PDF has no extractable text layer at all
  if (trimmed.length === 0 && textCandidates.length === 0) {
    return {
      automatic: false,
      cnpj: fileCandidates[0] ?? null,
      empresa: null,
      source: fileCandidates.length ? 'filename' : 'none',
      reason: 'pdf_without_text_layer',
    };
  }

  const source: MatchSource = fileCandidates.length && textCandidates.length
    ? 'multiple'
    : fileCandidates.length ? 'filename' : textCandidates.length ? 'pdf_native' : 'none';

  if (fileCandidates.length === 1 && textCandidates.length === 1 && fileCandidates[0] !== textCandidates[0]) {
    return { automatic: false, cnpj: null, empresa: null, source, reason: 'filename_content_conflict' };
  }
  if (candidates.length !== 1) {
    return { automatic: false, cnpj: null, empresa: null, source, reason: 'cnpj_ambiguous' };
  }

  // CNPJ came only from filename and PDF text is too thin / lacks signals
  if (textCandidates.length === 0 && trimmed.length < MIN_PDF_TEXT_LENGTH && !hasPdfSignals(text)) {
    return { automatic: false, cnpj: candidates[0], empresa: null, source, reason: 'insufficient_pdf_signals' };
  }

  const empresa = companies.find((item) =>
    item.status === 'ativa' && normalizeCnpj(item.cnpj) === candidates[0]
  ) || null;
  if (!empresa) {
    const inactive = companies.find((item) => normalizeCnpj(item.cnpj) === candidates[0]);
    return {
      automatic: false,
      cnpj: candidates[0],
      empresa: null,
      source,
      reason: inactive ? 'company_inactive' : 'company_not_found',
    };
  }
  return {
    automatic: true,
    cnpj: candidates[0],
    empresa,
    source,
    reason: null,
  };
}

export function canDispatchToPreferredChannel(
  empresa: Empresa,
  integrationStatus: Partial<Record<'email' | 'whatsapp', IntegrationHealth>>,
) {
  if (!empresa.comunicacaoAtiva || !empresa.canalPreferido) return 'invalid_channel';
  if (integrationStatus[empresa.canalPreferido] !== 'ativo') return 'integration_inactive';
  if (empresa.canalPreferido === 'email') {
    return empresa.emailValidado && validateEmail(empresa.emailPrincipal) ? null : 'missing_email';
  }
  return empresa.whatsappOptInAt && /^\+[1-9]\d{7,14}$/.test(empresa.whatsappPrincipal)
    ? null
    : 'whatsapp_consent_missing';
}

export function buildGuideDescription(guide: Pick<Guia, 'tipoGuia' | 'competencia' | 'vencimento' | 'valor'>, empresa: Empresa) {
  const greeting = empresa.saudacaoGuia || `Ola, ${empresa.razaoSocial}.`;
  const facts = [
    guide.tipoGuia && `Guia: ${guide.tipoGuia}`,
    guide.competencia && `Competencia: ${guide.competencia}`,
    guide.vencimento && `Vencimento: ${guide.vencimento}`,
    guide.valor !== null && `Valor: R$ ${guide.valor.toFixed(2).replace('.', ',')}`,
  ].filter(Boolean).join(' | ');
  return `${greeting} Sua guia esta disponivel.${facts ? ` ${facts}.` : ''}`;
}
