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
const numberAfter = (text: string, labels: string[]) => {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}[^\\d-]{0,80}(${money.source})`, 'i'));
    const value = normalizeNumber(match?.[1]);
    if (value !== undefined) return value;
  }
  return undefined;
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
    const payroll = numberAfter(text, ['folha', 'salários', 'salarios', 'encargos', 'pró-labore', 'pro-labore']);
    const grossProfit = numberAfter(text, ['lucro bruto', 'resultado bruto']);
    const expenses = numberAfter(text, ['despesas operacionais', 'despesas']);
    const netProfit = numberAfter(text, ['lucro líquido', 'lucro liquido', 'resultado líquido', 'resultado liquido', 'resultado']);
    values.revenue = revenue;
    values.operatingExpenses = expenses;
    values.netProfit = netProfit;
    if (revenue && costs !== undefined) values.inputCostPercent = Number(((Math.abs(costs) / revenue) * 100).toFixed(2));
    if (revenue && payroll !== undefined) values.payrollPercent = Number(((Math.abs(payroll) / revenue) * 100).toFixed(2));
    if (revenue && grossProfit !== undefined) values.grossMargin = Number(((grossProfit / revenue) * 100).toFixed(2));
    push(findings, documentType, 'revenue', values.revenue, 0.8, documentType.toUpperCase());
    push(findings, documentType, 'inputCostPercent', values.inputCostPercent, 0.78, documentType.toUpperCase());
    push(findings, documentType, 'payrollPercent', values.payrollPercent, 0.65, documentType.toUpperCase());
  } else if (documentType === 'pgdas') {
    values.grossRevenue12m = numberAfter(text, ['rbt12', 'receita bruta acumulada', 'receita bruta total dos últimos 12 meses', 'receita bruta total dos ultimos 12 meses']);
    values.revenue = numberAfter(text, ['receita mensal', 'receita do período', 'receita do periodo', 'receita bruta do pa']);
    values.effectiveTaxRate = numberAfter(text, ['alíquota efetiva', 'aliquota efetiva', 'alíquota', 'aliquota']);
    values.taxRegimeDetected = has(text, ['simples nacional', 'pgdas']) ? 'simples_nacional' : undefined;
    values.hasSt = has(text, ['substituição tributária', 'substituicao tributaria', '\\bST\\b']) || undefined;
    values.hasMonophasic = has(text, ['monofásic', 'monofasic']) || undefined;
    values.hasExportation = has(text, ['exportação', 'exportacao']) || undefined;
    push(findings, documentType, 'grossRevenue12m', values.grossRevenue12m, 0.9, 'PGDAS');
    push(findings, documentType, 'effectiveTaxRate', values.effectiveTaxRate, 0.9, 'PGDAS');
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
    // CNPJ
    const cnpjMatch = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}\b/);
    if (cnpjMatch) values.cnpj = cnpjMatch[0];
    const empMatch = text.match(/Empresa:\s*([^\n]+)/i);
    if (empMatch) values.companyName = empMatch[1].trim();
    const periodMatch = text.match(/Per[ií]odo:\s*\d{2}\/(\d{2})\/(\d{4})/i);
    if (periodMatch) values.period = `${periodMatch[1]}/${periodMatch[2]}`;
    const empCount = text.match(/Total de empregados:\s*(\d+)/i);
    if (empCount) values.employeesCount = Number(empCount[1]);

    // Localiza a linha que começa com "Total:" e junta linhas seguintes até obter 11 números.
    const moneyRe = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|\b0\b/g;
    const lines = text.split(/\n/);
    let totalIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*Total:/i.test(lines[i])) { totalIdx = i; break; }
    }
    if (totalIdx >= 0) {
      let buf = lines[totalIdx].replace(/^\s*Total:/i, ' ');
      let nums = buf.match(moneyRe) ?? [];
      let j = totalIdx + 1;
      while (nums.length < 11 && j < lines.length && j <= totalIdx + 6) {
        if (/Total de empregados|P[áa]gina|JB Folha|Pacote/i.test(lines[j])) { j++; continue; }
        buf += ' ' + lines[j];
        nums = buf.match(moneyRe) ?? [];
        j++;
      }
      const parsed = nums.map((n) => normalizeNumber(n)).filter((n): n is number => n !== undefined);
      if (parsed.length >= 11) {
        // Ordem do cabeçalho JB Folha "RESUMO DE CÁLCULO":
        // Salário, S.Fam, BaseINSS, INSS, BaseIRRF, IRRF, BaseFGTS, FGTS, Prov./Vant., Descontos, Líquido
        values.salaryTotal = parsed[0];
        values.inssBase = parsed[2];
        values.inssValue = parsed[3];
        values.irrfBase = parsed[4];
        values.irrfValue = parsed[5];
        values.fgtsBase = parsed[6];
        values.fgtsValue = parsed[7];
        values.grossPayroll = parsed[8];
        values.discounts = parsed[9];
        values.netPayroll = parsed[10];
      } else {
        warnings.push(`Linha Total encontrada mas com apenas ${parsed.length} valores numéricos.`);
      }
    } else {
      warnings.push('Linha "Total" não encontrada no relatório de folha.');
    }

    push(findings, documentType, 'cnpj', values.cnpj, 0.9, 'Folha');
    push(findings, documentType, 'period', values.period, 0.9, 'Folha');
    push(findings, documentType, 'employeesCount', values.employeesCount, 0.9, 'Folha');
    push(findings, documentType, 'salaryTotal', values.salaryTotal, 0.9, 'Folha');
    push(findings, documentType, 'inssValue', values.inssValue, 0.85, 'Folha');
    push(findings, documentType, 'fgtsValue', values.fgtsValue, 0.85, 'Folha');
    push(findings, documentType, 'irrfValue', values.irrfValue, 0.8, 'Folha');
    push(findings, documentType, 'grossPayroll', values.grossPayroll, 0.9, 'Folha');
    push(findings, documentType, 'netPayroll', values.netPayroll, 0.85, 'Folha');
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
  const confidence = findings.length ? Math.min(0.95, 0.35 + findings.length * 0.1) : 0;
  values.warnings = warnings;
  values.confidence = confidence;
  return { values, findings, confidence, summary: summary(values), warnings };
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
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = (typeof text === 'string' ? text : Array.isArray(text) ? text.join('\n') : '').trim();
    if (clean.length < 40) {
      return { text: '', nonProcessable: true, reason: 'PDF sem camada de texto (provável escaneado). OCR ainda não está disponível.' };
    }
    return { text: clean };
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

    const result = extract(document.document_type, decoded.text ?? '');
    const status = result.confidence > 0 ? 'lido' : 'erro_leitura';
    const { data: updated, error } = await supabase.from('tax_reform_documents').update({
      reading_status: status,
      extraction_error: status === 'lido' ? null : 'Nenhum texto ou campo decisivo pôde ser extraído do arquivo.',
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
