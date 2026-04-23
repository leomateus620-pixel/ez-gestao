// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: kv } = await supabase
      .from("automation_config_kv")
      .select("value_json")
      .eq("key", "dry_run_zimmermann")
      .maybeSingle();
    const v: any = (kv?.value_json as any) || {};
    const cnpjReq: string | null = v.cnpj_request_id ?? null;
    const cndReq: string | null = v.cnd_request_id ?? null;

    const cancelledStatuses = ["queued", "running", "dispatched", "waiting_callback"];
    const targetIds = [cnpjReq, cndReq].filter(Boolean) as string[];

    // Cancel jobs linked to these requests (and any orphan running job as safety net)
    const jobUpdates: any[] = [];
    if (targetIds.length > 0) {
      const r = await supabase.from("automation_jobs")
        .update({
          status: "cancelled",
          error_type: "cancelled",
          error_message: "Cancelado pelo usuário",
          finished_at: new Date().toISOString(),
        })
        .in("target_request_id", targetIds)
        .in("status", cancelledStatuses)
        .select("id");
      jobUpdates.push(...(r.data || []));
    }
    // Safety: cancel ALL still-running jobs (dry-run is the only thing using this pipeline)
    const r2 = await supabase.from("automation_jobs")
      .update({
        status: "cancelled",
        error_type: "cancelled",
        error_message: "Cancelado pelo usuário",
        finished_at: new Date().toISOString(),
      })
      .in("status", cancelledStatuses)
      .select("id");
    jobUpdates.push(...(r2.data || []));

    // Cancel the lookup requests themselves
    if (cnpjReq) {
      await supabase.from("company_lookup_requests")
        .update({ status: "cancelled", finished_at: new Date().toISOString() })
        .eq("id", cnpjReq)
        .in("status", ["queued", "running"]);
    }
    if (cndReq) {
      await supabase.from("cnd_lookup_requests")
        .update({ status: "cancelled", finished_at: new Date().toISOString() })
        .eq("id", cndReq)
        .in("status", ["queued", "running"]);
    }

    // Reset KV so the UI unlocks the "Executar dry-run" button
    await supabase.from("automation_config_kv").upsert({
      key: "dry_run_zimmermann",
      value_json: {
        ...v,
        passed: false,
        in_progress: false,
        cancelled: true,
        cancelled_at: new Date().toISOString(),
        phase: "cancelled",
        last_run_at: new Date().toISOString(),
      },
      description: "Resultado do dry-run obrigatório (Zimmermann) — assíncrono",
    }, { onConflict: "key" });

    return new Response(JSON.stringify({
      ok: true,
      cancelled_jobs: jobUpdates.length,
      cnpj_request_id: cnpjReq,
      cnd_request_id: cndReq,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});