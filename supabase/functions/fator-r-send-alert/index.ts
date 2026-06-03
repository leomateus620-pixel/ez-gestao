import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

const base64url = (data: string) => {
  const bytes = new TextEncoder().encode(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const encodeSubject = (subject: string) => {
  // RFC 2047 Base64 encoding to preserve UTF-8 (acentos)
  const bytes = new TextEncoder().encode(subject);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
};

const buildRaw = (from: string, to: string, subject: string, html: string) => {
  const recipients = Array.isArray(to) ? to.join(", ") : to;
  const message = [
    `From: ${from}`,
    `To: ${recipients}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n");
  return base64url(message);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    const { to, subject, html, from, dryRun } = await req.json();
    if (!to || !subject || !html) {
      return Response.json({ ok: false, provider: "gmail_connector", reason: "invalid_payload", message: "Campos obrigatórios ausentes (to, subject, html)." }, { headers: cors });
    }
    const sender = from || Deno.env.get("FATOR_R_EMAIL_FROM") || "leomateus620@gmail.com";
    const shouldDryRun = dryRun !== false || Deno.env.get("FATOR_R_EMAIL_DRY_RUN") !== "false";
    if (shouldDryRun) {
      console.log("[fator-r-send-alert] email_dry_run", { to, subject, from: sender });
      return Response.json({
        ok: true,
        dryRun: true,
        provider: "gmail_connector",
        message: "Envio simulado; defina dryRun=false e FATOR_R_EMAIL_DRY_RUN=false para envio real.",
      }, { headers: cors });
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
    if (!lovableKey || !gmailKey) {
      console.warn("[fator-r-send-alert] gmail_connector_missing", { hasLovable: !!lovableKey, hasGmail: !!gmailKey });
      return Response.json({
        ok: false,
        provider: "gmail_connector",
        reason: "gmail_not_connected",
        message: "Gmail não conectado. Conecte o Gmail no Lovable para ativar os alertas.",
      }, { headers: cors });
    }

    const raw = buildRaw(sender, to, subject, html);
    console.log("[fator-r-send-alert] email_send_started", { to, subject, from: sender });
    const resp = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    const text = await resp.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }
    console.log("[fator-r-send-alert] gmail_response", { status: resp.status, body: text.slice(0, 800) });

    if (!resp.ok) {
      const message = data?.error?.message || text || `Gmail respondeu ${resp.status}`;
      console.error("[fator-r-send-alert] gmail_send_failed", { status: resp.status, message });
      return Response.json({
        ok: false,
        provider: "gmail_connector",
        reason: "gmail_send_failed",
        status: resp.status,
        message,
      }, { headers: cors });
    }

    console.log("[fator-r-send-alert] gmail_send_success", { messageId: data?.id });
    return Response.json({
      ok: true,
      provider: "gmail_connector",
      messageId: data?.id ?? null,
      threadId: data?.threadId ?? null,
    }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[fator-r-send-alert] unexpected_error", message);
    return Response.json({ ok: false, provider: "gmail_connector", reason: "unexpected_error", message }, { headers: cors });
  }
});
