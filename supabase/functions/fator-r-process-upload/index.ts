// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { getFatorRRecommendation, parsePgdasFatorR, type FatorRStatus } from "../_shared/fatorRParser.ts";
import { computeSha256, findExistingByName, resolveAnalyzedFolder, resolveCompanyFolder, uploadPdf } from "../_shared/fator-r-drive-storage.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_FROM = "leomateus620@gmail.com";
const ALERT_TO = "ricardo@escritoriozimmermann.com.br";

const reqEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret ausente: ${name}`);
  return value;
};

const decodeBase64 = (base64: string) => {
  const clean = base64.includes(",") ? base64.split(",").pop()! : base64;
  return Uint8Array.from(atob(clean), (char) => char.charCodeAt(0));
};

async function extractPdf(bytes: Uint8Array) {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const rawText = (Array.isArray(text) ? text.join("\n") : String(text)).trim();
    if (!rawText || rawText.length < 20) throw new Error("pdf_text_empty");
    return rawText;
  } catch (error) {
    throw new Error(`Falha ao extrair texto do PDF na funcao remota. Verifique deploy da Edge Function e logs do Supabase. Detalhe: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const shouldSendAlert = (status: FatorRStatus, confidence: number) => (status === "attention" || status === "critical") && confidence >= 0.75;
const formatMoney = (value: number | null) => value === null ? "-" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatPercent = (value: number | null) => value === null ? "-" : `${value.toFixed(2)}%`;
const formatPeriod = (parsed: any) => parsed.period ?? (parsed.referenceMonth && parsed.referenceYear ? `${String(parsed.referenceMonth).padStart(2, "0")}/${parsed.referenceYear}` : "Periodo nao identificado");
const statusLabel = (status: FatorRStatus) => ({ critical: "Critico", attention: "Atencao", safe: "OK", not_applicable: "Nao se aplica", parse_error: "Erro de leitura", unknown: "Erro de leitura" }[status]);
const emailDryRunFrom = (body: any) => body?.dryRun !== false || Deno.env.get("FATOR_R_EMAIL_DRY_RUN") !== "false";

async function resolveRequestUserId(supabase: any, req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  return data?.user?.id ?? null;
}

const logStep = async (supabase: any, payload: { documentId?: string | null; companyId?: string | null; eventType: string; message: string; data?: any }) => {
  try {
    await supabase.from("fator_r_processing_logs").insert({
      document_id: payload.documentId ?? null,
      company_id: payload.companyId ?? null,
      event_type: payload.eventType,
      message: payload.message,
      payload: payload.data ?? {},
    });
  } catch (_error) {
    // Logging is best-effort; processing should not fail because the log table rejected a row.
  }
};

