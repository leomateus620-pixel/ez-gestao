// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

async function validSignature(url: string, form: URLSearchParams, signature: string, token: string) {
  const keys = [...form.keys()].sort();
  const payload = keys.reduce((value, key) => value + key + (form.get(key) || ""), url);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload)));
  const expected = btoa(String.fromCharCode(...signed));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index++) diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  return diff === 0;
}

async function rateAllowed(db: any) {
  const { data, error } = await db.rpc("consume_guide_rate_limit", {
    p_key: "webhook:twilio",
    p_limit: 120,
    p_window_seconds: 60,
  });
  return !error && data === true;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const raw = await req.text();
  const form = new URLSearchParams(raw);
  const signature = req.headers.get("x-twilio-signature") || "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  const publicUrl = Deno.env.get("TWILIO_STATUS_CALLBACK_URL") || req.url;
  if (!token || !(await validSignature(publicUrl, form, signature, token))) {
    return new Response("Invalid signature", { status: 401 });
  }
  const messageSid = form.get("MessageSid");
  const messageStatus = form.get("MessageStatus") || "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await rateAllowed(db))) return new Response("Rate limited", { status: 429 });
  const { data: dispatch } = await db.from("guia_envios").select("*")
    .eq("provider_message_id", messageSid).maybeSingle();
  if (!dispatch) return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });

  if (["delivered", "read"].includes(messageStatus)) {
    if (dispatch.status === "entregue") return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
    await db.from("guia_envios").update({ status: "entregue", delivered_at: new Date().toISOString() })
      .eq("id", dispatch.id);
    await db.from("guia_eventos").insert({
      guia_id: dispatch.guia_id, event_type: "delivery_confirmed",
      message: "Entrega confirmada pelo WhatsApp.", metadata_json: { message_status: messageStatus },
    });
  } else if (["failed", "undelivered"].includes(messageStatus)) {
    if (dispatch.status === "falhou") return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
    await db.from("guia_envios").update({
      status: "falhou", failed_at: new Date().toISOString(),
      provider_error: form.get("ErrorCode") || "twilio_delivery_failed",
    }).eq("id", dispatch.id);
    await db.from("guia_excecoes").insert({
      guia_id: dispatch.guia_id, exception_type: "delivery_failed", severity: "error",
      reason: "A entrega do WhatsApp falhou apos a submissao.",
      action_recommended: "Analise o destinatario e realize nova acao manual.",
      detected_data_json: { error_code: form.get("ErrorCode") },
    });
  }
  return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
});
