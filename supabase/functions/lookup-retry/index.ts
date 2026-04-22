// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function signHmac(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { request_id, type } = body;
    if (!request_id || !type) {
      return new Response(JSON.stringify({ error: "missing_params" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const reqTable = type === "cnpj" ? "company_lookup_requests" : "cnd_lookup_requests";
    const { data: request } = await supabase.from(reqTable).select("*").eq("id", request_id).maybeSingle();
    if (!request) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const correlation_id = crypto.randomUUID();
    const provider = request.source_provider;
    const cnpj = request.cnpj_normalized;

    // backoff if previous job had attempts
    let attempts = 0;
    if (request.latest_job_id) {
      const { data: prev } = await supabase.from("automation_jobs").select("attempts,max_attempts").eq("id", request.latest_job_id).maybeSingle();
      attempts = (prev?.attempts || 0);
      if (attempts >= (prev?.max_attempts || 3)) {
        return new Response(JSON.stringify({ error: "max_attempts_reached" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: jobRow, error: jobErr } = await supabase.from("automation_jobs").insert({
      job_type: type === "cnpj" ? "cnpj_lookup" : "cnd_lookup",
      target_request_id: request_id,
      provider,
      status: "queued",
      correlation_id,
      attempts: attempts + 1,
      metadata_json: { cnpj, type, retry: true },
    }).select().single();
    if (jobErr) throw jobErr;

    await supabase.from(reqTable).update({
      latest_job_id: jobRow.id, status: "running", finished_at: null,
    }).eq("id", request_id);

    const workerUrl = Deno.env.get("CLOUDFLARE_WORKER_URL");
    const hmacSecret = Deno.env.get("CLOUDFLARE_WORKER_HMAC_SECRET");
    if (!workerUrl || !hmacSecret) {
      return new Response(JSON.stringify({ job_id: jobRow.id, status: "manual_required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = {
      job_id: jobRow.id,
      job_type: type === "cnpj" ? "cnpj_lookup" : "cnd_lookup",
      cnpj, correlation_id,
      callback_base: Deno.env.get("SUPABASE_URL"),
    };
    const body_str = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const signature = await signHmac(hmacSecret, `${timestamp}.${nonce}.${body_str}`);
    const dispatchUrl = workerUrl.replace(/\/$/, "") + "/execute-job";
    const resp = await fetch(dispatchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lovable-Signature": signature,
        "X-Lovable-Timestamp": timestamp,
        "X-Lovable-Nonce": nonce,
      },
      body: body_str,
    });
    if (!resp.ok && resp.status !== 202) {
      const txt = await resp.text();
      throw new Error(`worker_${resp.status}: ${txt.slice(0, 200)}`);
    }
    await supabase.from("automation_jobs").update({
      status: "dispatched", dispatched_at: new Date().toISOString(),
    }).eq("id", jobRow.id);

    return new Response(JSON.stringify({ job_id: jobRow.id, status: "dispatched", correlation_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});