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

/**
 * Extrai a relação CLIENTES (saldo a receber) do Balanço, classificando cada
 * sacado por heurística de razão social. Usado apenas como evidência de perfil
 * comercial — NÃO substitui relatório de faturamento por cliente.
 */
function extractBalanceClients(text: string): {
  total: number; b2b: number; b2c: number; entity: number; amounts: number[];
} {
  const lines = text.replace(/\r/g, '\n').split('\n').map((l) => l.trim());
  // Localiza o cabeçalho da conta "CLIENTES" dentro do Balanço.
  // O JB Contábil emite duas linhas "CLIENTES" seguidas (grupo + conta), com o
  // total da conta entre elas. Saltamos AMBAS para evitar que o total da conta
  // seja contado como um cliente.
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^CLIENTES\s*$/.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && (!lines[j] || /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(lines[j]) || /^CLIENTES\s*$/.test(lines[j]))) j += 1;
      start = j;
      break;
    }
  }
  if (start < 0) return { total: 0, b2b: 0, b2c: 0, entity: 0, amounts: [] };
  // Stop ao encontrar próxima seção contábil em CAIXA ALTA.
  const stopRe = /^(ADIANTAMENTOS|CR[EÉ]DITOS\s|OUTROS\s+CR|ATIVO\s+NAO|ATIVO\s+N[ÃA]O|INVESTIMENTOS|IMOBILIZADO|INTANGIVEL|P\s+A\s+S\s+S\s+I\s+V\s+O|PASSIVO|DEPRECIA)/i;
  const noiseRe = /^(Empresa:|Emp\.:|CEP:|Bairro:|Cidade:|NIRE:|CRPJ|Per[ií]odo:|Data do NIRE|IE:|CNPJ:|Endere|Fone|BALAN[ÇC]O|A T I V O|P A S S I V O|ValorContas|Folha:|Contas Cont|_{5,}|S[OÓ]CIO|CONTADOR|RG:|CPF:|CRC:|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|\d{2,}-\d{3}$|0{4,}\d|^$)/;
  const moneyOnly = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
  const out = { total: 0, b2b: 0, b2c: 0, entity: 0, amounts: [] as number[] };
  let nameBuf: string[] = [];
  // Pula a linha imediatamente após o cabeçalho se for o total da conta (já está em accountsReceivable).
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) { continue; }
    if (stopRe.test(line)) break;
    if (noiseRe.test(line)) { nameBuf = []; continue; }
    if (moneyOnly.test(line)) {
      const amount = Number(line.replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(amount)) { nameBuf = []; continue; }
      // Ignora o total inicial (147.536,81 logo após "CLIENTES").
      if (!nameBuf.length) continue;
      const name = nameBuf.join(' ').replace(/\s+/g, ' ').trim();
      const cls = classifyClientName(name);
      out.total += amount;
      out.amounts.push(amount);
      if (cls === 'b2b') out.b2b += amount;
      else if (cls === 'entity') out.entity += amount;
      else out.b2c += amount;
      nameBuf = [];
      continue;
    }
    // Linha textual = parte do nome do cliente
    nameBuf.push(line);
  }
  return out;
}

