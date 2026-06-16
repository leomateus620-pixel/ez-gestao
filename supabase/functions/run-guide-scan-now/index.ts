// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import {
  MIN_TEXT_LENGTH, MIN_CONFIDENCE_AUTO_DISPATCH,
  normalizeCnpj, classifyGuideType, extractMetadata,
  calculateConfidence, dedupHash, renderTemplate, buildTemplateData,
  slugifyEmpresa, competenciaToFolder,
} from "../_shared/guide-parser.ts";
import { DRIVE_GW, gwHeaders, downloadFile, moveFile, findOrCreateFolder } from "../_shared/guide-drive.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const GMAIL_GW = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

async function extractPdf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const normalized = (Array.isArray(text) ? text.join("\n") : (text as string))
    .replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return {
    text: normalized.slice(0, 30000),
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

async function logEvent(db: any, guideId: string, eventType: string, message: string, meta: any = {}, level: 'info'|'warning'|'error' = 'info') {
  await db.from("guia_eventos").insert({
    guia_id: guideId, event_type: eventType, level, message, metadata_json: meta,
  });
}

async function logException(db: any, guideId: string, type: string, reason: string, action: string, meta: any = {}, severity: 'warning'|'error' = 'warning') {
  await db.from("guia_excecoes").insert({
    guia_id: guideId, exception_type: type, severity,
    reason, action_recommended: action,
  });
  await logEvent(db, guideId, 'exception', reason, { type, ...meta }, severity === 'error' ? 'error' : 'warning');
}

async function moveToFolder(db: any, guide: any, driveKey: string, destFolderId: string, fromFolderId: string, pastaAtual: string) {
  try {
    await moveFile(driveKey, guide.drive_file_id, destFolderId, fromFolderId);
    await db.from("guias").update({ pasta_atual: pastaAtual }).eq("id", guide.id);
  } catch (err) {
    await logEvent(db, guide.id, 'drive_move_failed', String(err).slice(0, 300), {}, 'warning');
  }
}

async function loadTemplate(db: any, tipo: string, canal: 'email' | 'whatsapp') {
  const { data } = await db.from('guide_templates').select('*').eq('tipo_guia', tipo).eq('canal', canal).eq('ativo', true).maybeSingle();
  if (data) return data;
  const { data: fallback } = await db.from('guide_templates').select('*').eq('tipo_guia', 'outros').eq('canal', canal).maybeSingle();
  return fallback;
}

async function sendEmail(gmailKey: string, to: string, subject: string, body: string, pdfBytes: Uint8Array, filename: string) {
  const prof = await fetch(`${GMAIL_GW}/users/me/profile`, { headers: gwHeaders(gmailKey) });
  const from = prof.ok ? (await prof.json()).emailAddress : "me";
  const boundary = `lovable-${crypto.randomUUID()}`;
  const mime = [
    `From: ${from}`, `To: ${to}`, `Subject: ${subject}`,
    "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "", body,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`, "",
    base64(pdfBytes), `--${boundary}--`,
  ].join("\r\n");
  const send = await fetch(`${GMAIL_GW}/users/me/messages/send`, {
    method: "POST", headers: gwHeaders(gmailKey),
    body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(mime)) }),
  });
  if (!send.ok) throw new Error(`gmail_send_failed_${send.status}:${(await send.text()).slice(0,200)}`);
  return { messageId: (await send.json()).id as string, from };
}

