import { describe, expect, it } from 'vitest';
import {
  analyzeGuideText,
  classifyEmpregadorDocument,
  dedupHashFgts,
  matchCompanyForFGTSGuide,
  normalizeLegalName,
  stripLegalTerms,
} from '../../../supabase/functions/_shared/guide-parser.ts';

const GFD_TEXT = [
  'GFD - Guia do FGTS Digital',
  'CPF/CNPJ do Empregador: 21.205.304',
  'Nome/Razão Social do Empregador: TARIFA ZERO SOLUCOES CORPORATIVAS LTDA',
  'Identificador: 0126060842429268-9',
  'Competência: 05/2026',
  'Pagar este documento até: 19/06/2026',
  'Valor a recolher: 370,58',
  'Total da Guia: 370,58',
].join(' ');

function company(overrides: Record<string, unknown> = {}) {
  return {
    id: 'emp-1',
    cnpj: '21205304000199',
    razao_social: 'Tarifa Zero Soluções Corporativas Ltda',
    nome_fantasia: 'Tarifa Zero',
    aliases: [],
    status: 'ativa',
    comunicacao_ativa: true,
    ...overrides,
  } as any;
}

describe('FGTS Digital parser', () => {
  it('classifies the employer document and extracts the core fields', () => {
    const analysis = analyzeGuideText(GFD_TEXT, true);
    expect(analysis.classification.tipo).toBe('fgts');
    expect(analysis.metadata.subtipo).toBe('fgts_digital_gfd');
    expect(analysis.metadata.empregadorDocumentoRaw).toBe('21.205.304');
    expect(analysis.metadata.empregadorDocumentoTipo).toBe('documento_parcial');
    expect(analysis.metadata.empregadorNomeRazaoSocial).toBe('TARIFA ZERO SOLUCOES CORPORATIVAS LTDA');
    expect(analysis.metadata.primaryCnpj).toBeNull();
    expect(analysis.metadata.competencia).toBe('05/2026');
    expect(analysis.metadata.vencimento).toBe('2026-06-19');
    expect(analysis.metadata.valor).toBeCloseTo(370.58, 2);
    expect(analysis.metadata.identificador).toBe('0126060842429268-9');
    // No hard error on missing CNPJ for FGTS when employer name is available.
    expect(analysis.issues.some((i) => i.code === 'cnpj_missing')).toBe(false);
    expect(analysis.issues.some((i) => i.code === 'fgts_partial_employer_document')).toBe(true);
  });

  it('classifyEmpregadorDocument tags partial / raiz / completo correctly', () => {
    expect(classifyEmpregadorDocument('21.205.304').tipo).toBe('documento_parcial');
    expect(classifyEmpregadorDocument('21205304').tipo).toBe('cnpj_raiz');
    expect(classifyEmpregadorDocument('11.444.777/0001-61').tipo).toBe('cnpj_completo');
  });

  it('normalization helpers strip accents, casing and legal terms', () => {
    expect(normalizeLegalName('Tarifa Zero Soluções Corporativas Ltda')).toBe('TARIFA ZERO SOLUCOES CORPORATIVAS LTDA');
    expect(stripLegalTerms('Tarifa Zero Soluções Corporativas Ltda')).toBe('TARIFA ZERO SOLUCOES CORPORATIVAS');
  });
});

describe('matchCompanyForFGTSGuide', () => {
  it('matches by exact normalized legal name when CNPJ is partial', () => {
    const result = matchCompanyForFGTSGuide(
      { razaoSocial: 'TARIFA ZERO SOLUCOES CORPORATIVAS LTDA', documentoRaiz: null },
      [company()],
    );
    expect(result.empresa?.id).toBe('emp-1');
    expect(result.method).toBe('exact_normalized_legal_name');
  });

  it('matches by alias exact', () => {
    const result = matchCompanyForFGTSGuide(
      { razaoSocial: 'TARIFA ZERO' },
      [company({ razao_social: 'Outra Empresa', aliases: ['Tarifa Zero'] })],
    );
    expect(result.method).toBe('alias_exact');
  });

  it('returns review when multiple companies match the same legal name', () => {
    const result = matchCompanyForFGTSGuide(
      { razaoSocial: 'TARIFA ZERO SOLUCOES CORPORATIVAS LTDA' },
      [company({ id: 'a' }), company({ id: 'b' })],
    );
    expect(result.empresa).toBeNull();
    expect(result.reason).toBe('multiple_companies_exact_name');
  });

  it('refuses to auto-match on similarity alone', () => {
    const result = matchCompanyForFGTSGuide(
      { razaoSocial: 'TARIFA ZERO SOLUCOES CORP LTDA' },
      [company()],
    );
    // Similarity may or may not pass 0.94; either way, never auto.
    expect(result.empresa).toBeNull();
    expect(['similarity', 'none']).toContain(result.method);
  });

  it('blocks when CNPJ raiz matches multiple branches', () => {
    const result = matchCompanyForFGTSGuide(
      { documentoRaiz: '21205304', razaoSocial: null },
      [company({ id: 'a', cnpj: '21205304000111' }), company({ id: 'b', cnpj: '21205304000222' })],
    );
    expect(result.empresa).toBeNull();
    expect(result.reason).toBe('cnpj_raiz_multiple_branches');
  });

  it('rejects inactive companies', () => {
    const result = matchCompanyForFGTSGuide(
      { razaoSocial: 'TARIFA ZERO SOLUCOES CORPORATIVAS LTDA' },
      [company({ status: 'pausada' })],
    );
    expect(result.empresa).toBeNull();
  });
});

describe('FGTS dedup hash', () => {
  it('does not depend on CNPJ and prefers identificador_guia when present', async () => {
    const hashA = await dedupHashFgts({
      empresaId: 'emp-1', tipo: 'fgts', competencia: '05/2026',
      vencimento: '2026-06-19', valor: 370.58, identificadorGuia: '0126060842429268-9',
    });
    const hashB = await dedupHashFgts({
      empresaId: 'emp-1', tipo: 'fgts', competencia: '05/2026',
      vencimento: '2026-06-19', valor: 370.58, identificadorGuia: null,
    });
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(hashA).not.toBe(hashB);
  });
});