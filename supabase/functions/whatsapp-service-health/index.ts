import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, OPTIONS"};
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return new Response("method_not_allowed", { status: 405, headers: corsHeaders });
  const url = Deno.env.get("WHATSAPP_SERVICE_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("WHATSAPP_SERVICE_SECRET");
  if (!url || !secret) return new Response(JSON.stringify({ ok: false, configured: false, error: "Integração não configurada" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const resp = await fetch(`${url}/health`, { signal: AbortSignal.timeout(6000) });
    const body = await resp.json().catch(() => ({}));
    return new Response(JSON.stringify({ ok: resp.ok && body?.ok === true, configured: true, status: resp.status, body }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ ok: false, configured: true, error: "Serviço externo offline" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
