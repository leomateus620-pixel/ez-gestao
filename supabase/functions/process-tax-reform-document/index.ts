import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1';
import * as XLSX from 'npm:xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ExtractedValues = Record<string, unknown> & { warnings?: string[]; confidence?: number };
type Finding = { documentType: string; field: string; value: string | number | boolean; confidence: number; sourceLabel?: string; explanation?: string };

const normalizeNumber = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  const negativeByParen = /^\(.+\)$/.test(trimmed);
  const parsed = Number(trimmed.replace(/^\(|\)$/g, '').replace(/R\$|%/gi, '').replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return undefined;
  return negativeByParen ? -Math.abs(parsed) : parsed;
};

const money = /-?\d{1,3}(?:\.\d{3})*(?:,\d{2})|-?\d+(?:[,.]\d{2})?/;
const moneyG = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
/**
 * Procura um rótulo no texto e retorna o ÚLTIMO número monetário da MESMA linha
 * (colunas de balancete: saldo atual costuma ser o último). Se a linha do rótulo
 * não tiver número, busca em até `lookahead` linhas seguintes não-rótulo. Se
 * houver múltiplas ocorrências do rótulo, prefere a última (transmissões/anos
 * mais recentes).
 */
const numberAfter = (text: string, labels: string[], lookahead = 6) => {
  const lines = text.replace(/\r/g, '\n').split('\n');
  let best: number | undefined;
  for (const label of labels) {
    const re = new RegExp(label, 'i');
    for (let i = 0; i < lines.length; i += 1) {
      if (!re.test(lines[i])) continue;
      // Mesma linha → último número.
      const sameLine = lines[i].match(moneyG);
      if (sameLine && sameLine.length) {
        const v = normalizeNumber(sameLine[sameLine.length - 1]);
        if (v !== undefined) { best = v; continue; }
      }
      // Próximas linhas até achar número ou outra linha-rótulo.
      for (let j = i + 1; j < Math.min(lines.length, i + 1 + lookahead); j += 1) {
        const next = lines[j];
        if (!next || !next.trim()) continue;
        const nums = next.match(moneyG);
        if (nums && nums.length) {
          const v = normalizeNumber(nums[nums.length - 1]);
          if (v !== undefined) { best = v; break; }
        }
        // Se for outra linha de texto sem número, desiste.
        if (/[A-Za-zÀ-ú]{4,}/.test(next)) break;
      }
    }
    if (best !== undefined) return best;
  }
  return best;
};
const has = (text: string, words: string[]) => words.some((word) => new RegExp(word, 'i').test(text));
const push = (findings: Finding[], documentType: string, field: string, value: unknown, confidence: number, sourceLabel?: string) => {
  if (value === undefined || value === null || value === '') return;
  findings.push({ documentType, field, value: value as string | number | boolean, confidence, sourceLabel });
};

// ============================================================
// BALANÇO + DRE (parser dedicado, espelha o parser do cliente em
// src/features/tax-reform/document-analysis/extractors.ts).
// Não usa rótulos amplos como "receita" / "resultado" — sempre usa
// rótulos específicos da DRE para evitar capturar valores do Balanço.
// ============================================================
const normalizeLabelKey = (label: string) => label
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s./()-]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const parenMoneyRe = /\(?-?\d{1,3}(?:\.\d{3})*(?:,\d{2})\)?|\(?-?\d+(?:[,.]\d{2})?\)?/;

