// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const headers = { "Content-Type": "application/json" };

function internal(req: Request) {
  const expected = Deno.env.get("GUIDE_INTERNAL_SECRET") || "";
  return !!expected && req.headers.get("x-guide-internal-secret") === expected;
}

function emailValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || "");
}

function phoneValid(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value || "");
}

function base64Url(bytes: Uint8Array) {
  let raw = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    raw += String.fromCharCode(...bytes.slice(index, index + 8192));
  }
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64(bytes: Uint8Array) {
  let raw = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    raw += String.fromCharCode(...bytes.slice(index, index + 8192));
  }
  return btoa(raw);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function googleAccessToken(db: any) {
  if (Deno.env.get("GOOGLE_ACCESS_TOKEN")) return Deno.env.get("GOOGLE_ACCESS_TOKEN")!;
  const encryptionKey = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!encryptionKey || !clientId || !clientSecret) return null;
  const { data: stored } = await db.from("integracao_segredos")
    .select("*").eq("provider", "google_oauth").maybeSingle();
  if (!stored) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encryptionKey));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(stored.encryption_iv) }, key,
    fromBase64(stored.encrypted_refresh_token),
  );
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: new TextDecoder().decode(decrypted), grant_type: "refresh_token",
    }),
  });
  const tokenBody = await tokenResponse.json();
  return tokenResponse.ok ? tokenBody.access_token as string : null;
}

function description(guide: any, company: any) {
  const facts = [
    guide.tipo_guia && `Guia: ${guide.tipo_guia}`,
    guide.competencia && `Competencia: ${guide.competencia}`,
    guide.vencimento && `Vencimento: ${guide.vencimento}`,
    guide.valor != null && `Valor: R$ ${Number(guide.valor).toFixed(2).replace(".", ",")}`,
  ].filter(Boolean).join(" | ");
  return `${company.saudacao_guia || `Ola, ${company.razao_social}.`} Sua guia esta disponivel.${facts ? ` ${facts}.` : ""}`;
}

async function block(db: any, guide: any, type: string, reason: string, action: string) {
  await db.from("guias").update({ status: "revisao", provider_error: reason }).eq("id", guide.id);
  await db.from("guia_excecoes").insert({
    guia_id: guide.id,
    exception_type: type,
    severity: "warning",
    reason,
    action_recommended: action,
  });
  return new Response(JSON.stringify({ status: "revisao", reason }), { status: 409, headers });
}

async function fetchPdf(guide: any, token: string | null) {
  if (!token) return null;
  const result = await fetch(`https://www.googleapis.com/drive/v3/files/${guide.drive_file_id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return result.ok ? new Uint8Array(await result.arrayBuffer()) : null;
}

async function gmailDispatch(guide: any, company: any, pdf: Uint8Array, token: string | null) {
  const from = Deno.env.get("GMAIL_SENDER");
  if (!token || !from) return null;
  const subject = `Guia ${guide.tipo_guia || "fiscal"} - ${company.razao_social}`;
  const body = description(guide, company);
  const boundary = `ez-gestao-${crypto.randomUUID()}`;
  const mime = [
    `From: ${from}`, `To: ${company.email}`, `Subject: ${subject}`,
    "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "", body,
    `--${boundary}`, `Content-Type: application/pdf; name="${guide.file_name}"`,
    "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${guide.file_name}"`, "",
    base64(pdf), `--${boundary}--`,
  ].join("\r\n");
  const sent = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(mime)) }),
  });
  if (!sent.ok) return null;
  const result = await sent.json();
  return { id: result.id, destination: company.email, subject, preview: body };
}

