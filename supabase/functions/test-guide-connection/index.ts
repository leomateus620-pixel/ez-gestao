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

  // WhatsApp via função existente
  const wpRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-whatsapp-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ to: destinatario, body: '[EZ] Teste do conector WhatsApp — módulo Guias.' }),
  });
  if (!wpRes.ok) {
    return new Response(JSON.stringify({ ok: false, status: wpRes.status, error: (await wpRes.text()).slice(0, 400) }), { status: 502, headers: cors });
  }
  return new Response(JSON.stringify({ ok: true, canal: 'whatsapp' }), { headers: cors });
});