function classifyClientName(name: string): 'b2b' | 'b2c' | 'entity' {
  const u = name.toUpperCase();
  if (/(\bASSOC(?:IACAO|IAÇÃO|\.)|\bCOND(?:OM[IÍ]NIO|\.)|\bEDIF[IÍ]CIO|\bROTARY|\bCLUBE|\bLOJA\s+SIMB[OÓ]LICA|\bIGREJA|\bPAR[OÓ]QUIA)/.test(u)) return 'entity';
  if (/(\bLTDA\b|\bEIRELI\b|\bS\/?A\b|\bSA\b|\bCIA\b|\bME\b|\bEPP\b|\bMEI\b|ADVOG\.?\s*ASSOC|CORRETORA|TRANSPORTES|TURISMO|TELECOM|CL[IÍ]NICA|PRODUTORA|REPRES|REPRESENTA|IND[\.\s]|COM[\.\s]|COMERCIO|COM[ÉE]RCIO|IND[ÚU]STRIA|SERV[\.IÇOS]|& CIA|EIR\b)/.test(u)) return 'b2b';
  return 'b2c';
}

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
      // Busca número em até 10 linhas, parando em outra linha de rótulo conhecido.
      for (let j = i; j < Math.min(lines.length, i + 10); j += 1) {
        const nums = extractAllNumbers(lines[j]);
        if (nums.length) return nums[0];
        if (j > i && /[A-Za-zÀ-ú]{6,}/.test(lines[j]) && !regex.test(lines[j])) break;
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

  // ---- Perfil de clientes pelo saldo da conta CLIENTES (apenas evidência comercial) ----
  if (values.accountsReceivable !== undefined) {
    const balanceClients = extractBalanceClients(text);
    if (balanceClients.total > 0) {
      values.balanceClientsTotal = Number(balanceClients.total.toFixed(2));
      values.b2bBalanceAmount = Number(balanceClients.b2b.toFixed(2));
      values.b2cBalanceAmount = Number(balanceClients.b2c.toFixed(2));
      values.entityBalanceAmount = Number(balanceClients.entity.toFixed(2));
      values.b2bPercentFromBalanceClients = Number(((balanceClients.b2b / balanceClients.total) * 100).toFixed(2));
      values.b2cPercentFromBalanceClients = Number(((balanceClients.b2c / balanceClients.total) * 100).toFixed(2));
      values.entityPercentFromBalanceClients = Number(((balanceClients.entity / balanceClients.total) * 100).toFixed(2));
      const top10Sum = [...balanceClients.amounts].sort((a, b) => b - a).slice(0, 10).reduce((s, v) => s + v, 0);
      values.top10BalanceClientsConcentration = Number(((top10Sum / balanceClients.total) * 100).toFixed(2));
      values.clientProfileSource = 'balance_clients_account';
      values.clientProfileConfidence = 'medium';
    }
  }

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

    // Folha anual a partir de contas explícitas — uma única passagem pelo map
    // para impedir que variantes do mesmo rótulo somem a mesma linha duas vezes
    // (ex.: "Decimo Terceiro" e "Décimo Terceiro" normalizam para a mesma chave).
    const payrollTargets = new Set<string>([
      'decimo terceiro salario',
      '13 salario',
      'f.g.t.s.',
      'fgts',
      'ferias',
      'ordenados e gratificacoes',
      'aviso previo',
      'despesas c/ estagiarios',
      'estagiarios',
      'ajuda de custo',
      'pro-labore',
    ]);
    const normLabel = (s: string) => s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s./()-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const usedLines = new Set<number>();
    let payrollSum = 0;
    let payrollHits = 0;
    for (const entry of map) {
      if (entry.lineIndex < dreLine) continue;
      if (usedLines.has(entry.lineIndex)) continue;
      if (!payrollTargets.has(normLabel(entry.label))) continue;
      payrollSum += Math.abs(entry.value);
      payrollHits += 1;
      usedLines.add(entry.lineIndex);
    }
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

  // employeesCount: aceita mesma linha OU próximas 6 linhas com inteiro isolado.
  values.employeesCount = extractEmployeesCount(text);

  // Detecta blocos "Total:" em 4 camadas (A: regex full text, B: line-based, C: footer fallback, D: soma de empregados).
  const rawBlocks = findPayrollTotalBlocks(text, warnings);
  const validBlocks: ReturnType<typeof mapPayrollColumns>[] = [];
  for (const cols of rawBlocks) {
    const mapped = mapPayrollColumns(cols);
    if (!mapped) continue;
    if (!isPayrollBlockCoherent(mapped)) {
      warnings.push(`Bloco Total descartado: valores incoerentes (Líquido=${mapped.netPayroll}, Bruto=${mapped.grossPayroll}, Descontos=${mapped.discounts}).`);
      continue;
    }
    validBlocks.push(mapped);
  }
  if (rawBlocks.length && !validBlocks.length) {
    warnings.push('Linha Total encontrada, mas valores incoerentes.');
  } else if (!rawBlocks.length) {
    warnings.push('Linha "Total" não encontrada no relatório de folha.');
  }
  if (validBlocks.length) {
    const sumKey = (k: keyof NonNullable<ReturnType<typeof mapPayrollColumns>>) =>
      Number(validBlocks.reduce((s, b) => s + (b as Record<string, number>)[k as string], 0).toFixed(2));
    values.salaryTotal = sumKey('salaryTotal');
    values.familySalary = sumKey('familySalary');
    values.inssBase = sumKey('inssBase');
    values.inssValue = sumKey('inssValue');
    values.irrfBase = sumKey('irrfBase');
    values.irrfValue = sumKey('irrfValue');
    values.fgtsBase = sumKey('fgtsBase');
    values.fgtsValue = sumKey('fgtsValue');
    values.grossPayroll = sumKey('grossPayroll');
    values.discounts = sumKey('discounts');
    values.netPayroll = sumKey('netPayroll');
    if (validBlocks.length > 1) values.establishmentsAggregated = validBlocks.length;
  }

  pushFinding(findings, documentType, 'cnpj', values.cnpj, 0.9, 'Folha');
  pushFinding(findings, documentType, 'period', values.period, 0.9, 'Folha');
  pushFinding(findings, documentType, 'employeesCount', values.employeesCount, 0.9, 'Folha');
  pushFinding(findings, documentType, 'salaryTotal', values.salaryTotal, 0.85, 'Folha');
  pushFinding(findings, documentType, 'inssValue', values.inssValue, 0.85, 'Folha');
  pushFinding(findings, documentType, 'fgtsValue', values.fgtsValue, 0.85, 'Folha');
  pushFinding(findings, documentType, 'grossPayroll', values.grossPayroll, 0.9, 'Folha', 'Coluna Prov./Vant. da linha Total.');
  pushFinding(findings, documentType, 'netPayroll', values.netPayroll, 0.85, 'Folha');

  // Campos decisivos: período + salaryTotal + grossPayroll + netPayroll.
  const decisiveMissing: string[] = [];
  if (!values.period) decisiveMissing.push('Período');
  if (values.salaryTotal === undefined) decisiveMissing.push('Total de salários');
  if (values.grossPayroll === undefined) decisiveMissing.push('Proventos/Vantagens');
  if (values.netPayroll === undefined) decisiveMissing.push('Líquido a pagar');
  if (decisiveMissing.length) warnings.push(`Campos decisivos ausentes: ${decisiveMissing.join(', ')}.`);
  const confidence = decisiveMissing.length ? 0 : confidenceFromFindings(findings, 0.45);
  return { documentType, values: { ...values, warnings, confidence }, findings, summary: summarizeExtractedValues(values), confidence, warnings };
}

