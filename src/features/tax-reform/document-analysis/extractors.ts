import {
  buildLineLabelValueMap,
  clampConfidence,
  extractAllNumbers,
  extractCnpj,
  extractNumberAfterLabel,
  findSectionLine,
  findValueByLabels,
  normalizeNumber,
  pushFinding,
  summarizeExtractedValues,
} from './normalize';
import type { TaxReformDocumentExtraction, TaxReformDocumentFinding, TaxReformExtractedValues } from './types';

const linesOf = (text: string) => text.replace(/\r/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
const contains = (text: string, words: string[]) => words.some((word) => new RegExp(word, 'i').test(text));
const pct = (numerator: number | undefined, denominator: number | undefined) => {
  if (numerator === undefined || !denominator) return undefined;
  return Number(((Math.abs(numerator) / denominator) * 100).toFixed(2));
};

function confidenceFromFindings(findings: TaxReformDocumentFinding[], base = 0.35) {
  if (!findings.length) return 0;
  return clampConfidence(Math.min(0.95, base + findings.length * 0.08));
}

// ============================================================
// PGDAS
// ============================================================
export function parsePgdasDocument(text: string, documentType = 'pgdas'): TaxReformDocumentExtraction {
  const findings: TaxReformDocumentFinding[] = [];
  const warnings: string[] = [];
  const values: TaxReformExtractedValues = { taxRegimeDetected: 'simples_nacional' };

  values.cnpj = extractCnpj(text);
  const nameMatch = text.match(/Nome Empresarial:\s*([^\n\r]+)/i);
  if (nameMatch) values.companyName = nameMatch[1].trim().replace(/\s{2,}.*$/, '');
  const paMatch = text.match(/Per[ií]odo de Apura[cç][aã]o\s*\(?PA\)?:\s*(\d{2}\/\d{4})/i);
  if (paMatch) values.period = paMatch[1];

  // Helper: encontra um rótulo no texto e devolve o primeiro número da MESMA linha
  // (ou da próxima linha se a atual não tiver número).
  const firstNumberNear = (regex: RegExp): number | undefined => {
    const lines = text.replace(/\r/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (!regex.test(lines[i])) continue;
      // Busca primeiro número em até 3 linhas a partir daqui.
      for (let j = i; j < Math.min(lines.length, i + 4); j += 1) {
        const nums = extractAllNumbers(lines[j]);
        if (nums.length) return nums[0];
      }
    }
    return undefined;
  };

  values.monthlyRevenue = firstNumberNear(/Receita Bruta do PA/i);
  values.revenue = values.monthlyRevenue;
  values.grossRevenue12m = firstNumberNear(/RBT12|Receita bruta acumulada nos doze meses/i);
  values.rba = firstNumberNear(/\bRBA\b|ano-calend[aá]rio corrente/i);
  values.rbaa = firstNumberNear(/\bRBAA\b|ano-calend[aá]rio anterior/i);

  const limitMatch = text.match(/Limite de receita bruta[^\n]*?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  values.simplesLimit = normalizeNumber(limitMatch?.[1]) ?? 4_800_000;
  const sublimitMatch = text.match(/Sublimite de Receita[^\n]*?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  values.sublimit = normalizeNumber(sublimitMatch?.[1]) ?? 3_600_000;

  // DAS total: prioriza linha "Principal X Multa Y Juros Z Total W" (sempre presente no DAS gerado).
  const principalMatch = text.match(/Principal\s+([\d.,]+)\s+Multa\s+([\d.,]+)\s+Juros\s+([\d.,]+)\s+Total\s+([\d.,]+)/i);
  if (principalMatch) values.dasTotal = normalizeNumber(principalMatch[4]);
  if (values.dasTotal === undefined) {
    // Fallback: 9 valores logo após "Total do Débito Exigível".
    const lines = text.replace(/\r/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (!/Total do D[eé]bito Exig[ií]vel/i.test(lines[i])) continue;
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
        const nums = extractAllNumbers(lines[j]);
        if (nums.length >= 9) {
          [values.irpj, values.csll, values.cofins, values.pis, values.inssCpp, values.icms, values.ipi, values.iss, values.dasTotal] = nums;
          break;
        }
      }
      if (values.dasTotal !== undefined) break;
    }
  }

  if (values.dasTotal !== undefined && values.monthlyRevenue) {
    values.effectiveTaxRate = Number(((values.dasTotal / values.monthlyRevenue) * 100).toFixed(2));
  } else {
    const eta = extractNumberAfterLabel(text, ['alíquota efetiva', 'aliquota efetiva']);
    if (eta !== undefined) values.effectiveTaxRate = eta;
  }

  if (values.grossRevenue12m && values.simplesLimit) {
    values.simplesLimitUsagePercent = Number(((values.grossRevenue12m / values.simplesLimit) * 100).toFixed(2));
  }
  if (values.grossRevenue12m && values.sublimit) {
    values.sublimitUsagePercent = Number(((values.grossRevenue12m / values.sublimit) * 100).toFixed(2));
  }
  if (values.simplesLimitUsagePercent !== undefined) {
    values.nearSimplesLimit = values.simplesLimitUsagePercent >= 80;
  }

  // Fator R
  if (/Fator\s*r\s*=\s*N[aã]o se aplica/i.test(text)) {
    values.factorRStatus = 'nao_se_aplica';
    values.shouldCalculateFactorR = false;
  } else if (/Fator\s*r\s*=\s*/i.test(text)) {
    values.factorRStatus = 'aplica';
    values.shouldCalculateFactorR = true;
  } else {
    values.factorRStatus = 'desconhecido';
  }

  values.hasExportation = /Mercado Externo[\s\S]{0,200}?(?!0,00)\d+,\d{2}/i.test(text) && !/Mercado Externo 0,00 Total/.test(text) ? undefined : undefined;
  // For real PGDAS: detect if any mercado externo > 0
  const externoMatch = text.match(/Receita Bruta do PA[^\n]*\n?[^\n]*?\d{1,3}(?:\.\d{3})*,\d{2}\s+(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  if (externoMatch) {
    const ext = normalizeNumber(externoMatch[1]);
    if (ext !== undefined) values.hasExportation = ext > 0;
  }

  values.hasSt = /Substitui[cç][aã]o Tribut[aá]ria/i.test(text) ? true : undefined;
  values.hasMonophasic = /monof[aá]sic/i.test(text) ? true : undefined;

  // Findings
  pushFinding(findings, documentType, 'cnpj', values.cnpj, 0.95, 'PGDAS', 'CNPJ do contribuinte no extrato.');
  pushFinding(findings, documentType, 'period', values.period, 0.9, 'PGDAS');
  pushFinding(findings, documentType, 'monthlyRevenue', values.monthlyRevenue, 0.9, 'PGDAS', 'Receita Bruta do PA (RPA).');
  pushFinding(findings, documentType, 'grossRevenue12m', values.grossRevenue12m, 0.9, 'PGDAS', 'RBT12 identificado no demonstrativo oficial.');
  pushFinding(findings, documentType, 'rba', values.rba, 0.85, 'PGDAS');
  pushFinding(findings, documentType, 'rbaa', values.rbaa, 0.85, 'PGDAS');
  pushFinding(findings, documentType, 'dasTotal', values.dasTotal, 0.9, 'PGDAS', 'Total do Débito Exigível do PA.');
  pushFinding(findings, documentType, 'effectiveTaxRate', values.effectiveTaxRate, 0.9, 'PGDAS',
    values.dasTotal !== undefined && values.monthlyRevenue ? 'Calculada como DAS ÷ Receita do PA × 100.' : 'Identificada no PGDAS.');
  pushFinding(findings, documentType, 'simplesLimitUsagePercent', values.simplesLimitUsagePercent, 0.85, 'PGDAS');
  pushFinding(findings, documentType, 'nearSimplesLimit', values.nearSimplesLimit, 0.85, 'PGDAS');
  pushFinding(findings, documentType, 'factorRStatus', values.factorRStatus, 0.9, 'PGDAS');
  pushFinding(findings, documentType, 'taxRegimeDetected', values.taxRegimeDetected, 0.9, 'PGDAS');

  if (!values.monthlyRevenue) warnings.push('Receita Bruta do PA não localizada no PGDAS.');
  if (!values.grossRevenue12m) warnings.push('RBT12 não localizado no PGDAS.');
  if (values.dasTotal === undefined) warnings.push('Total do DAS não localizado; alíquota efetiva não pôde ser calculada.');

  const confidence = confidenceFromFindings(findings, 0.5);
  return { documentType, values: { ...values, warnings, confidence }, findings, summary: summarizeExtractedValues(values), confidence, warnings };
}

// ============================================================
// BALANÇO + DRE (PDF único)
// ============================================================
export function parseBalanceAndDreDocument(text: string, documentType = 'dre'): TaxReformDocumentExtraction {
  const findings: TaxReformDocumentFinding[] = [];
  const warnings: string[] = [];
  const values: TaxReformExtractedValues = {};

  values.cnpj = extractCnpj(text);
  const nameMatch = text.match(/Empresa:\s*(?:Emp\.?:[^A-Z]*)?([A-ZÇÃÕÁÉÍÓÚÂÊÔ][A-ZÇÃÕÁÉÍÓÚÂÊÔ\s.&-]+LTDA[^\n]*)/);
  if (nameMatch) values.companyName = nameMatch[1].trim();
  const periodMatch = text.match(/Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4}\s*[aà]\s*\d{2}\/\d{2}\/\d{4})/i);
  if (periodMatch) values.period = periodMatch[1];

  const map = buildLineLabelValueMap(text);
  const activoLine = findSectionLine(text, ['A T I V O', 'BALANÇO PATRIMONIAL']);
  const passivoLine = findSectionLine(text, ['P A S S I V O']);
  const dreLine = findSectionLine(text, ['DEMONSTRAÇÃO DO RESULTADO', 'DEMONSTRACAO DO RESULTADO']);

  const ativoEnd = passivoLine > 0 ? passivoLine : (dreLine > 0 ? dreLine : undefined);
  const passivoEnd = dreLine > 0 ? dreLine : undefined;

  // ---- BALANÇO ATIVO ----
  values.assetsTotal = findValueByLabels(map, ['A T I V O', 'ATIVO'], { exact: true, fromLine: activoLine, toLine: ativoEnd })
    ?? findValueByLabels(map, ['ATIVO'], { fromLine: activoLine, toLine: ativoEnd });
  values.currentAssets = findValueByLabels(map, ['ATIVO CIRCULANTE'], { fromLine: activoLine, toLine: ativoEnd });
  values.cashAndBanks = findValueByLabels(map, ['DISPONIVEL', 'DISPONÍVEL'], { fromLine: activoLine, toLine: ativoEnd });
  values.financialInvestments = findValueByLabels(map, ['APLICAÇÕES FINANCEIRAS', 'APLICACOES FINANCEIRAS'], { fromLine: activoLine, toLine: ativoEnd });
  values.accountsReceivable = findValueByLabels(map, ['CLIENTES'], { fromLine: activoLine, toLine: ativoEnd });
  values.nonCurrentAssets = findValueByLabels(map, ['ATIVO NAO CIRCULANTE', 'ATIVO NÃO CIRCULANTE'], { fromLine: activoLine, toLine: ativoEnd });

  // ---- BALANÇO PASSIVO ----
  if (passivoLine > 0) {
    values.liabilitiesTotal = findValueByLabels(map, ['P A S S I V O', 'PASSIVO'], { fromLine: passivoLine, toLine: passivoEnd });
    values.currentLiabilities = findValueByLabels(map, ['PASSIVO CIRCULANTE'], { fromLine: passivoLine, toLine: passivoEnd });
    values.suppliersBalance = findValueByLabels(map, ['FORNECEDORES'], { fromLine: passivoLine, toLine: passivoEnd });
    values.laborObligations = findValueByLabels(map, ['OBRIGAÇÕES TRABALHISTAS', 'OBRIGACOES TRABALHISTAS'], { fromLine: passivoLine, toLine: passivoEnd });
    values.taxObligations = findValueByLabels(map, ['OBRIGAÇÕES TRIBUTARIAS', 'OBRIGACOES TRIBUTARIAS', 'OBRIGAÇÕES TRIBUTÁRIAS'], { fromLine: passivoLine, toLine: passivoEnd });
    values.simplesPayable = findValueByLabels(map, ['Simples Nacional a Recolher'], { fromLine: passivoLine, toLine: passivoEnd });
    values.irrfPayable = findValueByLabels(map, ['IRRF a Recolher'], { fromLine: passivoLine, toLine: passivoEnd });
    values.equity = findValueByLabels(map, ['PATRIMÔNIO LÍQUIDO', 'PATRIMONIO LIQUIDO'], { fromLine: passivoLine, toLine: passivoEnd });
    values.capitalStock = findValueByLabels(map, ['Capital Social'], { fromLine: passivoLine, toLine: passivoEnd });
    values.accumulatedProfits = findValueByLabels(map, ['Lucros ou Prejuízos Acumulados', 'Lucros ou Prejuizos Acumulados'], { fromLine: passivoLine, toLine: passivoEnd });
    values.afac = findValueByLabels(map, ['ADIANTAMENTO PARA FUTURO AUMENTO', 'Adto p/ Futuro Aumento'], { fromLine: passivoLine, toLine: passivoEnd });
  }

  // ---- DRE ----
  if (dreLine > 0) {
    values.grossRevenue = findValueByLabels(map, ['RECEITA BRUTA OPERACIONAL'], { fromLine: dreLine });
    values.serviceRevenue = findValueByLabels(map, ['PRESTAÇÃO DE SERVIÇOS', 'PRESTACAO DE SERVICOS'], { fromLine: dreLine });
    values.simplesNacionalExpense = findValueByLabels(map, ['SIMPLES NACIONAL'], { fromLine: dreLine });
    if (values.simplesNacionalExpense !== undefined) values.simplesNacionalExpense = Math.abs(values.simplesNacionalExpense);
    values.netRevenue = findValueByLabels(map, ['RECEITA OPERACIONAL LÍQUIDA', 'RECEITA OPERACIONAL LIQUIDA'], { fromLine: dreLine });
    values.serviceCosts = findValueByLabels(map, ['CUSTO DOS SERVIÇOS PRESTADOS', 'CUSTO DOS SERVICOS PRESTADOS'], { fromLine: dreLine });
    if (values.serviceCosts !== undefined) values.serviceCosts = Math.abs(values.serviceCosts);
    values.grossProfit = findValueByLabels(map, ['LUCRO BRUTO'], { fromLine: dreLine });
    values.operatingExpenses = findValueByLabels(map, ['TOTAL DESPESAS OPERACIONAIS'], { fromLine: dreLine });
    if (values.operatingExpenses !== undefined) values.operatingExpenses = Math.abs(values.operatingExpenses);
    values.adminExpenses = findValueByLabels(map, ['DESPESAS ADMINISTRATIVAS'], { fromLine: dreLine });
    if (values.adminExpenses !== undefined) values.adminExpenses = Math.abs(values.adminExpenses);
    values.proLabore = findValueByLabels(map, ['Pro-Labore', 'Pró-Labore'], { fromLine: dreLine });
    if (values.proLabore !== undefined) values.proLabore = Math.abs(values.proLabore);
    values.pjServices = findValueByLabels(map, ['Serviços Prestados PJ', 'Servicos Prestados PJ'], { fromLine: dreLine });
    if (values.pjServices !== undefined) values.pjServices = Math.abs(values.pjServices);
    values.taxExpenses = findValueByLabels(map, ['DESPESAS TRIBUTARIAS', 'DESPESAS TRIBUTÁRIAS'], { fromLine: dreLine });
    if (values.taxExpenses !== undefined) values.taxExpenses = Math.abs(values.taxExpenses);
    values.financialResult = findValueByLabels(map, ['RESULTADO FINANCEIRO LIQUIDO', 'RESULTADO FINANCEIRO LÍQUIDO'], { fromLine: dreLine });
    values.otherOperatingExpenses = findValueByLabels(map, ['OUTRAS DESPESAS OPERACIONAIS'], { fromLine: dreLine });
    if (values.otherOperatingExpenses !== undefined) values.otherOperatingExpenses = Math.abs(values.otherOperatingExpenses);
    values.netProfit = findValueByLabels(map, ['RESULTADO LÍQUIDO DO EXERCÍCIO', 'RESULTADO LIQUIDO DO EXERCICIO'], { fromLine: dreLine })
      ?? findValueByLabels(map, ['RESULTADO LÍQUIDO ANTES DAS PROVISÕES'], { fromLine: dreLine });

    // Folha anual a partir de contas explícitas (NÃO usar regex genérica "folha").
    const payrollAccounts = [
      'Decimo Terceiro Salário', 'Décimo Terceiro Salário', '13º Salário',
      'F.G.T.S.', 'FGTS',
      'Ferias', 'Férias',
      'Ordenados e Gratificações', 'Ordenados e Gratificacoes',
      'Aviso Previo', 'Aviso Prévio',
      'Despesas C/ Estagiários', 'Despesas C/ Estagiarios', 'Estagiários',
      'Ajuda de Custo',
      'Pro-Labore', 'Pró-Labore',
    ];
    let payrollSum = 0;
    let payrollHits = 0;
    payrollAccounts.forEach((account) => {
      const v = findValueByLabels(map, [account], { exact: true, fromLine: dreLine });
      if (v !== undefined) { payrollSum += Math.abs(v); payrollHits += 1; }
    });
    if (payrollHits > 0) {
      values.annualPayrollFromDre = Number(payrollSum.toFixed(2));
      if (values.grossRevenue) values.payrollPercentFromDre = pct(payrollSum, values.grossRevenue);
      values.payrollPercent = values.payrollPercentFromDre;
    }

    if (values.grossRevenue && values.simplesNacionalExpense !== undefined) {
      values.annualEffectiveTaxRate = pct(values.simplesNacionalExpense, values.grossRevenue);
    }
    if (values.grossRevenue && values.serviceCosts !== undefined) {
      values.inputCostPercent = pct(values.serviceCosts, values.grossRevenue);
    }
    if (values.grossRevenue && values.grossProfit !== undefined) {
      values.grossMargin = pct(values.grossProfit, values.grossRevenue);
    }
    if (values.grossRevenue && values.netProfit !== undefined) {
      values.netMargin = pct(values.netProfit, values.grossRevenue);
    }
    values.revenue = values.grossRevenue;
  } else {
    warnings.push('Seção DRE não encontrada no documento.');
  }

  // Findings
  pushFinding(findings, documentType, 'cnpj', values.cnpj, 0.9, 'Balanço/DRE');
  pushFinding(findings, documentType, 'assetsTotal', values.assetsTotal, 0.85, 'Balanço');
  pushFinding(findings, documentType, 'equity', values.equity, 0.85, 'Balanço');
  pushFinding(findings, documentType, 'afac', values.afac, 0.8, 'Balanço');
  pushFinding(findings, documentType, 'grossRevenue', values.grossRevenue, 0.9, 'DRE');
  pushFinding(findings, documentType, 'simplesNacionalExpense', values.simplesNacionalExpense, 0.85, 'DRE');
  pushFinding(findings, documentType, 'netRevenue', values.netRevenue, 0.85, 'DRE');
  pushFinding(findings, documentType, 'serviceCosts', values.serviceCosts, 0.85, 'DRE');
  pushFinding(findings, documentType, 'inputCostPercent', values.inputCostPercent, 0.85, 'DRE', 'Calculado: custo dos serviços ÷ receita bruta × 100.');
  pushFinding(findings, documentType, 'grossMargin', values.grossMargin, 0.8, 'DRE');
  pushFinding(findings, documentType, 'netMargin', values.netMargin, 0.8, 'DRE');
  pushFinding(findings, documentType, 'annualEffectiveTaxRate', values.annualEffectiveTaxRate, 0.85, 'DRE', 'Calculada: Simples Nacional ÷ receita bruta × 100.');
  pushFinding(findings, documentType, 'annualPayrollFromDre', values.annualPayrollFromDre, 0.8, 'DRE', 'Soma de contas explícitas de mão de obra (13º, FGTS, Férias, Ordenados, Aviso Prévio, Estagiários, Ajuda de Custo, Pró-Labore).');
  pushFinding(findings, documentType, 'payrollPercentFromDre', values.payrollPercentFromDre, 0.8, 'DRE');
  pushFinding(findings, documentType, 'netProfit', values.netProfit, 0.85, 'DRE');

  if (!values.grossRevenue) warnings.push('Receita bruta não localizada na DRE.');

  const confidence = confidenceFromFindings(findings, 0.45);
  return { documentType, values: { ...values, warnings, confidence }, findings, summary: summarizeExtractedValues(values), confidence, warnings };
}

// ============================================================
// FOLHA DE PAGAMENTO (Resumo de Cálculo)
// ============================================================
export function parsePayrollSummaryDocument(text: string, documentType = 'folha_pagamento'): TaxReformDocumentExtraction {
  const findings: TaxReformDocumentFinding[] = [];
  const warnings: string[] = [];
  const values: TaxReformExtractedValues = {};

  values.cnpj = extractCnpj(text);
  const empMatch = text.match(/Empresa:\s*([^\n]+)/);
  if (empMatch) values.companyName = empMatch[1].trim();
  const periodMatch = text.match(/Per[ií]odo:\s*\d{2}\/(\d{2})\/(\d{4})/i);
  if (periodMatch) values.period = `${periodMatch[1]}/${periodMatch[2]}`;

  // "Total de empregados:" pode aparecer antes ou depois da linha numérica.
  const empCountMatch = text.match(/Total de empregados:\s*\n?\s*([\s\S]*?)(?:\n|$)/i);
  // Pega o último número isolado após o bloco Total: ... empregados
  const totalBlockMatch = text.match(/Total:\s*\n?Total de empregados:\s*\n?([^\n]+)\n?\s*(\d+)/);
  if (totalBlockMatch) {
    const numericLine = totalBlockMatch[1];
    values.employeesCount = Number(totalBlockMatch[2]);
    const nums = extractAllNumbers(numericLine);
    // Order observed in JB Folha "RESUMO DE CÁLCULO" totals line (extração unpdf):
    // [0]=Salário, [1]=S.Fam, [2]=BaseINSS, [3]=INSS, [4]=FGTS, [5]=IRRF, [6]=BaseFGTS, [7]=BaseIRRF, [8]=Prov./Vant., [9]=Descontos, [10]=Líquido
    if (nums.length >= 11) {
      values.salaryTotal = nums[0];
      values.inssBase = nums[2];
      values.inssValue = nums[3];
      values.fgtsValue = nums[4];
      values.irrfValue = nums[5];
      values.fgtsBase = nums[6];
      values.irrfBase = nums[7];
      values.grossPayroll = nums[8];
      values.discounts = nums[9];
      values.netPayroll = nums[10];
    }
  } else {
    warnings.push('Linha "Total" não encontrada no relatório de folha.');
  }

  pushFinding(findings, documentType, 'cnpj', values.cnpj, 0.9, 'Folha');
  pushFinding(findings, documentType, 'period', values.period, 0.9, 'Folha');
  pushFinding(findings, documentType, 'employeesCount', values.employeesCount, 0.9, 'Folha');
  pushFinding(findings, documentType, 'salaryTotal', values.salaryTotal, 0.85, 'Folha');
  pushFinding(findings, documentType, 'inssValue', values.inssValue, 0.85, 'Folha');
  pushFinding(findings, documentType, 'fgtsValue', values.fgtsValue, 0.85, 'Folha');
  pushFinding(findings, documentType, 'grossPayroll', values.grossPayroll, 0.9, 'Folha', 'Coluna Prov./Vant. da linha Total.');
  pushFinding(findings, documentType, 'netPayroll', values.netPayroll, 0.85, 'Folha');

  const confidence = confidenceFromFindings(findings, 0.45);
  return { documentType, values: { ...values, warnings, confidence }, findings, summary: summarizeExtractedValues(values), confidence, warnings };
}

// ============================================================
// Faturamento por cliente (mantido)
// ============================================================
function extractClientRevenue(text: string, documentType: string): TaxReformDocumentExtraction {
  const findings: TaxReformDocumentFinding[] = [];
  const warnings: string[] = [];
  const rows = linesOf(text);
  let total = 0;
  let b2b = 0;
  let b2c = 0;
  let government = 0;
  const amounts: number[] = [];
  rows.forEach((row) => {
    const cols = row.split(/[;,\t]/).map((col) => col.trim()).filter(Boolean);
    const amount = [...cols].reverse().map(normalizeNumber).find((value) => value !== undefined);
    if (!amount) return;
    total += amount;
    amounts.push(amount);
    const lowered = row.toLowerCase();
    const hasCnpj = /\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/.test(row);
    const hasCpf = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(row);
    if (contains(lowered, ['governo', 'prefeitura', 'estado', 'município', 'municipio', 'união', 'uniao'])) government += amount;
    else if (hasCnpj || contains(lowered, [' ltda', ' s/a', ' sa ', 'eireli', 'empresa', 'industria', 'comercio'])) b2b += amount;
    else if (hasCpf || contains(lowered, ['consumidor final', 'pessoa física', 'pessoa fisica', 'cpf'])) b2c += amount;
  });
  const values: TaxReformExtractedValues = {};
  if (total > 0) {
    values.revenue = Number(total.toFixed(2));
    values.b2bPercent = Number(((b2b / total) * 100).toFixed(2));
    values.b2cPercent = Number(((b2c / total) * 100).toFixed(2));
    values.governmentPercent = Number(((government / total) * 100).toFixed(2));
    const top10 = amounts.sort((a, b) => b - a).slice(0, 10).reduce((sum, value) => sum + value, 0);
    values.top10ClientsConcentration = Number(((top10 / total) * 100).toFixed(2));
  }
  pushFinding(findings, documentType, 'revenue', values.revenue, 0.75, 'Faturamento por cliente');
  pushFinding(findings, documentType, 'b2bPercent', values.b2bPercent, 0.75, 'Faturamento por cliente', 'Percentual estimado por CNPJ e marcadores de pessoa jurídica.');
  pushFinding(findings, documentType, 'b2cPercent', values.b2cPercent, 0.7, 'Faturamento por cliente', 'Percentual estimado por CPF/consumidor final.');
  pushFinding(findings, documentType, 'governmentPercent', values.governmentPercent, 0.7, 'Faturamento por cliente');
  pushFinding(findings, documentType, 'top10ClientsConcentration', values.top10ClientsConcentration, 0.8, 'Faturamento por cliente');
  if (!total) warnings.push('Não foi possível identificar valores por cliente.');
  const confidence = confidenceFromFindings(findings, 0.35);
  return { documentType, values: { ...values, warnings, confidence }, findings, summary: summarizeExtractedValues(values), confidence, warnings };
}

function extractSupplierLike(text: string, documentType: string): TaxReformDocumentExtraction {
  const base = documentType === 'fornecedores' ? 'Fornecedores' : 'Documento';
  const findings: TaxReformDocumentFinding[] = [];
  const warnings: string[] = [];
  const revenue = extractNumberAfterLabel(text, ['receitas', 'receita', 'faturamento']);
  const costs = extractNumberAfterLabel(text, ['custos', 'cmv', 'compras', 'fornecedores']);
  const expenses = extractNumberAfterLabel(text, ['despesas', 'despesas operacionais']);
  const result = extractNumberAfterLabel(text, ['resultado', 'lucro líquido', 'lucro liquido']);
  const values: TaxReformExtractedValues = { revenue, operatingExpenses: expenses, netProfit: result };
  if (revenue && costs !== undefined) values.inputCostPercent = Number(((Math.abs(costs) / revenue) * 100).toFixed(2));
  if (contains(text, ['lucro real'])) values.supplierRegimeDetected = 'lucro_real';
  else if (contains(text, ['lucro presumido'])) values.supplierRegimeDetected = 'lucro_presumido';
  else if (contains(text, ['simples nacional'])) values.supplierRegimeDetected = 'simples_nacional';
  pushFinding(findings, documentType, 'revenue', values.revenue, 0.7, base);
  pushFinding(findings, documentType, 'inputCostPercent', values.inputCostPercent, 0.7, base);
  pushFinding(findings, documentType, 'supplierRegimeDetected', values.supplierRegimeDetected, 0.55, base);
  pushFinding(findings, documentType, 'operatingExpenses', expenses, 0.6, base);
  if (!findings.length) warnings.push('Campos decisivos não localizados no documento.');
  const confidence = confidenceFromFindings(findings, 0.3);
  return { documentType, values: { ...values, warnings, confidence }, findings, summary: summarizeExtractedValues(values), confidence, warnings };
}

export function extractTaxReformDocumentFromText(documentType: string, text: string): TaxReformDocumentExtraction {
  if (!text.trim()) {
    return { documentType, values: { warnings: ['Arquivo sem texto extraível.'], confidence: 0 }, findings: [], summary: 'Arquivo sem texto extraível para leitura automática.', confidence: 0, warnings: ['Arquivo sem texto extraível.'] };
  }
  if (documentType === 'pgdas') return parsePgdasDocument(text, documentType);
  if (documentType === 'dre' || documentType === 'balancete') return parseBalanceAndDreDocument(text, documentType);
  if (documentType === 'folha_pagamento') return parsePayrollSummaryDocument(text, documentType);
  if (documentType === 'faturamento_cliente') return extractClientRevenue(text, documentType);
  if (['vendas_cfop', 'nfse'].includes(documentType)) {
    const extraction = parsePgdasDocument(text, documentType);
    extraction.values.hasIssRetido = contains(text, ['iss retido']) || undefined;
    pushFinding(extraction.findings, documentType, 'hasIssRetido', extraction.values.hasIssRetido, 0.65, documentType.toUpperCase());
    extraction.summary = summarizeExtractedValues(extraction.values);
    return extraction;
  }
  return extractSupplierLike(text, documentType);
}
