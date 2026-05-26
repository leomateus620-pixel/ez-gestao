import type { Empresa, Guia, IntegrationHealth, MatchSource } from '@/data/types';
import { validateCNPJ, validateEmail } from '@/lib/formatters';

export const OCR_AUTO_DISPATCH_THRESHOLD = 0.9;

export function normalizeCnpj(value: string) {
  return (value || '').replace(/\D/g, '');
}

export function extractCnpjCandidates(value: string) {
  const matches = value.match(/\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[/\s-]?\d{4}[-\s]?\d{2}/g) || [];
  return [...new Set(matches.map(normalizeCnpj).filter(validateCNPJ))];
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
  wasOcr = false,
  confidence: number | null = null,
): IdentityResult {
  const fileCandidates = extractCnpjCandidates(fileName);
  const textCandidates = extractCnpjCandidates(text);
  const candidates = [...new Set([...fileCandidates, ...textCandidates])];
  const source: MatchSource = fileCandidates.length && textCandidates.length
    ? 'multiple'
    : wasOcr ? 'ocr' : fileCandidates.length ? 'filename' : textCandidates.length ? 'pdf_text' : 'none';
  if (fileCandidates.length === 1 && textCandidates.length === 1 && fileCandidates[0] !== textCandidates[0]) {
    return { automatic: false, cnpj: null, empresa: null, source, reason: 'source_conflict' };
  }
  if (candidates.length !== 1) {
    return { automatic: false, cnpj: null, empresa: null, source, reason: 'cnpj_ambiguous' };
  }
  if (wasOcr && (confidence === null || confidence < OCR_AUTO_DISPATCH_THRESHOLD)) {
    return { automatic: false, cnpj: candidates[0], empresa: null, source, reason: 'low_ocr_confidence' };
  }
  const empresa = companies.find((item) =>
    item.status === 'ativa' && normalizeCnpj(item.cnpj) === candidates[0]
  ) || null;
  return {
    automatic: !!empresa,
    cnpj: candidates[0],
    empresa,
    source,
    reason: empresa ? null : 'company_not_found',
  };
}

export function canDispatchToPreferredChannel(
  empresa: Empresa,
  integrationStatus: Partial<Record<'email' | 'whatsapp', IntegrationHealth>>,
) {
  if (!empresa.comunicacaoAtiva || !empresa.canalPreferido) return 'channel_missing';
  if (integrationStatus[empresa.canalPreferido] !== 'ativo') return 'integration_inactive';
  if (empresa.canalPreferido === 'email') {
    return empresa.emailValidado && validateEmail(empresa.emailPrincipal) ? null : 'invalid_email';
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
