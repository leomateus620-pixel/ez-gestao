import type { Page } from "@cloudflare/playwright";
import type { Env, ExecuteJobPayload } from "../types";
import { withBrowser } from "../lib/browser";
import { sendProgress, sendFinal, requestArtifactUpload, uploadArtifactBytes } from "../lib/progress";
import { classifyError } from "../lib/classification";
import { findCaptchaImage, findCaptchaInput, solveCaptcha } from "../lib/captcha";

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

async function trySelectors(page: Page, selectors: string[]): Promise<unknown | null> {
  for (const sel of selectors) {
    try {
      const handle = await page.$(sel);
      if (handle) return handle;
    } catch { /* ignore */ }
  }
  return null;
}

function detectCaptcha(text: string): boolean {
  return /captcha|recaptcha|hcaptcha|n[ãa]o sou um rob[oô]/i.test(text);
}

export async function runCndLookup(env: Env, payload: ExecuteJobPayload): Promise<void> {
  const start = Date.now();
  let html = "";
  let successPayload: Record<string, unknown> | null = null;
  try {
    await sendProgress(env, { job_id: payload.job_id, step: "navigate", message: "Abrindo portal CND", status: "running", provider: PROVIDER });
    await withBrowser(env, async (browser) => {
      const page = await browser.newPage();
      try {
        await page.setExtraHTTPHeaders({ "User-Agent": "Mozilla/5.0 (compatible; GestaoEZ-CND/1.0)" });
      } catch { /* ignore: optional */ }
      // Step 1: landing page
      await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await captureScreenshot(env, payload, page, "cnd_step1_landing");
      let landingContent = await page.content();
      html = landingContent.toLowerCase();
      if (detectCaptcha(html)) {
        throw new Error("captcha detected on landing page");
      }

      // Step 2: enter form (click "Emitir Certidão" if there is an intermediate landing)
      await sendProgress(env, { job_id: payload.job_id, step: "enter_form", message: "Acessando formulário CND", provider: PROVIDER });
      const enterFormSelectors = [
        'a:has-text("Emitir Certidão")',
        'button:has-text("Emitir Certidão")',
        'a:has-text("Emitir")',
        'button:has-text("Emitir")',
        'a[href*="emitir" i]',
        'a[href*="Emitir"]',
      ];
      const enterFormEl = await trySelectors(page, enterFormSelectors);
      if (enterFormEl) {
        try {
          await Promise.all([
            page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => null),
            (enterFormEl as { click: () => Promise<void> }).click(),
          ]);
        } catch { /* ignore — may already be on form */ }
      }

      // Step 3: fill CNPJ
      await sendProgress(env, { job_id: payload.job_id, step: "fill_cnpj", message: "Preenchendo CNPJ", provider: PROVIDER });
      const cnpjDigits = payload.cnpj.replace(/\D/g, "");
      const inputSelectors = [
        '#NI',
        'input[name="NI"]',
        'input[name="cnpj"]',
        'input[id*="cnpj" i]',
        'input[type="text"]',
      ];
      const input = await trySelectors(page, inputSelectors);
      if (!input) {
        await captureScreenshot(env, payload, page, "cnd_step2_form_missing");
        throw new Error("layout_changed: input CNPJ not found on form (#NI / input[name=NI])");
      }
      await (input as { fill: (v: string) => Promise<void> }).fill(cnpjDigits);
      await captureScreenshot(env, payload, page, "cnd_step2_form");

      // Step 3b: detect + solve captcha (if present)
      const captchaImg = await findCaptchaImage(page);
      if (captchaImg) {
        await sendProgress(env, { job_id: payload.job_id, step: "solve_captcha", message: "Resolvendo captcha via OCR", provider: PROVIDER });
        await captureScreenshot(env, payload, page, "cnd_step2b_captcha");
        const solved = await solveCaptcha(env, page);
        if (!solved.ok || !solved.text) {
          throw new Error(`captcha_unsolvable: ${solved.reason || "unknown"}`);
        }
        const captchaInput = await findCaptchaInput(page);
        if (!captchaInput) {
          throw new Error("layout_changed: captcha image found but input not found");
        }
        await (captchaInput as { fill: (v: string) => Promise<void> }).fill(solved.text);
        await captureScreenshot(env, payload, page, "cnd_step2c_captcha_filled");
      }

      // Step 4: submit
      await sendProgress(env, { job_id: payload.job_id, step: "submit", message: "Enviando consulta", provider: PROVIDER });
      const submitSelectors = [
        'button:has-text("Consultar")',
        'input[type="submit"][value*="Consultar" i]',
        '#btnConsultar',
        'button[type="submit"]',
        'input[type="submit"]',
      ];
      const submit = await trySelectors(page, submitSelectors);
      if (!submit) {
        throw new Error("layout_changed: submit button not found on form");
      }
      await (submit as { click: () => Promise<void> }).click();

      // Step 5: wait for result page
      await sendProgress(env, { job_id: payload.job_id, step: "wait_result", message: "Aguardando resposta do portal", provider: PROVIDER });
      try {
        await page.waitForLoadState("networkidle", { timeout: 30_000 });
      } catch {
        await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => null);
      }
      // Wait for any known marker in result
      try {
        await page.waitForFunction(
          () => {
            const t = (document.body?.innerText || "").toLowerCase();
            return /certid[ãa]o|c[oó]digo de controle|n[ãa]o consta|captcha|positiva|negativa/i.test(t);
          },
          { timeout: 30_000 }
        );
      } catch { /* timeout — fall through to parse */ }

      await captureScreenshot(env, payload, page, "cnd_step3_result");

      const content = await page.content();
      const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const lower = text.toLowerCase();

      // Step 6: detect captcha on result
      if (detectCaptcha(lower)) {
        throw new Error("captcha detected on result page");
      }

      // Step 7: parse
      let cnd_status: string | null = null;
      if (/positiva com efeitos de negativa/i.test(lower)) cnd_status = "positiva_com_efeitos";
      else if (/negativa de d[ée]bitos|certid[ãa]o negativa/i.test(lower)) cnd_status = "negativa";
      else if (/positiva/i.test(lower)) cnd_status = "positiva";
      else if (/n[ãa]o (consta|foi poss[íi]vel|emitir)/i.test(lower)) cnd_status = "nao_emitida";

      const certMatch = content.match(/c[óo]digo de controle[^A-Z0-9]*([A-Z0-9.\-]{6,})/i);
      const validityMatch = content.match(/v[áa]lida at[ée]\s*(\d{2}\/\d{2}\/\d{4})/i);
      const issuedMatch = content.match(/emitida em\s*(\d{2}\/\d{2}\/\d{4})/i);

      // Step 8: layout_changed if no known markers at all
      if (!cnd_status && !certMatch && !validityMatch) {
        throw new Error("layout_changed: no known markers in result page");
      }

      await sendProgress(env, { job_id: payload.job_id, step: "done", message: "Consulta CND concluída", provider: PROVIDER });

      successPayload = {
        job_id: payload.job_id,
        request_id: payload.request_id,
        type: "cnd",
        status: "success",
        cnd_status: cnd_status || "indisponivel",
        certificate_number: certMatch?.[1] || null,
        issued_at: issuedMatch ? toIsoDate(issuedMatch[1]) : new Date().toISOString(),
        valid_until: validityMatch ? toIsoDate(validityMatch[1]) : null,
        source_url: PORTAL_URL,
        raw_payload: { html_excerpt: content.slice(0, 5000) },
        parsed_payload: {
          cnd_status: cnd_status || "indisponivel",
          certificate_number: certMatch?.[1] || null,
          valid_until: validityMatch ? toIsoDate(validityMatch[1]) : null,
          issued_at: issuedMatch ? toIsoDate(issuedMatch[1]) : null,
        },
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