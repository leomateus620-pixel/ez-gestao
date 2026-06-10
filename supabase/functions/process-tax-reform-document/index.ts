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
  const parsed = Number(value.replace(/R\$|%/gi, '').replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
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
    const revenue = numberAfter(text, ['receita bruta', 'receita operacional bruta', 'faturamento bruto', 'receitas', 'receita']);
    const costs = numberAfter(text, ['cmv', 'cpv', 'custo dos serviços', 'custo dos servicos', 'custos', 'compras']);
    // Folha em DRE: itera linha-a-linha somando contas trabalhistas explícitas
    // UMA única vez por linha de origem, evitando que variantes do mesmo rótulo
    // dupliquem a mesma conta (ex.: "Decimo Terceiro" e "Décimo Terceiro").
    const payrollTargets = new Set<string>([
      'decimo terceiro salario', '13 salario',
      'f.g.t.s.', 'fgts',
      'ferias', 'ordenados e gratificacoes',
      'aviso previo', 'despesas c/ estagiarios', 'estagiarios',
      'ajuda de custo', 'pro-labore',
    ]);
    const normLbl = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s./()-]/g,'').replace(/\s+/g,' ').trim();
    const _lines = text.replace(/\r/g,'\n').split('\n').map(l=>l.trim());
    let payroll = 0; let payrollHits = 0;
    const usedLines = new Set<number>();
    for (let i = 0; i < _lines.length; i += 1) {
      const label = _lines[i];
      if (!label || /\d/.test(label)) continue;
      if (!payrollTargets.has(normLbl(label))) continue;
      // Próxima linha numérica (até 3 linhas à frente).
      for (let j = i + 1; j < Math.min(_lines.length, i + 4); j += 1) {
        const nxt = _lines[j];
        if (!nxt) continue;
        if (!/^\(?-?\d{1,3}(?:\.\d{3})*,\d{2}\)?$/.test(nxt)) break;
        const n = normalizeNumber(nxt.replace(/^\(|\)$/g,''));
        if (n !== undefined && !usedLines.has(i)) {
          payroll += Math.abs(n); payrollHits += 1; usedLines.add(i);
        }
        break;
      }
    }
    const grossProfit = numberAfter(text, ['lucro bruto', 'resultado bruto']);
    const expenses = numberAfter(text, ['despesas operacionais', 'despesas']);
    const netProfit = numberAfter(text, ['lucro líquido', 'lucro liquido', 'resultado líquido', 'resultado liquido', 'resultado']);
    values.revenue = revenue;
    values.operatingExpenses = expenses;
    values.netProfit = netProfit;
    if (revenue && costs !== undefined) values.inputCostPercent = Number(((Math.abs(costs) / revenue) * 100).toFixed(2));
    if (revenue && payrollHits > 0) {
      values.annualPayrollFromDre = Number(payroll.toFixed(2));
      values.payrollPercent = Number(((payroll / revenue) * 100).toFixed(2));
    }
    if (revenue && grossProfit !== undefined) values.grossMargin = Number(((grossProfit / revenue) * 100).toFixed(2));
    push(findings, documentType, 'revenue', values.revenue, 0.8, documentType.toUpperCase());
    push(findings, documentType, 'inputCostPercent', values.inputCostPercent, 0.78, documentType.toUpperCase());
    push(findings, documentType, 'payrollPercent', values.payrollPercent, 0.65, documentType.toUpperCase());
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
    if (!has('revenue')) m.push('Receita bruta');
    return m;
  }
  if (documentType === 'folha_pagamento') {
    const m: string[] = [];
    if (!has('salaryTotal')) m.push('Total de salários');
    if (!has('netPayroll')) m.push('Líquido a pagar');
    if (!has('period')) m.push('Período');
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
  // employeesCount pode estar na linha seguinte (multi-linha do unpdf)
  {
    const _lines = text.replace(/\r/g, '\n').split('\n');
    let total = 0;
    for (let i = 0; i < _lines.length; i += 1) {
      if (!/Total de empregados:/i.test(_lines[i])) continue;
      const sameLine = _lines[i].match(/Total de empregados:\s*(\d{1,5})\s*$/i);
      if (sameLine) { total += Number(sameLine[1]); continue; }
      for (let j = i + 1; j < Math.min(_lines.length, i + 6); j += 1) {
        const t = _lines[j].trim();
        if (!t) continue;
        if (/^\d{1,5}$/.test(t)) { total += Number(t); break; }
      }
    }
    if (total > 0) out.employeesCount = total;
  }

  const moneyRe = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
  const lines = text.split(/\n/);
  const skipRe = /^(?:\s*)(?:P[áa]gina|JB Folha|Pacote|Sistema|Data\s*:|Hora\s*:|Usu[aá]rio|Fls\.?\s*\d)/i;
  const barrierRe = /^(?:\s*)(?:Empregado|Empresa\s*:|Inscr\.?\s*Fed|CNPJ\s*:|RESUMO|Total\s*:|Cargo\s*:|Departamento\s*:)/i;
  // Barreira CNPJ embarcada no meio da linha: se aparecer um CNPJ diferente do de cabeçalho, considera barreira.

  const blocks: number[][] = [];
  const totalIdxs: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*Total:/i.test(lines[i])) totalIdxs.push(i);
  }
  for (const idx of totalIdxs) {
    let buf = lines[idx].replace(/^\s*Total:/i, ' ');
    let nums = buf.match(moneyRe) ?? [];
    for (let j = idx + 1; j < Math.min(lines.length, idx + 31) && nums.length < 11; j += 1) {
      const line = lines[j];
      if (!line || !line.trim()) continue;
      if (skipRe.test(line)) continue;
      if (j !== idx + 1 && barrierRe.test(line)) break;
      // "Total de empregados:" pode aparecer dentro do bloco — preserva (contém o N de empregados)
      // mas não conta como número monetário (regex exige ,2 dígitos).
      buf += ' ' + line;
      nums = buf.match(moneyRe) ?? [];
    }
    const parsed = nums.map((n) => normalizeNumber(n)).filter((n): n is number => n !== undefined);
    if (parsed.length >= 11) {
      // Ordem observada via unpdf:
      // [0]=Salário, [1]=S.Fam, [2]=BaseINSS, [3]=INSS, [4]=FGTS, [5]=IRRF, [6]=BaseFGTS, [7]=BaseIRRF, [8]=Prov./Vant., [9]=Descontos, [10]=Líquido
      const liq = parsed[10];
      const bruto = parsed[8];
      const desc = parsed[9];
      const coerent = Math.abs(liq - (bruto - desc)) <= 1;
      if (coerent) blocks.push(parsed.slice(0, 11));
      else warnings.push(`Bloco Total na linha ${idx + 1} descartado: Líquido (${liq}) ≠ Bruto (${bruto}) − Descontos (${desc}).`);
    }
  }

  if (!blocks.length) {
    if (totalIdxs.length) warnings.push('Linha Total encontrada mas sem 11 valores coerentes — folha não interpretada.');
    else warnings.push('Linha "Total" não encontrada no relatório de folha.');
    return out;
  }

  // Soma blocos (multi-estabelecimento). Para apenas 1 bloco, é o próprio.
  const sum = (idx: number) => blocks.reduce((s, b) => s + b[idx], 0);
  out.salaryTotal = Number(sum(0).toFixed(2));
  out.inssBase = Number(sum(2).toFixed(2));
  out.inssValue = Number(sum(3).toFixed(2));
  out.fgtsValue = Number(sum(4).toFixed(2));
  out.irrfValue = Number(sum(5).toFixed(2));
  out.fgtsBase = Number(sum(6).toFixed(2));
  out.irrfBase = Number(sum(7).toFixed(2));
  out.grossPayroll = Number(sum(8).toFixed(2));
  out.discounts = Number(sum(9).toFixed(2));
  out.netPayroll = Number(sum(10).toFixed(2));
  if (blocks.length > 1) out.establishmentsAggregated = blocks.length;
  return out;
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

    const { data: document, error: fetchError } = await supabase.from('tax_reform_documents').select('*').eq('id', documentId).single();
    if (fetchError) throw fetchError;
    await supabase.from('tax_reform_documents').update({ reading_status: 'lendo', extraction_error: null }).eq('id', documentId);

    if (!document.storage_path) throw new Error('Documento sem storage_path.');
    const bucket = document.storage_bucket || 'tax-reform-documents';
    const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(document.storage_path);
    if (downloadError) throw downloadError;
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
    if ((decoded as { warning?: string }).warning) {
      (result.values as ExtractedValues).warnings = [...((result.values as ExtractedValues).warnings ?? []), (decoded as { warning: string }).warning];
    }
    const status = result.confidence > 0 ? 'lido' : 'erro_leitura';
    const extractionError = status === 'lido'
      ? null
      : ((result.values as ExtractedValues).warnings ?? []).join(' ') || 'Nenhum campo decisivo pôde ser extraído do arquivo.';
    const { data: updated, error } = await supabase.from('tax_reform_documents').update({
      reading_status: status,
      extraction_error: extractionError,
      extracted_summary: result.summary,
      extracted_values: result.values,
      extracted_findings: result.findings,
      extraction_confidence: result.confidence,
    }).eq('id', documentId).select('*').single();
    if (error) throw error;
    return new Response(JSON.stringify({ document: updated }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado na leitura.';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
