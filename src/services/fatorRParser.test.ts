import { describe, expect, it } from 'vitest';
import { classifyFatorR, parseFatorRFromText } from './fatorRParser';

describe('parseFatorRFromText', () => {
  it('interprets an attention PGDAS extract with decimal Fator R', () => {
    const result = parseFatorRFromText(`
      PGDAS-D Extrato do Simples Nacional
      Razão Social: Cliente Atenção Ltda
      CNPJ: 12.345.678/0001-90
      Período de Apuração: 05/2026
      Receita bruta acumulada RBT12: R$ 950.000,00
      Folha de salários FS12: R$ 304.000,00
      Fator R apurado: 0,32
    `, 'pgdas-cliente-atencao-05-2026.pdf');

    expect(result.cnpj).toBe('12.345.678/0001-90');
    expect(result.referenceMonth).toBe(5);
    expect(result.referenceYear).toBe(2026);
    expect(result.fatorRValue).toBeCloseTo(0.32);
    expect(result.fatorRPercent).toBeCloseTo(32);
    expect(classifyFatorR(result.fatorRValue)).toBe('attention');
  });

  it('interprets a critical PGDAS extract with percentage Fator R', () => {
    const result = parseFatorRFromText(`
      Nome Empresarial: Cliente Crítico Serviços Médicos
      CNPJ 98.765.432/0001-10
      PA 2026-04
      RBT12 R$ 1.200.000,00
      FS12 R$ 336.000,00
      Percentual do Fator R: 28,00%
    `);

    expect(result.referenceMonth).toBe(4);
    expect(result.referenceYear).toBe(2026);
    expect(result.fatorRValue).toBeCloseTo(0.28);
    expect(result.fatorRPercent).toBeCloseTo(28);
    expect(classifyFatorR(result.fatorRValue)).toBe('critical');
  });

  it('classifies values above 32% as safe', () => {
    const result = parseFatorRFromText('Competência: março de 2026 Fator R: 33,50% CNPJ: 11.222.333/0001-44');

    expect(result.referenceMonth).toBe(3);
    expect(result.referenceYear).toBe(2026);
    expect(classifyFatorR(result.fatorRValue)).toBe('safe');
  });
});
