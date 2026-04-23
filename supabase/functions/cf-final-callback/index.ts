// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, x-cf-signature, x-cf-timestamp, x-cf-nonce",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function verifyHmac(secret: string, payload: string, signature: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const raw = await req.text();
    const sig = req.headers.get("x-cf-signature") || "";
    const ts = req.headers.get("x-cf-timestamp") || "";
    const nonce = req.headers.get("x-cf-nonce") || "";
    const secret = Deno.env.get("CF_CALLBACK_HMAC_SECRET")!;

    const tsNum = parseInt(ts);
    if (!tsNum || Math.abs(Date.now() - tsNum) > 5 * 60_000) {
      return new Response(JSON.stringify({ error: "stale_timestamp" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ok = await verifyHmac(secret, `${ts}.${nonce}.${raw}`, sig);
    if (!ok) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: nonceErr } = await supabase.from("hmac_nonces").insert({
      nonce, direction: "cf->lovable",
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (nonceErr) {
      return new Response(JSON.stringify({ error: "nonce_replay" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = JSON.parse(raw);
    const {
      job_id, type, status, error_type, error_message,
      raw_payload, parsed_payload, source_url, parsed_confidence,
      // CNPJ
      official_name, trade_name, registration_status, opening_date,
      legal_nature, main_cnae, secondary_cnaes, qsa, address,
      // CND
      cnd_status, certificate_number, issued_at, valid_until,
      pdf_path, pdf_sha256,
      provider, latency_ms,
    } = body;
    let { request_id } = body;

    // CNDT (Certidão Negativa de Débitos Trabalhistas) reutiliza as tabelas
    // CND, distinguindo via source_provider nas requests.
    const isCndLike = type === "cnd" || type === "cndt";
    const reqTable = type === "cnpj" ? "company_lookup_requests" : "cnd_lookup_requests";
    const resTable = type === "cnpj" ? "company_lookup_results" : "cnd_lookup_results";

    // Fallback: resolve request_id via job_id when worker omits it
    if (!request_id && job_id) {
      const { data: jobRow } = await supabase
        .from("automation_jobs")
        .select("target_request_id")
        .eq("id", job_id)
        .maybeSingle();
      if (jobRow?.target_request_id) {
        request_id = jobRow.target_request_id;
        console.log("cf-final-callback resolved request_id via fallback", { job_id, request_id });
      } else {
        console.error("cf-final-callback missing request_id and no fallback", { job_id });
      }
    }
    if (!request_id) {
      return new Response(JSON.stringify({ error: "missing_request_id", job_id }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guard: if the job has been cancelled by the user, ignore the callback silently.
    if (job_id) {
      const { data: jobStatus } = await supabase
        .from("automation_jobs")
        .select("status")
        .eq("id", job_id)
        .maybeSingle();
      if (jobStatus?.status === "cancelled") {
        console.log("cf-final-callback ignored: job cancelled", { job_id });
        return new Response(JSON.stringify({ ok: true, ignored: "cancelled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (status === "success") {
      if (type === "cnpj") {
        await supabase.from(resTable).insert({
          request_id,
          official_name, trade_name, registration_status, opening_date,
          legal_nature, main_cnae,
          secondary_cnaes_json: secondary_cnaes || [],
          qsa_json: qsa || [],
          address_json: address || {},
          source_url,
          raw_payload_json: raw_payload || {},
          parsed_payload_json: parsed_payload || {},
          parsed_confidence: parsed_confidence ?? 0,
          cache_valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } else if (isCndLike) {
        const cacheUntil = valid_until || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        // Prefer explicit pdf_path; fall back to parsed_payload.certificate_pdf_path
        const finalPdfPath = pdf_path
          || parsed_payload?.certificate_pdf_path
          || raw_payload?.pdf_artifact_path
          || null;
        await supabase.from(resTable).insert({
          request_id,
          cnd_status: cnd_status || "indisponivel",
          certificate_number,
          issued_at,
          valid_until,
          source_url,
          raw_payload_json: raw_payload || {},
          parsed_payload_json: parsed_payload || {},
          pdf_path: finalPdfPath, pdf_sha256,
          cache_valid_until: cacheUntil,
        });
      }
      const upd1 = await supabase.from(reqTable).update({
        status: "success", finished_at: new Date().toISOString(),
      }).eq("id", request_id).select("id");
      if (!upd1.data?.length) console.warn("cf-final-callback request update affected 0 rows", { request_id, reqTable });
      const upd2 = await supabase.from("automation_jobs").update({
        status: "success", finished_at: new Date().toISOString(),
      }).eq("id", job_id).select("id");
      if (!upd2.data?.length) console.warn("cf-final-callback job update affected 0 rows", { job_id });
    } else {
      const finalStatus = status === "manual_required" ? "manual_required" : "failed";
      const upd1 = await supabase.from(reqTable).update({
        status: finalStatus, finished_at: new Date().toISOString(),
      }).eq("id", request_id).select("id");
      if (!upd1.data?.length) console.warn("cf-final-callback request update affected 0 rows (failure path)", { request_id, reqTable });
      const upd2 = await supabase.from("automation_jobs").update({
        status: finalStatus,
        error_type: error_type || "unknown",
        error_message: (error_message || "").slice(0, 500),
        finished_at: new Date().toISOString(),
      }).eq("id", job_id).select("id");
      if (!upd2.data?.length) console.warn("cf-final-callback job update affected 0 rows (failure path)", { job_id });
      await supabase.from("automation_exceptions").insert({
        title: error_type || "Falha na execução",
        description: (error_message || "").slice(0, 500),
        exception_type: error_type || "unknown",
        severity: finalStatus === "manual_required" ? "warning" : "error",
        job_id,
        technical_details_json: { request_id, type, raw_payload: raw_payload || null },
      });
    }

    // provider health update (rolling 24h success/latency, simple version)
    if (provider) {
      const success = status === "success" ? 1 : 0;
      const { data: existing } = await supabase
        .from("provider_health").select("*")
        .eq("provider_name", provider).maybeSingle();
      const oldRate = existing?.success_rate_24h ?? 0;
      const oldLat = existing?.avg_latency_ms_24h ?? 0;
      const newRate = oldRate === 0 ? success * 100 : oldRate * 0.9 + success * 100 * 0.1;
      const newLat = oldLat === 0 ? (latency_ms || 0) : oldLat * 0.9 + (latency_ms || 0) * 0.1;
      await supabase.from("provider_health").upsert({
        provider_name: provider,
        provider_runtime: "cloudflare_worker_browser_run",
        last_heartbeat_at: new Date().toISOString(),
        status: success ? "online" : "degraded",
        success_rate_24h: newRate,
        avg_latency_ms_24h: newLat,
        last_error_at: success ? existing?.last_error_at : new Date().toISOString(),
        last_error_message: success ? existing?.last_error_message : (error_message || null),
      }, { onConflict: "provider_name" });
    }

    await supabase.from("hmac_nonces").delete().lt("expires_at", new Date().toISOString());

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});