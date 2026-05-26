// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any, no-useless-escape */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
// unpdf is a serverless/Deno-friendly fork of pdf.js – no Node deps, no OCR.
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const jsonHeaders = { "Content-Type": "application/json" };
const MIN_TEXT_LENGTH = 40;

function isInternal(req: Request) {
  const provided = req.headers.get("x-guide-internal-secret") || "";
  const expected = Deno.env.get("GUIDE_INTERNAL_SECRET") || "";
  return !!expected && provided === expected;
}

function normalizeCnpj(value: string) {
  return (value || "").replace(/\D/g, "");
}

function validCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const digit = (base: string, weights: number[]) => {
    const total = weights.reduce((sum, weight, index) => sum + Number(base[index]) * weight, 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = digit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}

function cnpjCandidates(text: string) {
  const matches = text.match(/\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/\s-]?\d{4}[-\s]?\d{2}/g) || [];
  return [...new Set(matches.map(normalizeCnpj).filter(validCnpj))];
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

/**
 * Native PDF text extraction. NO external OCR. Returns rich metadata so callers
 * can decide if the document is digital (text layer) or a scanned image.
 */
export interface NativeExtraction {
  text: string;
  pageCount: number;
  hasTextLayer: boolean;
  extractionMethod: "native_pdf_text";
  confidence: number; // 0..1 derived from text density + fiscal signals
}

function fiscalSignals(text: string) {
  const due = /(?:vencimento|venc\.)\s*[:\-]?\s*\d{2}\/\d{2}\/\d{4}/i.test(text);
  const amount = /(?:valor(?:\s+total)?|total)\s*[:\-]?\s*R?\$?\s*[\d.]+,\d{2}/i.test(text);
  const kind = /\b(DAS|DARF|FGTS|INSS|ICMS|ISS|GPS|DAE)\b/i.test(text);
  return [due, amount, kind].filter(Boolean).length;
}

async function extractPdfText(bytes: Uint8Array): Promise<NativeExtraction> {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const normalized = (Array.isArray(text) ? text.join("\n") : (text as string))
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hasTextLayer = normalized.length >= MIN_TEXT_LENGTH;
  const signals = fiscalSignals(normalized);
  // density: 0..1, signals: 0..3 → confidence weighted by both
  const density = Math.min(1, normalized.length / 600);
  const confidence = hasTextLayer ? Math.min(1, 0.4 * density + 0.2 * signals) : 0;
  return {
    text: normalized.slice(0, 20000),
    pageCount: totalPages || 0,
    hasTextLayer,
    extractionMethod: "native_pdf_text",
    confidence,
  };
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
    { name: "AES-GCM", iv: fromBase64(stored.encryption_iv) },
    key,
    fromBase64(stored.encrypted_refresh_token),
  );
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: new TextDecoder().decode(decrypted), grant_type: "refresh_token",
    }),
  });
  const tokenBody = await tokenResponse.json();
  return tokenResponse.ok ? tokenBody.access_token as string : null;
}

