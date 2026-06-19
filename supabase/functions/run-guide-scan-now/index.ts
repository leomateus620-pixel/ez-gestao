// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any, no-control-regex */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import {
  MAX_EMAIL_ATTACHMENT_BYTES,
  MIN_CONFIDENCE_AUTO_DISPATCH,
  MIN_TEXT_LENGTH,
  analyzeGuideText,
  buildGuideDriveFileName,
  buildTemplateData,
  calculateConfidence,
  collectValidationIssues,
  competenciaToFolder,
  dedupHash,
  dedupHashFgts,
  formatCnpj,
  guideReviewLevel,
  matchCompanyForFGTSGuide,
  normalizeCnpj,
  normalizePhoneE164,
  renderTemplate,
  slugifyEmpresa,
  validateEmailAddress,
  validateTemplateRender,
  type ClassifyResult,
  type FieldEvidence,
  type FgtsMatchResult,
  type GuideMetadata,
  type TipoGuia,
} from "../_shared/guide-parser.ts";
import { DRIVE_GW, downloadFile, findOrCreateFolder, gwHeaders, moveFile, renameFile } from "../_shared/guide-drive.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const GMAIL_GW = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

type Mode = "teste" | "producao";
type OperationLevel =
  | "automacao_desligada"
  | "somente_classificacao"
  | "leitura_revisao"
  | "envio_automatico_seguro"
  | "producao_total";

type ProcessOptions = {
  batchId: string | null;
  forceDispatch: boolean;
  manualApproval: boolean;
};

type RouteDecision = {
  status: "nao_identificada" | "duplicada" | "revisao_manual" | "quarentena" | "pronta_envio" | "erro";
  folder?: "not_identified" | "duplicates" | "review" | "errors";
  exceptionType?: string;
  reason: string;
  action: string;
  severity?: "warning" | "error";
  reviewLevel?: "quick" | "full" | "none";
  duplicateLevel?: "exact" | "operational" | "probable";
  readyButAwaitingApproval?: boolean;
};

type DispatchPlan = {
  channel: "email" | "whatsapp";
  destination: string | null;
  template: any | null;
  subject: string | null;
  body: string;
  errors: string[];
};

async function extractPdf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const normalized = (Array.isArray(text) ? text.join("\n") : (text as string))
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function field<T>(
  value: T,
  confidence: number,
  status: "valid" | "dubious" | "missing" | "invalid",
  source: string,
  method: string,
  justification: string,
): FieldEvidence<T> {
  return { value, confidence, status, source, method, justification };
}

async function logEvent(
  db: any,
  guideId: string,
  eventType: string,
  message: string,
  meta: any = {},
  level: "info" | "warning" | "error" = "info",
  batchId?: string | null,
) {
  await db.from("guia_eventos").insert({
    guia_id: guideId,
    event_type: eventType,
    level,
    message,
    metadata_json: { batch_id: batchId ?? null, ...meta },
  });
}

async function logException(
  db: any,
  guideId: string,
  type: string,
  reason: string,
  action: string,
  meta: any = {},
  severity: "warning" | "error" = "warning",
  batchId?: string | null,
) {
  // guia_excecoes só tem (id, guia_id, exception_type, severity, status, reason,
  // action_recommended, created_at, resolved_at). Metadados detalhados vão
  // para guia_eventos.metadata_json.
  await db.from("guia_excecoes").insert({
    guia_id: guideId,
    exception_type: type,
    severity,
    reason,
    action_recommended: action,
  });
  await logEvent(db, guideId, "routed_to_review", reason, { type, ...meta }, severity, batchId);
}

function folderIdFor(folders: any, key?: RouteDecision["folder"]) {
  if (key === "not_identified") return { id: folders.not_identified_folder_id, pasta: "nao_identificadas" };
  if (key === "duplicates") return { id: folders.duplicates_folder_id, pasta: "duplicadas" };
  if (key === "review") return { id: folders.review_folder_id, pasta: "revisao_manual" };
  if (key === "errors") return { id: folders.errors_folder_id, pasta: "erros" };
  return { id: null, pasta: "a_enviar" };
}

async function moveToFolder(
  db: any,
  guide: any,
  driveKey: string,
  folders: any,
  folder: RouteDecision["folder"],
  batchId?: string | null,
) {
  const target = folderIdFor(folders, folder);
  if (!target.id) return;
  try {
    await moveFile(driveKey, guide.drive_file_id, target.id, folders.source_folder_id);
    await db.from("guias").update({ pasta_atual: target.pasta }).eq("id", guide.id);
    await logEvent(db, guide.id, "drive_move_finished", `Arquivo movido para ${target.pasta}.`, { pasta_atual: target.pasta }, "info", batchId);
  } catch (err) {
    await logEvent(db, guide.id, "drive_move_failed", String(err).slice(0, 300), { folder }, "warning", batchId);
  }
}

async function loadTemplate(db: any, tipo: TipoGuia, canal: "email" | "whatsapp") {
  const { data } = await db.from("guide_templates")
    .select("*")
    .eq("tipo_guia", tipo)
    .eq("canal", canal)
    .eq("ativo", true)
    .maybeSingle();
  if (data) return data;
  const { data: fallback } = await db.from("guide_templates")
    .select("*")
    .eq("tipo_guia", "outros")
    .eq("canal", canal)
    .eq("ativo", true)
    .maybeSingle();
  return fallback;
}

async function sendEmail(gmailKey: string, to: string, subject: string, body: string, pdfBytes: Uint8Array, filename: string) {
  if (pdfBytes.byteLength > MAX_EMAIL_ATTACHMENT_BYTES) throw new Error("email_attachment_too_large");
  const prof = await fetch(`${GMAIL_GW}/users/me/profile`, { headers: gwHeaders(gmailKey) });
  const from = prof.ok ? (await prof.json()).emailAddress : "me";
  const boundary = `lovable-${crypto.randomUUID()}`;
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    base64(pdfBytes),
    `--${boundary}--`,
  ].join("\r\n");
  const send = await fetch(`${GMAIL_GW}/users/me/messages/send`, {
    method: "POST",
    headers: gwHeaders(gmailKey),
    body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(mime)) }),
  });
  if (!send.ok) throw new Error(`gmail_send_failed_${send.status}:${(await send.text()).slice(0, 200)}`);
  return { messageId: (await send.json()).id as string, from };
}

function companyName(row: any) {
  return row?.razao_social || row?.nome_fantasia || row?.nome || "Empresa";
}

function normalizeName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function companyNameCompatible(detected: string | null, company: any) {
  if (!detected || !company) return true;
  const left = normalizeName(detected);
  const right = normalizeName(companyName(company));
  if (!left || !right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 3));
  const leftTokens = left.split(" ").filter((token) => token.length > 3);
  if (rightTokens.size === 0 || leftTokens.length === 0) return true;
  const overlap = leftTokens.filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(1, Math.min(leftTokens.length, rightTokens.size)) >= 0.45;
}

function channelsFor(canal: string | null): ("email" | "whatsapp")[] {
  if (canal === "ambos") return ["whatsapp", "email"];
  if (canal === "email" || canal === "whatsapp") return [canal];
  return [];
}

