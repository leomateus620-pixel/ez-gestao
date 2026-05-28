// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { getFatorRRecommendation, parsePgdasFatorR, type FatorRStatus } from "../_shared/fatorRParser.ts";

const DRIVE_GW = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const ALLOWED = new Set(["application/pdf"]);

const reqEnv = (name: string) => { const v = Deno.env.get(name); if (!v) throw new Error(`Secret ausente: ${name}`); return v; };
const gwHeaders = (key: string) => ({ Authorization: `Bearer ${reqEnv("LOVABLE_API_KEY")}`, "X-Connection-Api-Key": key, "Content-Type": "application/json" });
const shouldSendAlert = (status: FatorRStatus, confidence: number) => (status === "attention" || status === "critical") && confidence >= 0.75;
const formatMoney = (value: number | null) => value === null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatPercent = (value: number | null) => value === null ? "—" : `${value.toFixed(2)}%`;
const statusLabel = (status: FatorRStatus) => ({ critical: "Crítico", attention: "Atenção", safe: "Seguro", not_applicable: "Não se aplica", unknown: "Revisar" }[status]);

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

async function listFolderFiles(folderId: string, driveKey: string) {
  const q = `'${folderId}' in parents and trashed=false`;
  const listRes = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink,createdTime,parents)&pageSize=100`, { headers: gwHeaders(driveKey) });
  if (!listRes.ok) throw new Error(`Falha ao listar Drive: HTTP ${listRes.status}`);
  const payload = await listRes.json() as any;
  return (payload.files ?? []).filter((f: any) => ALLOWED.has(f.mimeType));
}

const logStep = async (supabase: any, payload: { documentId?: string | null; companyId?: string | null; eventType: string; message: string; data?: any }) => {
  await supabase.from("fator_r_processing_logs").insert({ document_id: payload.documentId ?? null, company_id: payload.companyId ?? null, event_type: payload.eventType, message: payload.message, payload: payload.data ?? {} });
};

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
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(reqEnv("SUPABASE_URL"), reqEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const driveKey = reqEnv("GOOGLE_DRIVE_API_KEY");
    const globalFolderId = reqEnv("GOOGLE_DRIVE_FOLDER_ID");
    const alertFrom = Deno.env.get("FATOR_R_EMAIL_FROM") || "leomateus620@gmail.com";
    const defaultRecipient = Deno.env.get("FATOR_R_ALERT_DEFAULT_RECIPIENT") || "ricardo@escritoriozimmermann.com.br";
    const { data: config } = await supabase.from("fator_r_sync_config").select("*").limit(1).maybeSingle();
    if (config?.sync_enabled === false) return Response.json({ ok: true, skipped: true, reason: "sync_disabled" }, { headers: cors });

    const { data: companyFolders } = await supabase.from("fator_r_companies").select("id, drive_folder_id").not("drive_folder_id", "is", null);
    const folderMap = new Map<string, string | null>();
    folderMap.set(globalFolderId, null);
    for (const row of companyFolders ?? []) folderMap.set(row.drive_folder_id, row.id);

    const allFiles: any[] = [];
    for (const [folderId, companyId] of folderMap.entries()) {
      const files = await listFolderFiles(folderId, driveKey);
      for (const f of files) allFiles.push({ ...f, sourceCompanyId: companyId, sourceFolderId: folderId });
    }

    let processed = 0;
    for (const file of allFiles) {
      const { data: exists } = await supabase.from("fator_r_documents").select("id").eq("drive_file_id", file.id).maybeSingle();
      if (exists) continue;

      const docIns = await supabase.from("fator_r_documents").insert({ drive_file_id: file.id, drive_file_name: file.name, drive_mime_type: file.mimeType, drive_web_url: file.webViewLink, processing_status: "processing", extracted_data: { source_folder_id: file.sourceFolderId } }).select("*").single();
      if (docIns.error || !docIns.data) continue;
      const documentId = docIns.data.id;
      await logStep(supabase, { documentId, eventType: "upload_received", message: `Arquivo do Drive recebido: ${file.name}`, data: { source_folder_id: file.sourceFolderId } });

      try {
        const dl = await fetch(`${DRIVE_GW}/files/${file.id}?alt=media`, { headers: gwHeaders(driveKey) });
        if (!dl.ok) throw new Error(`download_failed_${dl.status}`);
        const bytes = new Uint8Array(await dl.arrayBuffer());
        const rawText = await extractPdf(bytes);
        await logStep(supabase, { documentId, eventType: "pdf_text_extracted", message: `Texto extraído de ${file.name}`, data: { raw_text_preview: rawText.slice(0, 1000) } });

        const parsed = parsePgdasFatorR(rawText, file.name);
        const status = parsed.status;
        await logStep(supabase, { documentId, eventType: "pgdas_fields_parsed", message: `Campos PGDAS interpretados em ${file.name}`, data: parsed });
        await logStep(supabase, { documentId, eventType: "fator_r_classified", message: `Fator R classificado como ${status}`, data: { status, confidence: parsed.confidence } });

        let companyId = file.sourceCompanyId;
        if (!companyId && parsed.cnpj && !parsed.cnpjIsPartial) {
          const norm = parsed.cnpj.replace(/\D/g, "");
          const { data: company } = await supabase.from("fator_r_companies").select("id").eq("normalized_cnpj", norm).maybeSingle();
          if (company) companyId = company.id;
          else {
            const created = await supabase.from("fator_r_companies").insert({ name: parsed.companyName || `Empresa ${norm}`, cnpj: parsed.cnpj, normalized_cnpj: norm, active: true, responsible_email: defaultRecipient }).select("id").single();
            companyId = created.data?.id ?? null;
          }
        }

        await supabase.from("fator_r_documents").update({ company_id: companyId, file_month: parsed.referenceMonth, file_year: parsed.referenceYear, detected_cnpj: parsed.cnpj, detected_company_name: parsed.companyName, extraction_confidence: parsed.confidence, declared_fator_r: parsed.declaredFatorRValue, computed_fator_r: parsed.computedFatorRValue, fator_r_status: status, not_applicable: parsed.notApplicable, raw_text: rawText.slice(0, 20000), extracted_data: { ...parsed, declared_fator_r: parsed.declaredFatorRValue, computed_fator_r: parsed.computedFatorRValue, fator_r_status: status, not_applicable: parsed.notApplicable, source_folder_id: file.sourceFolderId }, processing_status: "processed", processed_at: new Date().toISOString() }).eq("id", documentId);

        let monthlyResultId = null;
        if (companyId && parsed.fatorRValue !== null && parsed.referenceMonth && parsed.referenceYear && status !== "not_applicable" && status !== "unknown") {
          const { data: company } = await supabase.from("fator_r_companies").select("*").eq("id", companyId).single();
          const upsert = await supabase.from("fator_r_monthly_results").upsert({ company_id: companyId, document_id: documentId, reference_month: parsed.referenceMonth, reference_year: parsed.referenceYear, fator_r_value: parsed.fatorRValue, fator_r_percent: parsed.fatorRPercent, payroll_12m: parsed.payroll12m, revenue_12m: parsed.revenue12m, declared_fator_r: parsed.declaredFatorRValue, computed_fator_r: parsed.computedFatorRValue, not_applicable: parsed.notApplicable, status, recommendation: getFatorRRecommendation(status), metadata: { ...parsed.metadata, confidence: parsed.confidence, source_folder_id: file.sourceFolderId, declared_fator_r: parsed.declaredFatorRValue, computed_fator_r: parsed.computedFatorRValue } }, { onConflict: "company_id,reference_month,reference_year" }).select("id").single();
          monthlyResultId = upsert.data?.id ?? null;

          if (company?.active && config?.email_alerts_enabled !== false && shouldSendAlert(status, parsed.confidence)) {
            const recipients = [...new Set([company.responsible_email, ...(company.secondary_emails ?? []), defaultRecipient].filter(Boolean))];
            for (const recipient of recipients) {
              const subject = `[Fator R] ${status === "critical" ? "Crítico" : "Atenção"}: ${company.name} em ${formatPercent(parsed.fatorRPercent)}`;
              const html = buildAlertHtml(parsed, file.name, status);
              const existingAlert = await supabase.from("fator_r_alerts").select("id,status").eq("company_id", companyId).eq("monthly_result_id", monthlyResultId).eq("alert_type", status).eq("recipient_email", recipient).maybeSingle();
              if (existingAlert.data) continue;
              const { data: alertData, error: alertErr } = await supabase.from("fator_r_alerts").insert({ company_id: companyId, monthly_result_id: monthlyResultId, alert_type: status, recipient_email: recipient, subject, body: html, status: "pending" }).select("id").single();
              if (alertErr) continue;
              await logStep(supabase, { documentId, companyId, eventType: "alert_created", message: `Alerta ${status} criado para ${recipient}` });
              const resp = await supabase.functions.invoke("fator-r-send-alert", { body: { to: recipient, from: alertFrom, subject, html } });
              await supabase.from("fator_r_alerts").update({ status: resp.error ? "failed" : "sent", sent_at: resp.error ? null : new Date().toISOString(), error_message: resp.error?.message ?? null }).eq("id", alertData.id);
              await logStep(supabase, { documentId, companyId, eventType: resp.error ? "email_failed" : "email_sent", message: resp.error ? `Falha ao enviar e-mail: ${resp.error.message}` : `E-mail enviado para ${recipient}` });
            }
          }
        }

        await logStep(supabase, { documentId, companyId, eventType: "file_processed", message: `Arquivo ${file.name} processado com sucesso.`, data: { source_folder_id: file.sourceFolderId } });
        processed += 1;
      } catch (e) {
        await supabase.from("fator_r_documents").update({ processing_status: "failed", error_message: String(e) }).eq("id", documentId);
        await logStep(supabase, { documentId, eventType: "pdf_text_extraction_failed", message: String(e), data: { file_name: file.name } });
      }
    }

    await supabase.from("fator_r_sync_config").upsert({ id: config?.id, sync_enabled: config?.sync_enabled ?? true, email_alerts_enabled: config?.email_alerts_enabled ?? true, last_run_at: new Date().toISOString() });
    return Response.json({ ok: true, processed, found: allFiles.length }, { headers: cors });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: cors });
  }
});
