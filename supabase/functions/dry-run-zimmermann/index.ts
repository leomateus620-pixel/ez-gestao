// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ZIMMERMANN_CNPJ = "88736335000113";

async function dispatch(supabase: any, type: "cnpj" | "cnd"): Promise<string> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/lookup-dispatcher`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ cnpj: ZIMMERMANN_CNPJ, type, force_refresh: true, requested_by: "dry-run" }),
  });
  const j = await r.json();
  if (!j.request_id) throw new Error(`dispatch ${type} failed: ${JSON.stringify(j)}`);
  return j.request_id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const startedAt = new Date().toISOString();
    // Strict serialization: dispatch ONLY the CNPJ now. The status function
    // (`dry-run-zimmermann-status`) will dispatch the CND once the CNPJ
    // request reaches a terminal status. This guarantees zero parallel
    // browser launches against Cloudflare Browser Rendering.
    const cnpjReq = await dispatch(supabase, "cnpj");

    const dry_run_id = crypto.randomUUID();
    await supabase.from("automation_config_kv").upsert({
      key: "dry_run_zimmermann",
      value_json: {
        passed: false,
        in_progress: true,
        dry_run_id,
        started_at: startedAt,
        cnpj_request_id: cnpjReq,
        cnd_request_id: null,
        cnpj_status: "running",
        cnd_status: "pending",
        phase: "cnpj_running",
      },
      description: "Resultado do dry-run obrigatório (Zimmermann) — assíncrono",
    }, { onConflict: "key" });

    return new Response(JSON.stringify({
      accepted: true,
      dry_run_id,
      cnpj_request_id: cnpjReq,
      cnd_request_id: null,
      status: "pending",
      message: "Dry-run iniciado (CNPJ). CND será disparado quando CNPJ terminar. Faça polling em dry-run-zimmermann-status.",
    }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});