// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { getFatorRRecommendation, parsePgdasFatorR, type FatorRStatus } from "../_shared/fatorRParser.ts";
import { computeSha256, moveFileToFolder, resolveAnalyzedFolder } from "../_shared/fator-r-drive-storage.ts";

const DRIVE_GW = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const ALLOWED = new Set(["application/pdf"]);

const reqEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret ausente: ${name}`);
  return value;
};
const gwHeaders = (driveKey: string, lovableKey: string) => ({ Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": driveKey, "Content-Type": "application/json" });
const shouldSendAlert = (status: FatorRStatus, confidence: number) => (status === "attention" || status === "critical") && confidence >= 0.75;
const formatMoney = (value: number | null) => value === null ? "-" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatPercent = (value: number | null) => value === null ? "-" : `${value.toFixed(2)}%`;
const formatPeriod = (parsed: any) => parsed.period ?? (parsed.referenceMonth && parsed.referenceYear ? `${String(parsed.referenceMonth).padStart(2, "0")}/${parsed.referenceYear}` : "Periodo nao identificado");
const statusLabel = (status: FatorRStatus) => ({ critical: "Critico", attention: "Atencao", safe: "OK", not_applicable: "Nao se aplica", parse_error: "Erro de leitura", unknown: "Erro de leitura" }[status]);

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

async function listFolderFiles(folderId: string, driveKey: string, lovableKey: string) {
  const q = `'${folderId}' in parents and trashed=false`;
  const listRes = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink,createdTime,parents)&pageSize=200`, { headers: gwHeaders(driveKey, lovableKey) });
  if (!listRes.ok) throw new Error(`Falha ao listar Drive: HTTP ${listRes.status}`);
  const payload = await listRes.json() as any;
  return (payload.files ?? []) as any[];
}

async function listFolderFilesRecursive(folderId: string, driveKey: string, lovableKey: string, depth = 0): Promise<any[]> {
  if (depth > 6) return [];
  const entries = await listFolderFiles(folderId, driveKey, lovableKey);
  const pdfs = entries.filter((e: any) => ALLOWED.has(e.mimeType));
  const folders = entries.filter((e: any) => e.mimeType === "application/vnd.google-apps.folder");
  for (const folder of folders) {
    // Skip the "Analisados" folder to avoid reprocessing already-moved files.
    if ((folder.name ?? "").toLowerCase() === "analisados") continue;
    const nested = await listFolderFilesRecursive(folder.id, driveKey, lovableKey, depth + 1);
    for (const f of nested) pdfs.push(f);
  }
  return pdfs;
}

