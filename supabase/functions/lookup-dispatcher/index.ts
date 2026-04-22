// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROVIDER_CNPJ = "provider_public_portal_cnpj_cloudflare";
const PROVIDER_CND = "provider_public_portal_cnd_cloudflare";

function normalizeCnpj(input: string): string {
  return (input || "").replace(/\D/g, "");
}

function isValidCnpj(cnpj: string): boolean {
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;
  const calc = (slice: string) => {
    const weights = slice.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < slice.length; i++) sum += parseInt(slice[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 12) + d1);
  return d1 === parseInt(cnpj[12]) && d2 === parseInt(cnpj[13]);
}

async function signHmac(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const type: "cnpj" | "cnd" = body.type;
    const force_refresh: boolean = !!body.force_refresh;
    const cnpj = normalizeCnpj(body.cnpj || "");
    const requested_by = (body.requested_by || "anonymous").toString();

    if (!type || !["cnpj", "cnd"].includes(type)) {
      return new Response(JSON.stringify({ error: "invalid_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isValidCnpj(cnpj)) {
      return new Response(JSON.stringify({ error: "invalid_cnpj" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const correlation_id = crypto.randomUUID();
    const provider = type === "cnpj" ? PROVIDER_CNPJ : PROVIDER_CND;

    // ---- Cache check ----
    if (!force_refresh) {
      if (type === "cnpj") {
        const { data: cached } = await supabase
          .from("company_lookup_results")
          .select("*, company_lookup_requests!inner(cnpj_normalized)")
          .eq("company_lookup_requests.cnpj_normalized", cnpj)
          .gt("cache_valid_until", new Date().toISOString())
          .order("consulted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cached) {
          return new Response(
            JSON.stringify({
              from_cache: true,
              request_id: cached.request_id,
              correlation_id,
              status: "success",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else {
        const { data: cached } = await supabase
          .from("cnd_lookup_results")
          .select("*, cnd_lookup_requests!inner(cnpj_normalized)")
          .eq("cnd_lookup_requests.cnpj_normalized", cnpj)
          .gt("cache_valid_until", new Date().toISOString())
          .order("consulted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cached) {
          return new Response(
            JSON.stringify({
              from_cache: true,
              request_id: cached.request_id,
              correlation_id,
              status: "success",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // ---- Create request row ----
    const requestTable = type === "cnpj" ? "company_lookup_requests" : "cnd_lookup_requests";
    const insertData: any = {
      cnpj_normalized: cnpj,
      correlation_id,
      requested_by,
      source_provider: provider,
      force_refresh,
      status: "queued",
      started_at: new Date().toISOString(),
    };
    if (type === "cnpj") insertData.cnpj_input = body.cnpj;

    const { data: requestRow, error: reqErr } = await supabase
      .from(requestTable)
      .insert(insertData)
      .select()
      .single();
    if (reqErr) throw reqErr;

    // ---- Create automation_jobs row ----
    const { data: jobRow, error: jobErr } = await supabase
      .from("automation_jobs")
      .insert({
        job_type: type === "cnpj" ? "cnpj_lookup" : "cnd_lookup",
        target_request_id: requestRow.id,
        provider,
        status: "queued",
        correlation_id,
        metadata_json: { cnpj, type },
      })
      .select()
      .single();
    if (jobErr) throw jobErr;

    await supabase
      .from(requestTable)
      .update({ latest_job_id: jobRow.id, status: "running" })
      .eq("id", requestRow.id);

    // ---- Dispatch to Cloudflare Worker ----
    const workerUrl = Deno.env.get("CLOUDFLARE_WORKER_URL");
    const hmacSecret = Deno.env.get("CLOUDFLARE_WORKER_HMAC_SECRET");

    if (!workerUrl || !hmacSecret) {
      await supabase.from("automation_jobs").update({
        status: "failed",
        error_type: "worker_not_configured",
        error_message: "Worker Cloudflare não configurado",
        finished_at: new Date().toISOString(),
      }).eq("id", jobRow.id);
      await supabase.from(requestTable).update({
        status: "manual_required",
        finished_at: new Date().toISOString(),
      }).eq("id", requestRow.id);
      return new Response(JSON.stringify({
        request_id: requestRow.id,
        job_id: jobRow.id,
        from_cache: false,
        correlation_id,
        status: "manual_required",
        message: "Worker Cloudflare não configurado",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = {
      job_id: jobRow.id,
      job_type: type === "cnpj" ? "cnpj_lookup" : "cnd_lookup",
      cnpj,
      correlation_id,
      callback_base: Deno.env.get("SUPABASE_URL"),
    };
    const body_str = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const signature = await signHmac(hmacSecret, `${timestamp}.${nonce}.${body_str}`);

    try {
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
        status: "dispatched",
        dispatched_at: new Date().toISOString(),
      }).eq("id", jobRow.id);
    } catch (err: any) {
      await supabase.from("automation_jobs").update({
        status: "failed",
        error_type: "worker_unreachable",
        error_message: String(err?.message || err).slice(0, 500),
        finished_at: new Date().toISOString(),
      }).eq("id", jobRow.id);
      await supabase.from(requestTable).update({
        status: "failed",
        finished_at: new Date().toISOString(),
      }).eq("id", requestRow.id);
      await supabase.from("automation_exceptions").insert({
        title: "Worker Cloudflare inalcançável",
        description: String(err?.message || err).slice(0, 500),
        exception_type: "worker_unreachable",
        severity: "error",
        job_id: jobRow.id,
        technical_details_json: { cnpj, type, correlation_id },
      });
      return new Response(JSON.stringify({
        request_id: requestRow.id,
        job_id: jobRow.id,
        from_cache: false,
        correlation_id,
        status: "failed",
        error: "worker_unreachable",
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      request_id: requestRow.id,
      job_id: jobRow.id,
      from_cache: false,
      correlation_id,
      status: "dispatched",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});