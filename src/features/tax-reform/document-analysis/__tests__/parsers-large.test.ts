import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBalanceAndDreDocument, parsePayrollSummaryDocument, parsePgdasDocument } from '../extractors';

/**
 * Gera uma folha sintética com N empregados em formato JB Folha:
 * cabeçalhos de página, lista de empregados, linha "Total:", "Total de empregados:" e
 * uma linha com 11 valores agregados coerentes (Líquido = Bruto − Descontos).
 */
function buildFolha(opts: { cnpj: string; period: string; employees: number; salary: number; bruto: number; descontos: number; estab: number }) {
  const fmt = (n: number) => n.toFixed(2).replace('.', ',');
  const liquido = opts.bruto - opts.descontos;
  const inssBase = opts.bruto;
  const inss = +(opts.bruto * 0.095).toFixed(2);
  const fgts = +(opts.bruto * 0.08).toFixed(2);
  const irrf = 321.79;
  const fgtsBase = opts.bruto;
  const irrfBase = +(opts.bruto * 0.9).toFixed(2);
  const provVant = opts.bruto;
  const rowEmployee = (id: number) =>
    `${String(id).padStart(6, '0')} EMPREGADO ${id} 0,00 100,00 1.000,00 0,00 1.500,00 120,00 1.500,00 100,00 1.400,00 1.500,00 1.400,00`;
  const pageHeader = [
    'Empresa: EMPRESA TESTE LTDA',
    `Inscr. Fed.: ${opts.cnpj}`,
    `Emp: 1 / Estab: ${opts.estab}`,
    `Período: 01/${opts.period.replace('/', '/')} à 31/${opts.period.replace('/', '/')}`,
    'INSS Base IRRF IRRF Base FGTS FGTS Prov./Vant. Descontos LíquidoBase INSSEmpregado Salário S. Fam.',
    'RESUMO DE CÁLCULO',
  ];
  const employeesPerPage = 25;
  const lines: string[] = [...pageHeader];
  for (let i = 1; i <= opts.employees; i += 1) {
    lines.push(rowEmployee(i));
    if (i % employeesPerPage === 0 && i < opts.employees) {
      lines.push('10/06/2026 14:03:40 JB Folha Pacote: 05043/ 00001Página: 1');
      lines.push(...pageHeader);
    }
  }
  lines.push('Total:');
  lines.push('Total de empregados:');
  lines.push(
    `${fmt(opts.salary)} 0,00 ${fmt(inssBase)} ${fmt(inss)} ${fmt(fgts)} ${fmt(irrf)} ${fmt(fgtsBase)} ${fmt(irrfBase)} ${fmt(provVant)} ${fmt(opts.descontos)} ${fmt(liquido)}`,
  );
  lines.push(String(opts.employees));
  lines.push('10/06/2026 14:03:40 JB Folha Pacote: 05043/ 00001Página: 2');
  return lines.join('\n');
}