const logStep = async (supabase: any, payload: { documentId?: string | null; companyId?: string | null; eventType: string; message: string; data?: any }) => {
  try {
    await supabase.from("fator_r_processing_logs").insert({ document_id: payload.documentId ?? null, company_id: payload.companyId ?? null, event_type: payload.eventType, message: payload.message, payload: payload.data ?? {} });
  } catch (_error) {
    // Logging is best-effort.
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
  try {
    const supabase = createClient(reqEnv("SUPABASE_URL"), reqEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const driveKey = reqEnv("GOOGLE_DRIVE_API_KEY");
    const lovableKey = reqEnv("LOVABLE_API_KEY");
    const globalFolderId = reqEnv("GOOGLE_DRIVE_FOLDER_ID");
    const alertFrom = Deno.env.get("FATOR_R_EMAIL_FROM") || "leomateus620@gmail.com";
    const defaultRecipient = Deno.env.get("FATOR_R_ALERT_DEFAULT_RECIPIENT") || null;
    const emailDryRun = Deno.env.get("FATOR_R_EMAIL_DRY_RUN") !== "false";
    const analyzedFolderName = Deno.env.get("FATOR_R_ANALYZED_FOLDER_NAME") || "Analisados";
    const { data: config } = await supabase.from("fator_r_sync_config").select("*").limit(1).maybeSingle();
    const syncUserId = config?.user_id ?? Deno.env.get("FATOR_R_DEFAULT_USER_ID") ?? null;
    if (config?.sync_enabled === false) return Response.json({ ok: true, skipped: true, reason: "sync_disabled" }, { headers: cors });

    const { data: companyFolders } = await supabase.from("fator_r_companies").select("id, drive_folder_id").not("drive_folder_id", "is", null);
    const folderMap = new Map<string, string | null>();
    folderMap.set(globalFolderId, null);
    for (const row of companyFolders ?? []) folderMap.set(row.drive_folder_id, row.id);

    const allFiles: any[] = [];
    for (const [folderId, companyId] of folderMap.entries()) {
      const files = await listFolderFilesRecursive(folderId, driveKey, lovableKey);
      for (const file of files) {
        const actualParent = Array.isArray(file.parents) && file.parents.length ? file.parents[0] : folderId;
        allFiles.push({ ...file, sourceCompanyId: companyId, sourceFolderId: actualParent });
      }
    }

    let processed = 0;
    const results = [];

    for (const file of allFiles) {
      const { data: exists } = await supabase.from("fator_r_documents").select("id").eq("drive_file_id", file.id).maybeSingle();
      if (exists) continue;

      const docIns = await supabase.from("fator_r_documents").insert({
        drive_file_id: file.id,
        user_id: syncUserId,
        drive_file_name: file.name,
        drive_mime_type: file.mimeType,
        drive_web_url: file.webViewLink,
        drive_folder_id: file.sourceFolderId,
        cloud_storage_path: `drive://${file.sourceFolderId}/${file.name}`,
        storage_status: "drive_native",
        uploaded_at: file.createdTime ?? new Date().toISOString(),
        processing_status: "processing",
        extracted_data: { source_folder_id: file.sourceFolderId },
      }).select("*").single();
      if (docIns.error || !docIns.data) continue;
      const documentId = docIns.data.id;
      let companyId = file.sourceCompanyId;
      await logStep(supabase, { documentId, eventType: "upload_received", message: `Arquivo do Drive recebido: ${file.name}`, data: { source_folder_id: file.sourceFolderId, drive_file_id: file.id } });

      try {
        const dl = await fetch(`${DRIVE_GW}/files/${file.id}?alt=media`, { headers: gwHeaders(driveKey, lovableKey) });
        if (!dl.ok) throw new Error(`download_failed_${dl.status}`);
        const bytes = new Uint8Array(await dl.arrayBuffer());
        const fileHash = await computeSha256(bytes);
        const rawText = await extractPdf(bytes);
        await logStep(supabase, { documentId, eventType: "pdf_text_extracted", message: `Texto extraido de ${file.name}`, data: { raw_text_preview: rawText.slice(0, 1000), file_hash: fileHash } });

        const parsed = parsePgdasFatorR(rawText, file.name);
        const status = parsed.status;
        const alert = shouldSendAlert(status, parsed.confidence);
        await logStep(supabase, { documentId, eventType: "pgdas_fields_parsed", message: `Campos PGDAS interpretados em ${file.name}`, data: parsed });
        await logStep(supabase, { documentId, eventType: "fator_r_classified", message: `Fator R classificado como ${status}`, data: { status, confidence: parsed.confidence } });

        const normalizedCnpj = parsed.cnpj?.replace(/\D/g, "") ?? parsed.cnpjBase?.replace(/\D/g, "") ?? null;
        if (!companyId && normalizedCnpj) {
          const { data: company } = await supabase.from("fator_r_companies").select("id").eq("normalized_cnpj", normalizedCnpj).maybeSingle();
          if (company) companyId = company.id;
          else {
            const created = await supabase.from("fator_r_companies").insert({ name: parsed.companyName || `Empresa ${normalizedCnpj}`, cnpj: parsed.cnpj ?? parsed.cnpjBase, normalized_cnpj: normalizedCnpj, active: true, responsible_email: null, user_id: syncUserId }).select("id").single();
            companyId = created.data?.id ?? null;
          }
        }

        let duplicateDocument: any = null;
        const byHash = await supabase.from("fator_r_documents").select("id").eq("file_hash", fileHash).neq("id", documentId).limit(1).maybeSingle();
        if (byHash.data) duplicateDocument = byHash.data;
        if (!duplicateDocument && companyId && parsed.referenceMonth && parsed.referenceYear) {
          const byPeriod = await supabase.from("fator_r_documents")
            .select("id")
            .eq("company_id", companyId)
            .eq("file_year", parsed.referenceYear)
            .eq("file_month", parsed.referenceMonth)
            .eq("drive_file_name", file.name)
            .neq("id", documentId)
            .maybeSingle();
          if (byPeriod.data) duplicateDocument = byPeriod.data;
        }

        let driveProcessedFileId: string | null = null;
        let driveProcessedFolderId: string | null = null;
        let movedToAnalyzed = false;
        let processedPath = `drive://${file.sourceFolderId}/${file.name}`;
        let driveWebUrl = file.webViewLink ?? null;
        let storageStatus = duplicateDocument ? "skipped_duplicate" : "drive_native";

        if (status !== "parse_error" && status !== "unknown") {
          try {
            const analyzed = await resolveAnalyzedFolder({
              supabase,
              parentId: file.sourceFolderId,
              driveKey,
              lovableKey,
              pathPrefix: `drive://${file.sourceFolderId}`,
              folderName: analyzedFolderName,
              documentId,
              companyId,
            });
            const moved = await moveFileToFolder({
              fileId: file.id,
              addParentId: analyzed.folderId,
              removeParentIds: file.parents ?? [file.sourceFolderId],
              driveKey,
              lovableKey,
            });
            driveProcessedFileId = moved.id;
            driveProcessedFolderId = analyzed.folderId;
            driveWebUrl = moved.webViewLink ?? driveWebUrl;
            processedPath = `${analyzed.logicalPath}/${file.name}`;
            movedToAnalyzed = true;
            storageStatus = duplicateDocument ? "skipped_duplicate" : "analyzed";
            await logStep(supabase, { documentId, companyId, eventType: "drive_file_moved_to_analyzed", message: `Arquivo movido para Analisados: ${file.name}`, data: { processed_folder_id: analyzed.folderId, processed_path: processedPath } });
          } catch (error) {
            storageStatus = "failed";
            await logStep(supabase, { documentId, companyId, eventType: "drive_move_failed", message: error instanceof Error ? error.message : String(error), data: { file_name: file.name } });
          }
        }

        await supabase.from("fator_r_documents").update({
          company_id: companyId,
          user_id: syncUserId,
          file_hash: fileHash,
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
          drive_web_url: driveWebUrl,
          drive_processed_file_id: driveProcessedFileId,
          drive_processed_folder_id: driveProcessedFolderId,
          cloud_storage_path: processedPath,
          storage_status: storageStatus,
          extracted_data: { ...parsed, source_folder_id: file.sourceFolderId, moved_to_analyzed: movedToAnalyzed, duplicate_document_id: duplicateDocument?.id ?? null },
          processing_status: duplicateDocument ? "duplicate" : "processed",
          processed_at: new Date().toISOString(),
        }).eq("id", documentId);

        let monthlyResultId = null;
        if (companyId && parsed.referenceMonth && parsed.referenceYear && status !== "parse_error" && status !== "unknown") {
          const { data: company } = await supabase.from("fator_r_companies").select("*").eq("id", companyId).single();
          const upsert = await supabase.from("fator_r_monthly_results").upsert({
            company_id: companyId,
            user_id: syncUserId,
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
            metadata: { ...parsed.metadata, confidence: parsed.confidence, source_folder_id: file.sourceFolderId, moved_to_analyzed: movedToAnalyzed, file_name: file.name },
          }, { onConflict: "company_id,reference_month,reference_year" }).select("id").single();
          monthlyResultId = upsert.data?.id ?? null;

          if (!duplicateDocument && company?.active && config?.email_alerts_enabled !== false && alert) {
            const recipients = [...new Set([
              company.responsible_email,
              ...(company.secondary_emails ?? []),
              defaultRecipient,
            ].filter(Boolean))] as string[];
            if (recipients.length === 0) {
              await logStep(supabase, { documentId, companyId, eventType: "no_recipients_configured", message: `Sem destinatarios cadastrados para empresa ${company.name}`, data: { company_id: companyId } });
            }
            for (const recipient of recipients) {
              const subject = `Alerta Fator R — ${parsed.companyName ?? company.name} — ${formatPeriod(parsed)}`;
              const html = buildAlertHtml(parsed, file.name, status);
              const existingAlert = await supabase.from("fator_r_alerts")
                .select("id,status")
                .eq("company_id", companyId)
                .eq("monthly_result_id", monthlyResultId)
                .eq("alert_type", status)
                .eq("recipient_email", recipient)
                .maybeSingle();
              if (existingAlert.data?.status === "sent" || existingAlert.data?.status === "skipped") {
                await logStep(supabase, { documentId, companyId, eventType: "alert_duplicate_skipped", message: `Alerta duplicado ignorado para ${recipient}`, data: { alert_id: existingAlert.data.id } });
                continue;
              }
              const { data: alertData, error: alertErr } = existingAlert.data
                ? { data: existingAlert.data, error: null }
                : await supabase.from("fator_r_alerts").insert({ company_id: companyId, user_id: syncUserId, monthly_result_id: monthlyResultId, alert_type: status, recipient_email: recipient, subject, body: html, status: "pending" }).select("id").single();
              if (alertErr) continue;
              await logStep(supabase, { documentId, companyId, eventType: "alert_created", message: `Alerta ${status} criado para ${recipient}` });
              const resp = await supabase.functions.invoke("fator-r-send-alert", { body: { to: recipient, from: alertFrom, subject, html, dryRun: emailDryRun } });
              const respData = (resp.data ?? {}) as any;
              const sent = respData?.ok === true && respData?.dryRun !== true && !resp.error;
              const dryRun = respData?.dryRun === true;
              const message = resp.error?.message ?? respData?.message ?? null;
              await supabase.from("fator_r_alerts").update({ status: sent ? "sent" : dryRun ? "skipped" : "failed", sent_at: sent ? new Date().toISOString() : null, error_message: sent || dryRun ? null : message }).eq("id", alertData.id);
              await supabase.from("fator_r_documents").update({ email_status: sent ? "sent" : dryRun ? "dry_run" : "failed", email_sent_at: sent ? new Date().toISOString() : null }).eq("id", documentId);
              await logStep(supabase, { documentId, companyId, eventType: sent ? "email_sent" : dryRun ? "email_dry_run" : "email_failed", message: sent ? `E-mail enviado para ${recipient}` : dryRun ? `E-mail simulado para ${recipient}` : `Falha ao enviar e-mail: ${message}`, data: respData });
            }
          }
        }

        await logStep(supabase, { documentId, companyId, eventType: "file_processed", message: `Arquivo ${file.name} processado com sucesso.`, data: { moved_to_analyzed: movedToAnalyzed, status } });
        results.push({ fileName: file.name, status, companyId, documentId, movedToAnalyzed, alert });
        processed += 1;
      } catch (error) {
        await supabase.from("fator_r_documents").update({ processing_status: "failed", fator_r_status: "parse_error", error_message: "Nao foi possivel processar este PDF." }).eq("id", documentId);
        await logStep(supabase, { documentId, companyId, eventType: "pdf_processing_failed", message: error instanceof Error ? error.message : String(error), data: { file_name: file.name } });
        results.push({ fileName: file.name, status: "parse_error", movedToAnalyzed: false, alert: false });
      }
    }

    await supabase.from("fator_r_sync_config").upsert({ id: config?.id, user_id: syncUserId, sync_enabled: config?.sync_enabled ?? true, email_alerts_enabled: config?.email_alerts_enabled ?? true, last_run_at: new Date().toISOString() });
    return Response.json({ ok: true, processed, found: allFiles.length, results }, { headers: cors });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: cors });
  }
});
