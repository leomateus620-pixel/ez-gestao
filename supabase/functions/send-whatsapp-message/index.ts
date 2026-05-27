import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const normalizePhone = (raw: string) => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  if (digits.length === 12 && digits.startsWith("55")) return digits;
  if (digits.length === 13 && digits.startsWith("55")) return digits;
  return null;
};

const hmacHex = async (secret: string, payload: string) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    let insertedId: string | null = null;
    const phone = String(body.phone || "").trim();
    const message = String(body.message || "").trim();
    if (!phone) return new Response(JSON.stringify({ error: "phone_required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!message || message.length > 2000) return new Response(JSON.stringify({ error: "invalid_message" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const normalized = normalizePhone(phone);
    if (!normalized) return new Response(JSON.stringify({ error: "invalid_phone" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const messagePayload = {
      user_id: userData.user.id,
      tenant_id: body.tenant_id ?? null,
      source_type: body.source_type ?? "manual",
      source_id: body.source_id ?? null,
      recipient_name: body.recipient_name ?? null,
      phone,
      normalized_phone: normalized,
      message: message.replace(/[\u0000-\u001F\u007F]/g, " "),
      metadata: body.metadata ?? {},
      status: "queued",
    };

    const { data: inserted, error: insertError } = await supabase.from("whatsapp_messages").insert(messagePayload).select("*").single();
    insertedId = inserted?.id ?? null;
    if (insertError) throw insertError;

    await supabase.from("whatsapp_message_events").insert({ message_id: inserted.id, event_type: "queued", payload: { source: "edge" } });
    await supabase.from("whatsapp_messages").update({ status: "sending" }).eq("id", inserted.id);
    await supabase.from("whatsapp_message_events").insert({ message_id: inserted.id, event_type: "sending", payload: { source: "edge" } });

    const serviceUrl = Deno.env.get("WHATSAPP_SERVICE_URL")?.replace(/\/$/, "");
    const secret = Deno.env.get("WHATSAPP_SERVICE_SECRET");
    if (!serviceUrl || !secret) throw new Error("whatsapp_service_not_configured");

    const outbound = { message_id: inserted.id, phone: normalized, message: messagePayload.message, recipient_name: messagePayload.recipient_name, metadata: messagePayload.metadata };
    const timestamp = new Date().toISOString();
    const signature = await hmacHex(secret, `${timestamp}.${JSON.stringify(outbound)}`);

    const response = await fetch(`${serviceUrl}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Source": "lovable-supabase", "X-Timestamp": timestamp, "X-Signature": signature },
      body: JSON.stringify(outbound),
    });

    const responseData = await response.json().catch(() => ({}));
    if (!response.ok || !responseData?.ok) throw new Error(responseData?.error || `service_error_${response.status}`);

    await supabase.from("whatsapp_messages").update({
      status: "sent",
      external_message_id: responseData.external_message_id ?? null,
      sent_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", inserted.id);
    await supabase.from("whatsapp_message_events").insert({ message_id: inserted.id, event_type: "sent", payload: responseData });

    return new Response(JSON.stringify({ ok: true, message_id: inserted.id, status: "sent" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const messageId = insertedId;
    if (messageId) {
      const { data: msg } = await supabase.from("whatsapp_messages").select("attempts,max_attempts").eq("id", messageId).single();
      const attempts = (msg?.attempts ?? 0) + 1;
      const max = msg?.max_attempts ?? 3;
      const finalStatus = attempts >= max ? "failed" : "queued";
      await supabase.from("whatsapp_messages").update({ attempts, status: finalStatus, failed_at: finalStatus === "failed" ? new Date().toISOString() : null, last_error: String(err) }).eq("id", messageId);
      await supabase.from("whatsapp_message_events").insert({ message_id: messageId, event_type: "failed", payload: { error: String(err) } });
    }
    return new Response(JSON.stringify({ ok: false, error: "Não foi possível enviar sua mensagem de WhatsApp agora." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
