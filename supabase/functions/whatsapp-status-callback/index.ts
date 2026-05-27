import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type, x-timestamp, x-signature","Access-Control-Allow-Methods":"POST, OPTIONS"};
const hmacHex = async (secret: string, payload: string) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405, headers: corsHeaders });

  const raw = await req.text();
  const timestamp = req.headers.get("x-timestamp") || "";
  const signature = req.headers.get("x-signature") || "";
  const secret = Deno.env.get("WHATSAPP_SERVICE_SECRET") || "";
  const expected = await hmacHex(secret, `${timestamp}.${raw}`);
  if (!secret || expected !== signature) return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const payload = JSON.parse(raw);
  const allowed = ["delivered", "read", "failed"];
  if (!allowed.includes(payload.status)) return new Response(JSON.stringify({ error: "invalid_status" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const update: Record<string, unknown> = { status: payload.status, external_message_id: payload.external_message_id ?? null };
  if (payload.status === "delivered") update.delivered_at = new Date().toISOString();
  if (payload.status === "read") update.read_at = new Date().toISOString();
  if (payload.status === "failed") {
    update.failed_at = new Date().toISOString();
    update.last_error = payload.error ?? "delivery_failed";
  }

  await supabase.from("whatsapp_messages").update(update).eq("id", payload.message_id);
  await supabase.from("whatsapp_message_events").insert({ message_id: payload.message_id, event_type: "callback_received", payload });
  await supabase.from("whatsapp_message_events").insert({ message_id: payload.message_id, event_type: payload.status, payload: payload.payload ?? {} });

  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
