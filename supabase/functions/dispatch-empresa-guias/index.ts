// deno-lint-ignore-file no-explicit-any
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

function gwHeaders(connectionKey: string) {
  return {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
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

async function extractPdf(bytes: Uint8Array) {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const normalized = (Array.isArray(text) ? text.join("\n") : (text as string))
      .replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
    return { text: normalized.slice(0, 20000), pageCount: totalPages || 0 };
  } catch {
    return { text: "", pageCount: 0 };
  }
}

function metadataFromText(text: string) {
  const competencia = text.match(/(?:compet[eê]ncia|periodo)\s*[:\-]?\s*(\d{2}\/\d{4})/i)?.[1] || null;
  const due = text.match(/(?:vencimento|venc\.)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;
  const amount = text.match(/(?:valor(?:\s+total)?|total)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i)?.[1] || null;
  const kind = text.match(/\b(DAS|DARF|DCTFWeb|DCTF|FGTS|INSS|ICMS|ISS|GPS|DAE)\b/i)?.[1]?.toUpperCase() || null;
  return {
    tipo_guia: kind,
    competencia,
    vencimento: due ? due.split("/").reverse().join("-") : null,
    valor: amount ? Number(amount.replace(/\./g, "").replace(",", ".")) : null,
  };
}

function fmtBRL(v: number | null) {
  if (v == null) return "—";
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return iso.split("-").reverse().join("/");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const driveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
    if (!driveKey || !gmailKey || !Deno.env.get("LOVABLE_API_KEY")) {
      return new Response(JSON.stringify({ error: "connectors_missing" }), { status: 409, headers: cors });
    }
    const body = await req.json();
    const empresa_id: string = body.empresa_id;
    const guia_ids: string[] | undefined = body.guia_ids;
    const mode: "simulate" | "live" = body.mode === "live" ? "live" : "simulate";
    const destinatario_override: string | undefined = body.destinatario_override;
    const assunto_override: string | undefined = body.assunto;
    if (!empresa_id) return new Response(JSON.stringify({ error: "empresa_id_required" }), { status: 400, headers: cors });

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: empresa } = await db.from("empresas").select("*").eq("id", empresa_id).single();
    if (!empresa) return new Response(JSON.stringify({ error: "empresa_not_found" }), { status: 404, headers: cors });

    let q = db.from("guias").select("*").eq("empresa_id", empresa_id).eq("pasta_atual", "empresa");
    if (guia_ids && guia_ids.length) q = q.in("id", guia_ids);
    const { data: guias } = await q;
    if (!guias || !guias.length) {
      return new Response(JSON.stringify({ error: "no_guias", message: "Nenhuma guia disponível para envio." }), { status: 409, headers: cors });
    }

    const destinatario = destinatario_override || empresa.email_principal;
    if (!destinatario || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) {
      return new Response(JSON.stringify({ error: "invalid_recipient" }), { status: 400, headers: cors });
    }

    // Download + extract each PDF
    const items: { guia: any; bytes: Uint8Array; meta: ReturnType<typeof metadataFromText> }[] = [];
    for (const guia of guias) {
      const dl = await fetch(`${DRIVE_GW}/files/${guia.drive_file_id}?alt=media`, { headers: gwHeaders(driveKey) });
      if (!dl.ok) {
        return new Response(JSON.stringify({ error: "drive_download_failed", guia_id: guia.id, status: dl.status }), { status: 502, headers: cors });
      }
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const ext = await extractPdf(bytes);
      const meta = metadataFromText(ext.text);
      await db.from("guias").update({
        ...meta,
        texto_extraido_preview: ext.text.slice(0, 600),
        pagina_count: ext.pageCount,
        extraction_method: "native_pdf_text",
        has_text_layer: ext.text.length > 40,
        processed_at: new Date().toISOString(),
        status: "identificada",
      }).eq("id", guia.id);
      items.push({ guia, bytes, meta });
    }

    const subject = assunto_override || `Guias fiscais — ${empresa.razao_social}`;
    const greet = empresa.saudacao_guia?.trim() || `Olá, ${empresa.razao_social}.`;
    const lines = items.map(({ guia, meta }, i) => {
      const parts = [
        `${i + 1}. ${meta.tipo_guia || "Guia"} — ${guia.file_name}`,
        meta.competencia && `   Competência: ${meta.competencia}`,
        meta.vencimento && `   Vencimento: ${fmtDate(meta.vencimento)}`,
        meta.valor != null && `   Valor: ${fmtBRL(meta.valor)}`,
      ].filter(Boolean);
      return parts.join("\n");
    }).join("\n\n");
    const bodyText = `${greet}\n\nSeguem em anexo ${items.length} guia(s) fiscal(is):\n\n${lines}\n\n— Envio automático.`;

    if (mode === "simulate") {
      return new Response(JSON.stringify({
        mode: "simulate", destinatario, subject, body_preview: bodyText,
        items: items.map(({ guia, meta }) => ({ guia_id: guia.id, file_name: guia.file_name, ...meta })),
      }), { headers: cors });
    }

    // Build MIME with all attachments
    const sender = await fetch(`${GMAIL_GW}/users/me/profile`, { headers: gwHeaders(gmailKey) });
    const senderEmail = sender.ok ? (await sender.json()).emailAddress : "me";
    const boundary = `lovable-${crypto.randomUUID()}`;
    const mimeParts: string[] = [
      `From: ${senderEmail}`, `To: ${destinatario}`, `Subject: ${subject}`,
      "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
      `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "", bodyText,
    ];
    for (const { guia, bytes } of items) {
      mimeParts.push(
        `--${boundary}`,
        `Content-Type: application/pdf; name="${guia.file_name}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${guia.file_name}"`,
        "",
        base64(bytes),
      );
    }
    mimeParts.push(`--${boundary}--`);
    const mime = mimeParts.join("\r\n");

    const send = await fetch(`${GMAIL_GW}/users/me/messages/send`, {
      method: "POST", headers: gwHeaders(gmailKey),
      body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(mime)) }),
    });
    if (!send.ok) {
      const t = await send.text();
      return new Response(JSON.stringify({ error: "gmail_send_failed", status: send.status, details: t.slice(0, 500) }), { status: 502, headers: cors });
    }
    const result = await send.json();

    const idemBase = `${empresa_id}:${new Date().toISOString().slice(0, 10)}:${items.map(i => i.guia.id).sort().join(",")}`;
    for (const { guia } of items) {
      await db.from("guia_envios").insert({
        guia_id: guia.id, empresa_id, canal: "email",
        destinatario, assunto: subject, mensagem_preview: bodyText.slice(0, 500),
        provider_message_id: result.id, idempotency_key: `${idemBase}:${guia.id}`,
        status: "aceito",
        sanitized_payload: { mode: "live", message_id: result.id, sender: senderEmail, batch_size: items.length },
      });
      await db.from("guias").update({ status: "enviada", sent_at: new Date().toISOString(), provider_error: null }).eq("id", guia.id);
      await db.from("guia_eventos").insert({
        guia_id: guia.id, event_type: "dispatch_accepted",
        message: "E-mail enviado via dispatch-empresa-guias.",
        metadata_json: { provider_message_id: result.id, destinatario, batch_size: items.length },
      });
    }
    await db.from("logs_acesso").insert({
      empresa_id, acao: "envio", usuario: "Sistema", destinatario, canal: "email",
      detalhes: `${items.length} guia(s) enviada(s) por e-mail. msg=${result.id}`,
    });

    return new Response(JSON.stringify({
      mode: "live", destinatario, subject, provider_message_id: result.id,
      sender: senderEmail, items: items.length,
    }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: "unexpected", message: String(err).slice(0, 500) }), { status: 500, headers: cors });
  }
});