/* eslint-disable no-useless-escape, @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_FROM = "leomateus620@gmail.com";
const ALERT_TO = "ricardo@escritoriozimmermann.com.br";
const CRITICAL_THRESHOLD = 0.28;
const ATTENTION_THRESHOLD = 0.32;

const reqEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret ausente: ${name}`);
  return value;
};

const parseBrazilianNumber = (value?: string | null) => {
  if (!value) return null;
  const cleaned = value.trim().replace(/R\$\s*/i, "").replace(/\s/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const raw = Number(normalized.replace("%", ""));
  return Number.isNaN(raw) ? null : raw;
};

const pctToDecimal = (value: string) => {
  const raw = parseBrazilianNumber(value);
  if (raw === null) return null;
  return value.includes("%") || raw > 1 ? raw / 100 : raw;
};

const classify = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "unknown";
  if (value <= CRITICAL_THRESHOLD) return "critical";
  if (value <= ATTENTION_THRESHOLD) return "attention";
  return "safe";
};

const recommendation = (status: string) => {
  if (status === "critical") return "Índice crítico: revisar imediatamente pró-labore, folha e encargos para buscar Fator R acima de 28%.";
  if (status === "attention") return "Índice em atenção: disparar alerta preventivo e avaliar aumento de pró-labore/folha antes do fechamento.";
  if (status === "safe") return "Índice acima da zona de atenção, mantendo acompanhamento mensal.";
  return "Fator R não identificado com confiança suficiente; revisar o PDF manualmente.";
};

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const parse = (txt: string, fileName: string) => {
  const text = `${fileName}\n${txt}`;
  const compact = normalize(text);
  const cnpj = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/)?.[0] ?? null;
  const fator = compact.match(/fator\s*r(?:\s*apurado)?[^\d]{0,40}(\d{1,3}(?:[\.,]\d{1,4})?\s*%?|0[\.,]\d{1,4})/i)?.[1]
    ?? compact.match(/percentual\s*(?:do\s*)?fator\s*r[^\d]{0,40}(\d{1,3}(?:[\.,]\d{1,4})?\s*%?|0[\.,]\d{1,4})/i)?.[1]
    ?? null;
  const fs12 = compact.match(/(?:FS12|folha\s+de\s+sal[aá]rios|folha\s+dos\s+12\s+meses)[^\d]{0,40}(?:R\$\s*)?(\d[\d\.,]*)/i)?.[1] ?? null;
  const rbt12 = compact.match(/(?:RBT12|receita\s+bruta\s+acumulada|receita\s+bruta\s+dos\s+12\s+meses)[^\d]{0,40}(?:R\$\s*)?(\d[\d\.,]*)/i)?.[1] ?? null;
  const ym = compact.match(/(?:per[ií]odo\s*(?:de\s*)?apura[cç][aã]o|\bpa\b|compet[eê]ncia|refer[eê]ncia)[^\d]{0,20}(0?[1-9]|1[0-2])[\/\-_\s](20\d{2})/i)
    || compact.match(/(?:per[ií]odo\s*(?:de\s*)?apura[cç][aã]o|\bpa\b|compet[eê]ncia|refer[eê]ncia)[^\d]{0,20}(20\d{2})[\/\-_\s](0?[1-9]|1[0-2])/i)
    || compact.match(/(20\d{2})[\/\-_\s](0?[1-9]|1[0-2])/) 
    || compact.match(/(0?[1-9]|1[0-2])[\/\-_\s](20\d{2})/);
  const first = ym ? Number(ym[1]) : null;
  const second = ym ? Number(ym[2]) : null;
  const val = fator ? pctToDecimal(fator) : null;
  const companyName = text.match(/(?:raz[aã]o\s*social|nome\s*empresarial|contribuinte)\s*[:\-]?\s*([^\n]{3,120})/i)?.[1]?.replace(/\s*CNPJ\b.*$/i, "").trim() ?? null;
  return {
    cnpj,
    companyName,
    fatorRValue: val,
    fatorRPercent: val !== null ? val * 100 : null,
    payroll12m: parseBrazilianNumber(fs12),
    revenue12m: parseBrazilianNumber(rbt12),
    referenceMonth: first !== null && second !== null ? (first > 12 ? second : first) : null,
    referenceYear: first !== null && second !== null ? (first > 12 ? first : second) : null,
    confidence: val === null ? 0.35 : fs12 || rbt12 ? 0.92 : 0.8,
    warnings: [
      ...(val === null ? ["Fator R não identificado com alta confiança."] : []),
      ...(!ym ? ["Período de apuração não identificado automaticamente."] : []),
    ],
  };
};

