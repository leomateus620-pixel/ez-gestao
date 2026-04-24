// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const ZIMMERMANN_CNPJ = "47737345000196";
const TERMINAL = ["success", "failed", "manual_required", "partial", "cancelled"];
const ACTIVE = ["queued", "running", "dispatched", "waiting_callback"];
const STALL_MS = 3 * 60_000;

async function dispatch(type: "cnpj" | "cnd" | "cndt"): Promise<string> {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/lookup-dispatcher`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ cnpj: ZIMMERMANN_CNPJ, type, force_refresh: true, requested_by: "dry-run" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.request_id) throw new Error(`dispatch ${type} failed: ${JSON.stringify(j)}`);
  return j.request_id;
}

async function fetchRequest(supabase: any, type: "cnpj" | "cnd" | "cndt", id?: string | null) {
  if (!id) return { request: null, job: null };
  const table = type === "cnpj" ? "company_lookup_requests" : "cnd_lookup_requests";
  const { data: request } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  const jobId = request?.latest_job_id;
  const { data: job } = jobId
    ? await supabase.from("automation_jobs").select("*").eq("id", jobId).maybeSingle()
    : { data: null as any };
  return { request, job };
}

async function markStalled(supabase: any, type: "cnpj" | "cnd" | "cndt", request: any, job: any) {
  if (!request || TERMINAL.includes(request.status)) return { request, job };
  const last = new Date(job?.updated_at || job?.dispatched_at || request.started_at || request.created_at || Date.now()).getTime();
  if (Date.now() - last < STALL_MS) return { request, job };
  const table = type === "cnpj" ? "company_lookup_requests" : "cnd_lookup_requests";
  const now = new Date().toISOString();
  await supabase.from(table).update({ status: "failed", finished_at: now, notes: "stalled_execution: sem progresso por mais de 3 minutos" }).eq("id", request.id);
  if (job?.id && ACTIVE.includes(job.status)) {
    await supabase.from("automation_jobs").update({ status: "failed", error_type: "stalled_execution", error_message: "Execução sem progresso por mais de 3 minutos", finished_at: now }).eq("id", job.id);
  }
  return fetchRequest(supabase, type, request.id);
}

async function maybeNext(supabase: any, v: any, cnpjStatus: string, cndStatus: string) {
  if (!v.in_progress || v.phase === "cancelled") return v;
  if (TERMINAL.includes(cnpjStatus) && !v.cnd_request_id && cnpjStatus === "success") {
    const cndReq = await dispatch("cnd");
    return { ...v, cnd_request_id: cndReq, cnd_status: "running", phase: "cnd_running" };
  }
  if (TERMINAL.includes(cnpjStatus) && !v.cnd_request_id && cnpjStatus !== "success") {
    return { ...v, cnd_status: "skipped", cndt_status: "skipped", phase: "done" };
  }
  if (TERMINAL.includes(cndStatus) && v.cnd_request_id && !v.cndt_request_id && ["success", "manual_required"].includes(cndStatus)) {
    const cndtReq = await dispatch("cndt");
    return { ...v, cndt_request_id: cndtReq, cndt_status: "running", phase: "cndt_running" };
  }
  if (TERMINAL.includes(cndStatus) && v.cnd_request_id && !v.cndt_request_id && !["success", "manual_required"].includes(cndStatus)) {
    return { ...v, cndt_status: "skipped", phase: "done" };
  }
  return v;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: kv } = await supabase.from("automation_config_kv").select("*").eq("key", "dry_run_zimmermann").maybeSingle();
    let v: any = (kv?.value_json || {}) as any;
    if (v.phase === "cancelled") {
      const cancelled = {
        ...v,
        in_progress: false,
        passed: false,
        cnpj_status: v.cnpj_request_id ? "cancelled" : (v.cnpj_status || "pending"),
        cnd_status: v.cnd_request_id ? "cancelled" : (v.cnd_status || "pending"),
        cndt_status: v.cndt_request_id ? "cancelled" : (v.cndt_status || "pending"),
      };
      await supabase.from("automation_config_kv").upsert({ key: "dry_run_zimmermann", value_json: cancelled, description: "Resultado do dry-run obrigatório (Zimmermann) — cancelado" }, { onConflict: "key" });
      return new Response(JSON.stringify(cancelled), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!v.cnpj_request_id || v.in_progress === false) {
      return new Response(JSON.stringify({ in_progress: false, passed: !!v.passed, ...v }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let cnpj = await fetchRequest(supabase, "cnpj", v.cnpj_request_id);
    cnpj = await markStalled(supabase, "cnpj", cnpj.request, cnpj.job);
    let cnpjStatus = cnpj.request?.status || "running";

    v = await maybeNext(supabase, v, cnpjStatus, v.cnd_status || "pending");

    let cnd = await fetchRequest(supabase, "cnd", v.cnd_request_id);
    cnd = await markStalled(supabase, "cnd", cnd.request, cnd.job);
    let cndStatus = cnd.request?.status || (v.cnd_request_id ? "running" : (v.cnd_status || "pending"));

    v = await maybeNext(supabase, v, cnpjStatus, cndStatus);

    let cndt = await fetchRequest(supabase, "cndt", v.cndt_request_id);
    cndt = await markStalled(supabase, "cndt", cndt.request, cndt.job);
    const cndtStatus = cndt.request?.status || (v.cndt_request_id ? "running" : (v.cndt_status || "pending"));

    const cnpjDone = TERMINAL.includes(cnpjStatus);
    const cndDone = v.cnd_request_id ? TERMINAL.includes(cndStatus) : ["skipped", "pending"].includes(cndStatus);
    const cndtDone = v.cndt_request_id ? TERMINAL.includes(cndtStatus) : ["skipped", "pending"].includes(cndtStatus);
    const allDone = cnpjDone && cndDone && cndtDone;
    const passed = cnpjStatus === "success" && ["success", "manual_required"].includes(cndStatus) && ["success", "manual_required"].includes(cndtStatus);

    let reportPath: string | null = v.report_path || null;
    if (allDone && v.in_progress) {
      const [{ data: cnpjResult }, { data: cndResult }, { data: cndtResult }] = await Promise.all([
        supabase.from("company_lookup_results").select("*").eq("request_id", v.cnpj_request_id).maybeSingle(),
        v.cnd_request_id ? supabase.from("cnd_lookup_results").select("*").eq("request_id", v.cnd_request_id).maybeSingle() : Promise.resolve({ data: null }),
        v.cndt_request_id ? supabase.from("cnd_lookup_results").select("*").eq("request_id", v.cndt_request_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const report = { generated_at: new Date().toISOString(), started_at: v.started_at, cnpj: ZIMMERMANN_CNPJ, cnpj_request_id: v.cnpj_request_id, cnd_request_id: v.cnd_request_id, cndt_request_id: v.cndt_request_id, cnpj_status: cnpjStatus, cnd_status: cndStatus, cndt_status: cndtStatus, cnpj_job: cnpj.job, cnd_job: cnd.job, cndt_job: cndt.job, cnpj_result: cnpjResult, cnd_result: cndResult, cndt_result: cndtResult, passed };
      reportPath = `reports/dry-run-${Date.now()}.json`;
      await supabase.storage.from("automation-artifacts").upload(reportPath, new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), { contentType: "application/json", upsert: false });
    }

    const nextKv = { ...v, passed, in_progress: !allDone, last_run_at: allDone ? new Date().toISOString() : v.last_run_at, report_path: reportPath, cnpj_status: cnpjStatus, cnd_status: cndStatus, cndt_status: cndtStatus, phase: allDone ? "done" : (v.phase || "cnpj_running"), cnpj_error_type: cnpj.job?.error_type || null, cnpj_error_message: cnpj.job?.error_message || null, cnd_error_type: cnd.job?.error_type || null, cnd_error_message: cnd.job?.error_message || null, cndt_error_type: cndt.job?.error_type || null, cndt_error_message: cndt.job?.error_message || null };
    await supabase.from("automation_config_kv").upsert({ key: "dry_run_zimmermann", value_json: nextKv, description: "Resultado do dry-run obrigatório (Zimmermann) — orquestrado" }, { onConflict: "key" });

    let signedUrl: string | null = null;
    if (reportPath) {
      const { data: signed } = await supabase.storage.from("automation-artifacts").createSignedUrl(reportPath, 3600);
      signedUrl = signed?.signedUrl || null;
    }
    return new Response(JSON.stringify({ ...nextKv, signed_url: signedUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});