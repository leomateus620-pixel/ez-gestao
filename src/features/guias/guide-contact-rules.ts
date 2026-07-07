import type { CanalEnvio, Empresa, Guia, GuiaExcecao } from '@/data/types';
import { validateEmail } from '@/lib/formatters';

export type GuideContactIssueKind =
  | 'missing_client'
  | 'missing_email'
  | 'missing_phone'
  | 'missing_contact_channels'
  | 'missing_channel';

export type GuideContactIssue = {
  kind: GuideContactIssueKind;
  title: string;
  description: string;
  missingFields: Array<'email' | 'phone' | 'channel' | 'client'>;
  guide: Guia;
  company: Empresa | null;
  exception: GuiaExcecao | null;
};

export type GuideContactFormValues = {
  email: string;
  phone: string;
  preferredChannel: CanalEnvio;
  observation: string;
};

const contactExceptionTypes = new Set([
  'company_not_found',
  'missing_email',
  'missing_phone',
  'missing_contact_channels',
  'missing_channel',
  'invalid_channel',
  'dispatch_precondition_failed',
]);

export function normalizeGuideEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeBrazilianPhone(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  if (/^\+[1-9]\d{7,14}$/.test(raw)) return raw;

  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return `+${digits}`;
  }
  return '';
}

export function isValidBrazilianPhone(value: string) {
  return /^\+55\d{10,11}$/.test(normalizeBrazilianPhone(value));
}

export function guideCompanyName(guide: Guia, company?: Empresa | null) {
  const critical = guide.criticalFieldsJson || {};
  const detectedName = typeof critical.razao_social === 'object' && critical.razao_social !== null
    && 'value' in critical.razao_social
    ? String((critical.razao_social as { value?: unknown }).value || '')
    : '';
  return company?.razaoSocial || detectedName || guide.fileName.replace(/\.[^.]+$/, '');
}

export function channelsForCompany(company: Empresa | null | undefined) {
  if (!company?.canalPreferido) return [];
  if (company.canalPreferido === 'ambos') return ['email', 'whatsapp'] as const;
  return [company.canalPreferido] as const;
}

export function hasValidGuideEmail(company: Empresa | null | undefined) {
  return validateEmail((company?.emailPrincipal || '').trim());
}

export function hasValidGuidePhone(company: Empresa | null | undefined) {
  return Boolean(normalizeBrazilianPhone(company?.whatsappPrincipal || ''));
}

function issueCopy(kind: GuideContactIssueKind) {
  if (kind === 'missing_client') {
    return {
      title: 'Cliente ainda não cadastrado.',
      description: 'O sistema identificou a empresa na guia, mas não encontrou cadastro com contatos para envio.',
      missingFields: ['client', 'email', 'phone', 'channel'] as GuideContactIssue['missingFields'],
    };
  }
  if (kind === 'missing_email') {
    return {
      title: 'Este cliente não possui e-mail cadastrado para envio.',
      description: 'Cadastre um e-mail válido para liberar o envio desta guia pelo canal configurado.',
      missingFields: ['email'] as GuideContactIssue['missingFields'],
    };
  }
  if (kind === 'missing_phone') {
    return {
      title: 'Este cliente não possui número de WhatsApp/celular cadastrado para envio.',
      description: 'Cadastre um celular/WhatsApp válido para liberar o envio desta guia pelo canal configurado.',
      missingFields: ['phone'] as GuideContactIssue['missingFields'],
    };
  }
  if (kind === 'missing_channel') {
    return {
      title: 'Este cliente não possui forma de envio definida.',
      description: 'Escolha se a guia deve seguir por e-mail, WhatsApp ou pelos dois canais.',
      missingFields: ['channel'] as GuideContactIssue['missingFields'],
    };
  }
  return {
    title: 'Este cliente não possui e-mail nem número de WhatsApp/celular cadastrado para envio.',
    description: 'Cadastre ao menos um canal válido e confirme a forma de envio antes de processar a guia.',
    missingFields: ['email', 'phone'] as GuideContactIssue['missingFields'],
  };
}

