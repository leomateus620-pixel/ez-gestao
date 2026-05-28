import { describe, expect, it } from 'vitest';
import { parsePgdasFatorR } from './fatorRParser';

const baseHeader = (company: string, cnpj: string) => `
Extrato do Simples Nacional
CNPJ Básico: ${cnpj.slice(0, 10)} Nome Empresarial: ${company}
CNPJ Estabelecimento: ${cnpj}
Período de Apuração (PA): 04/2026
`;

describe('parsePgdasFatorR', () => {
  it('interpreta PGDAS com Fator R não aplicável sem gerar alerta', () => {
    const text = `
${baseHeader('FELIPE HAMMES DIESEL', '55.371.662/0001-60')}
Receita bruta acumulada nos doze meses anteriores ao PA (RBT12) 248.528,94 0,00 248.528,94
2.3) Folhas de Salários Anteriores
Nenhuma
Fator r = Não se aplica
`;

    const result = parsePgdasFatorR(text, '042026 SERV. 7,43%.pdf');

    expect(result.companyName).toBe('FELIPE HAMMES DIESEL');
    expect(result.cnpj).toBe('55.371.662/0001-60');
    expect(result.referenceMonth).toBe(4);
    expect(result.referenceYear).toBe(2026);
    expect(result.revenue12m).toBe(248528.94);
    expect(result.payroll12m).toBeNull();
    expect(result.folhaAusente).toBe(true);
    expect(result.notApplicable).toBe(true);
    expect(result.status).toBe('not_applicable');
    expect(result.shouldAlert).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('captura RBT12, total de FS12 e Fator R declarado em status atenção', () => {
    const text = `
${baseHeader('CRISTINE SCHWINGEL LTDA', '44.527.939/0001-84')}
Receita bruta acumulada nos doze meses anteriores ao PA (RBT12) 244.000,00 0,00 244.000,00
2.3) Folhas de Salários Anteriores
04/2025 R$ 4.200,00
05/2025 R$ 4.250,00
2.3.1) Total de Folhas de Salários Anteriores (R$) R$ 76.608,07
Fator r = 0,31 - Anexo III
`;

    const result = parsePgdasFatorR(text, '042026 SERV. 7,36%.pdf');

    expect(result.companyName).toBe('CRISTINE SCHWINGEL LTDA');
    expect(result.cnpj).toBe('44.527.939/0001-84');
    expect(result.referenceMonth).toBe(4);
    expect(result.referenceYear).toBe(2026);
    expect(result.revenue12m).toBe(244000);
    expect(result.payroll12m).toBe(76608.07);
    expect(result.declaredFatorRValue).toBe(0.31);
    expect(result.fatorRValue).toBe(0.31);
    expect(result.computedFatorRValue).toBeCloseTo(0.3139675, 6);
    expect(result.status).toBe('attention');
    expect(result.shouldAlert).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifica como crítico quando o Fator R declarado é 0,28', () => {
    const text = `
${baseHeader('E R ZANCAN CORRETORA DE SEGUROS LTDA', '54.767.050/0001-28')}
Receita bruta acumulada nos doze meses anteriores ao PA (RBT12) 196.305,84 0,00 196.305,84
2.3) Folhas de Salários Anteriores
04/2025 R$ 3.900,00
2.3.1) Total de Folhas de Salários Anteriores (R$) R$ 55.437,28
Fator r = 0,28 - Anexo III
`;

    const result = parsePgdasFatorR(text, '042026 SERV. 6,43%.pdf');

    expect(result.companyName).toBe('E R ZANCAN CORRETORA DE SEGUROS LTDA');
    expect(result.cnpj).toBe('54.767.050/0001-28');
    expect(result.referenceMonth).toBe(4);
    expect(result.referenceYear).toBe(2026);
    expect(result.revenue12m).toBe(196305.84);
    expect(result.payroll12m).toBe(55437.28);
    expect(result.declaredFatorRValue).toBe(0.28);
    expect(result.computedFatorRValue).toBeCloseTo(0.2824, 4);
    expect(result.status).toBe('critical');
    expect(result.shouldAlert).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('ignora valores de ISS/DAS da página 2 quando a seção 2.3.1 não traz o total', () => {
    const text = `
${baseHeader('CRISTINE SCHWINGEL LTDA', '44.527.939/0001-84')}
Receita bruta acumulada nos doze meses anteriores ao PA (RBT12) 244.000,00 0,00 244.000,00
2.3) Folhas de Salários Anteriores
2.3.1) Total de Folhas de Salários Anteriores (R$)
ISS R$ 541,99
Total Geral da Empresa R$ 1.234,56
Fator r = 0,31 - Anexo III
`;

    const result = parsePgdasFatorR(text, '042026 SERV. 7,36%.pdf');
    expect(result.payroll12m).toBeNull();
    expect(result.declaredFatorRValue).toBe(0.31);
    expect(result.status).toBe('attention');
  });
});