function metadata(text: string) {
  const competencia = text.match(/(?:compet[eê]ncia|periodo)\s*[:\-]?\s*(\d{2}\/\d{4})/i)?.[1] || null;
  const due = text.match(/(?:vencimento|venc\.)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;
  const amount = text.match(/(?:valor(?:\s+total)?|total)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i)?.[1] || null;
  const kind = text.match(/\b(DAS|DARF|FGTS|INSS|ICMS|ISS|GPS|DAE)\b/i)?.[1]?.toUpperCase() || null;
  const isoDate = due ? due.split("/").reverse().join("-") : null;
  const numericAmount = amount ? Number(amount.replace(/\./g, "").replace(",", ".")) : null;
  return { tipo_guia: kind, competencia, vencimento: isoDate, valor: numericAmount };
}

async function exception(db: any, guideId: string, type: string, reason: string, action: string, data = {}) {
  await db.from("guias").update({ status: "revisao", provider_error: reason }).eq("id", guideId);
  await db.from("guia_excecoes").insert({
    guia_id: guideId,
    exception_type: type,
    severity: "warning",
    reason,
    action_recommended: action,
    detected_data_json: data,
  });
  await db.from("guia_eventos").insert({
    guia_id: guideId,
    event_type: "exception",
    level: "warning",
    message: reason,
    metadata_json: { type, ...data },
  });
}

async function drivePdf(db: any, fileId: string) {
  const token = await googleAccessToken(db);
  if (!token) return null;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: jsonHeaders });
  }
  if (!isInternal(req)) {
    return new Response(JSON.stringify({ error: "internal_authentication_required" }), {
      status: 401, headers: jsonHeaders,
    });
  }
  const { guia_id } = await req.json().catch(() => ({}));
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: guide } = await db.from("guias").select("*").eq("id", guia_id).single();
  if (!guide) return new Response(JSON.stringify({ error: "guide_not_found" }), { status: 404, headers: jsonHeaders });

  await db.from("guias").update({ status: "lendo", locked_at: new Date().toISOString() }).eq("id", guide.id);

  const bytes = await drivePdf(db, guide.drive_file_id);
  if (!bytes) {
    await exception(db, guide.id, "drive_download_failed",
      "Nao foi possivel baixar o PDF do Drive.",
      "Verifique a conexao Google Drive da pasta de origem.");
    return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
  }

  let extraction: NativeExtraction;
  try {
    extraction = await extractPdfText(bytes);
  } catch (err) {
    await exception(db, guide.id, "pdf_text_extraction_failed",
      "Falha ao ler o conteudo do PDF.",
      "Reenvie o arquivo ou revise manualmente.",
      { error: String(err).slice(0, 300) });
    return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
  }

  await db.from("guia_eventos").insert({
    guia_id: guide.id,
    event_type: "pdf_text_extracted",
    message: "Leitura nativa de PDF concluida.",
    metadata_json: {
      page_count: extraction.pageCount,
      has_text_layer: extraction.hasTextLayer,
      extraction_method: extraction.extractionMethod,
      text_length: extraction.text.length,
      confidence: extraction.confidence,
    },
  });

  const text = extraction.text;
  const filenameCandidates = cnpjCandidates(guide.file_name);
  const contentCandidates = cnpjCandidates(text);

  if (!extraction.hasTextLayer && filenameCandidates.length === 0) {
    await exception(db, guide.id, "pdf_without_text_layer",
      "O PDF parece ser escaneado ou imagem. Envie uma versao digital/textual ou revise manualmente.",
      "Substitua por um PDF digital (com camada de texto) ou processe manualmente.",
      { page_count: extraction.pageCount });
    return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
  }

  if (filenameCandidates.length === 1 && contentCandidates.length === 1 && filenameCandidates[0] !== contentCandidates[0]) {
    await exception(db, guide.id, "filename_content_conflict",
      "O CNPJ do nome do arquivo difere do conteudo do PDF.",
      "Corrija a guia ou o nome do arquivo.",
      { filenameCandidates, contentCandidates });
    return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
  }

  const candidates = [...new Set([...filenameCandidates, ...contentCandidates])];
  if (candidates.length !== 1) {
    await exception(db, guide.id, "cnpj_ambiguous",
      "Nao foi encontrado um unico CNPJ valido na guia.",
      "Confirme o arquivo e vincule a empresa manualmente.",
      { candidates });
    return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
  }

  // CNPJ from filename only + PDF text without fiscal signals → not enough trust
  if (contentCandidates.length === 0 && fiscalSignals(text) < 1) {
    await exception(db, guide.id, "insufficient_pdf_signals",
      "O PDF nao tem indicios suficientes (valor, vencimento, tipo) para envio automatico.",
      "Revise manualmente antes de enviar.",
      { text_length: text.length });
    return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
  }

  const { data: companies } = await db.from("empresas").select("*");
  const matched = companies?.find((entry: any) => normalizeCnpj(entry.cnpj) === candidates[0]);
  if (!matched) {
    await exception(db, guide.id, "company_not_found",
      "Nenhuma empresa corresponde ao CNPJ detectado.",
      "Cadastre a empresa antes de reenviar.",
      { cnpj: candidates[0] });
    return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
  }
  if (matched.status !== "ativa") {
    await exception(db, guide.id, "company_inactive",
      "A empresa identificada esta inativa.",
      "Ative a empresa antes de reenviar.",
      { cnpj: candidates[0], status: matched.status });
    return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
  }

  const extracted = metadata(text);
  const matchSource = filenameCandidates.length && contentCandidates.length
    ? "multiple"
    : filenameCandidates.length ? "filename" : "pdf_native";

  await db.from("guias").update({
    status: "identificada",
    match_source: matchSource,
    cnpj_detectado: candidates[0],
    empresa_id: matched.id,
    texto_extraido_preview: text.slice(0, 600),
    pagina_count: extraction.pageCount,
    extraction_method: extraction.extractionMethod,
    has_text_layer: extraction.hasTextLayer,
    processed_at: new Date().toISOString(),
    locked_at: null,
    ...extracted,
  }).eq("id", guide.id);

  await db.from("guia_eventos").insert({
    guia_id: guide.id,
    event_type: "company_matched",
    message: "Empresa identificada com correspondencia segura.",
    metadata_json: { match_source: matchSource, cnpj: candidates[0], confidence: extraction.confidence },
  });

  const dispatched = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/dispatch-guide`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Guide-Internal-Secret": Deno.env.get("GUIDE_INTERNAL_SECRET") || "",
    },
    body: JSON.stringify({ guia_id: guide.id }),
  });
  return new Response(await dispatched.text(), { status: dispatched.status, headers: jsonHeaders });
});