function buildLabelValueMap(text: string): Array<{ label: string; value: number; lineIndex: number }> {
  const raw = text.replace(/\r/g, '\n').split('\n').map((l) => l.trim());
  const out: Array<{ label: string; value: number; lineIndex: number }> = [];
  const seen = new Set<string>();
  const add = (label: string, value: number | undefined, lineIndex: number) => {
    const cleanLabel = label.replace(/\s+/g, ' ').trim();
    if (value === undefined || !cleanLabel || /^\d/.test(cleanLabel)) return;
    const key = `${lineIndex}:${normalizeLabelKey(cleanLabel)}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: cleanLabel, value, lineIndex });
  };
  const isNumericLine = (line: string) => {
    if (!line) return false;
    const stripped = line.replace(/[()\s.,\-\d]/g, '');
    return stripped.length === 0 && /\d/.test(line);
  };
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i];
    if (!line) continue;
    if (isNumericLine(line)) continue;
    if (!/\d/.test(line)) {
      for (let j = i + 1; j < Math.min(raw.length, i + 4); j += 1) {
        const next = raw[j];
        if (!next) continue;
        if (isNumericLine(next)) {
          const value = normalizeNumber(next);
          add(line, value, i);
          break;
        }
        if (/\d/.test(next)) break;
      }
      continue;
    }
    const m = line.match(new RegExp(`^(.+?)[\\s:]+(${parenMoneyRe.source})\\s*$`));
    if (m) {
      const value = normalizeNumber(m[2]);
      const label = m[1].trim();
      add(label, value, i);
    }
    const reverse = line.match(new RegExp(`^(${parenMoneyRe.source})\\s+(.+?)$`));
    if (reverse) {
      add(reverse[2], normalizeNumber(reverse[1]), i);
    }
    const pairRe = new RegExp(`([A-Za-zÀ-ú][A-Za-zÀ-ú0-9\\s./()ºª-]{2,}?)\\s+(${parenMoneyRe.source})(?=\\s+[A-Za-zÀ-ú]|\\s*$)`, 'g');
    let pair: RegExpExecArray | null;
    while ((pair = pairRe.exec(line)) !== null) {
      add(pair[1], normalizeNumber(pair[2]), i);
    }
  }
  return out;
}

function findValueByLabels(
  map: Array<{ label: string; value: number; lineIndex: number }>,
  labels: string[],
  options: { exact?: boolean; fromLine?: number; toLine?: number } = {},
): number | undefined {
  const targets = labels.map(normalizeLabelKey);
  for (const target of targets) {
    for (const entry of map) {
      if (options.fromLine !== undefined && entry.lineIndex < options.fromLine) continue;
      if (options.toLine !== undefined && entry.lineIndex > options.toLine) continue;
      const norm = normalizeLabelKey(entry.label);
      const matches = options.exact ? norm === target : norm.includes(target);
      if (matches) return entry.value;
    }
  }
  return undefined;
}

function findSectionLine(text: string, markers: string[]): number {
  const lines = text.replace(/\r/g, '\n').split('\n').map((l) => normalizeLabelKey(l));
  const needles = markers.map(normalizeLabelKey);
  for (let i = 0; i < lines.length; i += 1) {
    if (needles.some((n) => lines[i].includes(n))) return i;
  }
  return -1;
}

function findFirstLineByLabels(map: Array<{ label: string; value: number; lineIndex: number }>, labels: string[]): number {
  const targets = labels.map(normalizeLabelKey);
  let best = Number.POSITIVE_INFINITY;
  for (const entry of map) {
    const norm = normalizeLabelKey(entry.label);
    if (targets.some((target) => norm.includes(target))) best = Math.min(best, entry.lineIndex);
  }
  return Number.isFinite(best) ? best : -1;
}

function pct(numerator: number | undefined, denominator: number | undefined): number | undefined {
  if (numerator === undefined || !denominator) return undefined;
  return Number(((Math.abs(numerator) / denominator) * 100).toFixed(2));
}

function parseBalanceAndDre(text: string, documentType: string): { values: ExtractedValues; findings: Finding[]; warnings: string[] } {
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const values: ExtractedValues = {};

  const cnpjMatch = text.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
  if (cnpjMatch) values.cnpj = cnpjMatch[0];
  const periodMatch = text.match(/Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4}\s*[aà]\s*\d{2}\/\d{2}\/\d{4})/i);
  if (periodMatch) values.period = periodMatch[1];

  const map = buildLabelValueMap(text);
  const activoLine = findSectionLine(text, ['A T I V O', 'BALANÇO PATRIMONIAL']);
  const passivoLine = findSectionLine(text, ['P A S S I V O']);
  const dreMarkers = [
    'RECEITA BRUTA OPERACIONAL',
    'PRESTAÇÃO DE SERVIÇOS',
    'PRESTACAO DE SERVICOS',
    'CUSTO DOS SERVIÇOS PRESTADOS',
    'CUSTO DOS SERVICOS PRESTADOS',
    'LUCRO BRUTO',
    'RESULTADO LÍQUIDO DO EXERCÍCIO',
    'RESULTADO LIQUIDO DO EXERCICIO',
  ];
  const headingDreLine = findSectionLine(text, ['DEMONSTRAÇÃO DO RESULTADO', 'DEMONSTRACAO DO RESULTADO']);
  const firstDreAccountLine = findFirstLineByLabels(map, dreMarkers);
  const dreLine = headingDreLine >= 0 ? headingDreLine : firstDreAccountLine;

  const ativoEnd = passivoLine > 0 ? passivoLine : (dreLine > 0 ? dreLine : undefined);
  const passivoEnd = dreLine > 0 ? dreLine : undefined;

  // Balanço — Ativo
  if (activoLine >= 0) {
    values.assetsTotal = findValueByLabels(map, ['ATIVO'], { fromLine: activoLine, toLine: ativoEnd });
    values.accountsReceivable = findValueByLabels(map, ['CLIENTES'], { fromLine: activoLine, toLine: ativoEnd });
  }
  // Balanço — Passivo
  if (passivoLine > 0) {
    values.equity = findValueByLabels(map, ['PATRIMÔNIO LÍQUIDO', 'PATRIMONIO LIQUIDO'], { fromLine: passivoLine, toLine: passivoEnd });
    values.afac = findValueByLabels(map, ['ADIANTAMENTO PARA FUTURO AUMENTO', 'Adto p/ Futuro Aumento'], { fromLine: passivoLine, toLine: passivoEnd });
  }

  // DRE
  if (dreLine >= 0) {
    values.grossRevenue = findValueByLabels(map, ['RECEITA BRUTA OPERACIONAL'], { fromLine: dreLine });
    values.serviceRevenue = findValueByLabels(map, ['PRESTAÇÃO DE SERVIÇOS', 'PRESTACAO DE SERVICOS'], { fromLine: dreLine });
    let simples = findValueByLabels(map, ['SIMPLES NACIONAL'], { fromLine: dreLine });
    if (simples !== undefined) simples = Math.abs(simples);
    values.simplesNacionalExpense = simples;
    values.netRevenue = findValueByLabels(map, ['RECEITA OPERACIONAL LÍQUIDA', 'RECEITA OPERACIONAL LIQUIDA'], { fromLine: dreLine });
    let costs = findValueByLabels(map, ['CUSTO DOS SERVIÇOS PRESTADOS', 'CUSTO DOS SERVICOS PRESTADOS'], { fromLine: dreLine });
    if (costs !== undefined) costs = Math.abs(costs);
    values.serviceCosts = costs;
    values.grossProfit = findValueByLabels(map, ['LUCRO BRUTO'], { fromLine: dreLine });
    let opEx = findValueByLabels(map, ['TOTAL DESPESAS OPERACIONAIS'], { fromLine: dreLine });
    if (opEx !== undefined) opEx = Math.abs(opEx);
    values.operatingExpenses = opEx;
    let admin = findValueByLabels(map, ['DESPESAS ADMINISTRATIVAS'], { fromLine: dreLine });
    if (admin !== undefined) admin = Math.abs(admin);
    values.adminExpenses = admin;
    let prol = findValueByLabels(map, ['Pro-Labore', 'Pró-Labore'], { fromLine: dreLine });
    if (prol !== undefined) prol = Math.abs(prol);
    values.proLabore = prol;
    let pj = findValueByLabels(map, ['Serviços Prestados PJ', 'Servicos Prestados PJ'], { fromLine: dreLine });
    if (pj !== undefined) pj = Math.abs(pj);
    values.pjServices = pj;
    let tax = findValueByLabels(map, ['DESPESAS TRIBUTARIAS', 'DESPESAS TRIBUTÁRIAS'], { fromLine: dreLine });
    if (tax !== undefined) tax = Math.abs(tax);
    values.taxExpenses = tax;
    values.financialResult = findValueByLabels(map, ['RESULTADO FINANCEIRO LIQUIDO', 'RESULTADO FINANCEIRO LÍQUIDO'], { fromLine: dreLine });
    let other = findValueByLabels(map, ['OUTRAS DESPESAS OPERACIONAIS'], { fromLine: dreLine });
    if (other !== undefined) other = Math.abs(other);
    values.otherOperatingExpenses = other;
    values.netProfit = findValueByLabels(map, ['RESULTADO LÍQUIDO DO EXERCÍCIO', 'RESULTADO LIQUIDO DO EXERCICIO'], { fromLine: dreLine })
      ?? findValueByLabels(map, ['RESULTADO LÍQUIDO ANTES DAS PROVISÕES', 'RESULTADO LIQUIDO ANTES DAS PROVISOES'], { fromLine: dreLine });

    // Folha anual a partir de contas trabalhistas explícitas (somente DRE).
    const payrollTargets = new Set<string>([
      'decimo terceiro salario', '13 salario',
      'f.g.t.s.', 'fgts',
      'ferias', 'ordenados e gratificacoes',
      'aviso previo', 'despesas c/ estagiarios', 'estagiarios',
      'ajuda de custo', 'pro-labore',
    ]);
    const used = new Set<number>();
    let payroll = 0; let payrollHits = 0;
    for (const entry of map) {
      if (entry.lineIndex < dreLine) continue;
      if (used.has(entry.lineIndex)) continue;
      if (!payrollTargets.has(normalizeLabelKey(entry.label))) continue;
      payroll += Math.abs(entry.value);
      payrollHits += 1;
      used.add(entry.lineIndex);
    }
    if (payrollHits > 0) {
      values.annualPayrollFromDre = Number(payroll.toFixed(2));
      if (typeof values.grossRevenue === 'number') {
        values.payrollPercentFromDre = pct(payroll, values.grossRevenue);
        values.payrollPercent = values.payrollPercentFromDre;
      }
    }

    if (typeof values.grossRevenue === 'number' && values.simplesNacionalExpense !== undefined) {
      values.annualEffectiveTaxRate = pct(values.simplesNacionalExpense, values.grossRevenue);
    }
    if (typeof values.grossRevenue === 'number' && values.serviceCosts !== undefined) {
      values.inputCostPercent = pct(values.serviceCosts, values.grossRevenue);
    }
    if (typeof values.grossRevenue === 'number' && values.grossProfit !== undefined) {
      values.grossMargin = pct(values.grossProfit, values.grossRevenue);
    }
    if (typeof values.grossRevenue === 'number' && values.netProfit !== undefined) {
      values.netMargin = pct(values.netProfit, values.grossRevenue);
    }
    values.revenue = values.grossRevenue;
  } else {
    warnings.push('Seção DRE não encontrada no documento.');
  }

  push(findings, documentType, 'cnpj', values.cnpj, 0.9, 'Balanço/DRE');
  push(findings, documentType, 'assetsTotal', values.assetsTotal, 0.85, 'Balanço');
  push(findings, documentType, 'equity', values.equity, 0.85, 'Balanço');
  push(findings, documentType, 'afac', values.afac, 0.8, 'Balanço');
  push(findings, documentType, 'grossRevenue', values.grossRevenue, 0.9, 'DRE');
  push(findings, documentType, 'simplesNacionalExpense', values.simplesNacionalExpense, 0.85, 'DRE');
  push(findings, documentType, 'netRevenue', values.netRevenue, 0.85, 'DRE');
  push(findings, documentType, 'serviceCosts', values.serviceCosts, 0.85, 'DRE');
  push(findings, documentType, 'grossProfit', values.grossProfit, 0.85, 'DRE');
  push(findings, documentType, 'operatingExpenses', values.operatingExpenses, 0.85, 'DRE');
  push(findings, documentType, 'netProfit', values.netProfit, 0.85, 'DRE');
  push(findings, documentType, 'inputCostPercent', values.inputCostPercent, 0.85, 'DRE');
  push(findings, documentType, 'grossMargin', values.grossMargin, 0.8, 'DRE');
  push(findings, documentType, 'netMargin', values.netMargin, 0.8, 'DRE');
  push(findings, documentType, 'annualEffectiveTaxRate', values.annualEffectiveTaxRate, 0.85, 'DRE');
  push(findings, documentType, 'annualPayrollFromDre', values.annualPayrollFromDre, 0.8, 'DRE');
  push(findings, documentType, 'payrollPercentFromDre', values.payrollPercentFromDre, 0.8, 'DRE');

  return { values, findings, warnings };
}

const summary = (values: ExtractedValues) => {
  const parts: string[] = [];
  if (typeof values.revenue === 'number') parts.push(`receita ${values.revenue}`);
  if (typeof values.grossRevenue12m === 'number') parts.push(`RBT12 ${values.grossRevenue12m}`);
  if (typeof values.effectiveTaxRate === 'number') parts.push(`alíquota efetiva ${values.effectiveTaxRate}%`);
  if (typeof values.inputCostPercent === 'number') parts.push(`custos/insumos ${values.inputCostPercent}%`);
  if (typeof values.b2bPercent === 'number') parts.push(`B2B ${values.b2bPercent}%`);
  if (typeof values.salaryTotal === 'number') parts.push(`salários R$ ${values.salaryTotal}`);
  if (typeof values.netPayroll === 'number') parts.push(`líquido R$ ${values.netPayroll}`);
  if (typeof values.employeesCount === 'number') parts.push(`${values.employeesCount} funcionários`);
  return parts.length ? `Dados extraídos: ${parts.join('; ')}.` : 'Nenhum campo tributário decisivo foi identificado com segurança no documento.';
};

function extract(documentType: string, text: string) {
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const values: ExtractedValues = {};
  if (!text.trim()) warnings.push('Arquivo sem texto extraível.');

  if (documentType === 'dre' || documentType === 'balancete') {
    const parsed = parseBalanceAndDre(text, documentType);
    Object.assign(values, parsed.values);
    findings.push(...parsed.findings);
    warnings.push(...parsed.warnings);
  } else if (documentType === 'pgdas') {
    values.grossRevenue12m = numberAfter(text, ['rbt12', 'receita bruta acumulada', 'receita bruta total dos últimos 12 meses', 'receita bruta total dos ultimos 12 meses'], 10);
    values.revenue = numberAfter(text, ['receita bruta do pa', 'receita mensal', 'receita do período', 'receita do periodo'], 10);
    values.effectiveTaxRate = numberAfter(text, ['alíquota efetiva', 'aliquota efetiva'], 10);
    values.taxRegimeDetected = has(text, ['simples nacional', 'pgdas']) ? 'simples_nacional' : undefined;
    values.hasSt = has(text, ['substituição tributária', 'substituicao tributaria', '\\bST\\b']) || undefined;
    values.hasMonophasic = has(text, ['monofásic', 'monofasic']) || undefined;
    values.hasExportation = has(text, ['exportação', 'exportacao']) || undefined;
    // Validação: dasTotal ≈ Σ tributos (quando ambos disponíveis).
    const principal = text.match(/Principal\s+([\d.,]+)\s+Multa\s+[\d.,]+\s+Juros\s+[\d.,]+\s+Total\s+([\d.,]+)/i);
    if (principal) values.dasTotal = normalizeNumber(principal[2]);
    if (typeof values.dasTotal === 'number' && typeof values.revenue === 'number' && values.revenue > 0 && values.effectiveTaxRate === undefined) {
      values.effectiveTaxRate = Number(((values.dasTotal / values.revenue) * 100).toFixed(2));
    }
    push(findings, documentType, 'grossRevenue12m', values.grossRevenue12m, 0.9, 'PGDAS');
    push(findings, documentType, 'effectiveTaxRate', values.effectiveTaxRate, 0.9, 'PGDAS');
    push(findings, documentType, 'dasTotal', values.dasTotal, 0.9, 'PGDAS');
    push(findings, documentType, 'revenue', values.revenue, 0.9, 'PGDAS');
    push(findings, documentType, 'taxRegimeDetected', values.taxRegimeDetected, 0.9, 'PGDAS');
  } else if (documentType === 'faturamento_cliente') {
    let total = 0; let b2b = 0; let b2c = 0; let government = 0; const amounts: number[] = [];
    text.replace(/\r/g, '\n').split('\n').forEach((row) => {
      const cols = row.split(/[;,\t]/).map((col) => col.trim()).filter(Boolean);
      const amount = [...cols].reverse().map(normalizeNumber).find((value) => value !== undefined);
      if (!amount) return;
      total += amount; amounts.push(amount);
      const hasCnpj = /\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/.test(row);
      const hasCpf = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(row);
      if (has(row, ['governo', 'prefeitura', 'estado', 'município', 'municipio'])) government += amount;
      else if (hasCnpj || has(row, ['ltda', 's/a', 'industria', 'comercio'])) b2b += amount;
      else if (hasCpf || has(row, ['consumidor final', 'pessoa física', 'pessoa fisica'])) b2c += amount;
    });
    if (total > 0) {
      values.revenue = Number(total.toFixed(2));
      values.b2bPercent = Number(((b2b / total) * 100).toFixed(2));
      values.b2cPercent = Number(((b2c / total) * 100).toFixed(2));
      values.governmentPercent = Number(((government / total) * 100).toFixed(2));
      values.top10ClientsConcentration = Number(((amounts.sort((a, b) => b - a).slice(0, 10).reduce((sum, value) => sum + value, 0) / total) * 100).toFixed(2));
    }
    push(findings, documentType, 'b2bPercent', values.b2bPercent, 0.75, 'Faturamento por cliente');
    push(findings, documentType, 'top10ClientsConcentration', values.top10ClientsConcentration, 0.8, 'Faturamento por cliente');
  } else if (documentType === 'folha_pagamento') {
    const parsed = parsePayrollTotals(text, warnings);
    Object.assign(values, parsed);

    push(findings, documentType, 'cnpj', values.cnpj, 0.9, 'Folha');
    push(findings, documentType, 'period', values.period, 0.9, 'Folha');
    push(findings, documentType, 'employeesCount', values.employeesCount, 0.9, 'Folha');
    push(findings, documentType, 'salaryTotal', values.salaryTotal, 0.9, 'Folha');
    push(findings, documentType, 'inssValue', values.inssValue, 0.85, 'Folha');
    push(findings, documentType, 'fgtsValue', values.fgtsValue, 0.85, 'Folha');
    push(findings, documentType, 'irrfValue', values.irrfValue, 0.8, 'Folha');
    push(findings, documentType, 'grossPayroll', values.grossPayroll, 0.9, 'Folha');
    push(findings, documentType, 'netPayroll', values.netPayroll, 0.85, 'Folha');
    if (parsed.establishmentsAggregated && parsed.establishmentsAggregated > 1) {
      push(findings, documentType, 'establishmentsAggregated', parsed.establishmentsAggregated, 0.8, 'Folha');
    }
  } else {
    values.revenue = numberAfter(text, ['receita', 'faturamento']);
    const costs = numberAfter(text, ['fornecedores', 'compras', 'custos']);
    if (values.revenue && costs !== undefined) values.inputCostPercent = Number(((Math.abs(costs) / (values.revenue as number)) * 100).toFixed(2));
    if (has(text, ['lucro real'])) values.supplierRegimeDetected = 'lucro_real';
    else if (has(text, ['lucro presumido'])) values.supplierRegimeDetected = 'lucro_presumido';
    else if (has(text, ['simples nacional'])) values.supplierRegimeDetected = 'simples_nacional';
    push(findings, documentType, 'inputCostPercent', values.inputCostPercent, 0.65, documentType);
    push(findings, documentType, 'supplierRegimeDetected', values.supplierRegimeDetected, 0.55, documentType);
  }
  // Gate de campos decisivos por tipo: se faltar o essencial, marcar erro_leitura
  // (não inventar score com leitura parcial corrompida).
  const missing = decisiveFieldsMissing(documentType, values);
  let confidence = findings.length ? Math.min(0.95, 0.35 + findings.length * 0.1) : 0;
  if (missing.length) {
    warnings.push(`Campos decisivos ausentes: ${missing.join(', ')}.`);
    confidence = 0;
  }
  values.warnings = warnings;
  values.confidence = confidence;
  return { values, findings, confidence, summary: summary(values), warnings };
}

function decisiveFieldsMissing(documentType: string, values: ExtractedValues): string[] {
  const has = (k: string) => values[k] !== undefined && values[k] !== null && values[k] !== '';
  if (documentType === 'pgdas') {
    const m: string[] = [];
    if (!has('revenue')) m.push('Receita Bruta do PA');
    if (!has('grossRevenue12m')) m.push('RBT12');
    if (!has('dasTotal') && !has('effectiveTaxRate')) m.push('DAS total ou alíquota efetiva');
    return m;
  }
  if (documentType === 'dre' || documentType === 'balancete') {
    const m: string[] = [];
    if (!has('grossRevenue')) m.push('Receita bruta');
    const hasSecondary = has('serviceCosts') || has('grossProfit') || has('netProfit') || has('simplesNacionalExpense');
    if (has('grossRevenue') && !hasSecondary) m.push('Custo dos serviços / Lucro bruto / Lucro líquido / Simples Nacional');
    return m;
  }
  if (documentType === 'folha_pagamento') {
    const m: string[] = [];
    if (!has('period')) m.push('Período');
    if (!has('salaryTotal')) m.push('Total de salários');
    if (!has('grossPayroll')) m.push('Proventos/Vantagens');
    if (!has('netPayroll')) m.push('Líquido a pagar');
    return m;
  }
  return [];
}

/**
 * Parser robusto da linha "Total:" da folha (JB Folha "RESUMO DE CÁLCULO").
 *
 * Estratégia:
 * - Itera TODAS as ocorrências de linhas começando com "Total:" (não apenas a primeira).
 * - Para cada uma, junta linhas seguintes em até 30 linhas, ignorando rodapés/cabeçalhos
 *   conhecidos (Página, JB Folha, Pacote) e PARANDO ao encontrar uma "barreira"
 *   (Empregado, Empresa:, Inscr. Fed., Resumo, novo Total:, outro CNPJ).
 * - Aceita só o bloco se obtiver 11 números coerentes (|Líquido − (Bruto − Descontos)| ≤ 1).
 * - Se houver múltiplos blocos válidos (multi-estabelecimento), soma todos.
 */
function parsePayrollTotals(text: string, warnings: string[]): ExtractedValues {
  const out: ExtractedValues = {};
  const cnpjMatch = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}\b/);
  if (cnpjMatch) out.cnpj = cnpjMatch[0];
  const empMatch = text.match(/Empresa:\s*([^\n]+)/i);
  if (empMatch) out.companyName = empMatch[1].trim();
  const periodMatch = text.match(/Per[ií]odo:\s*\d{2}\/(\d{2})\/(\d{4})/i);
  if (periodMatch) out.period = `${periodMatch[1]}/${periodMatch[2]}`;

  out.employeesCount = extractEmployeesCount(text);

  const rawBlocks = findPayrollTotalBlocks(text, warnings);
  const valid: NonNullable<ReturnType<typeof mapPayrollColumns>>[] = [];
  for (const cols of rawBlocks) {
    const m = mapPayrollColumns(cols);
    if (!m) continue;
    if (!isPayrollBlockCoherent(m)) {
      warnings.push(`Bloco Total descartado: valores incoerentes (Líquido=${m.netPayroll}, Bruto=${m.grossPayroll}, Descontos=${m.discounts}).`);
      continue;
    }
    valid.push(m);
  }
  if (rawBlocks.length && !valid.length) {
    warnings.push('Linha Total encontrada, mas valores incoerentes.');
    return out;
  }
  if (!rawBlocks.length) {
    warnings.push('Linha "Total" não encontrada no relatório de folha.');
    return out;
  }
  const sumK = (k: keyof NonNullable<ReturnType<typeof mapPayrollColumns>>) =>
    Number(valid.reduce((s, b) => s + (b as Record<string, number>)[k as string], 0).toFixed(2));
  out.salaryTotal = sumK('salaryTotal');
  out.familySalary = sumK('familySalary');
  out.inssBase = sumK('inssBase');
  out.inssValue = sumK('inssValue');
  out.irrfBase = sumK('irrfBase');
  out.irrfValue = sumK('irrfValue');
  out.fgtsBase = sumK('fgtsBase');
  out.fgtsValue = sumK('fgtsValue');
  out.grossPayroll = sumK('grossPayroll');
  out.discounts = sumK('discounts');
  out.netPayroll = sumK('netPayroll');
  if (valid.length > 1) out.establishmentsAggregated = valid.length;
  return out;
}

// ===== Folha helpers (4 camadas + auto-detecção de colunas) =====
const PAYROLL_MONEY_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
function toMoneyNum(s: string): number { return Number(s.replace(/\./g, '').replace(',', '.')); }

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
  const fullRe = /\bTotal\s*:\s*((?:-?\d{1,3}(?:\.\d{3})*,\d{2}\s+){10}-?\d{1,3}(?:\.\d{3})*,\d{2})/gi;
  let mm: RegExpExecArray | null;
  while ((mm = fullRe.exec(text)) !== null) {
    const nums = (mm[1].match(PAYROLL_MONEY_RE) ?? []).map(toMoneyNum);
    if (nums.length >= 11) blocks.push(nums.slice(0, 11));
  }
  if (blocks.length) return blocks;

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
      if (/Total de empregados/i.test(ln)) continue;
      if (barrierRe.test(ln)) break;
      buf += ' ' + ln;
      nums = buf.match(PAYROLL_MONEY_RE) ?? [];
    }
    if (nums.length >= 11) blocks.push(nums.slice(0, 11).map(toMoneyNum));
  }
  if (blocks.length) return blocks;

  const hasMarkers = /RESUMO DE C[ÁA]LCULO/i.test(text)
    && /Empregado/i.test(text)
    && /Prov\.?\s*\/?\s*Vant/i.test(text)
    && /Descontos/i.test(text)
    && /L[ií]quido/i.test(text);
  if (hasMarkers) {
    const tail = lines.slice(Math.max(0, lines.length - 80));
    for (let i = 0; i < tail.length; i += 1) {
      const start = tail[i] ?? '';
      if (/^\s*\d{6}\s+/.test(start)) continue;
      let buf = start;
      let nums = buf.match(PAYROLL_MONEY_RE) ?? [];
      for (let j = i + 1; j < tail.length && nums.length < 11; j += 1) {
        if (barrierRe.test(tail[j])) break;
        if (/^\s*\d{6}\s+/.test(tail[j])) break;
        buf += ' ' + tail[j];
        nums = buf.match(PAYROLL_MONEY_RE) ?? [];
      }
      if (nums.length === 11) {
        blocks.push(nums.map(toMoneyNum));
        warnings.push('Linha Total não encontrada; usado bloco monetário do rodapé como fallback.');
        return blocks;
      }
    }
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

function decodeText(fileName: string, mimeType: string, bytes: ArrayBuffer) {
  const lower = fileName.toLowerCase();
  if (mimeType.startsWith('image/') || lower.match(/\.(png|jpe?g|gif|webp|bmp|tiff?)$/)) {
    return Promise.resolve({ text: '', nonProcessable: true, reason: 'Documento parece imagem/escaneado. OCR ainda não está disponível.' });
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || mimeType.includes('spreadsheetml') || mimeType.includes('ms-excel')) {
    return Promise.resolve(parseSpreadsheet(bytes));
  }
  if (lower.endsWith('.pdf') || mimeType.includes('pdf')) {
    return parsePdf(bytes);
  }
  // CSV/TXT/HTML/JSON
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return Promise.resolve({ text: decoded });
}

function parseSpreadsheet(bytes: ArrayBuffer) {
  try {
    const workbook = XLSX.read(new Uint8Array(bytes), { type: 'array' });
    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';', blankrows: false });
      if (csv.trim()) parts.push(`# ${sheetName}\n${csv}`);
    }
    const text = parts.join('\n\n');
    if (!text.trim()) return { text: '', nonProcessable: true, reason: 'Planilha sem conteúdo legível.' };
    return { text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { text: '', nonProcessable: true, reason: `Não foi possível ler a planilha: ${message}` };
  }
}

