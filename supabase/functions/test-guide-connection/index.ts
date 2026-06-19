// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const GMAIL_GW = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const GRAPH_BASE = "https://graph.facebook.com";

function b64url(s: string) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function isAuthorized(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await auth.auth.getUser(token);
  return !error && !!data.user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors });
  if (!(await isAuthorized(req))) return new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers: cors });

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid_body" }), { status: 400, headers: cors }); }

  const canal = body?.canal as 'email' | 'whatsapp';
  const destinatario = String(body?.destinatario || '').trim();
  if (!['email', 'whatsapp'].includes(canal) || !destinatario) {
    return new Response(JSON.stringify({ error: "missing_params", required: ['canal', 'destinatario'] }), { status: 400, headers: cors });
  }

  if (canal === 'email') {
    const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!gmailKey || !lovableKey) {
      return new Response(JSON.stringify({ error: "gmail_not_configured" }), { status: 409, headers: cors });
    }
    const headers = { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': gmailKey, 'Content-Type': 'application/json' };
    const prof = await fetch(`${GMAIL_GW}/users/me/profile`, { headers });
    const from = prof.ok ? (await prof.json()).emailAddress : 'me';
    const mime = [
      `From: ${from}`,
      `To: ${destinatario}`,
      'Subject: [EZ] Teste de conexão Gmail',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'Este é um teste do conector Gmail do módulo Guias do EZ.',
      `Enviado em: ${new Date().toISOString()}`,
    ].join('\r\n');
    const send = await fetch(`${GMAIL_GW}/users/me/messages/send`, {
      method: 'POST', headers,
      body: JSON.stringify({ raw: b64url(mime) }),
    });
    if (!send.ok) {
      const txt = (await send.text()).slice(0, 400);
      return new Response(JSON.stringify({ ok: false, status: send.status, error: txt }), { status: 502, headers: cors });
    }
    return new Response(JSON.stringify({ ok: true, canal: 'email', from, message_id: (await send.json()).id }), { headers: cors });
  }

  // WhatsApp via Meta Cloud API
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const wabaId = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID");
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v25.0";
  const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
  const testTo = Deno.env.get("WHATSAPP_TEST_TO");

  const diagnostics: Record<string, unknown> = {
    provider: "meta_cloud_api",
    api_version: apiVersion,
    access_token: accessToken ? "configured" : "missing",
    phone_number_id: phoneId ? "configured" : "missing",
    waba_id: wabaId ? "configured" : "missing",
    verify_token: verifyToken ? "configured" : "missing",
    test_to: testTo ? "configured" : "missing",
    app_secret: Deno.env.get("WHATSAPP_APP_SECRET") ? "configured" : "missing",
  };

  if (!accessToken || !phoneId) {
    return new Response(JSON.stringify({ ok: false, error: "whatsapp_not_configured", diagnostics }), { status: 409, headers: cors });
  }

  // 1) Valida token + phone_number_id
  const phoneResp = await fetch(`${GRAPH_BASE}/${apiVersion}/${phoneId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const phoneBody = await phoneResp.text();
  diagnostics.phone_check = phoneResp.ok ? "ok" : `error_${phoneResp.status}`;
  if (!phoneResp.ok) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_phone_or_token", detail: phoneBody.slice(0, 300), diagnostics }), { status: 502, headers: cors });
  }

  // 2) Lista templates da WABA (opcional)
  if (wabaId) {
    const tplResp = await fetch(`${GRAPH_BASE}/${apiVersion}/${wabaId}/message_templates?limit=50`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (tplResp.ok) {
      const tplJson = await tplResp.json();
      diagnostics.templates_count = Array.isArray(tplJson?.data) ? tplJson.data.length : 0;
      diagnostics.templates_active = Array.isArray(tplJson?.data)
        ? tplJson.data.filter((t: any) => t?.status === "APPROVED").map((t: any) => t.name)
        : [];
    } else {
      diagnostics.templates_count = `error_${tplResp.status}`;
    }
  }

  // 3) Envia mensagem de teste para WHATSAPP_TEST_TO (sempre, ignora destinatario do form)
  const sendTo = testTo || destinatario;
  if (!sendTo) {
    return new Response(JSON.stringify({ ok: false, error: "no_test_recipient", diagnostics }), { status: 400, headers: cors });
  }
  const sendResp = await fetch(`${GRAPH_BASE}/${apiVersion}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: sendTo,
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" } },
    }),
  });
  const sendBody = await sendResp.text();
  let sendJson: any = null;
  try { sendJson = JSON.parse(sendBody); } catch { /* */ }
  diagnostics.last_test_status = sendResp.ok ? "sent" : `error_${sendResp.status}`;
  diagnostics.last_test_message_id = sendJson?.messages?.[0]?.id ?? null;
  diagnostics.last_test_error = sendResp.ok ? null : (sendJson?.error?.message || sendBody.slice(0, 300));

  return new Response(JSON.stringify({
    ok: sendResp.ok,
    canal: "whatsapp",
    whatsapp: diagnostics,
  }), { status: sendResp.ok ? 200 : 502, headers: cors });
});