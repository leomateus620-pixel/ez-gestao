/* eslint-disable @typescript-eslint/no-explicit-any */
// Webhook da Meta WhatsApp Cloud API.
// GET: handshake (hub.verify_token).
// POST: eventos de status -> atualiza guia_envios + guia_eventos.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function sanitizeStatus(status: any) {
  if (!status || typeof status !== "object") return null;
  return {
    id: status.id,
    status: status.status,
    timestamp: status.timestamp,
    recipient_id: status.recipient_id,
    errors: Array.isArray(status.errors)
      ? status.errors.map((e: any) => ({ code: e?.code, title: e?.title, message: e?.message }))
      : undefined,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // GET — verificação Meta (hub.challenge)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") || "";
    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
    if (mode === "subscribe" && verifyToken && token === verifyToken) {
      return new Response(challenge, { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405, headers: corsHeaders });
  }

  // POST — eventos
  const rawBody = await req.text();

  // Validação de assinatura (X-Hub-Signature-256)
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET");
  if (appSecret) {
    const header = req.headers.get("x-hub-signature-256") || "";
    const sent = header.replace(/^sha256=/i, "").trim();
    if (!sent) {
      return new Response(JSON.stringify({ error: "missing_signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const expected = await hmacSha256Hex(appSecret, rawBody);
    if (!timingSafeEqual(sent.toLowerCase(), expected.toLowerCase())) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  let processed = 0;
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const statuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
      for (const status of statuses) {
        const messageId = status?.id;
        const statusName = status?.status as string | undefined;
        if (!messageId || !statusName) continue;

        const update: Record<string, unknown> = { provider_status: statusName };
        const nowIso = new Date().toISOString();
        if (statusName === "delivered") update.delivered_at = nowIso;
        if (statusName === "read") update.delivered_at = nowIso;
        if (statusName === "failed") {
          update.failed_at = nowIso;
          update.provider_error = (status?.errors?.[0]?.message
            || status?.errors?.[0]?.title
            || "delivery_failed").toString().slice(0, 400);
          update.status = "falhou";
        }
        if (statusName === "sent") update.sent_at = nowIso;

        const { data: envio } = await supabase
          .from("guia_envios")
          .update(update)
          .eq("provider_message_id", messageId)
          .eq("provider", "meta_whatsapp")
          .select("id,guia_id")
          .maybeSingle();

        if (envio?.guia_id) {
          await supabase.from("guia_eventos").insert({
            guia_id: envio.guia_id,
            event_type: `whatsapp_${statusName}`,
            level: statusName === "failed" ? "error" : "info",
            message: `WhatsApp ${statusName}`,
            metadata_json: { sanitized: sanitizeStatus(status) },
          });
        }
        processed++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});