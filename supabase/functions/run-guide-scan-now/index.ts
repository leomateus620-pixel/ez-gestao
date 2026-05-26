// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const DRIVE_GW = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const GMAIL_GW = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const MIN_TEXT_LENGTH = 40;

function gwHeaders(connectionKey: string) {
  return {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

function normalizeCnpj(value: string) { return (value || "").replace(/\D/g, ""); }
function validCnpj(value: string) {
  const c = normalizeCnpj(value);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dig = (base: string, w: number[]) => {
    const t = w.reduce((s, weight, i) => s + Number(base[i]) * weight, 0);
    const r = t % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dig(c.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = dig(c.slice(0, 12) + d1, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return c.endsWith(`${d1}${d2}`);
}
function cnpjCandidates(text: string) {
  const m = text.match(/\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/\s-]?\d{4}[-\s]?\d{2}/g) || [];
  return [...new Set(m.map(normalizeCnpj).filter(validCnpj))];
}
function fiscalSignals(text: string) {
  const due = /(?:vencimento|venc\.)\s*[:\-]?\s*\d{2}\/\d{2}\/\d{4}/i.test(text);
  const amount = /(?:valor(?:\s+total)?|total)\s*[:\-]?\s*R?\$?\s*[\d.]+,\d{2}/i.test(text);
  const kind = /\b(DAS|DARF|FGTS|INSS|ICMS|ISS|GPS|DAE)\b/i.test(text);
  return [due, amount, kind].filter(Boolean).length;
}
function metadataFromText(text: string) {
  const competencia = text.match(/(?:compet[eê]ncia|periodo)\s*[:\-]?\s*(\d{2}\/\d{4})/i)?.[1] || null;
  const due = text.match(/(?:vencimento|venc\.)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;
  const amount = text.match(/(?:valor(?:\s+total)?|total)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i)?.[1] || null;
  const kind = text.match(/\b(DAS|DARF|FGTS|INSS|ICMS|ISS|GPS|DAE)\b/i)?.[1]?.toUpperCase() || null;
  return {
    tipo_guia: kind,
    competencia,
    vencimento: due ? due.split("/").reverse().join("-") : null,
    valor: amount ? Number(amount.replace(/\./g, "").replace(",", ".")) : null,
  };
}

async function extractPdf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const normalized = (Array.isArray(text) ? text.join("\n") : (text as string))
    .replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return {
    text: normalized.slice(0, 20000),
    pageCount: totalPages || 0,
    hasTextLayer: normalized.length >= MIN_TEXT_LENGTH,
    extractionMethod: "native_pdf_text",
  };
}

function base64Url(bytes: Uint8Array) {
  let raw = "";
  for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.slice(i, i + 8192));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64(bytes: Uint8Array) {
  let raw = "";
  for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.slice(i, i + 8192));
  return btoa(raw);
}

async function logException(db: any, guideId: string, type: string, reason: string, action: string, meta: any = {}) {
  await db.from("guias").update({ status: "revisao", provider_error: reason }).eq("id", guideId);
  await db.from("guia_excecoes").insert({
    guia_id: guideId, exception_type: type, severity: "warning",
    reason, action_recommended: action,
  });
  await db.from("guia_eventos").insert({
    guia_id: guideId, event_type: "exception", level: "warning",
    message: reason, metadata_json: { type, ...meta },
  });
}

async function logEvent(db: any, guideId: string, eventType: string, message: string, meta: any = {}) {
  await db.from("guia_eventos").insert({
    guia_id: guideId, event_type: eventType, message, metadata_json: meta,
  });
}

async function processOneGuide(db: any, guide: any, driveKey: string, gmailKey: string, mode: "simulate" | "live") {
  // 1. Download
  await db.from("guias").update({ status: "lendo" }).eq("id", guide.id);
  const dl = await fetch(`${DRIVE_GW}/files/${guide.drive_file_id}?alt=media`, {
    headers: gwHeaders(driveKey),
  });
  if (!dl.ok) {
    const body = await dl.text();
    await logException(db, guide.id, "drive_download_failed",
      `Nao foi possivel baixar o PDF do Drive (HTTP ${dl.status}).`,
      "Verifique a conexao Google Drive e as permissoes do arquivo.",
      { status: dl.status, body: body.slice(0, 500) });
    return { status: "revisao", reason: "drive_download_failed" };
  }
  const bytes = new Uint8Array(await dl.arrayBuffer());

  // 2. Extract
  let extraction;
  try { extraction = await extractPdf(bytes); }
  catch (err) {
    await logException(db, guide.id, "pdf_text_extraction_failed",
      "Falha ao ler o conteudo do PDF.", "Reenvie ou revise manualmente.",
      { error: String(err).slice(0, 300) });
    return { status: "revisao", reason: "pdf_text_extraction_failed" };
  }
  await logEvent(db, guide.id, "pdf_text_extracted", "Leitura nativa concluida.", {
    page_count: extraction.pageCount, has_text_layer: extraction.hasTextLayer,
    text_length: extraction.text.length,
  });

  // 3. CNPJ identification
  const filenameCands = cnpjCandidates(guide.file_name);
  const contentCands = cnpjCandidates(extraction.text);
  if (!extraction.hasTextLayer && filenameCands.length === 0) {
    await logException(db, guide.id, "pdf_without_text_layer",
      "O PDF parece ser escaneado ou imagem (sem camada de texto).",
      "Substitua por um PDF digital com texto ou processe manualmente.",
      { page_count: extraction.pageCount });
    return { status: "revisao", reason: "pdf_without_text_layer" };
  }
  const candidates = [...new Set([...filenameCands, ...contentCands])];
  if (candidates.length !== 1) {
    await logException(db, guide.id, "cnpj_ambiguous",
      "Nao foi encontrado um unico CNPJ valido na guia.",
      "Vincule a empresa manualmente.", { candidates });
    return { status: "revisao", reason: "cnpj_ambiguous" };
  }
  if (contentCands.length === 0 && fiscalSignals(extraction.text) < 1) {
    await logException(db, guide.id, "insufficient_pdf_signals",
      "O PDF nao tem indicios fiscais suficientes para envio automatico.",
      "Revise manualmente antes de enviar.", { text_length: extraction.text.length });
    return { status: "revisao", reason: "insufficient_pdf_signals" };
  }

  // 4. Company match
  const { data: companies } = await db.from("empresas").select("*");
  const matched = companies?.find((c: any) => normalizeCnpj(c.cnpj) === candidates[0]);
  if (!matched) {
    await logException(db, guide.id, "company_not_found",
      "Nenhuma empresa corresponde ao CNPJ detectado.",
      "Cadastre a empresa antes de reenviar.", { cnpj: candidates[0] });
    return { status: "revisao", reason: "company_not_found" };
  }
  if (matched.status !== "ativa") {
    await logException(db, guide.id, "company_inactive",
      "A empresa identificada esta inativa.",
      "Ative a empresa antes de reenviar.", { cnpj: candidates[0] });
    return { status: "revisao", reason: "company_inactive" };
  }

  const meta = metadataFromText(extraction.text);
  const matchSource = filenameCands.length && contentCands.length ? "cnpj_pdf"
    : filenameCands.length ? "filename" : "cnpj_pdf";
  await db.from("guias").update({
    status: "identificada",
    match_source: matchSource,
    cnpj_detectado: candidates[0],
    empresa_id: matched.id,
    texto_extraido_preview: extraction.text.slice(0, 600),
    pagina_count: extraction.pageCount,
    extraction_method: extraction.extractionMethod,
    has_text_layer: extraction.hasTextLayer,
    processed_at: new Date().toISOString(),
    ...meta,
  }).eq("id", guide.id);
  await logEvent(db, guide.id, "company_matched", "Empresa identificada.", {
    cnpj: candidates[0], empresa: matched.razao_social, match_source: matchSource,
  });

  // 5. Channel validation
  if (!matched.comunicacao_ativa || matched.canal_preferido !== "email") {
    await logException(db, guide.id, "invalid_channel",
      "Empresa sem canal de e-mail ativo.",
      "Configure canal_preferido='email' e comunicacao_ativa=true.", {});
    return { status: "revisao", reason: "invalid_channel" };
  }
  if (!matched.email_validado || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(matched.email_principal || "")) {
    await logException(db, guide.id, "missing_email",
      "E-mail principal nao foi validado ou esta invalido.",
      "Valide o e-mail da empresa antes do envio.", { email: matched.email_principal });
    return { status: "revisao", reason: "missing_email" };
  }

  // 6. Idempotency
  const idemKey = `${guide.id}:email`;
  const { data: prior } = await db.from("guia_envios").select("*")
    .eq("idempotency_key", idemKey).maybeSingle();
  if (prior && prior.status !== "falhou") {
    return { status: prior.status, duplicate_prevented: true };
  }

  // 7. Build email
  const subject = `Guia ${meta.tipo_guia || "fiscal"} - ${matched.razao_social}`;
  const facts = [
    meta.tipo_guia && `Guia: ${meta.tipo_guia}`,
    meta.competencia && `Competencia: ${meta.competencia}`,
    meta.vencimento && `Vencimento: ${meta.vencimento.split("-").reverse().join("/")}`,
    meta.valor != null && `Valor: R$ ${Number(meta.valor).toFixed(2).replace(".", ",")}`,
  ].filter(Boolean).join(" | ");
  const greet = matched.saudacao_guia?.trim() || `Ola, ${matched.razao_social}.`;
  const body = `${greet}\n\nSua guia esta disponivel em anexo.${facts ? `\n\n${facts}.` : ""}\n\n— Envio automatico.`;
  const destinatario = matched.email_principal;

  if (mode === "simulate") {
    await db.from("guia_envios").insert({
      guia_id: guide.id, empresa_id: matched.id, canal: "email",
      destinatario, assunto: subject, mensagem_preview: body,
      idempotency_key: idemKey, status: "simulado",
      sanitized_payload: { mode: "simulate", subject, body_preview: body.slice(0, 200) },
    });
    await db.from("guias").update({ status: "identificada" }).eq("id", guide.id);
    await logEvent(db, guide.id, "dispatch_simulated",
      "Simulacao concluida: e-mail seria enviado mas nao foi disparado.",
      { destinatario, subject });
    return { status: "simulado", destinatario, subject, body_preview: body };
  }

  // 8. Live: send via Gmail gateway
  await db.from("guias").update({ status: "enviando" }).eq("id", guide.id);
  const sender = await fetch(`${GMAIL_GW}/users/me/profile`, { headers: gwHeaders(gmailKey) });
  const senderEmail = sender.ok ? (await sender.json()).emailAddress : "me";
  const boundary = `lovable-${crypto.randomUUID()}`;
  const mime = [
    `From: ${senderEmail}`, `To: ${destinatario}`, `Subject: ${subject}`,
    "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "", body,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${guide.file_name}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${guide.file_name}"`, "",
    base64(bytes), `--${boundary}--`,
  ].join("\r\n");

  const send = await fetch(`${GMAIL_GW}/users/me/messages/send`, {
    method: "POST", headers: gwHeaders(gmailKey),
    body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(mime)) }),
  });
  if (!send.ok) {
    const errBody = await send.text();
    await db.from("guias").update({ status: "erro", provider_error: `Gmail HTTP ${send.status}` })
      .eq("id", guide.id);
    await db.from("guia_excecoes").insert({
      guia_id: guide.id, exception_type: "dispatch_failed", severity: "error",
      reason: `Gmail recusou o envio (HTTP ${send.status}).`,
      action_recommended: "Verifique escopos do conector Gmail (gmail.send) e tente novamente.",
    });
    await logEvent(db, guide.id, "dispatch_failed", "Falha no envio via Gmail.", {
      status: send.status, body: errBody.slice(0, 500),
    });
    return { status: "erro", reason: "gmail_send_failed", details: errBody.slice(0, 500) };
  }
  const sendResult = await send.json();

  await db.from("guia_envios").insert({
    guia_id: guide.id, empresa_id: matched.id, canal: "email",
    destinatario, assunto: subject, mensagem_preview: body,
    provider_message_id: sendResult.id, idempotency_key: idemKey,
    status: "aceito",
    sanitized_payload: { mode: "live", message_id: sendResult.id, sender: senderEmail },
  });

  // 9. Move file in Drive
  const move = await fetch(
    `${DRIVE_GW}/files/${guide.drive_file_id}?addParents=${encodeURIComponent(guide.sent_folder_id)}&removeParents=${encodeURIComponent(guide.source_folder_id)}`,
    { method: "PATCH", headers: gwHeaders(driveKey), body: "{}" },
  );
  if (!move.ok) {
    await logException(db, guide.id, "drive_move_failed",
      "E-mail enviado, mas a movimentacao para enviados falhou.",
      "Mova o PDF manualmente para a subpasta 'enviados'.",
      { status: move.status });
  } else {
    await db.from("guias").update({
      status: "enviada", pasta_atual: "enviados",
      sent_at: new Date().toISOString(), provider_error: null,
    }).eq("id", guide.id);
  }
  await logEvent(db, guide.id, "dispatch_accepted",
    "E-mail enviado pelo Gmail e arquivo movido.",
    { provider_message_id: sendResult.id, destinatario });
  return {
    status: "enviada", destinatario, subject,
    provider_message_id: sendResult.id, sender: senderEmail,
  };
}

async function hasAdminSession(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await auth.auth.getUser(token);
  return !error && !!data.user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors });
  }
  if (!(await hasAdminSession(req))) {
    return new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers: cors });
  }

  const driveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!driveKey || !gmailKey || !Deno.env.get("LOVABLE_API_KEY")) {
    return new Response(JSON.stringify({
      error: "connectors_missing",
      message: "Conectores Google Drive e Gmail precisam estar conectados.",
    }), { status: 409, headers: cors });
  }

  const body = await req.json().catch(() => ({}));
  const mode: "simulate" | "live" = body?.mode === "live" ? "live" : "simulate";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: drive } = await db.from("integracoes_guias").select("*")
    .eq("provider", "google_drive").single();
  if (!drive?.source_folder_id || !drive?.sent_folder_id || drive.status !== "ativo") {
    return new Response(JSON.stringify({
      error: "drive_integration_inactive",
      message: "Execute bootstrap-test-folder para configurar as pastas.",
    }), { status: 409, headers: cors });
  }

  // List files in source folder
  const params = new URLSearchParams({
    q: `'${drive.source_folder_id}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,md5Checksum,modifiedTime)",
    pageSize: "100",
  });
  const list = await fetch(`${DRIVE_GW}/files?${params}`, { headers: gwHeaders(driveKey) });
  if (!list.ok) {
    const text = await list.text();
    return new Response(JSON.stringify({
      error: "drive_list_failed", status: list.status, details: text.slice(0, 500),
    }), { status: 502, headers: cors });
  }
  const files = ((await list.json()).files || []) as any[];

  const results: any[] = [];
  for (const file of files) {
    // Upsert guia
    const { data: existing } = await db.from("guias").select("*")
      .eq("drive_file_id", file.id).maybeSingle();
    let guide = existing;
    if (!guide) {
      const { data: inserted } = await db.from("guias").insert({
        drive_file_id: file.id, file_name: file.name, mime_type: file.mimeType,
        sha256: file.md5Checksum || null, source_folder_id: drive.source_folder_id,
        sent_folder_id: drive.sent_folder_id,
      }).select().single();
      guide = inserted;
    }
    if (!guide) continue;
    if (["enviada", "enviando"].includes(guide.status)) {
      results.push({ file: file.name, skipped: true, reason: "already_processed", status: guide.status });
      continue;
    }
    if (file.mimeType !== "application/pdf") {
      await db.from("guias").update({ status: "revisao", provider_error: "Formato nao suportado." })
        .eq("id", guide.id);
      await db.from("guia_excecoes").insert({
        guia_id: guide.id, exception_type: "unsupported_file",
        reason: "Somente PDFs sao processados.",
        action_recommended: "Envie o arquivo em formato PDF.",
      });
      results.push({ file: file.name, skipped: true, reason: "not_pdf" });
      continue;
    }
    try {
      const r = await processOneGuide(db, guide, driveKey, gmailKey, mode);
      results.push({ file: file.name, guia_id: guide.id, ...r });
    } catch (err) {
      results.push({ file: file.name, error: String(err).slice(0, 500) });
    }
  }

  await db.from("integracoes_guias").update({
    last_check_at: new Date().toISOString(), last_error: null,
  }).eq("provider", "google_drive");

  return new Response(JSON.stringify({
    mode, scanned: files.length, results,
  }), { headers: cors });
});
