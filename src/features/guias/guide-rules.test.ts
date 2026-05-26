import { describe, expect, it } from 'vitest';
import type { Empresa } from '@/data/types';
import {
  buildGuideDescription,
  canDispatchToPreferredChannel,
  evaluateIdentity,
  extractCnpjCandidates,
  hasPdfSignals,
} from './guide-rules';

function company(overrides: Partial<Empresa> = {}): Empresa {
  return {
    id: 'company-1',
    razaoSocial: 'Empresa Exemplo Ltda',
    nomeFantasia: 'Empresa Exemplo',
    cnpj: '11444777000161',
    regimeTributario: 'simples_nacional',
    municipio: 'Sao Paulo',
    estado: 'SP',
    responsavelInterno: 'Admin',
    responsavelCliente: 'Financeiro',
    emailPrincipal: 'financeiro@example.com',
    whatsappPrincipal: '+5511999999999',
    canalPreferido: 'email',
    emailValidado: true,
    whatsappOptInAt: null,
    comunicacaoAtiva: true,
    saudacaoGuia: '',
    observacoes: '',
    status: 'ativa',
    criadoEm: '2026-05-26',
    atualizadoEm: '2026-05-26',
    ...overrides,
  };
}

describe('guide identity rules', () => {
  it('extracts only valid CNPJs and matches an active company by filename', () => {
    expect(extractCnpjCandidates('CNPJ 11.444.777/0001-61')).toEqual(['11444777000161']);
    const richText = 'DAS Competencia: 05/2026 Vencimento: 30/06/2026 Valor: R$ 100,00 CNPJ 11.444.777/0001-61';
    const result = evaluateIdentity('DAS_11.444.777-0001-61.pdf', richText, [company()]);
    expect(result.automatic).toBe(true);
    expect(result.empresa?.id).toBe('company-1');
    expect(result.source).toBe('multiple');
  });

  it('matches via native pdf text alone when filename has no CNPJ', () => {
    const text = 'Boleto DAS Vencimento: 30/06/2026 Valor: R$ 250,00 CNPJ 11.444.777/0001-61';
    const result = evaluateIdentity('boleto.pdf', text, [company()]);
    expect(result.automatic).toBe(true);
    expect(result.source).toBe('pdf_native');
  });

  it('flags PDFs without extractable text layer', () => {
    const result = evaluateIdentity('escaneado.pdf', '', [company()]);
    expect(result.automatic).toBe(false);
    expect(result.reason).toBe('pdf_without_text_layer');
  });

  it('blocks a conflict between filename and extracted content', () => {
    const result = evaluateIdentity(
      'guia_11.444.777-0001-61.pdf',
      'Destinatario CNPJ 04.252.011/0001-10',
      [company()],
    );
    expect(result.automatic).toBe(false);
    expect(result.reason).toBe('filename_content_conflict');
  });

  it('flags filename-only CNPJ when pdf signals are insufficient', () => {
    const result = evaluateIdentity('DAS_11.444.777-0001-61.pdf', 'apenas algumas palavras', [company()]);
    expect(result.automatic).toBe(false);
    expect(result.reason).toBe('insufficient_pdf_signals');
  });

  it('detects fiscal signals in extracted text', () => {
    expect(hasPdfSignals('DAS Vencimento: 30/06/2026 Valor: R$ 100,00')).toBe(true);
    expect(hasPdfSignals('texto qualquer sem sinais')).toBe(false);
  });

  it('returns company_inactive when CNPJ matches a paused company', () => {
    const text = 'DAS Vencimento: 30/06/2026 Valor: R$ 100,00 CNPJ 11.444.777/0001-61';
    const result = evaluateIdentity('boleto.pdf', text, [company({ status: 'pausada' })]);
    expect(result.reason).toBe('company_inactive');
  });
});

describe('preferred delivery channel rules', () => {
  it('uses only validated email when email is preferred', () => {
    expect(canDispatchToPreferredChannel(company(), { email: 'ativo' })).toBeNull();
    expect(canDispatchToPreferredChannel(company({ emailValidado: false }), { email: 'ativo' })).toBe('missing_email');
  });

  it('requires opt-in and E.164 for WhatsApp', () => {
    const whatsapp = company({ canalPreferido: 'whatsapp', whatsappOptInAt: '2026-05-26T12:00:00Z' });
    expect(canDispatchToPreferredChannel(whatsapp, { whatsapp: 'ativo' })).toBeNull();
    expect(canDispatchToPreferredChannel({ ...whatsapp, whatsappOptInAt: null }, { whatsapp: 'ativo' })).toBe('whatsapp_consent_missing');
  });

  it('builds a useful message without requiring optional metadata', () => {
    expect(buildGuideDescription({
      tipoGuia: 'DAS',
      competencia: '05/2026',
      vencimento: null,
      valor: 120.4,
    }, company())).toContain('Guia: DAS');
  });
});
