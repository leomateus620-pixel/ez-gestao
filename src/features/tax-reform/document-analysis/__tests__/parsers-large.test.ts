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
});