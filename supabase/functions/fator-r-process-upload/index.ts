// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { getFatorRRecommendation, parsePgdasFatorR, type FatorRStatus } from "../_shared/fatorRParser.ts";
import { computeSha256, findExistingByName, resolveCompanyFolder, uploadPdf } from "../_shared/fator-r-drive-storage.ts";

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
    throw new Error(`Falha ao extrair texto do PDF na função remota. Verifique deploy da Edge Function e logs do Supabase. Detalhe: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const shouldSendAlert = (status: FatorRStatus, confidence: number) => (status === "attention" || status === "critical") && confidence >= 0.75;
const logStep = async (supabase: any, payload: { documentId?: string | null; companyId?: string | null; eventType: string; message: string; data?: any }) => {
  await supabase.from("fator_r_processing_logs").insert({
    document_id: payload.documentId ?? null,
    company_id: payload.companyId ?? null,
    event_type: payload.eventType,
    message: payload.message,
    payload: payload.data ?? {},
  });
};

const formatMoney = (value: number | null) => value === null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatPercent = (value: number | null) => value === null ? "—" : `${value.toFixed(2)}%`;
const statusLabel = (status: FatorRStatus) => ({ critical: "Crítico", attention: "Atenção", safe: "Seguro", not_applicable: "Não se aplica", unknown: "Revisar" }[status]);

const buildAlertHtml = (parsed: any, fileName: string, status: FatorRStatus) => `
  <p>Olá,</p>
  <p>O monitoramento identificou um PGDAS em status <strong>${statusLabel(status)}</strong>.</p>
  <ul>
    <li><strong>Empresa:</strong> ${parsed.companyName ?? "Não identificada"}</li>
    <li><strong>CNPJ:</strong> ${parsed.cnpj ?? "Não identificado"}</li>
    <li><strong>Período:</strong> ${parsed.referenceMonth && parsed.referenceYear ? `${String(parsed.referenceMonth).padStart(2, "0")}/${parsed.referenceYear}` : "Não identificado"}</li>
    <li><strong>Fator R declarado:</strong> ${parsed.notApplicable ? "Não se aplica" : formatPercent(parsed.declaredFatorRPercent)}</li>
    <li><strong>Fator R calculado:</strong> ${formatPercent(parsed.computedFatorRPercent)}</li>
    <li><strong>RBT12:</strong> ${formatMoney(parsed.revenue12m)}</li>
    <li><strong>FS12:</strong> ${parsed.folhaAusente ? "Nenhuma" : formatMoney(parsed.payroll12m)}</li>
    <li><strong>Status:</strong> ${statusLabel(status)}</li>
    <li><strong>Arquivo:</strong> ${fileName}</li>
  </ul>
  <p><strong>Recomendação:</strong> ${getFatorRRecommendation(status)}</p>
  <p>Este é um alerta automatizado de apoio à análise contábil.</p>
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    const supabase = createClient(reqEnv("SUPABASE_URL"), reqEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const body = await req.json();
    const files = Array.isArray(body.files) ? body.files : [];
    const persist = body.persist !== false;
    const sendAlerts = body.sendAlerts !== false;
    const alertFrom = body.alertFrom || Deno.env.get("FATOR_R_EMAIL_FROM") || ALERT_FROM;
    const alertTo = body.alertTo || Deno.env.get("FATOR_R_ALERT_DEFAULT_RECIPIENT") || ALERT_TO;

    const processed = [];
    for (const file of files) {
      if (!file?.name || !file?.base64) throw new Error("Arquivo inválido para processamento.");
      await logStep(supabase, { eventType: "upload_received", message: `Upload manual recebido: ${file.name}` });

      const bytes = decodeBase64(file.base64);
      const rawText = await extractPdf(bytes);
      await logStep(supabase, { eventType: "pdf_text_extracted", message: `Texto extraído de ${file.name}`, data: { raw_text_preview: rawText.slice(0, 1000) } });

      const parsed = parsePgdasFatorR(rawText, file.name);
      const status = parsed.status;
      await logStep(supabase, { eventType: "pgdas_fields_parsed", message: `Campos PGDAS interpretados em ${file.name}`, data: parsed });
      await logStep(supabase, { eventType: "fator_r_classified", message: `Fator R classificado como ${status}`, data: { status, confidence: parsed.confidence } });

      const alert = shouldSendAlert(status, parsed.confidence);
      const resultPayload: any = { fileName: file.name, status, recommendation: getFatorRRecommendation(status), alert, alertFrom, alertTo, parsed };

      let companyId = null;
      let documentId = null;
      let monthlyResultId = null;

      const fileHash = await computeSha256(bytes);
      let driveFileId: string | null = null;
      let driveWebUrl: string | null = null;
      let driveFolderId: string | null = null;
      let cloudStoragePath: string | null = null;
      let storageStatus: "uploaded" | "skipped_duplicate" | "failed" | "pending" = "pending";
      let uploadedAt: string | null = null;

      if (persist) {
        if (parsed.cnpj && !parsed.cnpjIsPartial) {
          const norm = parsed.cnpj.replace(/\D/g, "");
          const existing = await supabase.from("fator_r_companies").select("id").eq("normalized_cnpj", norm).maybeSingle();
          if (existing.data?.id) companyId = existing.data.id;
          else {
            const created = await supabase.from("fator_r_companies").insert({
              name: parsed.companyName || `Empresa ${norm}`,
              cnpj: parsed.cnpj,
              normalized_cnpj: norm,
              responsible_email: alertTo,
              active: true,
            }).select("id").single();
            companyId = created.data?.id ?? null;
          }
        }

        // Deduplicação por hash (qualquer empresa) ou por (empresa, período, nome)
        let dup: any = null;
        const byHash = await supabase.from("fator_r_documents").select("id, drive_file_id, drive_web_url, drive_folder_id, cloud_storage_path, storage_status").eq("file_hash", fileHash).maybeSingle();
        if (byHash.data) dup = byHash.data;
        if (!dup && companyId && parsed.referenceMonth && parsed.referenceYear) {
          const byName = await supabase.from("fator_r_documents")
            .select("id, drive_file_id, drive_web_url, drive_folder_id, cloud_storage_path, storage_status")
            .eq("company_id", companyId).eq("file_year", parsed.referenceYear).eq("file_month", parsed.referenceMonth)
            .eq("drive_file_name", file.name).maybeSingle();
          if (byName.data) dup = byName.data;
        }

        // Tenta enviar ao Drive (best-effort)
        const driveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
        const lovableKey = Deno.env.get("LOVABLE_API_KEY");
        const rootName = Deno.env.get("FATOR_R_DRIVE_ROOT_NAME") || "PGDAS - Monitoramento Fator R";
        const rootParentId = Deno.env.get("FATOR_R_DRIVE_ROOT_PARENT_ID") || null;

        if (dup) {
          driveFileId = dup.drive_file_id ?? null;
          driveWebUrl = dup.drive_web_url ?? null;
          driveFolderId = dup.drive_folder_id ?? null;
          cloudStoragePath = dup.cloud_storage_path ?? null;
          storageStatus = "skipped_duplicate";
          await logStep(supabase, { companyId, eventType: "drive_duplicate_skipped", message: `Duplicado ignorado: ${file.name}`, data: { file_hash: fileHash } });
        } else if (driveKey && lovableKey && parsed.companyName && parsed.cnpj && parsed.referenceMonth && parsed.referenceYear) {
          try {
            const { folderId, logicalPath } = await resolveCompanyFolder({
              supabase, driveKey, lovableKey, rootName, rootParentId,
              companyName: parsed.companyName, cnpj: parsed.cnpj,
              year: parsed.referenceYear, month: parsed.referenceMonth, companyId,
            });
            driveFolderId = folderId;
            cloudStoragePath = `${logicalPath}/${file.name}`;
            const existing = await findExistingByName(folderId, file.name, driveKey, lovableKey);
            if (existing) {
              driveFileId = existing.id;
              driveWebUrl = existing.webViewLink;
              storageStatus = "skipped_duplicate";
              await logStep(supabase, { companyId, eventType: "drive_duplicate_skipped", message: `Arquivo já existente no Drive: ${file.name}`, data: { drive_file_id: existing.id } });
            } else {
              const uploaded = await uploadPdf({ bytes, name: file.name, parentId: folderId, driveKey, lovableKey });
              driveFileId = uploaded.id;
              driveWebUrl = uploaded.webViewLink;
              storageStatus = "uploaded";
              uploadedAt = new Date().toISOString();
              await logStep(supabase, { companyId, eventType: "drive_upload_success", message: `PDF enviado ao Drive: ${file.name}`, data: { drive_file_id: uploaded.id, path: cloudStoragePath } });
            }
          } catch (e) {
            storageStatus = "failed";
            await logStep(supabase, { companyId, eventType: "drive_upload_failed", message: `Falha no Drive: ${e instanceof Error ? e.message : String(e)}`, data: { file_name: file.name } });
          }
        } else if (!driveKey || !lovableKey) {
          storageStatus = "failed";
          await logStep(supabase, { companyId, eventType: "drive_upload_failed", message: "Drive não configurado (GOOGLE_DRIVE_API_KEY/LOVABLE_API_KEY ausente).", data: {} });
        }

        const doc = await supabase.from("fator_r_documents").insert({
          company_id: companyId,
          drive_file_id: driveFileId ?? `manual:${crypto.randomUUID()}`,
          drive_file_name: file.name,
          drive_mime_type: "application/pdf",
          drive_web_url: driveWebUrl,
          drive_folder_id: driveFolderId,
          cloud_storage_path: cloudStoragePath,
          file_hash: fileHash,
          storage_status: storageStatus,
          uploaded_at: uploadedAt,
          file_month: parsed.referenceMonth,
          file_year: parsed.referenceYear,
          detected_cnpj: parsed.cnpj,
          detected_company_name: parsed.companyName,
          extraction_confidence: parsed.confidence,
          declared_fator_r: parsed.declaredFatorRValue,
          computed_fator_r: parsed.computedFatorRValue,
          fator_r_status: status,
          not_applicable: parsed.notApplicable,
          raw_text: rawText.slice(0, 20000),
          extracted_data: { ...resultPayload, declared_fator_r: parsed.declaredFatorRValue, computed_fator_r: parsed.computedFatorRValue, fator_r_status: status, not_applicable: parsed.notApplicable, source: "manual_pdf_upload", storage_status: storageStatus, drive_web_url: driveWebUrl, cloud_storage_path: cloudStoragePath },
          processing_status: "processed",
          processed_at: new Date().toISOString(),
        }).select("id").single();
        documentId = doc.data?.id ?? null;
        if (documentId) {
          await logStep(supabase, { documentId, companyId, eventType: "file_processed", message: `Arquivo ${file.name} vinculado.`, data: { storage_status: storageStatus, drive_web_url: driveWebUrl } });
        }

        if (companyId && parsed.fatorRValue !== null && parsed.referenceMonth && parsed.referenceYear && status !== "not_applicable" && status !== "unknown") {
          const upsert = await supabase.from("fator_r_monthly_results").upsert({
            company_id: companyId,
            document_id: documentId,
            reference_month: parsed.referenceMonth,
            reference_year: parsed.referenceYear,
            fator_r_value: parsed.fatorRValue,
            fator_r_percent: parsed.fatorRPercent,
            payroll_12m: parsed.payroll12m,
            revenue_12m: parsed.revenue12m,
            declared_fator_r: parsed.declaredFatorRValue,
            computed_fator_r: parsed.computedFatorRValue,
            not_applicable: parsed.notApplicable,
            status,
            recommendation: getFatorRRecommendation(status),
            metadata: { ...parsed.metadata, confidence: parsed.confidence, source: "manual_pdf_upload", declared_fator_r: parsed.declaredFatorRValue, computed_fator_r: parsed.computedFatorRValue },
          }, { onConflict: "company_id,reference_month,reference_year" }).select("id").single();
          monthlyResultId = upsert.data?.id ?? null;
        }
      }

      let email = { attempted: false, sent: false, error: null as string | null, provider: "gmail_connector" as string };
      if (sendAlerts && alert && alertTo) {
        const subject = `[Fator R] ${status === "critical" ? "Crítico" : "Atenção"}: ${parsed.companyName ?? file.name} em ${formatPercent(parsed.fatorRPercent)}`;
        const html = buildAlertHtml(parsed, file.name, status);
        let alertId: string | null = null;
        let duplicateSent = false;

        if (persist && companyId) {
          const existing = await supabase
            .from("fator_r_alerts")
            .select("id,status")
            .eq("company_id", companyId)
            .eq("monthly_result_id", monthlyResultId)
            .eq("alert_type", status)
            .eq("recipient_email", alertTo)
            .maybeSingle();
          if (existing.data) {
            alertId = existing.data.id;
            if (existing.data.status === "sent") {
              duplicateSent = true;
              await logStep(supabase, { documentId, companyId, eventType: "alert_duplicate_skipped", message: "Alerta já existente; envio duplicado ignorado.", data: { alertId } });
            }
          } else {
            const created = await supabase.from("fator_r_alerts").insert({ company_id: companyId, monthly_result_id: monthlyResultId, alert_type: status, recipient_email: alertTo, subject, body: html, status: "pending" }).select("id").single();
            alertId = created.data?.id ?? null;
            await logStep(supabase, { documentId, companyId, eventType: "alert_created", message: `Alerta ${status} criado para ${alertTo}` });
          }
        }

        if (duplicateSent) {
          email = { attempted: false, sent: true, error: "Alerta já existente; envio duplicado ignorado.", provider: "gmail_connector" };
        } else {
          await logStep(supabase, { documentId, companyId, eventType: "email_send_started", message: `Iniciando envio Gmail para ${alertTo}`, data: { from: alertFrom, subject } });
          try {
            const resp = await supabase.functions.invoke("fator-r-send-alert", { body: { to: alertTo, from: alertFrom, subject, html } });
            const respData = (resp.data ?? {}) as any;
            const transportError = resp.error?.message ?? null;
            const sent = !transportError && respData?.ok === true;
            const reason = respData?.reason ?? null;
            const message = respData?.message ?? transportError ?? null;

            if (!sent && reason === "gmail_not_connected") {
              await logStep(supabase, { documentId, companyId, eventType: "gmail_connector_missing", message: message ?? "Gmail não conectado.", data: respData });
            } else if (sent) {
              await logStep(supabase, { documentId, companyId, eventType: "gmail_send_success", message: `E-mail enviado via Gmail para ${alertTo}`, data: { messageId: respData?.messageId } });
            } else {
              await logStep(supabase, { documentId, companyId, eventType: "gmail_send_failed", message: message ?? "Falha desconhecida no envio Gmail.", data: respData });
            }

            email = { attempted: true, sent, error: sent ? null : (message ?? "Falha no envio"), provider: "gmail_connector" };

            if (persist && alertId) {
              await supabase.from("fator_r_alerts").update({
                status: sent ? "sent" : "failed",
                sent_at: sent ? new Date().toISOString() : null,
                error_message: sent ? null : (message ?? null),
              }).eq("id", alertId);
              await logStep(supabase, { documentId, companyId, eventType: "alert_status_updated", message: `Alerta marcado como ${sent ? "sent" : "failed"}`, data: { alertId } });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await logStep(supabase, { documentId, companyId, eventType: "gmail_send_failed", message: `Exceção no envio Gmail: ${message}` });
            email = { attempted: true, sent: false, error: message, provider: "gmail_connector" };
            if (persist && alertId) {
              await supabase.from("fator_r_alerts").update({ status: "failed", error_message: message }).eq("id", alertId);
              await logStep(supabase, { documentId, companyId, eventType: "alert_status_updated", message: "Alerta marcado como failed após exceção", data: { alertId } });
            }
          }
        }
      }

      processed.push({ ...resultPayload, companyId, documentId, monthlyResultId, email, driveWebUrl, storageStatus, cloudStoragePath, driveFileId });
    }

    return Response.json({ ok: true, processed }, { headers: cors });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: cors });
  }
});
