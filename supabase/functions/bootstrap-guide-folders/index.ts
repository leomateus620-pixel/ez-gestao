// Alias canônico para bootstrap-test-folder. Mantém compatibilidade durante a
// transição do nome. Reencaminha para a função existente (mesma lógica de
// criação da árvore Guias/A Enviar, Enviadas, Revisão Manual, Não
// Identificadas, Erros, Duplicadas) chamando o handler diretamente para
// preservar o auth do chamador.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    return new Response(JSON.stringify({ error: "supabase_url_missing" }), { status: 500, headers: cors });
  }
  // Reencaminha para o handler legado preservando o token do chamador.
  const upstream = await fetch(`${supabaseUrl}/functions/v1/bootstrap-test-folder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("authorization") || "",
      apikey: req.headers.get("apikey") || "",
    },
    body: await req.text().catch(() => "{}"),
  });
  const body = await upstream.text();
  return new Response(body, { status: upstream.status, headers: cors });
});