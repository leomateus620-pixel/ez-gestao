// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { getFatorRRecommendation, parsePgdasFatorR, type FatorRStatus } from "../_shared/fatorRParser.ts";

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
      const resultPayload = { fileName: file.name, status, recommendation: getFatorRRecommendation(status), alert, alertFrom, alertTo, parsed };

      let companyId = null;
      let documentId = null;
      let monthlyResultId = null;

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

        const doc = await supabase.from("fator_r_documents").insert({
          company_id: companyId,
          drive_file_id: `manual:${crypto.randomUUID()}`,
          drive_file_name: file.name,
          drive_mime_type: "application/pdf",
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
          extracted_data: { ...resultPayload, declared_fator_r: parsed.declaredFatorRValue, computed_fator_r: parsed.computedFatorRValue, fator_r_status: status, not_applicable: parsed.notApplicable, source: "manual_pdf_upload" },
          processing_status: "processed",
          processed_at: new Date().toISOString(),
        }).select("id").single();
        documentId = doc.data?.id ?? null;

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

      let email = { attempted: false, sent: false, error: null as string | null };
      if (sendAlerts && alert && alertTo) {
        const subject = `[Fator R] ${status === "critical" ? "Crítico" : "Atenção"}: ${parsed.companyName ?? file.name} em ${formatPercent(parsed.fatorRPercent)}`;
        const html = buildAlertHtml(parsed, file.name, status);
        let alertId = null;
        if (persist && companyId) {
          const existing = await supabase.from("fator_r_alerts").select("id,status").eq("company_id", companyId).eq("monthly_result_id", monthlyResultId).eq("alert_type", status).eq("recipient_email", alertTo).maybeSingle();
          if (!existing.data) {
            const created = await supabase.from("fator_r_alerts").insert({ company_id: companyId, monthly_result_id: monthlyResultId, alert_type: status, recipient_email: alertTo, subject, body: html, status: "pending" }).select("id").single();
            alertId = created.data?.id ?? null;
            await logStep(supabase, { documentId, companyId, eventType: "alert_created", message: `Alerta ${status} criado para ${alertTo}` });
          }
        }
        const resp = await supabase.functions.invoke("fator-r-send-alert", { body: { to: alertTo, from: alertFrom, subject, html } });
        email = { attempted: true, sent: !resp.error, error: resp.error?.message ?? null };
        await logStep(supabase, { documentId, companyId, eventType: resp.error ? "email_failed" : "email_sent", message: resp.error ? `Falha ao enviar e-mail: ${resp.error.message}` : `E-mail enviado para ${alertTo}` });
        if (persist && alertId) await supabase.from("fator_r_alerts").update({ status: resp.error ? "failed" : "sent", sent_at: resp.error ? null : new Date().toISOString(), error_message: resp.error?.message ?? null }).eq("id", alertId);
      }

      processed.push({ ...resultPayload, companyId, documentId, monthlyResultId, email });
    }

    return Response.json({ ok: true, processed }, { headers: cors });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: cors });
  }
});