async function processOneGuide(db: any, guide: any, driveKey: string, gmailKey: string, folders: any, testConfig: any) {
  const modo = testConfig.modo_global as 'teste' | 'producao';
  await db.from("guias").update({ status: "lendo", modo }).eq("id", guide.id);

  // 1. Download
  let bytes: Uint8Array;
  try { bytes = await downloadFile(driveKey, guide.drive_file_id); }
  catch (err) {
    await db.from("guias").update({ status: "erro", provider_error: String(err).slice(0,300), pasta_atual: 'erros' }).eq("id", guide.id);
    await moveToFolder(db, guide, driveKey, folders.errors_folder_id, folders.source_folder_id, 'erros');
    await logException(db, guide.id, 'drive_download_failed', 'Falha ao baixar PDF.', 'Verifique a conexão Drive.', {}, 'error');
    return { status: 'erro', reason: 'drive_download_failed' };
  }

  // 2. Extract
  let extraction;
  try { extraction = await extractPdf(bytes); }
  catch (err) {
    await db.from("guias").update({ status: "erro", provider_error: 'pdf_text_extraction_failed', pasta_atual: 'erros' }).eq("id", guide.id);
    await moveToFolder(db, guide, driveKey, folders.errors_folder_id, folders.source_folder_id, 'erros');
    await logException(db, guide.id, 'pdf_text_extraction_failed', 'Falha ao ler o PDF.', 'Reenvie ou processe manualmente.', { error: String(err).slice(0,200) }, 'error');
    return { status: 'erro', reason: 'pdf_text_extraction_failed' };
  }
  if (!extraction.hasTextLayer) {
    await db.from("guias").update({
      status: 'erro', provider_error: 'pdf_without_text_layer', pasta_atual: 'erros',
      pagina_count: extraction.pageCount, extraction_method: extraction.extractionMethod, has_text_layer: false,
    }).eq('id', guide.id);
    await moveToFolder(db, guide, driveKey, folders.errors_folder_id, folders.source_folder_id, 'erros');
    await logException(db, guide.id, 'pdf_without_text_layer', 'PDF escaneado/sem texto.', 'Envie versão digital.', {}, 'error');
    return { status: 'erro', reason: 'pdf_without_text_layer' };
  }

  // 3. Parse metadata + classify
  const metadata = extractMetadata(extraction.text);
  const classification = classifyGuideType(extraction.text);

  // 4. CNPJ → empresa
  const { data: companies } = await db.from("empresas").select("*");
  let matched: any = null;
  for (const c of metadata.cnpjCandidates) {
    const m = companies?.find((co: any) => normalizeCnpj(co.cnpj) === c && co.status === 'ativa');
    if (m) { matched = m; break; }
  }

  const conf = calculateConfidence(metadata, classification, !!matched);

  const baseUpdate: any = {
    cnpj_detectado: metadata.cnpjCandidates[0] || null,
    empresa_id: matched?.id || null,
    tipo_guia: classification.label,
    tipo_guia_normalized: classification.tipo,
    tipo_guia_confidence: classification.confidence,
    competencia: metadata.competencia,
    vencimento: metadata.vencimento,
    valor: metadata.valor,
    valor_extraido_raw: metadata.valorRaw,
    codigo_barras: metadata.codigoBarras,
    identificador_guia: metadata.identificador,
    razao_social_detectada: metadata.razaoSocial,
    texto_extraido_preview: extraction.text.slice(0, 600),
    pagina_count: extraction.pageCount,
    extraction_method: extraction.extractionMethod,
    has_text_layer: true,
    confidence_score: conf.overallConfidence,
    processed_at: new Date().toISOString(),
    match_source: metadata.cnpjCandidates.length ? 'cnpj_pdf' : 'filename',
  };

  // 5. Routing
  if (metadata.cnpjCandidates.length === 0) {
    await db.from('guias').update({ ...baseUpdate, status: 'nao_identificada', pasta_atual: 'nao_identificadas' }).eq('id', guide.id);
    await moveToFolder(db, guide, driveKey, folders.not_identified_folder_id, folders.source_folder_id, 'nao_identificadas');
    await logException(db, guide.id, 'cnpj_not_found', 'Nenhum CNPJ identificado no PDF.', 'Revise manualmente.');
    return { status: 'nao_identificada' };
  }

  // Dedup
  if (matched) {
    const hash = await dedupHash({
      cnpj: normalizeCnpj(matched.cnpj),
      tipo: classification.tipo,
      competencia: metadata.competencia,
      vencimento: metadata.vencimento,
      valor: metadata.valor,
    });
    baseUpdate.dedup_hash = hash;
    const { data: dup } = await db.from('guias').select('id, status')
      .eq('dedup_hash', hash).neq('id', guide.id).limit(1).maybeSingle();
    if (dup && !['duplicada', 'erro'].includes(dup.status)) {
      await db.from('guias').update({ ...baseUpdate, status: 'duplicada', pasta_atual: 'duplicadas' }).eq('id', guide.id);
      await moveToFolder(db, guide, driveKey, folders.duplicates_folder_id, folders.source_folder_id, 'duplicadas');
      await logException(db, guide.id, 'duplicate', `Duplicata de guia ${dup.id}.`, 'Revise se realmente é repetida.', { duplicate_of: dup.id });
      return { status: 'duplicada' };
    }
  }

  if (!matched || conf.overallConfidence < MIN_CONFIDENCE_AUTO_DISPATCH) {
    await db.from('guias').update({ ...baseUpdate, status: 'revisao', pasta_atual: 'revisao_manual' }).eq('id', guide.id);
    await moveToFolder(db, guide, driveKey, folders.review_folder_id, folders.source_folder_id, 'revisao_manual');
    await logException(db, guide.id, matched ? 'low_confidence' : 'company_not_found',
      matched ? `Confiança ${conf.overallConfidence} abaixo de ${MIN_CONFIDENCE_AUTO_DISPATCH}.` : 'CNPJ encontrado mas empresa não cadastrada.',
      'Revise dados e aprove manualmente.', { confidence: conf, cnpj_candidates: metadata.cnpjCandidates });
    return { status: 'revisao', confidence: conf.overallConfidence };
  }

  // Tudo OK
  await db.from('guias').update({ ...baseUpdate, status: 'pronta_envio' }).eq('id', guide.id);
  await logEvent(db, guide.id, 'identified', 'Guia identificada com sucesso.', { confidence: conf, tipo: classification.tipo, empresa: matched.razao_social });

  // 6. Validate dispatch preconditions
  const canal = matched.canal_preferido as 'email' | 'whatsapp' | 'ambos' | null;
  if (!matched.comunicacao_ativa || !canal) {
    await db.from('guias').update({ status: 'revisao', pasta_atual: 'revisao_manual' }).eq('id', guide.id);
    await moveToFolder(db, guide, driveKey, folders.review_folder_id, folders.source_folder_id, 'revisao_manual');
    await logException(db, guide.id, 'invalid_channel', 'Empresa sem canal de envio configurado.', 'Configure canal_preferido e comunicacao_ativa.');
    return { status: 'revisao', reason: 'invalid_channel' };
  }

  // 7. Dispatch
  const canais: ('email'|'whatsapp')[] = canal === 'ambos' ? ['email', 'whatsapp'] : [canal];
  const tplData = buildTemplateData({
    empresa: matched.razao_social, cnpj: matched.cnpj, tipoGuia: classification.label,
    competencia: metadata.competencia, vencimento: metadata.vencimento, valor: metadata.valor,
  });
  const results: any[] = [];

  for (const ch of canais) {
    const tpl = await loadTemplate(db, classification.tipo, ch);
    if (!tpl) { results.push({ canal: ch, skipped: 'no_template' }); continue; }
    const subject = tpl.assunto ? renderTemplate(tpl.assunto, tplData) : null;
    const body = renderTemplate(tpl.corpo, tplData);
    const isTest = modo === 'teste';
    const destinatario = isTest
      ? (ch === 'email' ? (testConfig.email_teste || matched.email_principal) : (testConfig.whatsapp_teste || matched.whatsapp_principal))
      : (ch === 'email' ? matched.email_principal : matched.whatsapp_principal);
    const finalBody = isTest ? `[TESTE - destinatário real: ${ch === 'email' ? matched.email_principal : matched.whatsapp_principal}]\n\n${body}` : body;
    const finalSubject = isTest && subject ? `[TESTE] ${subject}` : subject;
    const idemKey = `${guide.id}:${ch}:${modo}`;

    const { data: prior } = await db.from('guia_envios').select('id,status').eq('idempotency_key', idemKey).maybeSingle();
    if (prior && ['aceito','entregue'].includes(prior.status)) {
      results.push({ canal: ch, skipped: 'already_sent' }); continue;
    }

    if (!destinatario) {
      await logException(db, guide.id, 'missing_destination', `Destinatário ${ch} não configurado.`, 'Preencha contato no cadastro da empresa.');
      results.push({ canal: ch, error: 'no_destinatario' }); continue;
    }

    try {
      if (ch === 'email') {
        const { messageId, from } = await sendEmail(gmailKey, destinatario, finalSubject || `Guia ${classification.label}`, finalBody, bytes, guide.file_name);
        await db.from('guia_envios').insert({
          guia_id: guide.id, empresa_id: matched.id, canal: 'email',
          destinatario, assunto: finalSubject, mensagem_preview: finalBody.slice(0, 400),
          provider_message_id: messageId, idempotency_key: idemKey,
          status: isTest ? 'simulado' : 'aceito',
          sanitized_payload: { mode: modo, message_id: messageId, sender: from },
        });
        results.push({ canal: 'email', status: isTest ? 'simulado' : 'aceito', messageId });
      } else {
        // WhatsApp via Twilio: invoca send-whatsapp-message existente
        const wpRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-whatsapp-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({ to: destinatario, body: finalBody, guia_id: guide.id }),
        });
        const ok = wpRes.ok;
        await db.from('guia_envios').insert({
          guia_id: guide.id, empresa_id: matched.id, canal: 'whatsapp',
          destinatario, mensagem_preview: finalBody.slice(0, 400),
          idempotency_key: idemKey,
          status: ok ? (isTest ? 'simulado' : 'aceito') : 'falhou',
          sanitized_payload: { mode: modo, ok },
        });
        results.push({ canal: 'whatsapp', status: ok ? 'aceito' : 'falhou' });
      }
    } catch (err) {
      await db.from('guia_envios').insert({
        guia_id: guide.id, empresa_id: matched.id, canal: ch,
        destinatario, mensagem_preview: finalBody.slice(0, 400),
        idempotency_key: idemKey, status: 'falhou',
        sanitized_payload: { mode: modo, error: String(err).slice(0, 300) },
      });
      await logException(db, guide.id, 'dispatch_failed', `Falha no envio via ${ch}.`, 'Verifique conector e tente reenviar.', { error: String(err).slice(0,200) }, 'error');
      results.push({ canal: ch, error: String(err).slice(0,200) });
    }
  }

  const allOk = results.every((r) => r.status === 'aceito' || r.status === 'simulado');
  if (allOk && modo === 'producao') {
    // Move para Enviadas/[Empresa]/[YYYY-MM]/
    const empresaFolderName = slugifyEmpresa(matched.razao_social, matched.cnpj);
    const compFolderName = competenciaToFolder(metadata.competencia, metadata.vencimento);
    try {
      const empresaFolderId = await findOrCreateFolder(driveKey, empresaFolderName, folders.sent_folder_id);
      const compFolderId = await findOrCreateFolder(driveKey, compFolderName, empresaFolderId);
      await moveFile(driveKey, guide.drive_file_id, compFolderId, folders.source_folder_id);
      await db.from('guias').update({ status: 'enviada', pasta_atual: 'enviadas', sent_at: new Date().toISOString() }).eq('id', guide.id);
    } catch (err) {
      await logException(db, guide.id, 'drive_move_failed', 'Envio OK mas falha ao mover PDF.', 'Mova manualmente para Enviadas.', { error: String(err).slice(0,200) }, 'warning');
      await db.from('guias').update({ status: 'enviada', sent_at: new Date().toISOString() }).eq('id', guide.id);
    }
  } else if (allOk && modo === 'teste') {
    await db.from('guias').update({ status: 'enviada', sent_at: new Date().toISOString() }).eq('id', guide.id);
    // Não move em modo teste
  } else {
    await db.from('guias').update({ status: 'erro' }).eq('id', guide.id);
  }

  return { status: allOk ? 'enviada' : 'erro', modo, results, confidence: conf.overallConfidence };
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

  const driveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!driveKey || !gmailKey || !Deno.env.get("LOVABLE_API_KEY")) {
    return new Response(JSON.stringify({ error: "connectors_missing" }), { status: 409, headers: cors });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: drive } = await db.from("integracoes_guias").select("*").eq("provider", "google_drive").single();
  if (!drive?.source_folder_id || drive.status !== "ativo") {
    return new Response(JSON.stringify({ error: "drive_integration_inactive", message: "Execute bootstrap-test-folder para configurar pastas." }), { status: 409, headers: cors });
  }

  const { data: testConfig } = await db.from('guide_test_config').select('*').eq('id', 1).maybeSingle();
  const config = testConfig || { modo_global: 'teste', email_teste: null, whatsapp_teste: null };

  // Optional reprocess targeting
  let reprocessIds: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.guide_ids)) reprocessIds = body.guide_ids.filter((x: unknown) => typeof x === 'string');
  } catch { /* no body is fine */ }

  // Criar batch
  const { data: batch } = await db.from('guide_batch_runs').insert({ modo: config.modo_global }).select().single();

  let files: any[] = [];
  if (reprocessIds.length > 0) {
    const { data: targets } = await db.from('guias').select('drive_file_id, file_name, mime_type, sha256').in('id', reprocessIds);
    files = (targets || []).map((t: any) => ({ id: t.drive_file_id, name: t.file_name, mimeType: t.mime_type, md5Checksum: t.sha256 }));
  } else {
  // List files
  const params = new URLSearchParams({
    q: `'${drive.source_folder_id}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,md5Checksum,modifiedTime)",
    pageSize: "100",
  });
  const list = await fetch(`${DRIVE_GW}/files?${params}`, { headers: gwHeaders(driveKey) });
  if (!list.ok) {
    return new Response(JSON.stringify({ error: "drive_list_failed", status: list.status }), { status: 502, headers: cors });
  }
    files = ((await list.json()).files || []) as any[];
  }

  const results: any[] = [];
  const counters = { total: 0, enviadas: 0, revisao: 0, erros: 0, duplicadas: 0, nao_identificadas: 0, identificadas: 0 };

  for (const file of files) {
    counters.total++;
    const { data: existing } = await db.from("guias").select("*").eq("drive_file_id", file.id).maybeSingle();
    let guide = existing;
    if (!guide) {
      const { data: inserted } = await db.from("guias").insert({
        drive_file_id: file.id, file_name: file.name, mime_type: file.mimeType,
        sha256: file.md5Checksum || null, source_folder_id: drive.source_folder_id,
        sent_folder_id: drive.sent_folder_id, modo: config.modo_global,
      }).select().single();
      guide = inserted;
    }
    if (!guide) continue;
    if (reprocessIds.length === 0 && ['enviada','enviando'].includes(guide.status)) {
      results.push({ file: file.name, skipped: true, status: guide.status }); continue;
    }
    if (file.mimeType !== 'application/pdf') {
      await db.from('guias').update({ status: 'erro', provider_error: 'Formato não suportado.', pasta_atual: 'erros' }).eq('id', guide.id);
      await logException(db, guide.id, 'unsupported_file', 'Somente PDFs são processados.', 'Envie em PDF.', {}, 'error');
      counters.erros++;
      results.push({ file: file.name, skipped: true, reason: 'not_pdf' }); continue;
    }
    try {
      const r = await processOneGuide(db, guide, driveKey, gmailKey, drive, config);
      if (r.status === 'enviada') counters.enviadas++;
      else if (r.status === 'revisao') counters.revisao++;
      else if (r.status === 'erro') counters.erros++;
      else if (r.status === 'duplicada') counters.duplicadas++;
      else if (r.status === 'nao_identificada') counters.nao_identificadas++;
      if (['enviada','revisao','duplicada'].includes(r.status)) counters.identificadas++;
      results.push({ file: file.name, guia_id: guide.id, ...r });
    } catch (err) {
      counters.erros++;
      results.push({ file: file.name, error: String(err).slice(0,500) });
    }
  }

  if (batch) {
    await db.from('guide_batch_runs').update({
      finished_at: new Date().toISOString(), ...counters,
    }).eq('id', batch.id);
  }

  await db.from('integracoes_guias').update({
    last_check_at: new Date().toISOString(), last_error: null,
  }).eq('provider', 'google_drive');

  return new Response(JSON.stringify({
    modo: config.modo_global, scanned: files.length, batch_id: batch?.id, counters, results,
  }), { headers: cors });
});