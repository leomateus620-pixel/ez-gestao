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
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  
  if (!res.ok) throw new Error(`Serpro auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

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

    // Consulta CND Federal via Serpro
    const serproRes = await fetch(
      `https://gateway.apiserpro.serpro.gov.br/consulta-cnd-rf/v2/cnd/${cnpjLimpo}`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );

    const now = new Date().toISOString();

    if (!serproRes.ok) {
      // Registrar run com falha
      const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      
      // Find connector
      const { data: connector } = await adminClient.from('connectors').select('id').eq('orgao', 'receita_federal').limit(1).single();
      
      if (connector) {
        await adminClient.from('connector_runs').insert({
          connector_id: connector.id,
          empresa_id,
          cnd_item_id: cnd_item_id || null,
          status: 'falha',
          inicio_execucao: now,
          fim_execucao: now,
          tentativa: 1,
          resultado_bruto: `HTTP ${serproRes.status}`,
          status_normalizado: 'erro',
          confianca: 'baixa',
          erro_detalhes: `Serpro retornou status ${serproRes.status}`,
        });
      }

      return new Response(
        JSON.stringify({ error: 'Erro na consulta Serpro', status: serproRes.status }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resultado = await serproRes.json();
    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Find connector
    const { data: connector } = await adminClient.from('connectors').select('id').eq('orgao', 'receita_federal').limit(1).single();

    // Normalizar resultado
    const statusNorm = resultado.situacao?.toLowerCase().includes('negativa') ? 'valida' 
      : resultado.situacao?.toLowerCase().includes('positiva') ? 'positiva' : 'pendente';
    
    const dataEmissao = resultado.dataEmissao || null;
    const dataValidade = resultado.dataValidade || null;

    // Registrar run com sucesso
    if (connector) {
      await adminClient.from('connector_runs').insert({
        connector_id: connector.id,
        empresa_id,
        cnd_item_id: cnd_item_id || null,
        status: 'sucesso',
        inicio_execucao: now,
        fim_execucao: new Date().toISOString(),
        tentativa: 1,
        resultado_bruto: JSON.stringify(resultado),
        status_normalizado: statusNorm,
        confianca: 'alta',
        evidencias: ['Resposta JSON da API Serpro'],
      });
    }

    // Atualizar CND item se fornecido
    if (cnd_item_id) {
      const cndStatus = statusNorm === 'valida' ? 'valida' : statusNorm === 'positiva' ? 'erro' : 'pendente';
      await adminClient.from('cnd_items').update({
        status: cndStatus,
        data_emissao: dataEmissao,
        data_vencimento: dataValidade,
        origem: 'Serpro API - Receita Federal',
      }).eq('id', cnd_item_id);
    }

    return new Response(
      JSON.stringify({ success: true, resultado, status_normalizado: statusNorm }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
