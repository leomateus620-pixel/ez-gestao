import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MIN_CONFIDENCE_AUTO_DISPATCH,
  analyzeGuideText,
  extractDARFData,
  extractDASData,
  extractFGTSDigitalData,
  validateTemplateRender,
} from '../../../supabase/functions/_shared/guide-parser.ts';

type GoldenCase = {
  arquivo: string;
  text: string;
  expected: {
    cnpj: string;
    tipo_guia: string;
    competencia: string;
    vencimento: string;
    valor: number;
  };
};

const goldenSet = JSON.parse(
  readFileSync(join(process.cwd(), 'test-fixtures', 'guias', 'golden-set.json'), 'utf8'),
) as GoldenCase[];

describe('safe guide parser Golden Set', () => {
  it.each(goldenSet)('extracts expected fields for $arquivo', ({ text, expected }) => {
    const analysis = analyzeGuideText(text, true);

    expect(analysis.metadata.primaryCnpj).toBe(expected.cnpj);
    expect(analysis.classification.tipo).toBe(expected.tipo_guia);
    expect(analysis.metadata.competencia).toBe(expected.competencia);
    expect(analysis.metadata.vencimento).toBe(expected.vencimento);
    expect(analysis.metadata.valor).toBeCloseTo(expected.valor, 2);
    expect(analysis.overallConfidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE_AUTO_DISPATCH);
    expect(analysis.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('blocks automatic confidence when multiple valid CNPJs appear', () => {
    const text = [
      'Documento de Arrecadacao do Simples Nacional DAS.',
      'CNPJ do contribuinte: 11.444.777/0001-61.',
      'Receita Federal CNPJ: 04.252.011/0001-10.',
      'PA: 04/2026. Vencimento: 20/05/2026. Valor Total do Documento: R$ 2.857,14.',
    ].join(' ');

    const analysis = analyzeGuideText(text, true);

    expect(analysis.metadata.cnpjCandidates).toHaveLength(2);
    expect(analysis.metadata.fields.cnpj.status).toBe('dubious');
    expect(analysis.issues.some((issue) => issue.code === 'multiple_cnpj')).toBe(true);
  });

  it('rejects CNPJ-like sequences with invalid check digits', () => {
    const analysis = analyzeGuideText(
      'DAS CNPJ do contribuinte: 00.000.000/0001-00 PA: 04/2026 Vencimento: 20/05/2026 Valor Total: R$ 100,00',
      false,
    );

    expect(analysis.metadata.fields.cnpj.status).toBe('invalid');
    expect(analysis.issues.some((issue) => issue.code === 'cnpj_invalid')).toBe(true);
  });

  it('exposes specialized extractors for the main guide types', () => {
    expect(extractDASData(goldenSet[0].text).tipo).toBe('das');
    expect(extractFGTSDigitalData(goldenSet[1].text).tipo).toBe('fgts');
    expect(extractDARFData(goldenSet[2].text).tipo).toBe('darf');
  });

  it('blocks templates with unresolved placeholders or missing WhatsApp SID', () => {
    const errors = validateTemplateRender({
      template: {
        tipo_guia: 'das',
        canal: 'whatsapp',
        ativo: true,
        corpo: 'Guia [EMPRESA] [VALOR]',
        twilio_content_sid: null,
      },
      canal: 'whatsapp',
      tipo: 'das',
      renderedSubject: null,
      renderedBody: 'Guia Empresa [VALOR]',
    });

    expect(errors).toContain('twilio_content_sid_missing');
    expect(errors.some((error) => error.startsWith('unresolved_placeholders'))).toBe(true);
  });
});