function channelDestination(company: any, channel: "email" | "whatsapp", mode: Mode, config: any) {
  if (mode === "teste") {
    return channel === "email" ? (config.email_teste || null) : (config.whatsapp_teste || null);
  }
  return channel === "email" ? (company?.email_principal || null) : (company?.whatsapp_principal || null);
}

async function buildDispatchPlans(
  db: any,
  company: any,
  classification: ClassifyResult,
  metadata: GuideMetadata,
  mode: Mode,
  config: any,
) {
  const canal = company?.canal_preferido as "email" | "whatsapp" | "ambos" | null;
  const plans: DispatchPlan[] = [];
  for (const channel of channelsFor(canal)) {
    // Para WhatsApp, [LINK_GUIA] só é gerado no dispatch (link assinado
    // temporário). Usamos um marcador estável para passar pela validação
    // de placeholders; o dispatch substitui pelo URL real antes de enviar.
    const templateData = buildTemplateData({
      empresa: companyName(company),
      cnpj: company?.cnpj || metadata.primaryCnpj || "",
      tipoGuia: classification.label,
      competencia: metadata.competencia,
      vencimento: metadata.vencimento,
      valor: metadata.valor,
      linkGuia: channel === 'whatsapp' ? '__LINK_GUIA_PENDING__' : '',
    });
    const template = await loadTemplate(db, classification.tipo, channel);
    const rawSubject = template?.assunto ? renderTemplate(template.assunto, templateData) : null;
    const rawBody = template?.corpo ? renderTemplate(template.corpo, templateData) : "";
    const subject = mode === "teste" && rawSubject ? `[TESTE] ${rawSubject}` : rawSubject;
    const body = mode === "teste"
      ? `[TESTE - destinatario real bloqueado]\n\n${rawBody}`
      : rawBody;
    const destination = channelDestination(company, channel, mode, config);
    const errors = validateTemplateRender({ template, canal: channel, tipo: classification.tipo, renderedSubject: subject, renderedBody: body });
    if (!destination) errors.push("destination_missing");
    if (channel === "email" && destination && !validateEmailAddress(destination)) errors.push("invalid_email");
    if (channel === "whatsapp" && destination && !normalizePhoneE164(destination)) errors.push("invalid_whatsapp_number");
    plans.push({ channel, destination, template, subject, body, errors });
  }
  return plans;
}

function integrationByProvider(integrations: any[], provider: string) {
  return integrations.find((entry) => entry.provider === provider);
}

function dispatchConnectorErrors(plans: DispatchPlan[], integrations: any[], gmailKey: string) {
  const errors: string[] = [];
  for (const plan of plans) {
    if (plan.channel === "email") {
      const gmail = integrationByProvider(integrations, "gmail");
      if (!gmailKey || gmail?.status !== "ativo") errors.push("gmail_inactive");
    }
    if (plan.channel === "whatsapp") {
      const whatsapp = integrationByProvider(integrations, "whatsapp")
        || integrationByProvider(integrations, "twilio_whatsapp");
      const tokenOk = Boolean(Deno.env.get("WHATSAPP_ACCESS_TOKEN") && Deno.env.get("WHATSAPP_PHONE_NUMBER_ID"));
      if (!tokenOk && whatsapp?.status !== "ativo") errors.push("whatsapp_inactive");
    }
  }
  return [...new Set(errors)];
}

async function detectDuplicates(db: any, guide: any, metadata: GuideMetadata, classification: ClassifyResult, matched: any) {
  // Quando o operador clica em "Processar agora" (force_dispatch), a guia é
  // reprocessada propositalmente — não a tratamos como duplicada interna.
  if (guide.sha256 && !(guide as any).__forceDispatch) {
    const { data: exact } = await db.from("guias")
      .select("id,status,file_name")
      .eq("sha256", guide.sha256)
      .neq("id", guide.id)
      .not("status", "in", '("duplicada","erro")')
      .limit(1)
      .maybeSingle();
    if (exact) return { level: "exact" as const, duplicate: exact, hash: null };
  }

  if (!matched || !metadata.competencia || !classification.tipo || metadata.valor == null) {
    return { level: null, duplicate: null, hash: null };
  }

  const operationalHash = await dedupHash({
    cnpj: matched.cnpj,
    tipo: classification.tipo,
    competencia: metadata.competencia,
    vencimento: metadata.vencimento,
    valor: metadata.valor,
  });
  const operationalQuery = db.from("guias")
    .select("id,status,file_name")
    .eq("dedup_hash", operationalHash)
    .neq("id", guide.id)
    .not("status", "in", '("duplicada","erro")')
    .limit(1)
    .maybeSingle();
  const { data: operational } = (guide as any).__forceDispatch ? { data: null } : await operationalQuery;
  if (operational) return { level: "operational" as const, duplicate: operational, hash: operationalHash };

  const { data: probableRows } = await db.from("guias")
    .select("id,status,file_name,valor,vencimento")
    .eq("cnpj_detectado", normalizeCnpj(matched.cnpj))
    .eq("tipo_guia_normalized", classification.tipo)
    .eq("competencia", metadata.competencia)
    .neq("id", guide.id)
    .not("status", "in", '("duplicada","erro")')
    .limit(5);
  const probable = (probableRows || []).find((row: any) =>
    row.valor == null || metadata.valor == null || Math.abs(Number(row.valor) - metadata.valor) <= Math.max(5, metadata.valor * 0.05)
  );
  if (probable) return { level: "probable" as const, duplicate: probable, hash: operationalHash };

  if ((guide as any).__forceDispatch) return { level: null, duplicate: null, hash: operationalHash };
  return { level: null, duplicate: null, hash: operationalHash };
}

