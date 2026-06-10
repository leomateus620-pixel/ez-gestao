import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBalanceAndDreDocument, parsePayrollSummaryDocument, parsePgdasDocument } from '../extractors';
import { reconcileQuestionnaireWithDocuments } from '../reconcile';
import type { TaxReformDocument } from '../../types';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');
const pgdasText = fixture('pgdas-zimmermann.txt');
const dreText = fixture('balanco-dre-zimmermann.txt');
const folhaText = fixture('folha-zimmermann.txt');

const near = (actual: number | undefined, expected: number, tol = 0.05) => {
  expect(actual).toBeDefined();
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(tol);
};

describe('parsePgdasDocument (Zimmermann)', () => {
  const result = parsePgdasDocument(pgdasText);
  it('extrai CNPJ, período e regime', () => {
    expect(result.values.cnpj).toBe('88.736.335/0001-13');
    expect(result.values.period).toBe('04/2026');
    expect(result.values.taxRegimeDetected).toBe('simples_nacional');
  });
  it('extrai receitas RPA/RBT12/RBA/RBAA', () => {
    near(result.values.monthlyRevenue, 80220.40);
    near(result.values.grossRevenue12m, 958935.69);
    near(result.values.rba, 350279.28);
    near(result.values.rbaa, 902870.81);
  });
  it('extrai DAS total e calcula alíquota efetiva', () => {
    near(result.values.dasTotal, 6651.30);
    near(result.values.effectiveTaxRate, 8.29, 0.02);
  });
  it('calcula uso do limite do Simples', () => {
    near(result.values.simplesLimitUsagePercent, 19.98, 0.05);
    expect(result.values.nearSimplesLimit).toBe(false);
  });
  it('respeita Fator R = Não se aplica', () => {
    expect(result.values.factorRStatus).toBe('nao_se_aplica');
    expect(result.values.shouldCalculateFactorR).toBe(false);
  });
});

describe('parseBalanceAndDreDocument (Zimmermann)', () => {
  const result = parseBalanceAndDreDocument(dreText);
  it('extrai CNPJ', () => {
    expect(result.values.cnpj).toBe('88.736.335/0001-13');
  });
  it('extrai receita bruta e Simples', () => {
    near(result.values.grossRevenue, 902870.81);
    near(result.values.simplesNacionalExpense, 74867.75);
    near(result.values.netRevenue, 828003.06);
    near(result.values.serviceCosts, 386206.28);
    near(result.values.grossProfit, 441796.78);
  });
  it('calcula alíquota anual, custos, margens', () => {
    near(result.values.annualEffectiveTaxRate, 8.29, 0.05);
    near(result.values.inputCostPercent, 42.78, 0.05);
    near(result.values.grossMargin, 48.93, 0.05);
    near(result.values.netMargin, 41.57, 0.05);
  });
  it('soma folha anual de contas explícitas (sem incluir Serviços PJ)', () => {
    // 24732.22 + 28514.94 + 28728.28 + 279927.15 + 2202 + 2989.32 + 1050 + 18215.44 = 386359.35
    near(result.values.annualPayrollFromDre, 386359.35, 0.5);
    near(result.values.payrollPercentFromDre, 42.79, 0.05);
  });
  it('extrai patrimônio e AFAC do balanço', () => {
    near(result.values.assetsTotal, 807056.87);
    near(result.values.equity, 304918.61);
    near(result.values.afac, 475106.00);
  });
  it('lista clientes do balanço mas não deriva B2B/B2C', () => {
    near(result.values.accountsReceivable, 147536.81);
    expect(result.values.b2bPercent).toBeUndefined();
    expect(result.values.b2cPercent).toBeUndefined();
    expect(result.values.top10ClientsConcentration).toBeUndefined();
  });
});

describe('parsePayrollSummaryDocument (Zimmermann)', () => {
  const result = parsePayrollSummaryDocument(folhaText);
  it('extrai período e total de empregados', () => {
    expect(result.values.period).toBe('05/2026');
    expect(result.values.employeesCount).toBe(7);
  });
  it('extrai linha Total corretamente', () => {
    near(result.values.salaryTotal, 22680.85);
    near(result.values.inssBase, 24565.24);
    near(result.values.inssValue, 2343.08);
    near(result.values.irrfValue, 321.79);
    near(result.values.fgtsValue, 1835.52);
    near(result.values.grossPayroll, 24565.24);
    near(result.values.netPayroll, 20492.37);
  });
});

describe('reconcile DRE × PGDAS', () => {
  const pgdas = parsePgdasDocument(pgdasText);
  const dre = parseBalanceAndDreDocument(dreText);
  const docs: TaxReformDocument[] = [
    { id: '1', companyId: 'c', analysisId: 'a', documentType: 'pgdas', fileName: 'p.pdf', fileUrl: '', fileSize: 0, mimeType: 'application/pdf', readingStatus: 'lido', extractedValues: pgdas.values, extractedFindings: pgdas.findings, extractionConfidence: pgdas.confidence, uploadStatus: 'enviado', storagePath: 's', uploadedAt: '', updatedAt: '' },
    { id: '2', companyId: 'c', analysisId: 'a', documentType: 'dre', fileName: 'd.pdf', fileUrl: '', fileSize: 0, mimeType: 'application/pdf', readingStatus: 'lido', extractedValues: dre.values, extractedFindings: dre.findings, extractionConfidence: dre.confidence, uploadStatus: 'enviado', storagePath: 's', uploadedAt: '', updatedAt: '' },
  ];
  it('CNPJ bate entre documentos (sem alerta crítico de CNPJ)', () => {
    const alerts = reconcileQuestionnaireWithDocuments({}, docs);
    expect(alerts.find((a) => a.field === 'cnpj')).toBeUndefined();
  });
  it('RBAA × DRE.grossRevenue não gera alerta crítico', () => {
    const alerts = reconcileQuestionnaireWithDocuments({}, docs);
    expect(alerts.find((a) => a.field === 'grossRevenue' && a.severity === 'critical')).toBeUndefined();
  });
  it('Alíquotas batem (sem alerta)', () => {
    const alerts = reconcileQuestionnaireWithDocuments({}, docs);
    expect(alerts.find((a) => a.field === 'annualEffectiveTaxRate')).toBeUndefined();
  });
});