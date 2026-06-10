import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  if (lower.endsWith('.xlsx') || mimeType.includes('spreadsheetml')) {
    return { text: '', nonProcessable: true, reason: 'XLSX exige parser estruturado ainda não disponível nesta Edge Function. Reenvie como CSV ou finalize a integração com parser XLSX.' };
  }
  if (lower.endsWith('.xls')) {
    return { text: '', nonProcessable: true, reason: 'XLS legado binário exige parser estruturado. Reenvie como CSV/XLSX com parser conectado.' };
  }
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (lower.endsWith('.pdf') || mimeType.includes('pdf')) {
    const text = decoded.replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ÿ]+/g, ' ');
    return { text };
  }
  if (mimeType.startsWith('image/')) return { text: '', nonProcessable: true, reason: 'Imagem exige OCR real conectado; nenhum dado foi simulado.' };
  return { text: decoded };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { document_id: documentId } = await req.json();
    if (!documentId) return new Response(JSON.stringify({ error: 'document_id é obrigatório.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });

    const { data: document, error: fetchError } = await supabase.from('tax_reform_documents').select('*').eq('id', documentId).single();
    if (fetchError) throw fetchError;
    await supabase.from('tax_reform_documents').update({ reading_status: 'lendo', extraction_error: null }).eq('id', documentId);

    if (!document.storage_path) throw new Error('Documento sem storage_path.');
    const bucket = document.storage_bucket || 'tax-reform-documents';
    const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(document.storage_path);
    if (downloadError) throw downloadError;
    const decoded = decodeText(document.file_name, document.mime_type ?? '', await blob.arrayBuffer());
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
