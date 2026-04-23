// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const TERMINAL = ["success", "failed", "manual_required", "partial"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: kv } = await supabase
      .from("automation_config_kv")
      .select("*")
      .eq("key", "dry_run_zimmermann")
      .maybeSingle();

    const v = (kv?.value_json || {}) as any;
    const cnpjReq = v.cnpj_request_id;
    const cndReq = v.cnd_request_id;

    if (!cnpjReq || !cndReq) {
      return new Response(JSON.stringify({
        in_progress: false,
        passed: !!v.passed,
        ...v,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [{ data: cnpjReqRow }, { data: cndReqRow }] = await Promise.all([
      supabase.from("company_lookup_requests").select("status, finished_at").eq("id", cnpjReq).maybeSingle(),
      supabase.from("cnd_lookup_requests").select("status, finished_at").eq("id", cndReq).maybeSingle(),
    ]);

    const cnpjStatus = cnpjReqRow?.status || "running";
    const cndStatus = cndReqRow?.status || "running";
    const cnpjDone = TERMINAL.includes(cnpjStatus);
    const cndDone = TERMINAL.includes(cndStatus);
    const allDone = cnpjDone && cndDone;

    let cnpjJob: any = null, cndJob: any = null;
    if (allDone) {
      const [{ data: cj }, { data: dj }] = await Promise.all([
        supabase.from("automation_jobs").select("id, error_type, error_message, finished_at, started_at")
          .eq("target_request_id", cnpjReq).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("automation_jobs").select("id, error_type, error_message, finished_at, started_at")
          .eq("target_request_id", cndReq).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      cnpjJob = cj; cndJob = dj;
    }

    let reportPath: string | null = v.report_path || null;
    let signedUrl: string | null = null;
    let passed = !!v.passed;

    if (allDone && v.in_progress) {
      passed = cnpjStatus === "success" && (cndStatus === "success" || cndStatus === "manual_required");

      const { data: cnpjResult } = await supabase.from("company_lookup_results")
        .select("*").eq("request_id", cnpjReq).maybeSingle();
      const { data: cndResult } = await supabase.from("cnd_lookup_results")
        .select("*").eq("request_id", cndReq).maybeSingle();

      const report = {
        generated_at: new Date().toISOString(),
        started_at: v.started_at,
        cnpj: "88736335000113",
        cnpj_request_id: cnpjReq,
        cnd_request_id: cndReq,
        cnpj_status: cnpjStatus,
        cnd_status: cndStatus,
        cnpj_job: cnpjJob,
        cnd_job: cndJob,
        cnpj_result: cnpjResult,
        cnd_result: cndResult,
        passed,
      };
      reportPath = `reports/dry-run-${Date.now()}.json`;
      await supabase.storage.from("automation-artifacts")
        .upload(reportPath, new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), {
          contentType: "application/json", upsert: false,
        });

      await supabase.from("automation_config_kv").upsert({
        key: "dry_run_zimmermann",
        value_json: {
          passed,
          in_progress: false,
          dry_run_id: v.dry_run_id,
          started_at: v.started_at,
          last_run_at: new Date().toISOString(),
          report_path: reportPath,
          cnpj_request_id: cnpjReq,
          cnd_request_id: cndReq,
          cnpj_status: cnpjStatus,
          cnd_status: cndStatus,
          cnpj_error_type: cnpjJob?.error_type || null,
          cnpj_error_message: cnpjJob?.error_message || null,
          cnd_error_type: cndJob?.error_type || null,
          cnd_error_message: cndJob?.error_message || null,
        },
        description: "Resultado do dry-run obrigatório (Zimmermann)",
      }, { onConflict: "key" });
    }

    if (reportPath) {
      const { data: signed } = await supabase.storage
        .from("automation-artifacts").createSignedUrl(reportPath, 3600);
      signedUrl = signed?.signedUrl || null;
    }

    return new Response(JSON.stringify({
      in_progress: !allDone,
      passed,
      cnpj_request_id: cnpjReq,
      cnd_request_id: cndReq,
      cnpj_status: cnpjStatus,
      cnd_status: cndStatus,
      cnpj_error_type: cnpjJob?.error_type || v.cnpj_error_type || null,
      cnpj_error_message: cnpjJob?.error_message || v.cnpj_error_message || null,
      cnd_error_type: cndJob?.error_type || v.cnd_error_type || null,
      cnd_error_message: cndJob?.error_message || v.cnd_error_message || null,
      report_path: reportPath,
      signed_url: signedUrl,
      last_run_at: v.last_run_at || null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});