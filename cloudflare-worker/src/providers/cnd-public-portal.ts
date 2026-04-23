import type { Page } from "@cloudflare/playwright";
import type { Env, ExecuteJobPayload } from "../types";
import { withBrowser } from "../lib/browser";
import { sendProgress, sendFinal, requestArtifactUpload, uploadArtifactBytes } from "../lib/progress";
import { classifyError } from "../lib/classification";

const PORTAL_URL = "https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir";
const PROVIDER = "provider_public_portal_cnd_cloudflare";

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

export async function runCndLookup(env: Env, payload: ExecuteJobPayload): Promise<void> {
  const start = Date.now();
  let html = "";
  let successPayload: Record<string, unknown> | null = null;
  try {
    await sendProgress(env, { job_id: payload.job_id, step: "navigate", message: "Abrindo portal CND", status: "running", provider: PROVIDER });
    await withBrowser(env, async (browser) => {
      const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (compatible; GestaoEZ-CND/1.0)" });
      const page = await ctx.newPage();
      await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await captureScreenshot(env, payload, page, "cnd_step1");

      html = (await page.content()).toLowerCase();
      if (/captcha|hcaptcha|recaptcha/i.test(html)) {
        throw new Error("captcha detected on landing page");
      }

      await sendProgress(env, { job_id: payload.job_id, step: "submit", message: "Enviando CNPJ", provider: PROVIDER });
      const input = await page.$('input[name="NI"], input[name="cnpj"]');
      if (!input) throw new Error("selector input[name=NI|cnpj] not found");
      await input.fill(payload.cnpj);
      const submit = await page.$('input[type="submit"], button[type="submit"]');
      if (submit) await submit.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
      await captureScreenshot(env, payload, page, "cnd_step2");

      const content = await page.content();
      const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();

      let cnd_status: string = "indisponivel";
      if (/positiva com efeitos de negativa/.test(text)) cnd_status = "positiva_com_efeitos";
      else if (/negativa de d[ée]bitos/.test(text)) cnd_status = "negativa";
      else if (/positiva/.test(text)) cnd_status = "positiva";
      else if (/n[ãa]o.*(emitir|consta)/.test(text)) cnd_status = "nao_emitida";

      const certMatch = content.match(/c[oó]digo de controle[^A-Z0-9]*([A-Z0-9.\-]+)/i);
      const validityMatch = content.match(/v[áa]lida at[ée]\s*(\d{2}\/\d{2}\/\d{4})/i);

      await sendProgress(env, { job_id: payload.job_id, step: "done", message: "Consulta CND concluída", provider: PROVIDER });

      successPayload = {
        job_id: payload.job_id,
        request_id: payload.request_id,
        type: "cnd",
        status: "success",
        cnd_status,
        certificate_number: certMatch?.[1] || null,
        issued_at: new Date().toISOString(),
        valid_until: validityMatch ? toIsoDate(validityMatch[1]) : null,
        source_url: PORTAL_URL,
        raw_payload: { html_excerpt: content.slice(0, 5000) },
        parsed_payload: { cnd_status, certificate_number: certMatch?.[1] || null },
        provider: PROVIDER,
        latency_ms: Date.now() - start,
      };
    });

    if (successPayload) {
      await sendFinal(env, successPayload);
    }
  } catch (err) {
    const c = classifyError(err, html);
    await sendFinal(env, {
      job_id: payload.job_id,
      request_id: payload.request_id,
      type: "cnd",
      status: (c.error_type === "captcha_detected" || c.error_type === "manual_required") ? "manual_required" : "failed",
      error_type: c.error_type,
      error_message: c.message,
      source_url: PORTAL_URL,
      provider: PROVIDER,
      latency_ms: Date.now() - start,
    });
  }
}

function toIsoDate(br: string): string | null {
  const m = br.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}