import type { Browser, Page } from "@cloudflare/playwright";
import type { Env, ExecuteJobPayload } from "../types";
import { withBrowser } from "../lib/browser";
import { sendProgress, sendFinal, requestArtifactUpload, uploadArtifactBytes } from "../lib/progress";
import { classifyError } from "../lib/classification";

const PORTAL_URL = "https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp";
const PROVIDER = "provider_public_portal_cnpj_cloudflare";

async function captureScreenshot(env: Env, payload: ExecuteJobPayload, page: Page, label: string): Promise<string | null> {
  try {
    const buf = await page.screenshot({ type: "png", fullPage: false });
    const ticket = await requestArtifactUpload(env, {
      job_id: payload.job_id, artifact_type: "screenshot",
      filename: `${label}.png`, mime_type: "image/png",
    });
    if (!ticket) return null;
    const ok = await uploadArtifactBytes(ticket.upload_url, buf, "image/png");
    return ok ? ticket.path : null;
  } catch {
    return null;
  }
}

export async function runCnpjLookup(env: Env, payload: ExecuteJobPayload): Promise<void> {
  const start = Date.now();
  const sourceUrl = PORTAL_URL;
  let html = "";

  try {
    await sendProgress(env, { job_id: payload.job_id, step: "navigate", message: "Abrindo portal CNPJ", status: "running", provider: PROVIDER });

    await withBrowser(env, async (browser) => {
      const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (compatible; GestaoEZ-CNPJ/1.0)" });
      const page = await ctx.newPage();
      await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await captureScreenshot(env, payload, page, "step1_portal");

      // Detect captcha early
      html = (await page.content()).toLowerCase();
      if (/captcha|hcaptcha|recaptcha/i.test(html)) {
        throw new Error("captcha detected on landing page");
      }

      await sendProgress(env, { job_id: payload.job_id, step: "submit", message: "Enviando CNPJ", provider: PROVIDER });

      // Best-effort: form fields can change. We attempt common selectors.
      const cnpjInput = await page.$('input[name="cnpj"]');
      if (!cnpjInput) throw new Error("selector input[name=cnpj] not found");
      await cnpjInput.fill(payload.cnpj);

      const submit = await page.$('input[type="submit"], button[type="submit"]');
      if (submit) await submit.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
      await captureScreenshot(env, payload, page, "step2_result");

      await sendProgress(env, { job_id: payload.job_id, step: "parse", message: "Extraindo dados", provider: PROVIDER });
      const content = await page.content();
      html = content;

      // Heuristic parsing — portal returns a printable HTML; fields vary.
      // This intentionally captures the raw HTML in raw_payload and lets the
      // backend parser refine. Confidence kept conservative.
      const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const grab = (re: RegExp) => (text.match(re)?.[1] || "").trim();

      const parsed = {
        official_name: grab(/NOME EMPRESARIAL\s*([^\n]+?)\s+(?:T[ÍI]TULO|DATA|CNAE|NATUREZA)/i),
        trade_name: grab(/NOME DE FANTASIA\s*([^\n]+?)\s+(?:DATA|CNAE)/i),
        registration_status: grab(/SITUA[ÇC][ÃA]O CADASTRAL\s*([A-ZÇÃÉÁÍÓÚÊÔÂ]+)/i),
        opening_date: grab(/DATA DE ABERTURA\s*(\d{2}\/\d{2}\/\d{4})/i),
        legal_nature: grab(/NATUREZA JUR[IÍ]DICA\s*([^\n]+?)\s+(?:LOGRADOURO|CAPITAL)/i),
        main_cnae: grab(/ATIVIDADE ECON[OÔ]MICA PRINCIPAL\s*([^\n]+?)\s+(?:C[ÓO]DIGO|ATIVIDADE)/i),
      };
      const filled = Object.values(parsed).filter(Boolean).length;
      const confidence = filled / 6;

      await sendProgress(env, { job_id: payload.job_id, step: "done", message: "Consulta concluída", provider: PROVIDER });

      await sendFinal(env, {
        job_id: payload.job_id,
        request_id: undefined, // resolved via job_id->target_request_id (see fallback below)
        type: "cnpj",
        status: "success",
        official_name: parsed.official_name || null,
        trade_name: parsed.trade_name || null,
        registration_status: parsed.registration_status || null,
        opening_date: parsed.opening_date ? toIsoDate(parsed.opening_date) : null,
        legal_nature: parsed.legal_nature || null,
        main_cnae: parsed.main_cnae || null,
        secondary_cnaes: [],
        qsa: [],
        address: {},
        source_url: sourceUrl,
        raw_payload: { html_excerpt: content.slice(0, 5000) },
        parsed_payload: parsed,
        parsed_confidence: confidence,
        provider: PROVIDER,
        latency_ms: Date.now() - start,
      });
    });
  } catch (err) {
    const c = classifyError(err, html);
    await sendFinal(env, {
      job_id: payload.job_id,
      type: "cnpj",
      status: c.error_type === "captcha_detected" ? "manual_required" : "failed",
      error_type: c.error_type,
      error_message: c.message,
      source_url: sourceUrl,
      provider: PROVIDER,
      latency_ms: Date.now() - start,
    });
  }
}

function toIsoDate(br: string): string | null {
  const m = br.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}