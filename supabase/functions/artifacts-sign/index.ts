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
      return new Response(JSON.stringify({ error: "stale_timestamp" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const ok = await verifyHmac(secret, `${ts}.${nonce}.${raw}`, sig);
    if (!ok) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = JSON.parse(raw);
    const { job_id, artifact_type, filename, mime_type } = body;
    if (!job_id || !artifact_type || !filename) {
      return new Response(JSON.stringify({ error: "missing_params" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const safeName = filename.replace(/[^\w.\-]/g, "_");
    const path = `jobs/${job_id}/${Date.now()}_${safeName}`;

    const { data: signed, error: signErr } = await supabase.storage
      .from("automation-artifacts")
      .createSignedUploadUrl(path);
    if (signErr) throw signErr;

    const { data: art, error: artErr } = await supabase
      .from("automation_artifacts").insert({
        job_id, artifact_type, file_path: path,
        mime_type: mime_type || "application/octet-stream",
      }).select().single();
    if (artErr) throw artErr;

    return new Response(JSON.stringify({
      artifact_id: art.id,
      upload_url: signed.signedUrl,
      token: signed.token,
      path,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});