import { describe, expect, it } from 'vitest';
import type { Empresa, Guia, GuiaExcecao } from '@/data/types';
import {
  classifyGuideContactIssue,
  defaultGuideContactForm,
  hasValidGuidePhone,
  isValidBrazilianPhone,
  normalizeBrazilianPhone,
  validateGuideContactForm,
} from './guide-contact-rules';

function guide(overrides: Partial<Guia> = {}): Guia {
  return {
    id: 'guide-1',
    driveFileId: 'drive-1',
    fileName: 'DAS Empresa Exemplo.pdf',
    mimeType: 'application/pdf',
    sha256: null,
    status: 'revisao_manual',
    matchSource: 'pdf_native',
    cnpjDetectado: '11444777000161',
    empresaId: null,
    tipoGuia: 'DAS',
    competencia: '06/2026',
    vencimento: '2026-07-20',
    valor: 120.5,
    confidenceScore: 0.98,
    criticalFieldsJson: {
      razao_social: { value: 'Empresa Exemplo Ltda' },
    },
    validationIssuesJson: [],
    decisionReason: 'CNPJ valido, mas empresa nao cadastrada.',
    manualReviewLevel: 'full',
    duplicateLevel: null,
    textoExtraidoPreview: null,
    paginaCount: 1,
    extractionMethod: 'native_pdf_text',
    hasTextLayer: true,
    pastaAtual: 'revisao_manual',
    providerError: null,
    receivedAt: '2026-07-01T12:00:00Z',
    processedAt: null,
    sentAt: null,
    ...overrides,
  };
}

function company(overrides: Partial<Empresa> = {}): Empresa {
  return {
    id: 'company-1',
    razaoSocial: 'Empresa Exemplo Ltda',
    nomeFantasia: 'Empresa Exemplo',
    cnpj: '11444777000161',
    regimeTributario: 'simples_nacional',
    municipio: '',
    estado: '',
    responsavelInterno: '',
    responsavelCliente: '',
    emailPrincipal: 'financeiro@example.com',
    whatsappPrincipal: '+5511999999999',
    canalPreferido: 'email',
    emailValidado: true,
    whatsappOptInAt: '2026-07-01T12:00:00Z',
    comunicacaoAtiva: true,
    saudacaoGuia: '',
    observacoes: '',
    status: 'ativa',
    criadoEm: '2026-07-01',
    atualizadoEm: '2026-07-01',
    ...overrides,
  };
}

function exception(type: string): GuiaExcecao {
  return {
    id: `exception-${type}`,
    guiaId: 'guide-1',
    exceptionType: type,
    severity: 'warning',
    status: 'open',
    reason: type,
    actionRecommended: 'Corrigir cadastro.',
    createdAt: '2026-07-01T12:00:00Z',
  };
}

describe('guide contact issue rules', () => {
  it('classifies an identified guide without a registered client', () => {
    const issue = classifyGuideContactIssue(guide(), null, [exception('company_not_found')]);
    expect(issue?.kind).toBe('missing_client');
    expect(issue?.title).toBe('Cliente ainda não cadastrado.');
  });

  it('classifies missing e-mail when e-mail is the preferred channel', () => {
    const issue = classifyGuideContactIssue(
      guide({ empresaId: 'company-1' }),
      company({ emailPrincipal: '' }),
      [],
    );
    expect(issue?.kind).toBe('missing_email');
  });

  it('classifies missing WhatsApp when WhatsApp is the preferred channel', () => {
    const issue = classifyGuideContactIssue(
      guide({ empresaId: 'company-1' }),
      company({ canalPreferido: 'whatsapp', whatsappPrincipal: '' }),
      [],
    );
    expect(issue?.kind).toBe('missing_phone');
  });

  it('classifies missing both channels before a generic channel issue', () => {
    const issue = classifyGuideContactIssue(
      guide({ empresaId: 'company-1' }),
      company({ canalPreferido: null, emailPrincipal: '', whatsappPrincipal: '' }),
      [],
    );
    expect(issue?.kind).toBe('missing_contact_channels');
  });

  it('does not create a contact issue when the preferred channel is valid', () => {
    expect(classifyGuideContactIssue(guide({ status: 'pronta_envio', empresaId: 'company-1' }), company(), [])).toBeNull();
  });
});

describe('guide contact validation', () => {
  it('normalizes common Brazilian phone formats to E.164', () => {
    expect(normalizeBrazilianPhone('(55) 99999-9999')).toBe('+5555999999999');
    expect(normalizeBrazilianPhone('55999999999')).toBe('+5555999999999');
    expect(normalizeBrazilianPhone('+55 55 99999-9999')).toBe('+5555999999999');
  });

  it('blocks invalid e-mail and phone before save', () => {
    const issue = classifyGuideContactIssue(guide(), null, [exception('company_not_found')]);
    expect(issue).not.toBeNull();
    const result = validateGuideContactForm(issue!, {
      email: 'financeiro',
      phone: '123',
      preferredChannel: 'ambos',
      observation: '',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.email).toBe('Informe um e-mail válido.');
    expect(result.errors.phone).toBe('Informe um WhatsApp/celular brasileiro válido.');
  });

  it('defaults to WhatsApp when only a valid phone exists', () => {
    const issue = classifyGuideContactIssue(
      guide({ empresaId: 'company-1' }),
      company({ canalPreferido: 'whatsapp', emailPrincipal: '', whatsappPrincipal: '55999999999' }),
      [],
    );
    expect(issue).toBeNull();

    const pending = classifyGuideContactIssue(
      guide({ empresaId: 'company-1' }),
      company({ canalPreferido: null, emailPrincipal: '', whatsappPrincipal: '55999999999' }),
      [exception('invalid_channel')],
    );
    expect(defaultGuideContactForm(pending!).preferredChannel).toBe('whatsapp');
  });
});

describe('strict Brazilian phone validation', () => {
  it('rejects foreign numbers even with valid E.164 format', () => {
    expect(normalizeBrazilianPhone('+441234567890')).toBe('');
    expect(isValidBrazilianPhone('+441234567890')).toBe(false);
  });

  it('rejects Brazilian mobile numbers that do not start with 9', () => {
    expect(isValidBrazilianPhone('+5511812345678')).toBe(false);
  });

  it('rejects invalid DDD (below 11)', () => {
    expect(isValidBrazilianPhone('+551099999999')).toBe(false);
  });

  it('hasValidGuidePhone rejects foreign phone stored on empresa', () => {
    expect(
      hasValidGuidePhone(company({ whatsappPrincipal: '+441234567890' })),
    ).toBe(false);
  });

  it('accepts a well-formed Brazilian mobile number', () => {
    expect(isValidBrazilianPhone('11 99999-9999')).toBe(true);
    expect(normalizeBrazilianPhone('11 99999-9999')).toBe('+5511999999999');
  });
});

describe('missing_contact_channels ordering', () => {
  it('requires both channels when preferred is ambos', () => {
    const issue = classifyGuideContactIssue(
      guide({ empresaId: 'company-1' }),
      company({ canalPreferido: 'ambos', emailPrincipal: 'ok@example.com', whatsappPrincipal: '' }),
      [],
    );
    expect(issue?.kind).toBe('missing_phone');
  });
});
