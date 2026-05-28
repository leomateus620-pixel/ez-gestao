// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const DRIVE_GW = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ALLOWED = new Set(["application/pdf", "text/plain", "text/csv", "application/xml"]);

const reqEnv = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Secret ausente: ${name}`);
  return v;
};

const gwHeaders = (key: string) => ({
  Authorization: `Bearer ${reqEnv("LOVABLE_API_KEY")}`,
  "X-Connection-Api-Key": key,
  "Content-Type": "application/json",
});

const pctToDecimal = (value: string) => {
  const n = value.trim().replace("%", "").replace(".", "").replace(",", ".");
  const raw = Number(n);
  return Number.isNaN(raw) ? null : value.includes("%") || raw > 1 ? raw / 100 : raw;
};

const parse = (txt: string, fileName: string) => {
  const text = `${fileName}\n${txt}`;
  const cnpj = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/)?.[0] ?? null;
  const fator = text.match(/fator\s*r[^\d]*(\d{1,2}(?:[\.,]\d{1,2})?%?|0[\.,]\d{1,4})/i)?.[1] ?? null;
  const ym = text.match(/(20\d{2})[\/_\-\s](0?[1-9]|1[0-2])/) || text.match(/(0?[1-9]|1[0-2])[\/_\-\s](20\d{2})/);
  const val = fator ? pctToDecimal(fator) : null;
  const [month, year] = ym ? (Number(ym[1]) > 12 ? [Number(ym[2]), Number(ym[1])] : [Number(ym[1]), Number(ym[2])]) : [null, null];
  return { cnpj, fatorRValue: val, fatorRPercent: val ? val * 100 : null, referenceMonth: month, referenceYear: year, confidence: val ? 0.84 : 0.35 };
};

async function extractPdf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : String(text)).replace(/\s+/g, " ").trim();
}

async function listFolderFiles(folderId: string, driveKey: string) {
  const q = `'${folderId}' in parents and trashed=false`;
  const listRes = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink,createdTime,parents)&pageSize=100`, { headers: gwHeaders(driveKey) });
  if (!listRes.ok) throw new Error(`Falha ao listar Drive: HTTP ${listRes.status}`);
  const payload = await listRes.json() as any;
  return (payload.files ?? []).filter((f: any) => ALLOWED.has(f.mimeType));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(reqEnv("SUPABASE_URL"), reqEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const driveKey = reqEnv("GOOGLE_DRIVE_API_KEY");
    const globalFolderId = reqEnv("GOOGLE_DRIVE_FOLDER_ID");

    const { data: config } = await supabase.from("fator_r_sync_config").select("*").limit(1).maybeSingle();
    if (config?.sync_enabled === false) return Response.json({ ok: true, skipped: true, reason: "sync_disabled" });

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

      const docIns = await supabase.from("fator_r_documents").insert({
        drive_file_id: file.id,
        drive_file_name: file.name,
        drive_mime_type: file.mimeType,
        drive_web_url: file.webViewLink,
        processing_status: "processing",
        extracted_data: { source_folder_id: file.sourceFolderId },
      }).select("*").single();
      if (docIns.error || !docIns.data) continue;

      try {
        const dl = await fetch(`${DRIVE_GW}/files/${file.id}?alt=media`, { headers: gwHeaders(driveKey) });
        if (!dl.ok) throw new Error(`download_failed_${dl.status}`);

        const bytes = new Uint8Array(await dl.arrayBuffer());
        const rawText = file.mimeType === "application/pdf" ? await extractPdf(bytes) : new TextDecoder().decode(bytes);
        const parsed = parse(rawText, file.name);

        let companyId = file.sourceCompanyId;
        if (!companyId && parsed.cnpj) {
          const norm = parsed.cnpj.replace(/\D/g, "");
          const { data: company } = await supabase.from("fator_r_companies").select("id").eq("normalized_cnpj", norm).maybeSingle();
          if (company) companyId = company.id;
          else {
            const created = await supabase.from("fator_r_companies").insert({ name: `Empresa ${norm}`, cnpj: parsed.cnpj, normalized_cnpj: norm, active: true }).select("id").single();
            companyId = created.data?.id ?? null;
          }
        }

        await supabase.from("fator_r_documents").update({
          company_id: companyId,
          file_month: parsed.referenceMonth,
          file_year: parsed.referenceYear,
          detected_cnpj: parsed.cnpj,
          extraction_confidence: parsed.confidence,
          raw_text: rawText.slice(0, 20000),
          extracted_data: { ...parsed, source_folder_id: file.sourceFolderId },
          processing_status: "processed",
          processed_at: new Date().toISOString(),
        }).eq("id", docIns.data.id);

        if (companyId && parsed.fatorRValue !== null && parsed.referenceMonth && parsed.referenceYear) {
          const { data: company } = await supabase.from("fator_r_companies").select("*").eq("id", companyId).single();
          const status = parsed.fatorRValue <= Number(company.alert_threshold_critical)
            ? "critical"
            : parsed.fatorRValue <= Number(company.alert_threshold_attention)
              ? "attention"
              : "safe";
          const recommendation = status === "critical"
            ? "Índice crítico: recomenda-se revisão imediata de pró-labore, folha e encargos."
            : status === "attention"
              ? "Índice em atenção: recomenda-se revisão preventiva."
              : "Índice em faixa segura no cenário atual.";

          const upsert = await supabase.from("fator_r_monthly_results").upsert({
            company_id: companyId,
            document_id: docIns.data.id,
            reference_month: parsed.referenceMonth,
            reference_year: parsed.referenceYear,
            fator_r_value: parsed.fatorRValue,
            fator_r_percent: parsed.fatorRPercent,
            status,
            recommendation,
            metadata: { confidence: parsed.confidence, source_folder_id: file.sourceFolderId },
          }, { onConflict: "company_id,reference_month,reference_year" }).select("*").single();

          if (company.active && parsed.confidence >= 0.75 && status !== "safe") {
            const recipients = [company.responsible_email, ...(company.secondary_emails ?? []), Deno.env.get("FATOR_R_ALERT_DEFAULT_RECIPIENT")].filter(Boolean);
            for (const recipient of recipients) {
              const subject = `[Fator R] ${status === "critical" ? "Crítico" : "Atenção"}: ${company.name} em ${(parsed.fatorRPercent ?? 0).toFixed(2)}%`;
              const body = `Olá,\n\nO sistema identificou que a empresa ${company.name} apresentou Fator R de ${(parsed.fatorRPercent ?? 0).toFixed(2)}% no período ${parsed.referenceMonth}/${parsed.referenceYear}.\n\nStatus: ${status}.\n\nEste é um alerta automatizado de apoio à análise contábil. A decisão final deve ser validada pelo responsável contábil.`;
              const { error: alertErr } = await supabase.from("fator_r_alerts").insert({ company_id: companyId, monthly_result_id: upsert.data?.id, alert_type: status, recipient_email: recipient, subject, body, status: "pending" });
              if (!alertErr && config?.email_alerts_enabled !== false) {
                const resp = await supabase.functions.invoke("fator-r-send-alert", { body: { to: recipient, subject, html: body.replace(/\n/g, "<br/>") } });
                await supabase.from("fator_r_alerts").update({
                  status: resp.error ? "failed" : "sent",
                  sent_at: resp.error ? null : new Date().toISOString(),
                  error_message: resp.error?.message ?? null,
                }).eq("company_id", companyId).eq("monthly_result_id", upsert.data?.id).eq("alert_type", status).eq("recipient_email", recipient);
              }
            }
          }
        }

        await supabase.from("fator_r_processing_logs").insert({
          document_id: docIns.data.id,
          company_id: companyId,
          event_type: "file_processed",
          message: `Arquivo ${file.name} processado com sucesso.`,
          payload: { source_folder_id: file.sourceFolderId },
        });
        processed += 1;
      } catch (e) {
        await supabase.from("fator_r_documents").update({ processing_status: "failed", error_message: String(e) }).eq("id", docIns.data.id);
      }
    }

    await supabase.from("fator_r_sync_config").upsert({
      id: config?.id,
      sync_enabled: config?.sync_enabled ?? true,
      email_alerts_enabled: config?.email_alerts_enabled ?? true,
      last_run_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, processed, found: allFiles.length });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: cors });
  }
});
