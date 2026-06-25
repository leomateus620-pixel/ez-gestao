// Envio de TESTE WhatsApp via Meta Cloud API — gated por admin.
// Nunca expõe WHATSAPP_ACCESS_TOKEN em respostas, logs ou banco.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const GRAPH_BASE = "https://graph.facebook.com";

function normalizeE164(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

function friendlyForCode(code: number | null | undefined): string | null {
  if (code === 100) return "Token sem permissão, WABA não atribuída ao usuário do sistema, escopos incorretos ou ID da WABA incorreto.";
  if (code === 190) return "Token inválido, expirado ou revogado.";
  if (code === 131030) return "Número de destino não está autorizado a receber mensagens neste momento.";
  if (code === 132000 || code === 132001 || code === 132005 || code === 132007) return "Template inválido, não aprovado ou parâmetros incompatíveis.";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors });

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let userId: string | null = null;

  if (!isServiceRole) {
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: u, error: ue } = await authClient.auth.getUser(token);
    if (ue || !u?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
    userId = u.user.id;
    // Admin gate (bootstrap: allow if no admin configured yet)
    const { data: roleOk } = await svc.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: bootstrap } = await svc.rpc("no_admin_configured");
    if (!roleOk && !bootstrap) {
      return new Response(JSON.stringify({ error: "forbidden", message: "Apenas administradores podem testar a integração." }), { status: 403, headers: cors });
    }
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid_body" }), { status: 400, headers: cors }); }

  const to = normalizeE164(String(body?.to || ""));
  const templateName = String(body?.template_name || "").trim();
  const language = String(body?.language || "pt_BR").trim();
  const parameters: string[] = Array.isArray(body?.parameters) ? body.parameters.map((v: unknown) => String(v ?? "")) : [];
  if (!to) return new Response(JSON.stringify({ error: "invalid_to", message: "Informe o número em formato E.164 (ex.: 5511999999999)." }), { status: 400, headers: cors });
  if (!templateName) return new Response(JSON.stringify({ error: "missing_template_name" }), { status: 400, headers: cors });

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const wabaId = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID");
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v25.0";
  if (!accessToken || !phoneId) {
    return new Response(JSON.stringify({ error: "whatsapp_not_configured" }), { status: 409, headers: cors });
  }

  const components: any[] = [];
  if (parameters.length > 0) {
    components.push({ type: "body", parameters: parameters.map((v) => ({ type: "text", text: v.slice(0, 1024) })) });
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  const endpoint = `${GRAPH_BASE}/${apiVersion}/${phoneId}/messages`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const respText = await resp.text();
  let respJson: any = null; try { respJson = JSON.parse(respText); } catch { /* */ }

  const messageId = respJson?.messages?.[0]?.id ?? null;
  const errorCode: number | null = respJson?.error?.code ?? null;
  const errorFriendly = !resp.ok
    ? (friendlyForCode(errorCode) || respJson?.error?.message?.slice?.(0, 240) || `HTTP ${resp.status}`)
    : null;

  // Persistência de auditoria (sem token nem headers)
  try {
    await svc.from("whatsapp_integration_logs").insert({
      triggered_by: userId,
      test_type: "send_test",
      status: resp.ok ? "success" : "failed",
      endpoint: `${GRAPH_BASE}/${apiVersion}/{phone_number_id}/messages`,
      phone_number_id: phoneId,
      waba_id: wabaId,
      to_phone: to,
      template_name: templateName,
      message_id: messageId,
      error_code: errorCode,
      error_message: errorFriendly,
      meta: { language, has_parameters: parameters.length > 0, http_status: resp.status },
    });
  } catch { /* */ }

  if (!resp.ok) {
    return new Response(JSON.stringify({
      ok: false, error: "send_failed", error_code: errorCode, message: errorFriendly,
    }), { status: 502, headers: cors });
  }

  return new Response(JSON.stringify({
    ok: true, message_id: messageId, to, template_name: templateName,
  }), { headers: cors });
});