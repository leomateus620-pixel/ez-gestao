// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any, no-useless-escape */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const jsonHeaders = { "Content-Type": "application/json" };

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

function pdfText(bytes: Uint8Array) {
  const decoded = new TextDecoder("latin1").decode(bytes);
  const fragments = [...decoded.matchAll(/\(([^()]{3,})\)\s*Tj/g)].map((match) => match[1]);
  return fragments.join(" ").replace(/\\[()]/g, "").slice(0, 20000);
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
    metadata_json: { type },
  });
}

async function queueVisionOcr(db: any, guide: any, bytes: Uint8Array) {
  const token = Deno.env.get("GOOGLE_CLOUD_ACCESS_TOKEN");
  const bucket = Deno.env.get("GCS_OCR_BUCKET");
  if (!token || !bucket) return null;
  const objectName = `pending/${guide.id}.pdf`;
  const upload = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/pdf" }, body: bytes },
  );
  if (!upload.ok) return null;
  const outputPrefix = `gs://${bucket}/results/${guide.id}/`;
  const vision = await fetch("https://vision.googleapis.com/v1/files:asyncBatchAnnotate", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        inputConfig: { gcsSource: { uri: `gs://${bucket}/${objectName}` }, mimeType: "application/pdf" },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        outputConfig: { gcsDestination: { uri: outputPrefix }, batchSize: 5 },
      }],
    }),
  });
  if (!vision.ok) return null;
  const operation = await vision.json();
  await db.from("guias").update({
    status: "ocr",
    ocr_operation_name: operation.name,
    ocr_output_uri: outputPrefix,
    locked_at: null,
  }).eq("id", guide.id);
  await db.from("guia_eventos").insert({
    guia_id: guide.id,
    event_type: "ocr_requested",
    message: "OCR assincrono solicitado ao Google Cloud Vision.",
  });
  return operation.name;
}

async function readVisionResult(guide: any) {
  const token = Deno.env.get("GOOGLE_CLOUD_ACCESS_TOKEN");
  const bucket = Deno.env.get("GCS_OCR_BUCKET");
  if (!token || !bucket || !guide.ocr_operation_name) return null;
  const operation = await fetch(`https://vision.googleapis.com/v1/${guide.ocr_operation_name}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((response) => response.json());
  if (!operation.done) return { pending: true };
  const prefix = `results/${guide.id}/`;
  const listed = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?prefix=${encodeURIComponent(prefix)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  ).then((response) => response.json());
  const resultFile = listed.items?.find((item: any) => item.name.endsWith(".json"));
  if (!resultFile) return null;
  const result = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(resultFile.name)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  ).then((response) => response.json());
  const annotations = result.responses || [];
  const text = annotations.map((entry: any) => entry.fullTextAnnotation?.text || "").join("\n");
  const confidences = annotations.flatMap((entry: any) =>
    (entry.fullTextAnnotation?.pages || []).flatMap((page: any) =>
      (page.blocks || []).map((block: any) => block.confidence).filter((value: any) => typeof value === "number")
    )
  );
  const confidence = confidences.length
    ? confidences.reduce((sum: number, value: number) => sum + value, 0) / confidences.length
    : 0;
  return { pending: false, text, confidence };
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

  let text = "";
  let confidence: number | null = null;
  let source = "pdf_text";
  if (guide.status === "ocr" && guide.ocr_operation_name) {
    const ocr = await readVisionResult(guide);
    if (ocr?.pending) return new Response(JSON.stringify({ status: "ocr_pending" }), { status: 202, headers: jsonHeaders });
    if (!ocr?.text) {
      await exception(db, guide.id, "ocr_failed", "OCR finalizado sem texto utilizavel.", "Revise a guia manualmente.");
      return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
    }
    text = ocr.text;
    confidence = ocr.confidence;
    source = "ocr";
  } else {
    await db.from("guias").update({ status: "lendo", locked_at: new Date().toISOString() }).eq("id", guide.id);
    const bytes = await drivePdf(db, guide.drive_file_id);
    if (!bytes) {
      await exception(db, guide.id, "drive_download_failed", "Nao foi possivel baixar o PDF do Drive.", "Verifique a conexao Google OAuth.");
      return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
    }
    text = pdfText(bytes);
    const nameCandidates = cnpjCandidates(guide.file_name);
    if (text.length < 20 && nameCandidates.length === 0) {
      const operation = await queueVisionOcr(db, guide, bytes);
      if (!operation) {
        await exception(db, guide.id, "ocr_unavailable", "A guia requer OCR, mas o Vision nao esta ativo.", "Ative Google Cloud Vision e o bucket temporario.");
      }
      return new Response(JSON.stringify({ status: operation ? "ocr" : "revisao" }), { headers: jsonHeaders });
    }
  }

  const filenameCandidates = cnpjCandidates(guide.file_name);
  const contentCandidates = cnpjCandidates(text);
  const candidates = [...new Set([...filenameCandidates, ...contentCandidates])];
  if (filenameCandidates.length === 1 && contentCandidates.length === 1 && filenameCandidates[0] !== contentCandidates[0]) {
    await exception(db, guide.id, "source_conflict", "O CNPJ do nome do arquivo difere do conteudo.", "Corrija a guia ou o nome do arquivo.", { filenameCandidates, contentCandidates });
    return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
  }
  if (candidates.length !== 1) {
    await exception(db, guide.id, "cnpj_ambiguous", "Nao foi encontrado um unico CNPJ valido na guia.", "Confirme o arquivo e vincule a empresa manualmente.", { candidates });
    return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
  }
  if (source === "ocr" && (confidence === null || confidence < 0.9)) {
    await exception(db, guide.id, "low_ocr_confidence", "A identificacao via OCR ficou abaixo da confianca minima de 0.90.", "Revise a leitura antes do envio.", { confidence });
    return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
  }
  const { data: companies } = await db.from("empresas").select("*").eq("status", "ativa");
  const company = companies?.find((entry: any) => normalizeCnpj(entry.cnpj) === candidates[0]);
  if (!company) {
    await exception(db, guide.id, "company_not_found", "Nenhuma empresa ativa corresponde ao CNPJ detectado.", "Cadastre ou ative a empresa antes de reenviar.", { cnpj: candidates[0] });
    return new Response(JSON.stringify({ status: "revisao" }), { headers: jsonHeaders });
  }
  const extracted = metadata(text);
  const matchSource = filenameCandidates.length && contentCandidates.length ? "multiple" : source === "ocr" ? "ocr" : filenameCandidates.length ? "filename" : "pdf_text";
  await db.from("guias").update({
    status: "identificada",
    match_source: matchSource,
    cnpj_detectado: candidates[0],
    empresa_id: company.id,
    texto_extraido_preview: text.slice(0, 600),
    ocr_confidence: confidence,
    processed_at: new Date().toISOString(),
    locked_at: null,
    ...extracted,
  }).eq("id", guide.id);
  await db.from("guia_eventos").insert({
    guia_id: guide.id,
    event_type: "company_matched",
    message: "Empresa identificada com correspondencia segura.",
    metadata_json: { match_source: matchSource, cnpj: candidates[0] },
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