// ============================================================
// Folha — helpers compartilháveis (4 camadas + mapeamento auto)
// ============================================================
const PAYROLL_MONEY_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
function toMoneyNum(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

function extractEmployeesCount(text: string): number | undefined {
  const lines = text.replace(/\r/g, '\n').split('\n');
  let total = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/Total de empregados/i.test(line)) continue;
    const sameLine = line.match(/Total de empregados\s*:?\s*(\d{1,5})\b/i);
    if (sameLine) { total += Number(sameLine[1]); continue; }
    for (let j = i + 1; j < Math.min(lines.length, i + 7); j += 1) {
      const t = (lines[j] ?? '').trim();
      if (!t) continue;
      if (/\d{2}\/\d{2}\/\d{4}/.test(t)) continue;
      if (/P[áa]gina|Pacote|JB Folha/i.test(t)) continue;
      if (/,\d{2}/.test(t)) continue;
      const m = t.match(/^(\d{1,5})$/);
      if (m) { total += Number(m[1]); break; }
    }
  }
  return total > 0 ? total : undefined;
}

function mapPayrollColumns(cols: number[]) {
  if (cols.length < 11) return null;
  const c = cols.slice(0, 11);
  const inssBase = c[2];
  let irrfBase: number, irrfValue: number, fgtsBase: number, fgtsValue: number;
  // Auto-detecta ordem das colunas 4..7:
  // - Ordem visual/docling: BaseIRRF, IRRF, BaseFGTS, FGTS → c[4] é "base" (magnitude alta).
  // - Ordem pdfjs/unpdf:    FGTS,    IRRF, BaseFGTS, BaseIRRF → c[4] é "valor" (magnitude baixa).
  if (c[4] >= inssBase * 0.3) {
    irrfBase = c[4]; irrfValue = c[5]; fgtsBase = c[6]; fgtsValue = c[7];
  } else {
    fgtsValue = c[4]; irrfValue = c[5]; fgtsBase = c[6]; irrfBase = c[7];
  }
  return {
    salaryTotal: c[0], familySalary: c[1],
    inssBase, inssValue: c[3],
    irrfBase, irrfValue,
    fgtsBase, fgtsValue,
    grossPayroll: c[8], discounts: c[9], netPayroll: c[10],
  };
}