function routeGuide(args: {
  metadata: GuideMetadata;
  classification: ClassifyResult;
  confidence: number;
  issues: any[];
  matched: any | null;
  inactiveCompany: any | null;
  duplicate: { level: "exact" | "operational" | "probable" | null; duplicate: any | null };
  dispatchPlans: DispatchPlan[];
  connectorErrors: string[];
  mode: Mode;
  config: any;
  manualApproval: boolean;
  forceDispatch: boolean;
}) : RouteDecision {
  const { metadata, classification, confidence, matched, inactiveCompany, duplicate, dispatchPlans, connectorErrors, mode, config } = args;

  if (duplicate.level === "exact") {
    return {
      status: "duplicada",
      folder: "duplicates",
      exceptionType: "duplicate_exact",
      duplicateLevel: "exact",
      reason: `Duplicidade exata do arquivo ${duplicate.duplicate?.id}.`,
      action: "Bloquear envio e revisar historico.",
      severity: "warning",
      reviewLevel: "full",
    };
  }
  // FGTS Digital fallback: when there is no full CNPJ but the employer legal name
  // already produced a unique match to an active company, do not block on cnpj.
  const fgtsEmployerMatched = classification.tipo === "fgts"
    && metadata.fields.cnpj.status !== "valid"
    && !!matched
    && !!metadata.fields.razao_social?.value;
  if (metadata.fields.cnpj.status === "invalid" && !fgtsEmployerMatched) {
    return { status: "nao_identificada", folder: "not_identified", exceptionType: "cnpj_invalid", reason: "CNPJ invalido no PDF.", action: "Corrigir documento ou revisar manualmente.", severity: "error", reviewLevel: "full" };
  }
  if (metadata.fields.cnpj.status === "missing" && !fgtsEmployerMatched) {
    return { status: "nao_identificada", folder: "not_identified", exceptionType: "cnpj_missing", reason: "CNPJ ausente no PDF.", action: "Revisar manualmente.", severity: "warning", reviewLevel: "full" };
  }
  if (metadata.cnpjCandidates.length > 1) {
    return { status: "revisao_manual", folder: "review", exceptionType: "multiple_cnpj", reason: "Multiplos CNPJs validos encontrados no PDF.", action: "Escolher empresa/contribuinte manualmente.", severity: "warning", reviewLevel: "full" };
  }
  if (inactiveCompany) {
    return { status: "revisao_manual", folder: "review", exceptionType: "company_inactive", reason: "CNPJ pertence a empresa inativa.", action: "Ativar empresa ou bloquear envio.", severity: "warning", reviewLevel: "full" };
  }
  if (!matched) {
    return { status: "revisao_manual", folder: "review", exceptionType: "company_not_found", reason: "CNPJ valido, mas empresa nao cadastrada.", action: "Vincular empresa manualmente.", severity: "warning", reviewLevel: "full" };
  }
  if (duplicate.level === "operational") {
    return {
      status: "duplicada",
      folder: "duplicates",
      exceptionType: "duplicate_operational",
      duplicateLevel: "operational",
      reason: `Duplicidade operacional da guia ${duplicate.duplicate?.id}.`,
      action: "Bloquear reenvio automatico.",
      severity: "warning",
      reviewLevel: "full",
    };
  }
  if (duplicate.level === "probable") {
    return {
      status: "revisao_manual",
      folder: "review",
      exceptionType: "duplicate_probable",
      duplicateLevel: "probable",
      reason: `Possivel guia substituida, retificada ou reenviada (${duplicate.duplicate?.id}).`,
      action: "Comparar com guia anterior antes de qualquer envio.",
      severity: "warning",
      reviewLevel: "full",
    };
  }

  const criticalFields = Object.entries(metadata.fields)
    .filter(([name]) => !(fgtsEmployerMatched && name === 'cnpj'))
    .map(([, evidence]) => evidence);
  const missingOrInvalid = criticalFields.find((entry) => entry.status === "missing" || entry.status === "invalid");
  if (missingOrInvalid) {
    return { status: "revisao_manual", folder: "review", exceptionType: `${missingOrInvalid.source}_blocked`, reason: missingOrInvalid.justification, action: "Preencher e confirmar campo manualmente.", severity: "warning", reviewLevel: "full" };
  }
  const dubious = criticalFields.find((entry) => entry.status === "dubious");
  if (dubious) {
    return { status: "revisao_manual", folder: "review", exceptionType: `${dubious.source}_dubious`, reason: dubious.justification, action: "Confirmar campo duvidoso manualmente.", severity: "warning", reviewLevel: guideReviewLevel(confidence) === "quick" ? "quick" : "full" };
  }
  const relevantIssue = args.issues.find((issue) => issue.severity === "error" || ["competencia_due_inconsistent", "barcode_amount_mismatch", "company_name_mismatch"].includes(issue.code));
  if (relevantIssue) {
    return { status: "quarentena", folder: "review", exceptionType: relevantIssue.code, reason: relevantIssue.message, action: "Quarentena tecnica: validar inconsistencia antes de liberar.", severity: relevantIssue.severity === "error" ? "error" : "warning", reviewLevel: "full" };
  }
  // Score de confianca nao bloqueia mais: identificacao da empresa (CNPJ ou razao social)
  // ja foi validada acima; o envio segue pelo canal preferido da empresa.
  if (!matched.comunicacao_ativa || channelsFor(matched.canal_preferido).length === 0) {
    return { status: "revisao_manual", folder: "review", exceptionType: "invalid_channel", reason: "Empresa sem canal de envio ativo.", action: "Configurar canal e comunicacao ativa.", severity: "warning", reviewLevel: "full" };
  }
  const planErrors = dispatchPlans.flatMap((plan) => plan.errors.map((error) => `${plan.channel}:${error}`));
  if (planErrors.length > 0) {
    return { status: "quarentena", folder: "review", exceptionType: "dispatch_precondition_failed", reason: `Pre-condicoes de envio falharam: ${planErrors.join(", ")}.`, action: "Corrigir destinatario/template antes do envio.", severity: "error", reviewLevel: "full" };
  }
  if (mode === "producao" && connectorErrors.length > 0) {
    return { status: "erro", folder: "errors", exceptionType: "connector_inactive", reason: `Conector necessario inativo: ${connectorErrors.join(", ")}.`, action: "Pausar lote e reativar conectores.", severity: "error", reviewLevel: "full" };
  }

  const operationLevel = (config.operation_level || "somente_classificacao") as OperationLevel;
  const highValueThreshold = Number(config.high_value_threshold ?? 0);
  const blockedReasons: string[] = [];
  if (!args.forceDispatch) {
    if (["automacao_desligada", "somente_classificacao", "leitura_revisao"].includes(operationLevel)) {
      blockedReasons.push(`operation_level_blocks:${operationLevel}`);
    }
    if (config.require_batch_approval === true) blockedReasons.push("requires_batch_approval");
    if (!config.auto_dispatch_enabled) blockedReasons.push("auto_dispatch_disabled");
  }
  if (!args.manualApproval && highValueThreshold > 0 && metadata.valor != null && metadata.valor >= highValueThreshold) {
    blockedReasons.push(`high_value_requires_approval:>=${highValueThreshold}`);
  }
  // In test mode without explicit force/full-pipeline, never dispatch — keep preview only.
  if (mode === "teste" && !args.forceDispatch) {
    blockedReasons.push("mode_test_preview_only");
  }

  if (blockedReasons.length > 0) {
    const reason = mode === "teste" && !args.forceDispatch
      ? "Preview de teste gerado sem envio real."
      : `Identificada, envio automatico bloqueado por: ${blockedReasons.join(", ")}.`;
    return {
      status: "pronta_envio",
      reason,
      action: "Ajustar Configuracoes -> Pipeline, aprovar lote ou selecionar guia para envio.",
      reviewLevel: "none",
      readyButAwaitingApproval: true,
    };
  }

  return { status: "pronta_envio", reason: "Todos os campos criticos estao validos e consistentes.", action: "Enviar automaticamente.", reviewLevel: "none" };
}