async function whatsappDispatch(db: any, guide: any, company: any, pdf: Uint8Array) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const sender = Deno.env.get("TWILIO_WHATSAPP_SENDER");
  const contentSid = Deno.env.get("TWILIO_GUIDE_CONTENT_SID");
  if (!sid || !token || !sender || !contentSid) return null;
  const path = `${guide.id}/${guide.file_name}`;
  const upload = await db.storage.from("guias-delivery").upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upload.error) return null;
  const signed = await db.storage.from("guias-delivery").createSignedUrl(path, 15 * 60);
  if (!signed.data?.signedUrl) return null;
  const message = description(guide, company);
  const form = new URLSearchParams({
    To: `whatsapp:${company.whatsapp}`,
    From: sender.startsWith("whatsapp:") ? sender : `whatsapp:${sender}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify({ "1": company.razao_social, "2": message, "3": signed.data.signedUrl }),
  });
  const sent = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  if (!sent.ok) return null;
  const result = await sent.json();
  return { id: result.sid, destination: company.whatsapp, preview: message, template: contentSid };
}

serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  if (!internal(req)) return new Response(JSON.stringify({ error: "internal_authentication_required" }), { status: 401, headers });
  const { guia_id } = await req.json().catch(() => ({}));
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: guide } = await db.from("guias").select("*, empresas(*)").eq("id", guia_id).single();
  const company = guide?.empresas;
  if (!guide || !company || guide.status !== "identificada") {
    return new Response(JSON.stringify({ error: "guide_not_ready" }), { status: 409, headers });
  }
  if (!company.comunicacao_ativa || !company.canal_preferido) {
    return block(db, guide, "invalid_channel", "Empresa sem canal ativo para recebimento.", "Escolha email ou WhatsApp no cadastro.");
  }
  const channel = company.canal_preferido;
  if (channel === "email" && (!company.email_validado || !emailValid(company.email))) {
    return block(db, guide, "missing_email", "Email preferido nao foi validado.", "Valide o endereco de email da empresa.");
  }
  if (channel === "whatsapp" && (!company.whatsapp_opt_in_at || !phoneValid(company.whatsapp))) {
    return block(db, guide, "whatsapp_consent_missing", "WhatsApp sem telefone E.164 ou consentimento registrado.", "Registre opt-in e telefone valido.");
  }
  const { data: integration } = await db.from("integracoes_guias").select("*")
    .eq("provider", channel === "email" ? "gmail" : "twilio_whatsapp").single();
  if (integration?.status !== "ativo") {
    return block(db, guide, "integration_inactive", "Integracao do canal preferido nao esta ativa.", "Ative o conector antes do envio.");
  }
  const key = `${guide.id}:${channel}`;
  const { data: prior } = await db.from("guia_envios").select("*").eq("idempotency_key", key).maybeSingle();
  if (prior?.status && prior.status !== "falhou") {
    return new Response(JSON.stringify({ status: prior.status, duplicate_prevented: true }), { headers });
  }
  const googleToken = await googleAccessToken(db);
  const pdf = await fetchPdf(guide, googleToken);
  if (!pdf) return block(db, guide, "drive_download_failed", "O PDF nao pode ser baixado para envio.", "Verifique o acesso do Google Drive.");
  await db.from("guias").update({ status: "enviando" }).eq("id", guide.id);

  const submitted = channel === "email"
    ? await gmailDispatch(guide, company, pdf, googleToken)
    : await whatsappDispatch(db, guide, company, pdf);
  if (!submitted) {
    await db.from("guias").update({ status: "erro", provider_error: "Provider recusou o envio." }).eq("id", guide.id);
    await db.from("guia_excecoes").insert({
      guia_id: guide.id, exception_type: "dispatch_failed", severity: "error",
      reason: "O provedor nao aceitou o envio.", action_recommended: "Revise o conector e execute novamente.",
    });
    return new Response(JSON.stringify({ status: "erro" }), { status: 502, headers });
  }
  await db.from("guia_envios").upsert({
    guia_id: guide.id,
    empresa_id: company.id,
    canal: channel,
    destinatario: submitted.destination,
    assunto: submitted.subject || null,
    mensagem_preview: submitted.preview,
    template_sid: submitted.template || null,
    provider_message_id: submitted.id,
    idempotency_key: key,
    status: "aceito",
    sanitized_payload: { channel, provider_message_id: submitted.id },
    submitted_at: new Date().toISOString(),
  }, { onConflict: "idempotency_key" });
  const move = googleToken && await fetch(
    `https://www.googleapis.com/drive/v3/files/${guide.drive_file_id}?addParents=${encodeURIComponent(guide.sent_folder_id)}&removeParents=${encodeURIComponent(guide.source_folder_id)}`,
    { method: "PATCH", headers: { Authorization: `Bearer ${googleToken}`, "Content-Type": "application/json" }, body: "{}" },
  );
  if (!move || !move.ok) {
    return block(db, guide, "drive_move_failed", "Envio aceito, mas a movimentacao para enviados falhou.", "Mova o PDF manualmente e confira a permissao Drive.");
  }
  await db.from("guias").update({
    status: "enviada", pasta_atual: "enviados", sent_at: new Date().toISOString(), provider_error: null,
  }).eq("id", guide.id);
  await db.from("guia_eventos").insert({
    guia_id: guide.id, event_type: "dispatch_accepted",
    message: "Envio aceito pelo provedor e arquivo movido para enviados.",
    metadata_json: { channel, provider_message_id: submitted.id },
  });
  return new Response(JSON.stringify({ status: "enviada", channel }), { headers });
});