async function extractPdf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : String(text)).replace(/\s+/g, " ").trim();
}

const decodeBase64 = (base64: string) => {
  const clean = base64.includes(",") ? base64.split(",").pop()! : base64;
  return Uint8Array.from(atob(clean), (char) => char.charCodeAt(0));
};

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
      const bytes = decodeBase64(file.base64);
      const rawText = await extractPdf(bytes);
      const parsed = parse(rawText, file.name);
      const status = classify(parsed.fatorRValue);
      const resultPayload = {
        fileName: file.name,
        status,
        recommendation: recommendation(status),
        alert: status === "attention" || status === "critical",
        alertFrom,
        alertTo,
        parsed,
      };

      let companyId = null;
      let documentId = null;
      let monthlyResultId = null;

      if (persist) {
        if (parsed.cnpj) {
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
          raw_text: rawText.slice(0, 20000),
          extracted_data: { ...resultPayload, source: "manual_pdf_upload" },
          processing_status: "processed",
          processed_at: new Date().toISOString(),
        }).select("id").single();
        documentId = doc.data?.id ?? null;

        if (companyId && parsed.fatorRValue !== null && parsed.referenceMonth && parsed.referenceYear) {
          const upsert = await supabase.from("fator_r_monthly_results").upsert({
            company_id: companyId,
            document_id: documentId,
            reference_month: parsed.referenceMonth,
            reference_year: parsed.referenceYear,
            fator_r_value: parsed.fatorRValue,
            fator_r_percent: parsed.fatorRPercent,
            payroll_12m: parsed.payroll12m,
            revenue_12m: parsed.revenue12m,
            status,
            recommendation: recommendation(status),
            metadata: { confidence: parsed.confidence, source: "manual_pdf_upload" },
          }, { onConflict: "company_id,reference_month,reference_year" }).select("id").single();
          monthlyResultId = upsert.data?.id ?? null;
        }

        await supabase.from("fator_r_processing_logs").insert({
          document_id: documentId,
          company_id: companyId,
          event_type: "manual_pdf_processed",
          message: `PDF ${file.name} interpretado individualmente pelo teste manual.`,
          payload: resultPayload,
        });
      }

      if (sendAlerts && resultPayload.alert && parsed.confidence >= 0.75) {
        const subject = `[Fator R] ${status === "critical" ? "Crítico" : "Atenção"}: ${(parsed.fatorRPercent ?? 0).toFixed(2)}%`;
        const html = `Olá,<br/><br/>O teste manual identificou Fator R de ${(parsed.fatorRPercent ?? 0).toFixed(2)}% no arquivo <strong>${file.name}</strong>${parsed.referenceMonth && parsed.referenceYear ? `, período ${parsed.referenceMonth}/${parsed.referenceYear}` : ""}.<br/><br/>Status: <strong>${status}</strong>.<br/>${recommendation(status)}<br/><br/>Remetente configurado: ${alertFrom}`;
        const alert: any = persist && companyId ? await supabase.from("fator_r_alerts").insert({
          company_id: companyId,
          monthly_result_id: monthlyResultId,
          alert_type: status,
          recipient_email: alertTo,
          subject,
          body: html,
          status: "pending",
        }).select("id").single() : { data: null };
        const resp = await supabase.functions.invoke("fator-r-send-alert", { body: { to: alertTo, from: alertFrom, subject, html } });
        if (persist && alert.data?.id) {
          await supabase.from("fator_r_alerts").update({
            status: resp.error ? "failed" : "sent",
            sent_at: resp.error ? null : new Date().toISOString(),
            error_message: resp.error?.message ?? null,
          }).eq("id", alert.data.id);
        }
        processed.push({ ...resultPayload, companyId, documentId, monthlyResultId, email: { attempted: true, sent: !resp.error, error: resp.error?.message ?? null } });
      } else {
        processed.push({ ...resultPayload, companyId, documentId, monthlyResultId, email: { attempted: false, sent: false, error: null } });
      }
    }

    return Response.json({ ok: true, processed }, { headers: cors });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: cors });
  }
});