function buildCriticalFields(metadata: GuideMetadata, matched: any, dispatchPlans: DispatchPlan[]) {
  const empresa = matched
    ? field(matched.id, 1, "valid", "empresas.cnpj", "exact_cnpj_match", "Empresa ativa encontrada por CNPJ cadastrado.")
    : field(null, 0, "missing", "empresas.cnpj", "exact_cnpj_match", "Empresa nao vinculada.");
  const canal = matched?.canal_preferido
    ? field(matched.canal_preferido, 1, "valid", "empresas.canal_preferido", "channel_config", "Canal de envio configurado.")
    : field(null, 0, "missing", "empresas.canal_preferido", "channel_config", "Canal de envio ausente.");
  const destinatarioStatus = dispatchPlans.length > 0 && dispatchPlans.every((plan) => plan.destination && !plan.errors.includes("destination_missing") && !plan.errors.includes("invalid_email") && !plan.errors.includes("invalid_whatsapp_number"));
  const destinatario = destinatarioStatus
    ? field(dispatchPlans.map((plan) => `${plan.channel}:${plan.destination}`).join(", "), 1, "valid", "empresa.contato", "destination_validation", "Destinatario validado para todos os canais.")
    : field(null, 0, "missing", "empresa.contato", "destination_validation", "Destinatario ausente ou invalido.");
  return {
    ...metadata.fields,
    empresa,
    canal,
    destinatario,
  };
}