const buildAlertHtml = (parsed: any, fileName: string, status: FatorRStatus) => `
  <p>O monitoramento de Fator R identificou um PGDAS em status <strong>${statusLabel(status)}</strong>.</p>
  <ul>
    <li><strong>Empresa:</strong> ${parsed.companyName ?? "Nao identificada"}</li>
    <li><strong>CNPJ:</strong> ${parsed.cnpj ?? parsed.cnpjBase ?? "Nao identificado"}</li>
    <li><strong>Periodo:</strong> ${formatPeriod(parsed)}</li>
    <li><strong>Fator R declarado:</strong> ${parsed.notApplicable ? "Nao se aplica" : formatPercent(parsed.declaredFatorRPercent)}</li>
    <li><strong>Fator R calculado:</strong> ${formatPercent(parsed.computedFatorRPercent)}</li>
    <li><strong>RPA:</strong> ${formatMoney(parsed.rpa)}</li>
    <li><strong>RBT12:</strong> ${formatMoney(parsed.rbt12 ?? parsed.revenue12m)}</li>
    <li><strong>FS12:</strong> ${parsed.folhaAusente ? "Nenhuma" : formatMoney(parsed.payroll12 ?? parsed.payroll12m)}</li>
    <li><strong>Anexo:</strong> ${parsed.anexo ?? "-"}</li>
    <li><strong>DAS total:</strong> ${formatMoney(parsed.dasTotal)}</li>
    <li><strong>Pagamento reconhecido:</strong> ${parsed.paymentRecognized === null ? "Nao identificado" : parsed.paymentRecognized ? "Sim" : "Nao"}</li>
    <li><strong>Arquivo:</strong> ${fileName}</li>
  </ul>
  <p><strong>Limite minimo:</strong> 28% | <strong>Faixa de atencao:</strong> 32%.</p>
  <p><strong>Recomendacao:</strong> ${getFatorRRecommendation(status)}</p>
  <p>Este alerta e preventivo; revise pro-labore/folha antes do fechamento.</p>
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    const supabase = createClient(reqEnv("SUPABASE_URL"), reqEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const requestUserId = await resolveRequestUserId(supabase, req);
    const body = await req.json();
    const files = Array.isArray(body.files) ? body.files : [];
    const persist = body.persist !== false;
    const sendAlerts = body.sendAlerts !== false;
    const emailDryRun = emailDryRunFrom(body);
    const alertFrom = body.alertFrom || Deno.env.get("FATOR_R_EMAIL_FROM") || ALERT_FROM;
    const testRecipient = body.testRecipient || Deno.env.get("FATOR_R_ALERT_TEST_RECIPIENT");
    const alertTo = body.alertTo || testRecipient || Deno.env.get("FATOR_R_ALERT_DEFAULT_RECIPIENT") || ALERT_TO;

    const processed = [];
    for (const file of files) {
      const fileName = file?.name ?? "PDF sem nome";
      let documentId: string | null = null;
      let companyId: string | null = null;
      let monthlyResultId: string | null = null;

      try {
        if (!file?.name || !file?.base64) throw new Error("Arquivo invalido para processamento.");
        await logStep(supabase, { eventType: "upload_received", message: `Upload manual recebido: ${file.name}` });

        const bytes = decodeBase64(file.base64);
        const fileHash = await computeSha256(bytes);
        const rawText = await extractPdf(bytes);
        await logStep(supabase, { eventType: "pdf_text_extracted", message: `Texto extraido de ${file.name}`, data: { raw_text_preview: rawText.slice(0, 1000) } });

        const parsed = parsePgdasFatorR(rawText, file.name);
        const status = parsed.status;
        const alert = shouldSendAlert(status, parsed.confidence);
        const resultPayload: any = {
          fileName: file.name,
          status,
          recommendation: getFatorRRecommendation(status),
          alert,
          alertFrom,
          alertTo,
          emailDryRun,
          parsed,
        };

        await logStep(supabase, { eventType: "pgdas_fields_parsed", message: `Campos PGDAS interpretados em ${file.name}`, data: parsed });
        await logStep(supabase, { eventType: "fator_r_classified", message: `Fator R classificado como ${status}`, data: { status, confidence: parsed.confidence } });

        let duplicateDocument: any = null;
        let driveFileId: string | null = null;
        let driveWebUrl: string | null = null;
        let driveFolderId: string | null = null;
        let driveProcessedFileId: string | null = null;
        let driveProcessedFolderId: string | null = null;
        let cloudStoragePath: string | null = null;
        let storageStatus: "analyzed" | "skipped_duplicate" | "failed" | "pending" = "pending";
        let uploadedAt: string | null = null;

        if (persist) {
          const normalizedCnpj = parsed.cnpj?.replace(/\D/g, "") ?? parsed.cnpjBase?.replace(/\D/g, "") ?? null;
          if (normalizedCnpj) {
            const existing = await supabase.from("fator_r_companies").select("id").eq("normalized_cnpj", normalizedCnpj).maybeSingle();
            if (existing.data?.id) companyId = existing.data.id;
            else {
              const created = await supabase.from("fator_r_companies").insert({
                name: parsed.companyName || `Empresa ${normalizedCnpj}`,
                cnpj: parsed.cnpj ?? parsed.cnpjBase,
                normalized_cnpj: normalizedCnpj,
                responsible_email: alertTo,
                active: true,
                user_id: requestUserId,
              }).select("id").single();
              companyId = created.data?.id ?? null;
            }
          }

          const byHash = await supabase.from("fator_r_documents")
            .select("id,drive_file_id,drive_web_url,drive_folder_id,drive_processed_file_id,drive_processed_folder_id,cloud_storage_path,storage_status")
            .eq("file_hash", fileHash)
            .limit(1)
            .maybeSingle();
          if (byHash.data) duplicateDocument = byHash.data;

          if (!duplicateDocument && companyId && parsed.referenceMonth && parsed.referenceYear) {
            const byPeriod = await supabase.from("fator_r_documents")
              .select("id,drive_file_id,drive_web_url,drive_folder_id,drive_processed_file_id,drive_processed_folder_id,cloud_storage_path,storage_status")
              .eq("company_id", companyId)
              .eq("file_year", parsed.referenceYear)
              .eq("file_month", parsed.referenceMonth)
              .eq("drive_file_name", file.name)
              .maybeSingle();
            if (byPeriod.data) duplicateDocument = byPeriod.data;
          }

          const driveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
          const lovableKey = Deno.env.get("LOVABLE_API_KEY");
          const rootName = Deno.env.get("FATOR_R_DRIVE_ROOT_NAME") || "PGDAS - Monitoramento Fator R";
          const rootParentId = Deno.env.get("FATOR_R_DRIVE_ROOT_PARENT_ID") || null;
          const analyzedFolderName = Deno.env.get("FATOR_R_ANALYZED_FOLDER_NAME") || "Analisados";

          if (duplicateDocument) {
            driveFileId = duplicateDocument.drive_file_id ?? null;
            driveWebUrl = duplicateDocument.drive_web_url ?? null;
            driveFolderId = duplicateDocument.drive_folder_id ?? null;
            driveProcessedFileId = duplicateDocument.drive_processed_file_id ?? driveFileId;
            driveProcessedFolderId = duplicateDocument.drive_processed_folder_id ?? null;
            cloudStoragePath = duplicateDocument.cloud_storage_path ?? null;
            storageStatus = "skipped_duplicate";
            await logStep(supabase, { companyId, eventType: "drive_duplicate_skipped", message: `Duplicado ignorado: ${file.name}`, data: { file_hash: fileHash, existing_document_id: duplicateDocument.id } });
          } else if (driveKey && lovableKey && parsed.companyName && (parsed.cnpj || parsed.cnpjBase) && parsed.referenceMonth && parsed.referenceYear) {
            try {
              const { folderId, logicalPath } = await resolveCompanyFolder({
                supabase,
                driveKey,
                lovableKey,
                rootName,
                rootParentId,
                companyName: parsed.companyName,
                cnpj: parsed.cnpj ?? parsed.cnpjBase!,
                year: parsed.referenceYear,
                month: parsed.referenceMonth,
                companyId,
              });
              driveFolderId = folderId;
              const analyzed = await resolveAnalyzedFolder({
                supabase,
                parentId: folderId,
                driveKey,
                lovableKey,
                pathPrefix: logicalPath,
                folderName: analyzedFolderName,
                companyId,
              });
              driveProcessedFolderId = analyzed.folderId;
              cloudStoragePath = `${analyzed.logicalPath}/${file.name}`;
              const existing = await findExistingByName(analyzed.folderId, file.name, driveKey, lovableKey);
              if (existing) {
                driveFileId = existing.id;
                driveProcessedFileId = existing.id;
                driveWebUrl = existing.webViewLink;
                storageStatus = "skipped_duplicate";
                await logStep(supabase, { companyId, eventType: "drive_duplicate_skipped", message: `Arquivo ja existente em Analisados: ${file.name}`, data: { drive_file_id: existing.id } });
              } else {
                const uploaded = await uploadPdf({ bytes, name: file.name, parentId: analyzed.folderId, driveKey, lovableKey });
                driveFileId = uploaded.id;
                driveProcessedFileId = uploaded.id;
                driveWebUrl = uploaded.webViewLink;
                storageStatus = "analyzed";
                uploadedAt = new Date().toISOString();
                await logStep(supabase, { companyId, eventType: "drive_analyzed_saved", message: `PDF salvo em Analisados: ${file.name}`, data: { drive_file_id: uploaded.id, path: cloudStoragePath } });
              }
            } catch (error) {
              storageStatus = "failed";
              await logStep(supabase, { companyId, eventType: "drive_upload_failed", message: `Falha no Drive: ${error instanceof Error ? error.message : String(error)}`, data: { file_name: file.name } });
            }
          } else if (!driveKey || !lovableKey) {
            storageStatus = "failed";
            await logStep(supabase, { companyId, eventType: "drive_upload_failed", message: "Drive nao configurado (GOOGLE_DRIVE_API_KEY/LOVABLE_API_KEY ausente)." });
          }

          const doc = await supabase.from("fator_r_documents").insert({
            company_id: companyId,
            user_id: requestUserId,
            drive_file_id: duplicateDocument ? `manual-duplicate:${crypto.randomUUID()}` : driveFileId ?? `manual:${crypto.randomUUID()}`,
            drive_file_name: file.name,
            drive_mime_type: "application/pdf",
            drive_web_url: driveWebUrl,
            drive_folder_id: driveFolderId,
            drive_processed_file_id: driveProcessedFileId,
            drive_processed_folder_id: driveProcessedFolderId,
            cloud_storage_path: cloudStoragePath,
            file_hash: fileHash,
            storage_status: storageStatus,
            uploaded_at: uploadedAt,
            file_month: parsed.referenceMonth,
            file_year: parsed.referenceYear,
            detected_cnpj: parsed.cnpj ?? parsed.cnpjBase,
            detected_company_name: parsed.companyName,
            extraction_confidence: parsed.confidence,
            declared_fator_r: parsed.declaredFatorRValue,
            computed_fator_r: parsed.computedFatorRValue,
            fator_r_status: status,
            not_applicable: parsed.notApplicable,
            rpa: parsed.rpa,
            rbt12: parsed.rbt12,
            payroll12: parsed.payroll12,
            fator_r: parsed.fatorR,
            fator_r_percent: parsed.fatorRPercent,
            anexo: parsed.anexo,
            das_total: parsed.dasTotal,
            payment_recognized: parsed.paymentRecognized,
            alert_reason: parsed.alertReason,
            raw_text: rawText.slice(0, 20000),
            parse_json: parsed,
            extracted_data: { ...resultPayload, source: "manual_pdf_upload", storage_status: storageStatus, drive_web_url: driveWebUrl, cloud_storage_path: cloudStoragePath, moved_to_analyzed: storageStatus === "analyzed" || storageStatus === "skipped_duplicate" },
            processing_status: duplicateDocument ? "duplicate" : "processed",
            processed_at: new Date().toISOString(),
          }).select("id").single();
          documentId = doc.data?.id ?? null;
          if (documentId) await logStep(supabase, { documentId, companyId, eventType: "file_processed", message: `Arquivo ${file.name} processado.`, data: { storage_status: storageStatus, drive_web_url: driveWebUrl } });

          if (companyId && parsed.referenceMonth && parsed.referenceYear && status !== "parse_error" && status !== "unknown") {
            const upsert = await supabase.from("fator_r_monthly_results").upsert({
              company_id: companyId,
              user_id: requestUserId,
              document_id: documentId,
              reference_month: parsed.referenceMonth,
              reference_year: parsed.referenceYear,
              fator_r_value: parsed.fatorRValue,
              fator_r_percent: parsed.fatorRPercent,
              payroll_12m: parsed.payroll12m,
              revenue_12m: parsed.revenue12m,
              rpa: parsed.rpa,
              anexo: parsed.anexo,
              das_total: parsed.dasTotal,
              payment_recognized: parsed.paymentRecognized,
              declared_fator_r: parsed.declaredFatorRValue,
              computed_fator_r: parsed.computedFatorRValue,
              not_applicable: parsed.notApplicable,
              status,
              alert_reason: parsed.alertReason,
              recommendation: getFatorRRecommendation(status),
              metadata: { ...parsed.metadata, confidence: parsed.confidence, source: "manual_pdf_upload", file_name: file.name },
            }, { onConflict: "company_id,reference_month,reference_year" }).select("id").single();
            monthlyResultId = upsert.data?.id ?? null;
          }
        }

        let email = { attempted: false, sent: false, dryRun: emailDryRun, error: null as string | null, provider: "gmail_connector" };
        if (sendAlerts && alert && alertTo && !duplicateDocument) {
          const subject = `Alerta Fator R — ${parsed.companyName ?? file.name} — ${formatPeriod(parsed)}`;
          const html = buildAlertHtml(parsed, file.name, status);
          let alertId: string | null = null;
          let duplicateSent = false;

          if (persist && companyId) {
            const existing = await supabase.from("fator_r_alerts")
              .select("id,status")
              .eq("company_id", companyId)
              .eq("monthly_result_id", monthlyResultId)
              .eq("alert_type", status)
              .eq("recipient_email", alertTo)
              .maybeSingle();
            if (existing.data) {
              alertId = existing.data.id;
              duplicateSent = existing.data.status === "sent" || existing.data.status === "skipped";
              if (duplicateSent) await logStep(supabase, { documentId, companyId, eventType: "alert_duplicate_skipped", message: "Alerta ja existente; envio duplicado ignorado.", data: { alertId } });
            } else {
              const created = await supabase.from("fator_r_alerts").insert({
                company_id: companyId,
                user_id: requestUserId,
                monthly_result_id: monthlyResultId,
                alert_type: status,
                recipient_email: alertTo,
                subject,
                body: html,
                status: "pending",
              }).select("id").single();
              alertId = created.data?.id ?? null;
              await logStep(supabase, { documentId, companyId, eventType: "alert_created", message: `Alerta ${status} criado para ${alertTo}` });
            }
          }

          if (duplicateSent) {
            email = { attempted: false, sent: true, dryRun: emailDryRun, error: "Alerta duplicado ignorado.", provider: "gmail_connector" };
          } else {
            const resp = await supabase.functions.invoke("fator-r-send-alert", { body: { to: alertTo, from: alertFrom, subject, html, dryRun: emailDryRun } });
            const respData = (resp.data ?? {}) as any;
            const sent = respData?.ok === true && respData?.dryRun !== true && !resp.error;
            const dryRun = respData?.dryRun === true;
            const message = resp.error?.message ?? respData?.message ?? null;
            email = { attempted: true, sent, dryRun, error: sent || dryRun ? null : (message ?? "Falha no envio"), provider: "gmail_connector" };

            await logStep(supabase, {
              documentId,
              companyId,
              eventType: sent ? "email_sent" : dryRun ? "email_dry_run" : "email_failed",
              message: sent ? `E-mail enviado para ${alertTo}` : dryRun ? `E-mail simulado para ${alertTo}` : `Falha ao enviar e-mail: ${message}`,
              data: respData,
            });
            if (persist && alertId) {
              await supabase.from("fator_r_alerts").update({
                status: sent ? "sent" : dryRun ? "skipped" : "failed",
                sent_at: sent ? new Date().toISOString() : null,
                error_message: sent || dryRun ? null : (message ?? null),
              }).eq("id", alertId);
            }
            if (persist && documentId) {
              await supabase.from("fator_r_documents").update({
                email_status: sent ? "sent" : dryRun ? "dry_run" : "failed",
                email_sent_at: sent ? new Date().toISOString() : null,
              }).eq("id", documentId);
            }
          }
        }

        processed.push({
          ...resultPayload,
          companyId,
          documentId,
          monthlyResultId,
          email,
          driveWebUrl,
          storageStatus,
          cloudStoragePath,
          driveFileId,
          driveProcessedFileId,
          movedToAnalyzed: storageStatus === "analyzed" || storageStatus === "skipped_duplicate",
        });
      } catch (error) {
        await logStep(supabase, { documentId, companyId, eventType: "pdf_processing_failed", message: error instanceof Error ? error.message : String(error), data: { file_name: fileName } });
        processed.push({
          fileName,
          status: "parse_error",
          recommendation: "Nao foi possivel processar este PDF.",
          alert: false,
          alertFrom,
          alertTo,
          emailDryRun,
          parsed: null,
          error: "Nao foi possivel processar este PDF.",
        });
      }
    }

    return Response.json({ ok: true, processed }, { headers: cors });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: cors });
  }
});