describe('parsePayrollSummaryDocument — robustez em larga escala', () => {
  it('processa folha com 50 empregados em múltiplas páginas', () => {
    const text = buildFolha({ cnpj: '12.345.678/0001-90', period: '05/2026', employees: 50, salary: 80000, bruto: 100000, descontos: 20000, estab: 1 });
    const r = parsePayrollSummaryDocument(text);
    expect(r.values.employeesCount).toBe(50);
    expect(r.values.salaryTotal).toBe(80000);
    expect(r.values.grossPayroll).toBe(100000);
    expect(r.values.netPayroll).toBe(80000);
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it('agrega múltiplos estabelecimentos quando há vários blocos Total:', () => {
    const a = buildFolha({ cnpj: '12.345.678/0001-90', period: '05/2026', employees: 10, salary: 20000, bruto: 25000, descontos: 5000, estab: 1 });
    const b = buildFolha({ cnpj: '12.345.678/0002-71', period: '05/2026', employees: 15, salary: 30000, bruto: 36000, descontos: 6000, estab: 2 });
    const r = parsePayrollSummaryDocument(`${a}\n${b}`);
    expect(r.values.salaryTotal).toBe(50000);
    expect(r.values.grossPayroll).toBe(61000);
    expect(r.values.netPayroll).toBe(50000);
    expect((r.values as Record<string, unknown>).establishmentsAggregated).toBe(2);
  });

  it('descarta bloco Total: incoerente (Líquido ≠ Bruto − Descontos)', () => {
    // bloco inválido: liquido != bruto - descontos
    const bad = [
      'Empresa: X LTDA', 'Inscr. Fed.: 12.345.678/0001-90', 'Período: 01/05/2026 à 31/05/2026',
      'Total:', 'Total de empregados:',
      '1.000,00 0,00 1.000,00 95,00 80,00 0,00 1.000,00 900,00 1.000,00 200,00 999,00',
      '5',
    ].join('\n');
    const r = parsePayrollSummaryDocument(bad);
    expect(r.values.salaryTotal).toBeUndefined();
    expect(r.values.netPayroll).toBeUndefined();
    expect(r.values.warnings?.some((w) => /descartado/i.test(w))).toBe(true);
  });

  it('não confunde cabeçalho repetido de página com linha numérica do Total', () => {
    const text = [
      'Empresa: X LTDA', 'Inscr. Fed.: 12.345.678/0001-90', 'Período: 01/05/2026 à 31/05/2026',
      'Total:',
      'Empregado 999 1,00 2,00 3,00 4,00 5,00 6,00 7,00 8,00 9,00 10,00 11,00', // barreira: linha começa com Empregado
      'Total de empregados:',
      '10.000,00 0,00 11.000,00 1.045,00 880,00 0,00 11.000,00 9.900,00 11.000,00 2.000,00 9.000,00',
      '3',
    ].join('\n');
    const r = parsePayrollSummaryDocument(text);
    // O primeiro bloco Total: bate na barreira "Empregado" e é descartado; sem bloco válido.
    expect(r.values.salaryTotal).toBeUndefined();
  });
});

describe('parsePayrollSummaryDocument — Folha PDF Zimmermann (ordem docling/visual)', () => {
  // Mesma linha "Total:" com 11 valores na ordem visual (Salário, S.Fam, BaseINSS, INSS, BaseIRRF, IRRF, BaseFGTS, FGTS, Prov, Desc, Líq)
  const head = [
    'Empresa: ESCRITORIO CONTABIL ZIMMERMANN LTDA',
    'Inscr. Fed.: 88.736.335/0001-13',
    'Período: 01/05/2026 à 31/05/2026',
    'RESUMO DE CÁLCULO',
    'Empregado Salário S. Fam. Base INSS INSS Base IRRF IRRF Base FGTS FGTS Prov./Vant. Descontos Líquido',
  ].join('\n');

  it('Total: e valores na MESMA linha (docling)', () => {
    const text = `${head}\nTotal: 22.680,85 0,00 24.565,24 2.343,08 19.673,40 321,79 22.944,24 1.835,52 24.565,24 4.072,87 20.492,37\nTotal de empregados: 7\n`;
    const r = parsePayrollSummaryDocument(text);
    expect(r.values.period).toBe('05/2026');
    expect(r.values.employeesCount).toBe(7);
    expect(r.values.salaryTotal).toBe(22680.85);
    expect(r.values.familySalary).toBe(0);
    expect(r.values.inssBase).toBe(24565.24);
    expect(r.values.inssValue).toBe(2343.08);
    expect(r.values.irrfBase).toBe(19673.40);
    expect(r.values.irrfValue).toBe(321.79);
    expect(r.values.fgtsBase).toBe(22944.24);
    expect(r.values.fgtsValue).toBe(1835.52);
    expect(r.values.grossPayroll).toBe(24565.24);
    expect(r.values.discounts).toBe(4072.87);
    expect(r.values.netPayroll).toBe(20492.37);
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('Total: em linha separada + valores na linha seguinte (ordem docling)', () => {
    const text = `${head}\nTotal:\n22.680,85 0,00 24.565,24 2.343,08 19.673,40 321,79 22.944,24 1.835,52 24.565,24 4.072,87 20.492,37\nTotal de empregados:\n7\n`;
    const r = parsePayrollSummaryDocument(text);
    expect(r.values.employeesCount).toBe(7);
    expect(r.values.grossPayroll).toBe(24565.24);
    expect(r.values.netPayroll).toBe(20492.37);
    expect(r.values.irrfBase).toBe(19673.40);
    expect(r.values.fgtsValue).toBe(1835.52);
  });

  it('fallback D: soma de empregados quando não há linha Total', () => {
    const emp = (id: number) =>
      `00004${id} EMPREGADO ${id} 1.000,00 0,00 1.000,00 95,00 800,00 0,00 1.000,00 80,00 1.000,00 100,00 900,00`;
    const text = [head, emp(1), emp(2), emp(3), 'Total de empregados: 3'].join('\n');
    const r = parsePayrollSummaryDocument(text);
    expect(r.values.salaryTotal).toBe(3000);
    expect(r.values.grossPayroll).toBe(3000);
    expect(r.values.netPayroll).toBe(2700);
    expect(r.values.employeesCount).toBe(3);
    expect(r.warnings.some((w) => /fallback/i.test(w))).toBe(true);
  });

  it('bloco Total incoerente (Líquido ≠ Bruto − Descontos) → sem campos decisivos', () => {
    const text = `${head}\nTotal: 1.000,00 0,00 1.000,00 95,00 800,00 0,00 1.000,00 80,00 1.000,00 200,00 999,00\nTotal de empregados: 2\n`;
    const r = parsePayrollSummaryDocument(text);
    expect(r.values.salaryTotal).toBeUndefined();
    expect(r.values.netPayroll).toBeUndefined();
    expect(r.confidence).toBe(0);
    expect(r.warnings.some((w) => /incoerentes/i.test(w))).toBe(true);
  });

  it('Total de empregados na mesma linha vs próxima linha', () => {
    const t1 = `${head}\nTotal: 1.000,00 0,00 1.000,00 95,00 800,00 0,00 1.000,00 80,00 1.000,00 100,00 900,00\nTotal de empregados: 4\n`;
    expect(parsePayrollSummaryDocument(t1).values.employeesCount).toBe(4);
    const t2 = `${head}\nTotal: 1.000,00 0,00 1.000,00 95,00 800,00 0,00 1.000,00 80,00 1.000,00 100,00 900,00\nTotal de empregados:\n5\n`;
    expect(parsePayrollSummaryDocument(t2).values.employeesCount).toBe(5);
  });
});

describe('parsePgdasDocument — robustez', () => {
  it('extrai PGDAS mesmo com layout intermediário (linhas vazias)', () => {
    const text = [
      'Período de Apuração (PA): 04/2026',
      'Nome Empresarial: TESTE LTDA',
      'CNPJ: 12.345.678/0001-90',
      'Receita Bruta do PA',
      '50.000,00',
      'RBT12',
      '600.000,00',
      'Principal 1.000,00 Multa 0,00 Juros 0,00 Total 1.000,00',
      'Fator r = Não se aplica',
    ].join('\n');
    const r = parsePgdasDocument(text);
    expect(r.values.monthlyRevenue).toBe(50000);
    expect(r.values.dasTotal).toBe(1000);
    expect(r.values.grossRevenue12m).toBe(600000);
  });
});

describe('parseBalanceAndDreDocument — robustez', () => {
  it('processa balancete grande sem perder receita ou Simples', () => {
    // monta um DRE longo com muitas contas; o parser deve achar as chaves
    const filler = Array.from({ length: 80 }, (_, i) => `Conta Generica ${i + 1}\n${(i * 12.34).toFixed(2).replace('.', ',')}`).join('\n');
    const text = [
      'Empresa: ESCRITORIO TESTE LTDA',
      'Período: 01/01/2026 a 31/12/2026',
      'CNPJ: 12.345.678/0001-90',
      'DEMONSTRAÇÃO DO RESULTADO',
      'RECEITA BRUTA OPERACIONAL', '1.000.000,00',
      'SIMPLES NACIONAL', '82.900,00',
      'RECEITA OPERACIONAL LÍQUIDA', '917.100,00',
      'CUSTO DOS SERVIÇOS PRESTADOS', '400.000,00',
      'LUCRO BRUTO', '517.100,00',
      'RESULTADO LÍQUIDO DO EXERCÍCIO', '300.000,00',
      filler,
    ].join('\n');
    const r = parseBalanceAndDreDocument(text);
    expect(r.values.grossRevenue).toBe(1000000);
    expect(r.values.simplesNacionalExpense).toBe(82900);
    expect(r.values.netRevenue).toBe(917100);
    expect(r.values.netProfit).toBe(300000);
  });

  it('Balanço+DRE Zimmermann real: NÃO confunde Resultado Líquido com Receita', () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const text = readFileSync(join(testDir, 'fixtures', 'balanco-dre-zimmermann.txt'), 'utf-8');
    const r = parseBalanceAndDreDocument(text);
    // Campos críticos batem com o PDF real
    expect(r.values.grossRevenue).toBeCloseTo(902870.81, 1);
    expect(r.values.simplesNacionalExpense).toBeCloseTo(74867.75, 1);
    expect(r.values.netRevenue).toBeCloseTo(828003.06, 1);
    expect(r.values.serviceCosts).toBeCloseTo(386206.28, 1);
    expect(r.values.grossProfit).toBeCloseTo(441796.78, 1);
    expect(r.values.operatingExpenses).toBeCloseTo(84851.92, 1);
    expect(r.values.netProfit).toBeCloseTo(375304.85, 1);
    expect(r.values.inputCostPercent).toBeCloseTo(42.78, 1);
    expect(r.values.grossMargin).toBeCloseTo(48.93, 1);
    expect(r.values.netMargin).toBeCloseTo(41.57, 1);
    expect(r.values.payrollPercentFromDre).toBeCloseTo(42.79, 1);
    // Guardas negativos: erro anterior reportado pelo usuário não pode voltar
    expect(r.values.revenue).not.toBe(375304.85);
    expect(r.values.inputCostPercent).not.toBe(100);
    expect(r.values.operatingExpenses).not.toBe(375304.85);
  });

  it('Balanço+DRE Zimmermann: localiza DRE mesmo sem heading perfeito da seção', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const original = readFileSync(join(__dirname, 'fixtures', 'balanco-dre-zimmermann.txt'), 'utf-8');
    const text = original
      .replace(/DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO NO PERÍODO DE 01\/01\/2025 A 31\/12\/2025/g, 'RELATÓRIO CONTÁBIL')
      .replace(/DEMONSTRAÇÃO DO RESULTADO/g, 'CONTAS CONTÁBEIS');
    const r = parseBalanceAndDreDocument(text);
    expect(r.values.grossRevenue).toBeCloseTo(902870.81, 1);
    expect(r.values.simplesNacionalExpense).toBeCloseTo(74867.75, 1);
    expect(r.values.netRevenue).toBeCloseTo(828003.06, 1);
    expect(r.values.serviceCosts).toBeCloseTo(386206.28, 1);
    expect(r.values.grossProfit).toBeCloseTo(441796.78, 1);
    expect(r.values.netProfit).toBeCloseTo(375304.85, 1);
    expect(r.values.inputCostPercent).toBeCloseTo(42.78, 1);
    expect(r.values.revenue).not.toBe(375304.85);
    expect(r.values.inputCostPercent).not.toBe(100);
  });

  it('Balanço+DRE: aceita camada de PDF com valor antes do rótulo contábil', () => {
    const text = [
      'BALANÇO PATRIMONIAL LEVANTADO EM 31/12/2025',
      '807.056,87 A T I V O',
      '807.056,87 P A S S I V O',
      '902.870,81 RECEITA BRUTA OPERACIONAL',
      '(74.867,75) SIMPLES NACIONAL',
      '828.003,06 RECEITA OPERACIONAL LÍQUIDA',
      '(386.206,28) CUSTO DOS SERVIÇOS PRESTADOS',
      '441.796,78 LUCRO BRUTO',
      '375.304,85 RESULTADO LÍQUIDO DO EXERCÍCIO',
    ].join('\n');
    const r = parseBalanceAndDreDocument(text);
    expect(r.values.grossRevenue).toBeCloseTo(902870.81, 1);
    expect(r.values.serviceCosts).toBeCloseTo(386206.28, 1);
    expect(r.values.netProfit).toBeCloseTo(375304.85, 1);
    expect(r.values.inputCostPercent).toBeCloseTo(42.78, 1);
    expect(r.values.revenue).not.toBe(375304.85);
  });
});