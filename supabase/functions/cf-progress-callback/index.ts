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

    // nonce replay protection
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
    const { job_id, step, level, message, details_json, status } = body;

    await supabase.from("automation_job_logs").insert({
      job_id, level: level || "info", step: step || "progress",
      message: message || "", details_json: details_json || {},
    });

    const jobUpdate: any = { updated_at: new Date().toISOString() };
    if (status) {
      jobUpdate.status = status;
      if (status === "running" && !body.no_started_at) {
        jobUpdate.started_at = new Date().toISOString();
      }
    }
    await supabase.from("automation_jobs").update(jobUpdate).eq("id", job_id);

    // heartbeat provider_health
    if (body.provider) {
      await supabase.from("provider_health").upsert({
        provider_name: body.provider,
        provider_runtime: "cloudflare_worker_browser_run",
        last_heartbeat_at: new Date().toISOString(),
        status: "online",
      }, { onConflict: "provider_name" });
    }

    // cleanup expired nonces (best-effort)
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