async function dispatchGuide(
  db: any,
  guide: any,
  matched: any,
  metadata: GuideMetadata,
  classification: ClassifyResult,
  bytes: Uint8Array,
  plans: DispatchPlan[],
  gmailKey: string,
  mode: Mode,
  batchId: string | null,
) {
  const results: any[] = [];
  await db.from("guias").update({ status: "enviando" }).eq("id", guide.id);
  await logEvent(db, guide.id, "dispatch_started", "Envio iniciado.", { channels: plans.map((plan) => plan.channel) }, "info", batchId);

  for (const plan of plans) {
    const idemKey = `${guide.id}:${plan.channel}:${mode}`;
    const { data: prior } = await db.from("guia_envios").select("id,status").eq("idempotency_key", idemKey).maybeSingle();
    if (prior && ["aceito", "entregue", "simulado"].includes(prior.status)) {
      results.push({ canal: plan.channel, skipped: "already_sent", status: prior.status });
      continue;
    }
    try {
      if (plan.channel === "email") {
        const { messageId, from } = await sendEmail(gmailKey, plan.destination!, plan.subject || `Guia ${classification.label}`, plan.body, bytes, guide.file_name);
        await db.from("guia_envios").insert({
          guia_id: guide.id,
          empresa_id: matched.id,
          canal: "email",
          destinatario: plan.destination,
          assunto: plan.subject,
          mensagem_preview: plan.body.slice(0, 400),
          provider_message_id: messageId,
          idempotency_key: idemKey,
          status: "aceito",
          submitted_at: new Date().toISOString(),
          sanitized_payload: { mode, message_id: messageId, sender: from, template_id: plan.template?.id ?? null },
        });
        await logEvent(db, guide.id, "email_sent", "Email aceito pelo Gmail.", { message_id: messageId, to: plan.destination }, "info", batchId);
        results.push({ canal: "email", status: "aceito", messageId });
      } else {
        const normalized = normalizePhoneE164(plan.destination)!;
        // Para WhatsApp não há anexo: gera link assinado temporário no
        // bucket privado guia-pdf-links e injeta no placeholder [LINK_GUIA].
        let linkGuia: string | null = null;
        let linkExpiresAt: string | null = null;
        try {
          const storagePath = `${batchId || 'manual'}/${guide.id}.pdf`;
          const { error: upErr } = await db.storage
            .from('guia-pdf-links')
            .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true });
          if (upErr && !String(upErr.message || '').includes('exists')) throw upErr;
          const { data: signed, error: signErr } = await db.storage
            .from('guia-pdf-links')
            .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 dias
          if (signErr) throw signErr;
          linkGuia = signed?.signedUrl || null;
          if (linkGuia) {
            linkExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            await db.from('guias').update({ pdf_link_signed_url: linkGuia, pdf_link_expires_at: linkExpiresAt }).eq('id', guide.id);
            await logEvent(db, guide.id, 'whatsapp_link_generated', 'Link assinado gerado para WhatsApp.', { expires_at: linkExpiresAt }, 'info', batchId);
          }
        } catch (linkErr) {
          await logEvent(db, guide.id, 'whatsapp_link_failed', 'Falha ao gerar link assinado.', { error: String(linkErr).slice(0, 200) }, 'warn', batchId);
        }
        // O placeholder [LINK_GUIA] foi pré-resolvido para o marcador
        // __LINK_GUIA_PENDING__ na fase de validação. Substituímos agora
        // pelo link assinado real antes de enviar.
        const wpBody = linkGuia
          ? plan.body.replaceAll('__LINK_GUIA_PENDING__', linkGuia).replaceAll('[LINK_GUIA]', linkGuia)
          : plan.body.replaceAll('__LINK_GUIA_PENDING__', '');
        const tpl = plan.template || {};
        const wpRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-whatsapp-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            to: normalized,
            guide_id: guide.id,
            modo: mode,
            template_name: tpl.meta_template_name || 'envio_guia_fiscal',
            language: tpl.meta_template_language || 'pt_BR',
            has_document_header: Boolean(tpl.meta_template_has_document_header && linkGuia),
            document: linkGuia ? { link: linkGuia, filename: guide.file_name } : undefined,
            parameters: {
              tipo_guia: classification.label,
              empresa: companyName(matched),
              cnpj: matched.cnpj || metadata.primaryCnpj || '',
              competencia: metadata.competencia || '',
              vencimento: metadata.vencimento || '',
              valor: metadata.valor != null ? `R$ ${Number(metadata.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '',
            },
            body_variable_order: ['tipo_guia', 'empresa', 'competencia', 'vencimento', 'valor'],
          }),
        });
        const payload = await wpRes.json().catch(() => ({}));
        if (!wpRes.ok || payload?.ok === false) throw new Error(payload?.error || `whatsapp_failed_${wpRes.status}`);
        await db.from("guia_envios").insert({
          guia_id: guide.id,
          empresa_id: matched.id,
          canal: "whatsapp",
          destinatario: normalized,
          mensagem_preview: wpBody.slice(0, 400),
          template_sid: tpl.meta_template_name ?? null,
          provider: 'meta_whatsapp',
          provider_status: 'sent',
          provider_payload: { template: tpl.meta_template_name, modo: mode, has_document_header: Boolean(tpl.meta_template_has_document_header && linkGuia), document_present: Boolean(linkGuia) },
          sent_at: new Date().toISOString(),
          provider_message_id: payload?.message_id ?? null,
          idempotency_key: idemKey,
          status: "aceito",
          submitted_at: new Date().toISOString(),
          sanitized_payload: { mode, ok: true, template: tpl.meta_template_name ?? null, link_guia: linkGuia ? '<assinado>' : null },
        });
        await logEvent(db, guide.id, "whatsapp_sent", "WhatsApp aceito pelo provedor.", { message_id: payload?.message_id, to: normalized }, "info", batchId);
        results.push({ canal: "whatsapp", status: "aceito", messageId: payload?.message_id ?? null });
      }
    } catch (err) {
      await db.from("guia_envios").insert({
        guia_id: guide.id,
        empresa_id: matched.id,
        canal: plan.channel,
        destinatario: plan.destination,
        assunto: plan.subject,
        mensagem_preview: plan.body.slice(0, 400),
        template_sid: plan.template?.meta_template_name ?? plan.template?.twilio_content_sid ?? null,
        provider: plan.channel === 'whatsapp' ? 'meta_whatsapp' : 'gmail',
        provider_status: 'failed',
        idempotency_key: idemKey,
        status: "falhou",
        failed_at: new Date().toISOString(),
        provider_error: String(err).slice(0, 300),
        sanitized_payload: { mode, error: String(err).slice(0, 300) },
      });
      await logException(db, guide.id, "dispatch_failed", `Falha no envio via ${plan.channel}.`, "Verifique conector e tente reenviar.", { error: String(err).slice(0, 200) }, "error", batchId);
      results.push({ canal: plan.channel, status: "falhou", error: String(err).slice(0, 200) });
    }
  }
  return results;
}

async function organizeSentFile(db: any, guide: any, driveKey: string, folders: any, matched: any, metadata: GuideMetadata, classification: ClassifyResult, batchId: string | null) {
  try {
    await logEvent(db, guide.id, "drive_move_started", "Organizando PDF enviado no Drive.", {}, "info", batchId);
    const empresaFolderName = slugifyEmpresa(companyName(matched), matched.cnpj);
    const compFolderName = competenciaToFolder(metadata.competencia, metadata.vencimento);
    const finalName = buildGuideDriveFileName({
      tipo: classification.label,
      competencia: metadata.competencia,
      valor: metadata.valor,
      originalName: guide.file_name,
    });
    const empresaFolderId = await findOrCreateFolder(driveKey, empresaFolderName, folders.sent_folder_id);
    const compFolderId = await findOrCreateFolder(driveKey, compFolderName, empresaFolderId);
    await renameFile(driveKey, guide.drive_file_id, finalName);
    await moveFile(driveKey, guide.drive_file_id, compFolderId, folders.source_folder_id);
    await db.from("guias").update({
      status: "enviada",
      pasta_atual: "enviadas",
      sent_at: new Date().toISOString(),
      drive_organization_pending: false,
    }).eq("id", guide.id);
    await logEvent(db, guide.id, "drive_move_finished", "PDF movido para Enviadas com nome seguro.", { finalName, compFolderName }, "info", batchId);
  } catch (err) {
    await logException(db, guide.id, "drive_move_failed", "Envio OK, mas falha ao organizar PDF no Drive.", "Tentar mover novamente pelo painel.", { error: String(err).slice(0, 200) }, "warning", batchId);
    await db.from("guias").update({
      status: "enviada",
      sent_at: new Date().toISOString(),
      drive_organization_pending: true,
    }).eq("id", guide.id);
  }
}

function manualMetadataOverlay(guide: any, metadata: GuideMetadata, classification: ClassifyResult, manualApproval: boolean) {
  if (!manualApproval) return { metadata, classification };
  const cnpj = normalizeCnpj(guide.cnpj_detectado || metadata.primaryCnpj || "");
  const nextMetadata: GuideMetadata = {
    ...metadata,
    cnpjCandidates: cnpj ? [cnpj] : metadata.cnpjCandidates,
    primaryCnpj: cnpj || metadata.primaryCnpj,
    cnpjAmbiguous: false,
    competencia: guide.competencia || metadata.competencia,
    vencimento: guide.vencimento || metadata.vencimento,
    valor: guide.valor != null ? Number(guide.valor) : metadata.valor,
    fields: {
      ...metadata.fields,
      cnpj: cnpj ? field(cnpj, 0.99, "valid", "manual_override", "manual_review", "CNPJ confirmado por operador.") : metadata.fields.cnpj,
      tipo_guia: guide.tipo_guia_normalized ? field(guide.tipo_guia_normalized, 0.99, "valid", "manual_override", "manual_review", "Tipo confirmado por operador.") : metadata.fields.tipo_guia,
      competencia: guide.competencia ? field(guide.competencia, 0.99, "valid", "manual_override", "manual_review", "Competencia confirmada por operador.") : metadata.fields.competencia,
      vencimento: guide.vencimento ? field(guide.vencimento, 0.99, "valid", "manual_override", "manual_review", "Vencimento confirmado por operador.") : metadata.fields.vencimento,
      valor: guide.valor != null ? field(Number(guide.valor), 0.99, "valid", "manual_override", "manual_review", "Valor confirmado por operador.") : metadata.fields.valor,
    },
  };
  const nextClassification: ClassifyResult = guide.tipo_guia_normalized
    ? {
      tipo: guide.tipo_guia_normalized as TipoGuia,
      label: guide.tipo_guia || String(guide.tipo_guia_normalized).toUpperCase(),
      confidence: 0.99,
      matchedKeywords: ["manual_override"],
    }
    : classification;
  return { metadata: nextMetadata, classification: nextClassification };
}

async function processOneGuide(
  db: any,
  guide: any,
  driveKey: string,
  gmailKey: string,
  folders: any,
  config: any,
  integrations: any[],
  options: ProcessOptions,
) {
  const mode = (config.modo_global || "teste") as Mode;
  // Propaga a flag de reprocesso forçado para o detector de duplicidade.
  (guide as any).__forceDispatch = options.forceDispatch === true;
  await db.from("guias").update({ status: "processando", modo: mode, operation_batch_id: options.batchId }).eq("id", guide.id);
  await logEvent(db, guide.id, "scan_started", "Processamento da guia iniciado.", { mode }, "info", options.batchId);

  // When the operator forces reprocess (Processar agora on a stuck guia),
  // do NOT treat its twin as a duplicate up-front — the operator explicitly
  // asked to re-run the pipeline for this record.
  const exactBeforeDownload = guide.sha256 && !options.forceDispatch
    ? await db.from("guias")
      .select("id,status,file_name")
      .eq("sha256", guide.sha256)
      .neq("id", guide.id)
      .not("status", "in", '("duplicada","erro")')
      .limit(1)
      .maybeSingle()
    : { data: null };
  if (exactBeforeDownload.data) {
    const patch = {
      status: "duplicada",
      pasta_atual: "duplicadas",
      duplicate_level: "exact",
      duplicate_of: exactBeforeDownload.data.id,
      decision_status: "duplicada",
      decision_reason: "Duplicidade exata por hash de arquivo.",
      processed_at: new Date().toISOString(),
    };
    await db.from("guias").update(patch).eq("id", guide.id);
    await moveToFolder(db, guide, driveKey, folders, "duplicates", options.batchId);
    await logException(db, guide.id, "duplicate_exact", "Mesmo arquivo ja registrado.", "Bloquear envio.", { duplicate_of: exactBeforeDownload.data.id }, "warning", options.batchId);
    return { status: "duplicada", reason: "duplicate_exact", preview: patch };
  }

  let bytes: Uint8Array;
  try {
    bytes = await downloadFile(driveKey, guide.drive_file_id);
    await logEvent(db, guide.id, "file_found", "Arquivo baixado do Drive.", { bytes: bytes.byteLength }, "info", options.batchId);
  } catch (err) {
    await db.from("guias").update({ status: "erro", provider_error: String(err).slice(0, 300), pasta_atual: "erros" }).eq("id", guide.id);
    await moveToFolder(db, guide, driveKey, folders, "errors", options.batchId);
    await logException(db, guide.id, "drive_download_failed", "Falha ao baixar PDF.", "Verifique o conector Drive.", { error: String(err).slice(0, 200) }, "error", options.batchId);
    return { status: "erro", reason: "drive_download_failed" };
  }

  let extraction;
  try {
    extraction = await extractPdf(bytes);
  } catch (err) {
    await db.from("guias").update({ status: "erro", provider_error: "pdf_text_extraction_failed", pasta_atual: "erros" }).eq("id", guide.id);
    await moveToFolder(db, guide, driveKey, folders, "errors", options.batchId);
    await logException(db, guide.id, "pdf_text_extraction_failed", "Falha ao ler o PDF.", "Reenvie ou processe manualmente.", { error: String(err).slice(0, 200) }, "error", options.batchId);
    return { status: "erro", reason: "pdf_text_extraction_failed" };
  }
  await logEvent(db, guide.id, "pdf_text_extracted", "Texto extraido do PDF.", {
    page_count: extraction.pageCount,
    text_length: extraction.text.length,
    method: extraction.extractionMethod,
  }, "info", options.batchId);

  if (!extraction.hasTextLayer) {
    await db.from("guias").update({
      status: "erro",
      provider_error: "pdf_without_text_layer",
      pasta_atual: "erros",
      pagina_count: extraction.pageCount,
      extraction_method: extraction.extractionMethod,
      has_text_layer: false,
      processed_at: new Date().toISOString(),
    }).eq("id", guide.id);
    await moveToFolder(db, guide, driveKey, folders, "errors", options.batchId);
    await logException(db, guide.id, "pdf_without_text_layer", "PDF sem camada de texto.", "Enviar PDF digital ou revisar manualmente.", {}, "error", options.batchId);
    return { status: "erro", reason: "pdf_without_text_layer" };
  }

  await db.from("guias").update({ status: "validando" }).eq("id", guide.id);
  const initial = analyzeGuideText(extraction.text);

  const { data: companies } = await db.from("empresas").select("*");
  let matched: any = null;
  let inactiveCompany: any = null;
  let fgtsMatch: FgtsMatchResult | null = null;
  let matchMethod: string = 'none';
  if (initial.metadata.primaryCnpj) {
    const byCnpj = (companies || []).find((company: any) => normalizeCnpj(company.cnpj) === initial.metadata.primaryCnpj);
    if (byCnpj?.status === "ativa") { matched = byCnpj; matchMethod = 'cnpj_exact'; }
    else if (byCnpj) inactiveCompany = byCnpj;
  }

  // FGTS Digital fallback by employer legal name when CNPJ completo is absent.
  if (!matched && initial.classification.tipo === 'fgts' && (initial.metadata.empregadorNomeRazaoSocial || initial.metadata.empregadorDocumentoRaw)) {
    fgtsMatch = matchCompanyForFGTSGuide(
      {
        cnpjCompleto: initial.metadata.primaryCnpj,
        documentoRaiz: initial.metadata.empregadorDocumentoTipo === 'cnpj_raiz' ? initial.metadata.empregadorDocumentoRaw?.replace(/\D/g, '') ?? null : null,
        razaoSocial: initial.metadata.empregadorNomeRazaoSocial,
      },
      companies || [],
    );
    if (fgtsMatch.empresa) {
      matched = fgtsMatch.empresa;
      matchMethod = fgtsMatch.method;
      // Mark inactive resolution if any active was rejected (none here, but reset just in case)
      inactiveCompany = null;
    } else {
      matchMethod = fgtsMatch.method;
    }
  }

  const overlaid = manualMetadataOverlay(guide, initial.metadata, initial.classification, options.manualApproval);
  const metadata = overlaid.metadata;
  const classification = overlaid.classification;
  if (options.manualApproval && guide.empresa_id) {
    matched = (companies || []).find((company: any) => company.id === guide.empresa_id && company.status === "ativa") || matched;
    if (matched) matchMethod = matchMethod === 'none' ? 'manual_override' : matchMethod;
  }

  const confidence = calculateConfidence(metadata, classification, !!matched);
  const issues = collectValidationIssues(metadata, classification);
  // Skip the legacy name-mismatch warning when matched via the FGTS legal-name fallback —
  // that match already uses the normalized employer name as evidence.
  const fgtsNameBased = ['exact_normalized_legal_name', 'alias_exact', 'exact_normalized_no_legal_terms'].includes(matchMethod);
  if (!fgtsNameBased && !companyNameCompatible(metadata.razaoSocial, matched)) {
    issues.push({ code: "company_name_mismatch", severity: "warning", message: "Razao social detectada diverge da empresa cadastrada.", field: "empresa" });
  }
  if (fgtsMatch?.reason === 'cnpj_raiz_multiple_branches') {
    issues.push({ code: 'fgts_cnpj_raiz_multiple_branches', severity: 'warning', message: 'CNPJ raiz pertence a multiplas filiais ativas.', field: 'empresa' });
  }
  if (fgtsMatch?.method === 'similarity') {
    issues.push({ code: 'fgts_company_similarity_only', severity: 'warning', message: 'Empresa identificada apenas por similaridade aproximada.', field: 'empresa' });
  }

  await logEvent(db, guide.id, "cnpj_extracted", "CNPJs extraidos e validados.", {
    valid: metadata.cnpjCandidates.map(formatCnpj),
    invalid: metadata.invalidCnpjCandidates,
  }, "info", options.batchId);
  await logEvent(db, guide.id, "guide_type_classified", "Tipo de guia classificado.", {
    tipo: classification.tipo,
    confidence: classification.confidence,
    matched_keywords: classification.matchedKeywords,
  }, "info", options.batchId);

  let duplicate = await detectDuplicates(db, guide, metadata, classification, matched);
  // For FGTS without a full CNPJ, use the FGTS-aware dedup hash instead.
  if (matched && classification.tipo === 'fgts' && !metadata.primaryCnpj && metadata.valor != null && metadata.competencia) {
    const fgtsHash = await dedupHashFgts({
      empresaId: matched.id,
      tipo: classification.tipo,
      competencia: metadata.competencia,
      vencimento: metadata.vencimento,
      valor: metadata.valor,
      identificadorGuia: metadata.identificador,
    });
    duplicate = { ...duplicate, hash: fgtsHash } as typeof duplicate;
  }
  const dispatchPlans = matched ? await buildDispatchPlans(db, matched, classification, metadata, mode, config) : [];
  const connectorErrors = dispatchConnectorErrors(dispatchPlans, integrations, gmailKey);
  const criticalFields = buildCriticalFields(metadata, matched, dispatchPlans);
  const route = routeGuide({
    metadata,
    classification,
    confidence: confidence.overallConfidence,
    issues,
    matched,
    inactiveCompany,
    duplicate,
    dispatchPlans,
    connectorErrors,
    mode,
    config,
    manualApproval: options.manualApproval,
    forceDispatch: options.forceDispatch,
  });

  const baseUpdate: any = {
    cnpj_detectado: metadata.primaryCnpj || metadata.cnpjCandidates[0] || null,
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
    subtipo: metadata.subtipo,
    empregador_documento_raw: metadata.empregadorDocumentoRaw,
    empregador_documento_tipo: metadata.empregadorDocumentoTipo,
    empregador_nome_razao_social: metadata.empregadorNomeRazaoSocial,
    match_method: matchMethod,
    texto_extraido_preview: extraction.text.slice(0, 600),
    pagina_count: extraction.pageCount,
    extraction_method: extraction.extractionMethod,
    has_text_layer: true,
    confidence_score: confidence.overallConfidence,
    critical_fields_json: {
      ...criticalFields,
      ...(classification.tipo === 'fgts' && !metadata.primaryCnpj ? {
        cnpj: {
          value: null,
          raw: metadata.empregadorDocumentoRaw,
          status: 'partial',
          source: 'CPF/CNPJ do Empregador',
          method: 'fgts_employer_document_partial',
          confidence: 0.55,
          reason: 'FGTS Digital exibiu apenas documento parcial/raiz, nao CNPJ completo',
        },
        razao_social: metadata.fields.razao_social ?? null,
        company_match: matched ? {
          empresa_id: matched.id,
          method: matchMethod,
          confidence: fgtsMatch?.confidence ?? 0.98,
          status: 'valid',
        } : (fgtsMatch ? {
          method: fgtsMatch.method,
          candidates: fgtsMatch.candidates,
          reason: fgtsMatch.reason,
          status: 'pending',
        } : null),
      } : {}),
    },
    validation_issues_json: issues,
    decision_status: route.status,
    decision_reason: classification.tipo === 'fgts' && !metadata.primaryCnpj && matched && fgtsNameBased
      ? `${route.reason} | FGTS Digital identificado por razao social do empregador, pois CNPJ completo nao estava disponivel no PDF.`
      : route.reason,
    decision_reasons: [{ reason: route.reason, action: route.action, status: route.status }],
    manual_review_level: route.reviewLevel || null,
    duplicate_level: route.duplicateLevel || duplicate.level || null,
    duplicate_of: duplicate.duplicate?.id || null,
    dispatch_blocked_reason: route.status !== "pronta_envio" || route.readyButAwaitingApproval ? route.reason : null,
    processed_at: new Date().toISOString(),
    match_source: metadata.primaryCnpj ? "cnpj_pdf" : (fgtsNameBased ? "fgts_employer_name" : (options.manualApproval ? "manual" : "filename")),
  };
  if (duplicate.hash) baseUpdate.dedup_hash = duplicate.hash;

  await logEvent(db, guide.id, "fields_validated", "Campos criticos validados.", { critical_fields: criticalFields, issues }, "info", options.batchId);
  await logEvent(db, guide.id, "confidence_calculated", "Confianca calculada.", { confidence, threshold: MIN_CONFIDENCE_AUTO_DISPATCH }, "info", options.batchId);
  if (matched) await logEvent(db, guide.id, "company_matched", "Empresa vinculada por CNPJ.", { empresa_id: matched.id, razao_social: companyName(matched) }, "info", options.batchId);

  if (route.status !== "pronta_envio") {
    await db.from("guias").update({
      ...baseUpdate,
      status: route.status,
      pasta_atual: folderIdFor(folders, route.folder).pasta,
      quarantined_at: route.status === "quarentena" ? new Date().toISOString() : null,
    }).eq("id", guide.id);
    await moveToFolder(db, guide, driveKey, folders, route.folder, options.batchId);
    await logException(db, guide.id, route.exceptionType || route.status, route.reason, route.action, {
      confidence,
      cnpj_candidates: metadata.cnpjCandidates,
      duplicate_of: duplicate.duplicate?.id || null,
      dispatch_errors: dispatchPlans.map((plan) => ({ channel: plan.channel, errors: plan.errors })),
    }, route.severity || "warning", options.batchId);
    return {
      status: route.status,
      reason: route.exceptionType || route.status,
      confidence: confidence.overallConfidence,
      preview: {
        empresa: matched ? companyName(matched) : null,
        cnpj: metadata.primaryCnpj,
        tipo: classification.tipo,
        competencia: metadata.competencia,
        vencimento: metadata.vencimento,
        valor: metadata.valor,
        canais: dispatchPlans.map((plan) => plan.channel),
        destinatarios: dispatchPlans.map((plan) => plan.destination),
        score: confidence.overallConfidence,
        motivo: route.reason,
      },
    };
  }

  await db.from("guias").update({ ...baseUpdate, status: "pronta_envio", pasta_atual: "a_enviar" }).eq("id", guide.id);
  await logEvent(db, guide.id, "ready_to_dispatch", route.reason, {
    mode,
    awaiting_approval: route.readyButAwaitingApproval === true,
    channels: dispatchPlans.map((plan) => plan.channel),
  }, "info", options.batchId);

  if ((mode === "teste" && !options.forceDispatch) || route.readyButAwaitingApproval) {
    await logEvent(db, guide.id, "auto_dispatch_blocked", route.reason, {
      mode,
      reason: route.reason,
      operation_level: config.operation_level,
      auto_dispatch_enabled: config.auto_dispatch_enabled,
      require_batch_approval: config.require_batch_approval,
    }, "info", options.batchId);
    return {
      status: "pronta_envio",
      reason: mode === "teste" ? "test_preview_only" : "awaiting_approval",
      would_send: true,
      confidence: confidence.overallConfidence,
      preview: {
        empresa: matched ? companyName(matched) : null,
        cnpj: metadata.primaryCnpj,
        tipo: classification.tipo,
        competencia: metadata.competencia,
        vencimento: metadata.vencimento,
        valor: metadata.valor,
        canais: dispatchPlans.map((plan) => plan.channel),
        destinatarios_teste: dispatchPlans.map((plan) => plan.destination),
        score: confidence.overallConfidence,
        motivo: route.reason,
      },
    };
  }

  await logEvent(db, guide.id, "auto_dispatch_approved", "Pipeline completo: dispatch automatico aprovado.", {
    mode,
    forced: options.forceDispatch,
    channels: dispatchPlans.map((plan) => plan.channel),
  }, "info", options.batchId);
  const results = await dispatchGuide(db, guide, matched, metadata, classification, bytes, dispatchPlans, gmailKey, mode, options.batchId);
  const allOk = results.every((result) => result.status === "aceito" || result.status === "entregue" || result.skipped === "already_sent");
  if (!allOk) {
    await db.from("guias").update({ status: "erro", provider_error: "dispatch_failed" }).eq("id", guide.id);
    await logEvent(db, guide.id, "dispatch_failed", "Um ou mais canais falharam.", { results }, "error", options.batchId);
    return { status: "erro", reason: "dispatch_failed", results, confidence: confidence.overallConfidence };
  }

  if (mode === "teste") {
    // Test dispatch went to test recipients only — do NOT move Drive file to production "Enviadas".
    await db.from("guias").update({ status: "enviada_teste", sent_at: new Date().toISOString() }).eq("id", guide.id);
    return { status: "enviada_teste", reason: "sent_test", results, confidence: confidence.overallConfidence };
  }
  await organizeSentFile(db, guide, driveKey, folders, matched, metadata, classification, options.batchId);
  return { status: "enviada", reason: "sent", results, confidence: confidence.overallConfidence };
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
  const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY") || "";
  if (!driveKey || !Deno.env.get("LOVABLE_API_KEY")) {
    return new Response(JSON.stringify({ error: "connectors_missing", message: "Drive/Lovable connector ausente." }), { status: 409, headers: cors });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: integrations = [] } = await db.from("integracoes_guias").select("*");
  const drive = integrationByProvider(integrations, "google_drive");
  if (!drive?.source_folder_id || drive.status !== "ativo") {
    return new Response(JSON.stringify({ error: "drive_integration_inactive", message: "Configure a pasta Guias/A Enviar pelo conector Lovable." }), { status: 409, headers: cors });
  }

  const { data: testConfig } = await db.from("guide_test_config").select("*").eq("id", 1).maybeSingle();
  const config = {
    modo_global: "teste",
    operation_level: "somente_classificacao",
    auto_dispatch_enabled: false,
    require_batch_approval: true,
    ...testConfig,
  };

  let reprocessIds: string[] = [];
  let forceDispatch = false;
  let manualApproval = false;
  try {
    const body = await req.json();
    if (Array.isArray(body?.guide_ids)) reprocessIds = body.guide_ids.filter((value: unknown) => typeof value === "string");
    forceDispatch = body?.force_dispatch === true || body?.run_full_pipeline === true;
    manualApproval = body?.manual_approval === true;
  } catch {
    // Empty body is valid.
  }

  const { data: batch } = await db.from("guide_batch_runs").insert({
    modo: config.modo_global,
    operation_level: config.operation_level,
    notes: forceDispatch ? "manual_force_dispatch" : null,
  }).select().single();

  let files: any[] = [];
  // Always scan the Drive source folder for new files. When reprocessIds are
  // provided, also include those existing guias (even if they no longer live
  // in the source folder) so the operator can retry stuck guias from the UI.
  {
    const params = new URLSearchParams({
      q: `'${drive.source_folder_id}' in parents and trashed = false`,
      fields: "files(id,name,mimeType,md5Checksum,modifiedTime)",
      pageSize: "100",
    });
    const list = await fetch(`${DRIVE_GW}/files?${params}`, { headers: gwHeaders(driveKey) });
    if (!list.ok) {
      await db.from("guide_batch_runs").update({
        finished_at: new Date().toISOString(),
        paused: true,
        pause_reason: `drive_list_failed_${list.status}`,
      }).eq("id", batch?.id);
      await db.from("integracoes_guias").update({
        status: "erro",
        last_error: `drive_list_failed_${list.status}`,
        last_check_at: new Date().toISOString(),
      }).eq("provider", "google_drive");
      return new Response(JSON.stringify({ error: "drive_list_failed", status: list.status }), { status: 502, headers: cors });
    }
    files = ((await list.json()).files || []) as any[];
  }

  if (reprocessIds.length > 0) {
    const { data: targets } = await db.from("guias")
      .select("drive_file_id, file_name, mime_type, sha256")
      .in("id", reprocessIds);
    const known = new Set(files.map((f: any) => f.id));
    for (const target of (targets || []) as any[]) {
      if (!target.drive_file_id || known.has(target.drive_file_id)) continue;
      files.push({
        id: target.drive_file_id,
        name: target.file_name,
        mimeType: target.mime_type,
        md5Checksum: target.sha256,
      });
      known.add(target.drive_file_id);
    }
  }

  const results: any[] = [];
  const counters = {
    total: 0,
    enviadas: 0,
    revisao: 0,
    erros: 0,
    duplicadas: 0,
    nao_identificadas: 0,
    identificadas: 0,
    prontas_envio: 0,
    quarentena: 0,
  };

  for (const file of files) {
    counters.total++;
    const { data: existing } = await db.from("guias").select("*").eq("drive_file_id", file.id).maybeSingle();
    let guide = existing;
    if (!guide) {
      const { data: inserted } = await db.from("guias").insert({
        drive_file_id: file.id,
        file_name: file.name,
        mime_type: file.mimeType,
        sha256: file.md5Checksum || null,
        source_folder_id: drive.source_folder_id,
        sent_folder_id: drive.sent_folder_id,
        modo: config.modo_global,
        status: "aguardando_processamento",
      }).select().single();
      guide = inserted;
    }
    if (!guide) continue;
    await logEvent(db, guide.id, "file_registered", "Arquivo registrado para processamento.", { file_name: file.name, batch_id: batch?.id }, "info", batch?.id);
    if (reprocessIds.length === 0 && ["enviada", "enviando"].includes(guide.status)) {
      results.push({ file: file.name, skipped: true, status: guide.status });
      continue;
    }
    if (file.mimeType !== "application/pdf") {
      await db.from("guias").update({ status: "erro", provider_error: "Formato nao suportado.", pasta_atual: "erros" }).eq("id", guide.id);
      await moveToFolder(db, guide, driveKey, drive, "errors", batch?.id);
      await logException(db, guide.id, "unsupported_file", "Somente PDFs sao processados.", "Envie em PDF.", {}, "error", batch?.id);
      counters.erros++;
      results.push({ file: file.name, skipped: true, reason: "not_pdf" });
      continue;
    }
    try {
      const result = await processOneGuide(db, guide, driveKey, gmailKey, drive, config, integrations, {
        batchId: batch?.id ?? null,
        forceDispatch,
        manualApproval,
      });
      if (result.status === "enviada") counters.enviadas++;
      else if (result.status === "revisao_manual") counters.revisao++;
      else if (result.status === "quarentena") counters.quarentena++;
      else if (result.status === "erro") counters.erros++;
      else if (result.status === "duplicada") counters.duplicadas++;
      else if (result.status === "nao_identificada") counters.nao_identificadas++;
      else if (result.status === "pronta_envio") counters.prontas_envio++;
      if (["enviada", "revisao_manual", "duplicada", "pronta_envio", "quarentena"].includes(result.status)) counters.identificadas++;
      results.push({ file: file.name, guia_id: guide.id, ...result });
    } catch (err) {
      counters.erros++;
      await db.from("guias").update({ status: "erro", provider_error: String(err).slice(0, 300) }).eq("id", guide.id);
      await logEvent(db, guide.id, "dispatch_failed", "Falha tecnica inesperada no processamento.", { error: String(err).slice(0, 500) }, "error", batch?.id);
      results.push({ file: file.name, guia_id: guide.id, status: "erro", error: String(err).slice(0, 500) });
    }
  }

  if (batch) {
    await db.from("guide_batch_runs").update({
      finished_at: new Date().toISOString(),
      ...counters,
      preview_json: results,
    }).eq("id", batch.id);
  }

  await db.from("integracoes_guias").update({
    last_check_at: new Date().toISOString(),
    last_error: null,
  }).eq("provider", "google_drive");

  return new Response(JSON.stringify({
    modo: config.modo_global,
    operation_level: config.operation_level,
    scanned: files.length,
    batch_id: batch?.id,
    counters,
    results,
  }), { headers: cors });
});
