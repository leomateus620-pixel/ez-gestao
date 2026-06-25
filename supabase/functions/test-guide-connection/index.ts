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

  // WhatsApp via Meta Cloud API — diagnóstico em 3 etapas (A, B, C). NUNCA envia mensagens reais aqui.
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const wabaId = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID");
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v25.0";

  // A) Presença de secrets (sem expor valor)
  const secrets = {
    access_token: accessToken ? "present" : "missing",
    phone_number_id: phoneId ? "present" : "missing",
    waba_id: wabaId ? "present" : "missing",
    api_version: apiVersion ? "present" : "missing",
  };
  if (!accessToken || !phoneId || !wabaId) {
    return new Response(JSON.stringify({
      ok: false, canal: "whatsapp", error: "whatsapp_not_configured",
      whatsapp: { provider: "meta_cloud_api", api_version: apiVersion, secrets },
    }), { status: 409, headers: cors });
  }

  const friendlyForCode = (code: number | null | undefined) => {
    if (code === 100) return "Token sem permissão, WABA não atribuída ao usuário do sistema, escopos incorretos ou ID da WABA incorreto.";
    if (code === 190) return "Token inválido, expirado ou revogado.";
    return null;
  };

  // B) Templates da WABA
  const tplResp = await fetch(`${GRAPH_BASE}/${apiVersion}/${wabaId}/message_templates?limit=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const tplText = await tplResp.text();
  let tplJson: any = null; try { tplJson = JSON.parse(tplText); } catch { /* */ }
  let waba: Record<string, unknown> = {};
  if (tplResp.ok) {
    const list: any[] = Array.isArray(tplJson?.data) ? tplJson.data : [];
    waba = {
      ok: true,
      token_scope: list.length > 0 ? "waba_ok" : "waba_ok_no_templates",
      templates_count: list.length,
      templates_active: list.filter((t) => t?.status === "APPROVED").map((t) => ({
        name: t.name, language: t.language, category: t.category,
      })),
    };
  } else {
    const code = tplJson?.error?.code ?? null;
    waba = {
      ok: false,
      status: tplResp.status,
      error_code: code,
      error_message: friendlyForCode(code) || tplJson?.error?.message?.slice?.(0, 240) || `HTTP ${tplResp.status}`,
    };
  }

  // C) Phone Number
  const phoneResp = await fetch(`${GRAPH_BASE}/${apiVersion}/${phoneId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const phoneText = await phoneResp.text();
  let phoneJson: any = null; try { phoneJson = JSON.parse(phoneText); } catch { /* */ }
  let phone: Record<string, unknown> = {};
  if (phoneResp.ok) {
    phone = {
      ok: true,
      display_phone_number: phoneJson?.display_phone_number ?? null,
      verified_name: phoneJson?.verified_name ?? null,
      quality_rating: phoneJson?.quality_rating ?? null,
      code_verification_status: phoneJson?.code_verification_status ?? null,
    };
  } else {
    const code = phoneJson?.error?.code ?? null;
    phone = {
      ok: false,
      status: phoneResp.status,
      error_code: code,
      error_message: friendlyForCode(code) || phoneJson?.error?.message?.slice?.(0, 240) || `HTTP ${phoneResp.status}`,
    };
  }

  // Log de auditoria (best-effort)
  try {
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await svc.from("whatsapp_integration_logs").insert({
      test_type: "diagnostic",
      status: (waba as any).ok && (phone as any).ok ? "success" : "failed",
      endpoint: `${GRAPH_BASE}/${apiVersion}/{waba_id}/message_templates + /{phone_number_id}`,
      phone_number_id: phoneId,
      waba_id: wabaId,
      meta: { secrets, waba, phone },
    });
  } catch { /* ignore */ }

  return new Response(JSON.stringify({
    ok: (waba as any).ok && (phone as any).ok,
    canal: "whatsapp",
    whatsapp: { provider: "meta_cloud_api", api_version: apiVersion, secrets, waba, phone },
  }), { headers: cors });
});