/* eslint-disable @typescript-eslint/no-explicit-any */
// Envio de mensagens WhatsApp via Meta Cloud API (Graph API).
// Substitui o stack legado (WhatsApp Web/HMAC service e Twilio).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function normalizeE164(raw: string) {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
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
  if (!(await isAuthorized(req))) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v25.0";
  if (!accessToken || !phoneId) {
    return new Response(JSON.stringify({ error: "whatsapp_not_configured" }), { status: 409, headers: cors });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid_body" }), { status: 400, headers: cors }); }

  const to = normalizeE164(String(body.to || body.phone || ""));
  const templateName = String(body.template_name || "").trim();
  const language = String(body.language || "pt_BR").trim();
  const parameters = (body.parameters || {}) as Record<string, string>;
  const document = body.document as { link?: string; filename?: string } | undefined;
  const modo = body.modo === "teste" ? "teste" : "producao";
  const hasDocumentHeader = Boolean(body.has_document_header);
  const bodyVariableOrder: string[] | undefined = Array.isArray(body.body_variable_order) ? body.body_variable_order : undefined;

  // Modo teste: força WHATSAPP_TEST_TO
  const testTo = Deno.env.get("WHATSAPP_TEST_TO");
  const finalTo = modo === "teste" ? normalizeE164(testTo || "") : to;
  if (modo === "teste" && !finalTo) {
    return new Response(JSON.stringify({ error: "whatsapp_test_to_not_configured" }), { status: 409, headers: cors });
  }
  if (!finalTo) return new Response(JSON.stringify({ error: "invalid_to" }), { status: 400, headers: cors });
  if (!templateName) return new Response(JSON.stringify({ error: "missing_template_name" }), { status: 400, headers: cors });
  if (hasDocumentHeader && !document?.link) {
    return new Response(JSON.stringify({ error: "missing_document_link" }), { status: 400, headers: cors });
  }

  // Monta components do template
  const components: any[] = [];
  if (hasDocumentHeader && document?.link) {
    components.push({
      type: "header",
      parameters: [{
        type: "document",
        document: { link: document.link, filename: document.filename || "documento.pdf" },
      }],
    });
  }
  // Body parameters em ordem
  const orderedKeys = bodyVariableOrder && bodyVariableOrder.length
    ? bodyVariableOrder
    : ["tipo_guia", "empresa", "competencia", "vencimento", "valor"];
  const bodyParams = orderedKeys
    .map((k) => parameters[k])
    .filter((v) => v !== undefined && v !== null && String(v).length > 0)
    .map((v) => ({ type: "text", text: String(v).slice(0, 1024) }));
  if (bodyParams.length === 0 && Object.keys(parameters).length > 0) {
    return new Response(JSON.stringify({ error: "empty_body_parameters" }), { status: 400, headers: cors });
  }
  if (bodyParams.length > 0) components.push({ type: "body", parameters: bodyParams });

  const payload = {
    messaging_product: "whatsapp",
    to: finalTo,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  const graphUrl = `https://graph.facebook.com/${apiVersion}/${phoneId}/messages`;
  const resp = await fetch(graphUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const respText = await resp.text();
  let respJson: any = null;
  try { respJson = JSON.parse(respText); } catch { /* keep null */ }

  const messageId = respJson?.messages?.[0]?.id || null;
  const errorCode: number | null = respJson?.error?.code ?? null;
  const friendly = (() => {
    if (errorCode === 100) return "Token sem permissão, WABA não atribuída ao usuário do sistema, escopos incorretos ou ID da WABA incorreto.";
    if (errorCode === 190) return "Token inválido, expirado ou revogado.";
    if (errorCode === 131030) return "Número de destino não está autorizado a receber mensagens neste momento.";
    return respJson?.error?.message?.slice?.(0, 240) || null;
  })();

  // Auditoria (best-effort) — nunca grava token
  try {
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await svc.from("whatsapp_integration_logs").insert({
      test_type: "dispatch_guia",
      status: resp.ok ? "success" : "failed",
      endpoint: `https://graph.facebook.com/${apiVersion}/{phone_number_id}/messages`,
      phone_number_id: phoneId,
      waba_id: Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID") ?? null,
      to_phone: finalTo,
      template_name: templateName,
      message_id: messageId,
      error_code: errorCode,
      error_message: resp.ok ? null : friendly,
      meta: { modo, http_status: resp.status, has_document_header: hasDocumentHeader },
    });
  } catch { /* */ }

  if (!resp.ok) {
    return new Response(JSON.stringify({
      ok: false,
      status: resp.status,
      error: friendly || `HTTP ${resp.status}`,
      error_code: errorCode,
      error_subcode: respJson?.error?.error_subcode ?? null,
    }), { status: 502, headers: cors });
  }

  return new Response(JSON.stringify({
    ok: true,
    provider: "meta_whatsapp",
    message_id: messageId,
    to: finalTo,
    modo,
    raw: { contacts: respJson?.contacts ?? null, messages: respJson?.messages ?? null },
  }), { headers: cors });
});