export function classifyGuideContactIssue(
  guide: Guia,
  company: Empresa | null,
  exceptions: GuiaExcecao[],
): GuideContactIssue | null {
  const openException = exceptions.find((entry) =>
    entry.guiaId === guide.id &&
    entry.status !== 'resolved' &&
    entry.status !== 'ignored' &&
    contactExceptionTypes.has(entry.exceptionType),
  ) || null;

  if (!company && (openException?.exceptionType === 'company_not_found' || guide.decisionReason?.toLowerCase().includes('empresa nao cadastrada'))) {
    const copy = issueCopy('missing_client');
    return { kind: 'missing_client', guide, company: null, exception: openException, ...copy };
  }

  if (!company) return null;

  const emailOk = hasValidGuideEmail(company);
  const phoneOk = hasValidGuidePhone(company);
  const channels = channelsForCompany(company);
  const needsEmail = channels.includes('email');
  const needsPhone = channels.includes('whatsapp');

  let kind: GuideContactIssueKind | null = null;
  if (!emailOk && !phoneOk) kind = 'missing_contact_channels';
  else if (channels.length === 0) kind = 'missing_channel';
  else if (needsEmail && !emailOk) kind = 'missing_email';
  else if (needsPhone && !phoneOk) kind = 'missing_phone';
  else if (openException?.exceptionType === 'missing_email') kind = 'missing_email';
  else if (openException?.exceptionType === 'missing_phone') kind = 'missing_phone';
  else if (openException?.exceptionType === 'missing_contact_channels') kind = 'missing_contact_channels';
  else if (openException?.exceptionType === 'invalid_channel') kind = 'missing_channel';

  if (!kind) return null;
  const copy = issueCopy(kind);
  return { kind, guide, company, exception: openException, ...copy };
}

export function defaultGuideContactForm(issue: GuideContactIssue): GuideContactFormValues {
  const email = issue.company?.emailPrincipal || '';
  const phone = issue.company?.whatsappPrincipal || '';
  const normalizedPhone = normalizeBrazilianPhone(phone);
  const hasEmail = validateEmail(email);
  const hasPhone = Boolean(normalizedPhone);
  const preferredChannel = issue.company?.canalPreferido
    || (hasEmail && hasPhone ? 'ambos' : hasPhone ? 'whatsapp' : 'email');

  return {
    email,
    phone: normalizedPhone || phone,
    preferredChannel,
    observation: '',
  };
}

export function validateGuideContactForm(issue: GuideContactIssue, values: GuideContactFormValues) {
  const email = normalizeGuideEmail(values.email);
  const phone = normalizeBrazilianPhone(values.phone);
  const errors: Partial<Record<keyof GuideContactFormValues, string>> = {};
  const preferred = values.preferredChannel;
  const needsEmail = preferred === 'email' || preferred === 'ambos' || issue.kind === 'missing_email';
  const needsPhone = preferred === 'whatsapp' || preferred === 'ambos' || issue.kind === 'missing_phone';

  if (email && !validateEmail(email)) errors.email = 'Informe um e-mail válido.';
  if (values.phone.trim() && !phone) errors.phone = 'Informe um WhatsApp/celular brasileiro válido.';
  if (needsEmail && !email) errors.email ||= 'Informe o e-mail para continuar.';
  if (needsPhone && !phone) errors.phone ||= 'Informe o WhatsApp/celular para continuar.';
  if (!email && !phone) {
    errors.email = errors.email || 'Informe pelo menos um canal de contato.';
    errors.phone = errors.phone || 'Informe pelo menos um canal de contato.';
  }
  if (preferred === 'ambos' && (!email || !phone)) {
    errors.preferredChannel = 'Para enviar pelos dois canais, informe e-mail e WhatsApp.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    normalized: {
      email,
      phone,
      preferredChannel: preferred,
      observation: values.observation.trim(),
    },
  };
}
