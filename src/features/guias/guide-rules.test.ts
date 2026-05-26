import { describe, expect, it } from 'vitest';
import type { Empresa } from '@/data/types';
import {
  OCR_AUTO_DISPATCH_THRESHOLD,
  buildGuideDescription,
  canDispatchToPreferredChannel,
  evaluateIdentity,
  extractCnpjCandidates,
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
  it('extracts only valid CNPJs and matches an active company', () => {
    expect(extractCnpjCandidates('CNPJ 11.444.777/0001-61')).toEqual(['11444777000161']);
    const result = evaluateIdentity('DAS_11.444.777-0001-61.pdf', '', [company()]);
    expect(result.automatic).toBe(true);
    expect(result.empresa?.id).toBe('company-1');
    expect(result.source).toBe('filename');
  });

  it('blocks a conflict between filename and extracted content', () => {
    const result = evaluateIdentity(
      'guia_11.444.777-0001-61.pdf',
      'Destinatario CNPJ 04.252.011/0001-10',
      [company()],
    );
    expect(result.automatic).toBe(false);
    expect(result.reason).toBe('source_conflict');
  });

  it('requires minimum OCR confidence for automatic dispatch', () => {
    const blocked = evaluateIdentity('', 'CNPJ 11.444.777/0001-61', [company()], true, OCR_AUTO_DISPATCH_THRESHOLD - 0.01);
    const accepted = evaluateIdentity('', 'CNPJ 11.444.777/0001-61', [company()], true, OCR_AUTO_DISPATCH_THRESHOLD);
    expect(blocked.reason).toBe('low_ocr_confidence');
    expect(accepted.automatic).toBe(true);
  });
});

describe('preferred delivery channel rules', () => {
  it('uses only validated email when email is preferred', () => {
    expect(canDispatchToPreferredChannel(company(), { email: 'ativo' })).toBeNull();
    expect(canDispatchToPreferredChannel(company({ emailValidado: false }), { email: 'ativo' })).toBe('invalid_email');
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
