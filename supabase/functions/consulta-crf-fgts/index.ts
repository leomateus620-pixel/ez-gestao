import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getSerproToken(): Promise<string> {
  const consumerKey = Deno.env.get('SERPRO_CONSUMER_KEY')!;
  const consumerSecret = Deno.env.get('SERPRO_CONSUMER_SECRET')!;
  const credentials = btoa(`${consumerKey}:${consumerSecret}`);
  const res = await fetch('https://gateway.apiserpro.serpro.gov.br/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Serpro auth failed: ${res.status}`);
  return (await res.json()).access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: authData, error: authError } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (authError || !authData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { cnpj, empresa_id, cnd_item_id } = await req.json();
    if (!cnpj || !empresa_id) {
      return new Response(JSON.stringify({ error: 'cnpj e empresa_id são obrigatórios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const token = await getSerproToken();
    const now = new Date().toISOString();

    const serproRes = await fetch(
      `https://gateway.apiserpro.serpro.gov.br/consulta-crf/v2/crf/${cnpjLimpo}`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );

    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: connector } = await adminClient.from('connectors').select('id').eq('orgao', 'fgts').limit(1).single();

    if (!serproRes.ok) {
      if (connector) {
        await adminClient.from('connector_runs').insert({
          connector_id: connector.id, empresa_id, cnd_item_id: cnd_item_id || null,
          status: 'falha', inicio_execucao: now, fim_execucao: now, tentativa: 1,
          resultado_bruto: `HTTP ${serproRes.status}`, status_normalizado: 'erro', confianca: 'baixa',
          erro_detalhes: `Serpro CRF retornou status ${serproRes.status}`,
        });
      }
      return new Response(JSON.stringify({ error: 'Erro na consulta CRF/FGTS', status: serproRes.status }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resultado = await serproRes.json();
    const statusNorm = resultado.situacao?.toLowerCase().includes('regular') ? 'valida' : 'pendente';

    if (connector) {
      await adminClient.from('connector_runs').insert({
        connector_id: connector.id, empresa_id, cnd_item_id: cnd_item_id || null,
        status: 'sucesso', inicio_execucao: now, fim_execucao: new Date().toISOString(), tentativa: 1,
        resultado_bruto: JSON.stringify(resultado), status_normalizado: statusNorm, confianca: 'alta',
        evidencias: ['Resposta JSON da API Serpro - CRF/FGTS'],
      });
    }

    if (cnd_item_id) {
      await adminClient.from('cnd_items').update({
        status: statusNorm === 'valida' ? 'valida' : 'pendente',
        data_emissao: resultado.dataEmissao || null,
        data_vencimento: resultado.dataValidade || null,
        origem: 'Serpro API - CRF/FGTS',
      }).eq('id', cnd_item_id);
    }

    return new Response(JSON.stringify({ success: true, resultado, status_normalizado: statusNorm }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Erro interno', details: String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
