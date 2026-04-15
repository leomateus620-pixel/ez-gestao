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

    const { cnpj } = await req.json();
    if (!cnpj) {
      return new Response(JSON.stringify({ error: 'cnpj é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const token = await getSerproToken();

    const serproRes = await fetch(
      `https://gateway.apiserpro.serpro.gov.br/consulta-cnpj-df/v2/cnpj/${cnpjLimpo}`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );

    if (!serproRes.ok) {
      return new Response(JSON.stringify({ error: 'Erro na consulta CNPJ', status: serproRes.status }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resultado = await serproRes.json();

    return new Response(JSON.stringify({ success: true, resultado }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Erro interno', details: String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
