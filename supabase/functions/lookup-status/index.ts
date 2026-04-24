// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const ACTIVE = ["queued", "running", "dispatched", "waiting_callback", "retry_scheduled"];
const STALL_MS = 3 * 60_000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const request_id = url.searchParams.get("request_id");
    const type = url.searchParams.get("type"); // "cnpj" | "cnd"
    if (!request_id || !type) {
      return new Response(JSON.stringify({ error: "missing_params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const reqTable = type === "cnpj" ? "company_lookup_requests" : "cnd_lookup_requests";
    const resTable = type === "cnpj" ? "company_lookup_results" : "cnd_lookup_results";

    const { data: request } = await supabase
      .from(reqTable).select("*").eq("id", request_id).maybeSingle();
    if (!request) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: result } = await supabase
      .from(resTable).select("*").eq("request_id", request_id)
      .order("consulted_at", { ascending: false }).limit(1).maybeSingle();

    let job: any = null;
    let logs: any[] = [];
    let artifacts: any[] = [];
    if (request.latest_job_id) {
      const { data: j } = await supabase
        .from("automation_jobs").select("*").eq("id", request.latest_job_id).maybeSingle();
      job = j;
      const lastProgressAt = new Date(job?.updated_at || job?.dispatched_at || request.started_at || request.created_at || Date.now()).getTime();
      if (ACTIVE.includes(request.status) && Date.now() - lastProgressAt > STALL_MS) {
        const now = new Date().toISOString();
        await supabase.from(reqTable).update({
          status: "failed",
          finished_at: now,
          notes: "stalled_execution: sem progresso por mais de 3 minutos",
        }).eq("id", request_id);
        await supabase.from("automation_jobs").update({
          status: "failed",
          error_type: "stalled_execution",
          error_message: "Execução sem progresso por mais de 3 minutos",
          finished_at: now,
        }).eq("id", request.latest_job_id).in("status", ACTIVE);
        request.status = "failed";
        request.finished_at = now;
        job = { ...job, status: "failed", error_type: "stalled_execution", error_message: "Execução sem progresso por mais de 3 minutos", finished_at: now };
      }
      const { data: l } = await supabase
        .from("automation_job_logs").select("*")
        .eq("job_id", request.latest_job_id)
        .order("created_at", { ascending: true });
      logs = l || [];
      const { data: a } = await supabase
        .from("automation_artifacts").select("*")
        .eq("job_id", request.latest_job_id);
      artifacts = await Promise.all((a || []).map(async (art) => {
        const { data: signed } = await supabase.storage
          .from("automation-artifacts")
          .createSignedUrl(art.file_path, 300);
        return { ...art, signed_url: signed?.signedUrl || null };
      }));
    }

    return new Response(JSON.stringify({
      request, result, job, logs, artifacts,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});