function isPayrollBlockCoherent(m: NonNullable<ReturnType<typeof mapPayrollColumns>>): boolean {
  if (Math.abs(m.netPayroll - (m.grossPayroll - m.discounts)) > 1) return false;
  if (m.salaryTotal > m.grossPayroll + 1) return false;
  if (m.inssValue > m.inssBase + 1) return false;
  if (m.fgtsValue > m.fgtsBase + 1) return false;
  if (m.irrfValue > m.irrfBase + 1) return false;
  return true;
}

function findPayrollTotalBlocks(text: string, warnings: string[]): number[][] {
  const blocks: number[][] = [];
  // ---- Camada A: regex direto no texto completo ----
  const fullRe = /\bTotal\s*:\s*((?:-?\d{1,3}(?:\.\d{3})*,\d{2}\s+){10}-?\d{1,3}(?:\.\d{3})*,\d{2})/gi;
  let mm: RegExpExecArray | null;
  while ((mm = fullRe.exec(text)) !== null) {
    const nums = (mm[1].match(PAYROLL_MONEY_RE) ?? []).map(toMoneyNum);
    if (nums.length >= 11) blocks.push(nums.slice(0, 11));
  }
  if (blocks.length) return blocks;

  // ---- Camada B: busca linha-a-linha com acumulação até 30 linhas ----
  const lines = text.replace(/\r/g, '\n').split('\n');
  const skipRe = /^\s*(?:P[áa]gina|JB Folha|Pacote|Sistema|Data\s*:|Hora\s*:|Usu[aá]rio|Fls\.?\s*\d)/i;
  const barrierRe = /\b(Empregado|Empresa\s*:|Inscr\.?\s*Fed|CNPJ\s*:|RESUMO|Cargo\s*:|Departamento\s*:|Total\s*:)/i;
  const totalIdxs: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/Total de empregados/i.test(lines[i])) continue;
    if (/\bTotal\s*:/i.test(lines[i])) totalIdxs.push(i);
  }
  for (const idx of totalIdxs) {
    let buf = lines[idx].replace(/.*?\bTotal\s*:/i, ' ');
    let nums = buf.match(PAYROLL_MONEY_RE) ?? [];
    for (let j = idx + 1; j < Math.min(lines.length, idx + 31) && nums.length < 11; j += 1) {
      const ln = lines[j];
      if (!ln || !ln.trim()) continue;
      if (skipRe.test(ln)) continue;
      if (barrierRe.test(ln)) break;
      buf += ' ' + ln;
      nums = buf.match(PAYROLL_MONEY_RE) ?? [];
    }
    if (nums.length >= 11) blocks.push(nums.slice(0, 11).map(toMoneyNum));
  }
  if (blocks.length) return blocks;

  // ---- Camada C: bloco monetário no rodapé (últimas 80 linhas) ----
  const hasMarkers = /RESUMO DE C[ÁA]LCULO/i.test(text)
    && /Empregado/i.test(text)
    && /Prov\.?\s*\/?\s*Vant/i.test(text)
    && /Descontos/i.test(text)
    && /L[ií]quido/i.test(text);
  if (hasMarkers) {
    const tail = lines.slice(Math.max(0, lines.length - 80));
    for (let i = 0; i < tail.length; i += 1) {
      let buf = tail[i] ?? '';
      let nums = buf.match(PAYROLL_MONEY_RE) ?? [];
      for (let j = i + 1; j < tail.length && nums.length < 11; j += 1) {
        if (barrierRe.test(tail[j])) break;
        buf += ' ' + tail[j];
        nums = buf.match(PAYROLL_MONEY_RE) ?? [];
      }
      if (nums.length === 11) {
        blocks.push(nums.map(toMoneyNum));
        warnings.push('Linha Total não encontrada; usado bloco monetário do rodapé como fallback.');
        return blocks;
      }
    }
  }

  // ---- Camada D: soma de linhas de empregados (^\s*\d{6}\s+) ----
  if (hasMarkers) {
    const empRows: number[][] = [];
    for (const ln of lines) {
      if (!/^\s*\d{6}\s+/.test(ln)) continue;
      const nums = (ln.match(PAYROLL_MONEY_RE) ?? []).map(toMoneyNum);
      if (nums.length === 11) empRows.push(nums);
    }
    if (empRows.length > 0) {
      const sum = Array.from({ length: 11 }, (_, k) =>
        Number(empRows.reduce((s, r) => s + r[k], 0).toFixed(2)));
      blocks.push(sum);
      warnings.push(`Linha Total não encontrada; valores somados de ${empRows.length} empregados (fallback).`);
    }
  }
  return blocks;
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