async function parsePdf(bytes: ArrayBuffer) {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const numPages = (pdf as unknown as { numPages?: number }).numPages ?? 0;
    const MAX_PAGES = 200;
    const truncated = numPages > MAX_PAGES;
    const { text } = await extractText(pdf, { mergePages: true });
    let clean = (typeof text === 'string' ? text : Array.isArray(text) ? text.join('\n') : '').trim();
    const MAX_CHARS = 5_000_000;
    if (clean.length > MAX_CHARS) clean = clean.slice(0, MAX_CHARS);
    if (clean.length < 40) {
      return { text: '', nonProcessable: true, reason: 'PDF sem camada de texto (provável escaneado). OCR ainda não está disponível.' };
    }
    return { text: clean, warning: truncated ? `Documento com ${numPages} páginas — análise considera as primeiras ${MAX_PAGES}.` : undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { text: '', nonProcessable: true, reason: `Falha ao ler PDF: ${message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Autenticação obrigatória.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { document_id: documentId } = await req.json();
    if (!documentId) return new Response(JSON.stringify({ error: 'document_id é obrigatório.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? anonKey;

    // Valida usuário autenticado.
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Sessão inválida.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Service role para leitura/escrita do documento e download do storage privado.
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: document, error: fetchError } = await supabase.from('tax_reform_documents').select('*').eq('id', documentId).maybeSingle();
    if (fetchError) {
      console.error('[process-tax-reform-document] fetch error', { documentId, message: fetchError.message });
      throw fetchError;
    }
    if (!document) {
      console.warn('[process-tax-reform-document] documento não encontrado', { documentId });
      return new Response(
        JSON.stringify({ error: `Documento ${documentId} não encontrado no banco. Aguarde a sincronização e tente novamente.` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    await supabase.from('tax_reform_documents').update({ reading_status: 'lendo', extraction_error: null }).eq('id', documentId);

    if (!document.storage_path) throw new Error('Documento sem storage_path.');
    const bucket = document.storage_bucket || 'tax-reform-documents';
    const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(document.storage_path);
    if (downloadError) {
      console.error('[process-tax-reform-document] download falhou', { documentId, bucket, path: document.storage_path, message: downloadError.message });
      throw new Error(`Falha ao baixar arquivo do storage: ${downloadError.message}`);
    }
    const decoded = await decodeText(document.file_name, document.mime_type ?? '', await blob.arrayBuffer());
    if (decoded.nonProcessable) {
      const { data: updated, error } = await supabase.from('tax_reform_documents').update({
        reading_status: 'nao_processavel',
        extraction_error: decoded.reason,
        extracted_summary: decoded.reason,
        extracted_values: { warnings: [decoded.reason], confidence: 0 },
        extracted_findings: [],
        extraction_confidence: 0,
      }).eq('id', documentId).select('*').single();
      if (error) throw error;
      return new Response(JSON.stringify({ document: updated }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result = await Promise.race([
      Promise.resolve().then(() => extract(document.document_type, decoded.text ?? '')),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Tempo limite de 50s excedido ao interpretar o documento.')), 50_000)),
    ]).catch((e) => ({ values: { warnings: [String(e?.message ?? e)], confidence: 0 }, findings: [], confidence: 0, summary: 'Tempo limite excedido na leitura.', warnings: [String(e?.message ?? e)] }));
    console.info('[process-tax-reform-document] extração concluída', {
      documentId,
      type: document.document_type,
      confidence: result.confidence,
      findings: result.findings.length,
      warnings: (result.values as ExtractedValues).warnings ?? [],
    });
    if ((decoded as { warning?: string }).warning) {
      (result.values as ExtractedValues).warnings = [...((result.values as ExtractedValues).warnings ?? []), (decoded as { warning: string }).warning];
    }
    const allWarnings = (result.values as ExtractedValues).warnings ?? [];
    const hasCriticalWarnings = allWarnings.some((w) => /incoerentes|n[aã]o encontrada|ausentes/i.test(w));
    const status = result.confidence >= 0.7 && !hasCriticalWarnings ? 'lido' : 'erro_leitura';
    const extractionError = status === 'lido'
      ? null
      : allWarnings.join(' ') || 'Nenhum campo decisivo pôde ser extraído do arquivo.';
    // Quando a leitura falha, não publicar números — só warnings + confidence 0.
    const valuesToPersist: ExtractedValues = status === 'lido'
      ? result.values
      : { warnings: allWarnings, confidence: 0 };
    const findingsToPersist = status === 'lido' ? result.findings : [];
    const summaryToPersist = status === 'lido'
      ? result.summary
      : `Leitura falhou. Nenhum dado foi usado no score. Motivo: ${extractionError}`;
    const { data: updated, error } = await supabase.from('tax_reform_documents').update({
      reading_status: status,
      extraction_error: extractionError,
      extracted_summary: summaryToPersist,
      extracted_values: valuesToPersist,
      extracted_findings: findingsToPersist,
      extraction_confidence: status === 'lido' ? result.confidence : 0,
    }).eq('id', documentId).select('*').single();
    if (error) throw error;
    return new Response(JSON.stringify({ document: updated }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado na leitura.';
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[process-tax-reform-document] erro fatal', { message, stack });
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
