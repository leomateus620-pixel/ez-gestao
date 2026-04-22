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

async function waitFor(supabase: any, request_id: string, type: "cnpj" | "cnd", maxMs = 90000) {
  const reqTable = type === "cnpj" ? "company_lookup_requests" : "cnd_lookup_requests";
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data } = await supabase.from(reqTable).select("status").eq("id", request_id).maybeSingle();
    if (data && ["success", "failed", "manual_required", "partial"].includes(data.status)) return data.status;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return "timeout";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const startedAt = new Date().toISOString();
    const cnpjReq = await dispatch(supabase, "cnpj");
    const cndReq = await dispatch(supabase, "cnd");
    const [cnpjStatus, cndStatus] = await Promise.all([
      waitFor(supabase, cnpjReq, "cnpj"),
      waitFor(supabase, cndReq, "cnd"),
    ]);

    const { data: cnpjResult } = await supabase.from("company_lookup_results")
      .select("*").eq("request_id", cnpjReq).maybeSingle();
    const { data: cndResult } = await supabase.from("cnd_lookup_results")
      .select("*").eq("request_id", cndReq).maybeSingle();

    const passed = cnpjStatus === "success" && (cndStatus === "success" || cndStatus === "manual_required");

    const report = {
      generated_at: new Date().toISOString(),
      started_at: startedAt,
      cnpj: ZIMMERMANN_CNPJ,
      cnpj_request_id: cnpjReq,
      cnd_request_id: cndReq,
      cnpj_status: cnpjStatus,
      cnd_status: cndStatus,
      cnpj_result: cnpjResult,
      cnd_result: cndResult,
      passed,
    };

    const reportPath = `reports/dry-run-${Date.now()}.json`;
    await supabase.storage.from("automation-artifacts")
      .upload(reportPath, new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), {
        contentType: "application/json", upsert: false,
      });

    await supabase.from("automation_config_kv").upsert({
      key: "dry_run_zimmermann",
      value_json: { passed, last_run_at: new Date().toISOString(), report_path: reportPath, cnpj_status: cnpjStatus, cnd_status: cndStatus },
      description: "Resultado do dry-run obrigatório (Zimmermann)",
    }, { onConflict: "key" });

    const { data: signed } = await supabase.storage
      .from("automation-artifacts").createSignedUrl(reportPath, 3600);

    return new Response(JSON.stringify({
      passed, report_path: reportPath, signed_url: signed?.signedUrl || null,
      cnpj_status: cnpjStatus, cnd_status: cndStatus,
      cnpj_request_id: cnpjReq, cnd_request_id: cndReq,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});