import type { Page } from "@cloudflare/playwright";
import type { Env, ExecuteJobPayload } from "../types";
import { withBrowser } from "../lib/browser";
import { sendProgress, sendFinal, requestArtifactUpload, uploadArtifactBytes } from "../lib/progress";
import { findCaptchaImageSmart, solveCaptcha } from "../lib/captcha";

const SPA_URL = "https://servicos.receitafederal.gov.br/servico/certidoes/";
const PROVIDER = "provider_public_portal_cnd_spa_cloudflare";

/**
 * Result-bearing function. Returns a successPayload on success or throws
 * an Error whose message starts with "layout_changed:" / "timeout:" to signal
 * the dispatcher it can fall back to the legacy portal. Other errors
 * (captcha_unsolvable, captcha_failed) propagate as-is and skip fallback.
 */
export async function runCndSpaLookup(
  env: Env,
  payload: ExecuteJobPayload,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  let result: Record<string, unknown> | null = null;

  await sendProgress(env, {
    job_id: payload.job_id, step: "navigate_spa",
    message: "Abrindo SPA nova da Receita (CND)", status: "running", provider: PROVIDER,
  });

  await withBrowser(env, async (browser) => {
    const page = await browser.newPage();
    try {
      await page.setExtraHTTPHeaders({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      });
    } catch { /* optional */ }

    await page.goto(SPA_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 20_000 });
    } catch { /* SPA may keep polling — proceed anyway */ }
    await captureScreenshot(env, payload, page, "cnd_spa_step1_landing");

    // Step: select Pessoa Jurídica
    await sendProgress(env, { job_id: payload.job_id, step: "select_pj", message: "Selecionando Pessoa Jurídica", provider: PROVIDER });
    const clickedPj = await tryClickClickable(page, [/Pessoa\s*Jur[íi]dica/i, /CNPJ/i]);
    if (!clickedPj) {
      await captureScreenshot(env, payload, page, "cnd_spa_no_pj");
      throw new Error("layout_changed: spa_select_pj — botão 'Pessoa Jurídica' não encontrado");
    }

    try {
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
    } catch { /* ignore */ }

    // Step: fill CNPJ
    await sendProgress(env, { job_id: payload.job_id, step: "fill_cnpj_spa", message: "Preenchendo CNPJ (SPA)", provider: PROVIDER });
    const cnpjDigits = payload.cnpj.replace(/\D/g, "");
    const cnpjInput = await trySelectors(page, [
      'input[placeholder*="CNPJ" i]',
      'input[placeholder*="00.000.000" i]',
      'input[name*="cnpj" i]',
      'input[id*="cnpj" i]',
      'input[formcontrolname*="cnpj" i]',
      'input[aria-label*="CNPJ" i]',
    ]);
    if (!cnpjInput) {
      await captureScreenshot(env, payload, page, "cnd_spa_no_input");
      throw new Error("layout_changed: spa_fill_cnpj — input do CNPJ não encontrado");
    }
    await (cnpjInput as { fill: (v: string) => Promise<void> }).fill(cnpjDigits);
    await captureScreenshot(env, payload, page, "cnd_spa_step2_form");

    // Step: detect + solve captcha (mandatory in SPA)
    const { result: captchaFound, report: captchaScan } = await findCaptchaImageSmart(page);
    if (!captchaFound) {
      await captureScreenshot(env, payload, page, "cnd_spa_no_captcha");
      await sendProgress(env, {
        job_id: payload.job_id, step: "solve_captcha_spa",
        message: "Captcha esperado mas não encontrado na SPA",
        provider: PROVIDER, status: "failed",
        details_json: { total_imgs: captchaScan.total_imgs, candidates: captchaScan.candidates.slice(0, 10) },
      });
      throw new Error("layout_changed: spa_no_captcha — captcha esperado mas não encontrado");
    }
    await sendProgress(env, {
      job_id: payload.job_id, step: "solve_captcha_spa",
      message: "Resolvendo captcha via OCR (SPA)", provider: PROVIDER,
      details_json: {
        selector_used: captchaFound.selector_used,
        width: captchaFound.width, height: captchaFound.height,
        src_prefix: captchaFound.src_prefix, alt: captchaFound.alt,
      },
    });
    await captureScreenshot(env, payload, page, "cnd_spa_step2b_captcha");
    const solved = await solveCaptcha(env, page);
    if (!solved.ok || !solved.text) {
      throw new Error(`captcha_unsolvable: ${solved.reason || "unknown"}`);
    }
    const captchaInput = await trySelectors(page, [
      'input[placeholder*="código" i]',
      'input[placeholder*="codigo" i]',
      'input[id*="captcha" i]',
      'input[name*="captcha" i]',
      'input[placeholder*="verifica" i]',
      'input[placeholder*="seguran" i]',
      'input[aria-label*="c\u00f3digo" i]',
    ]);
    if (!captchaInput) {
      throw new Error("layout_changed: spa_captcha_input — campo do código do captcha não encontrado");
    }
    await (captchaInput as { fill: (v: string) => Promise<void> }).fill(solved.text);
    await captureScreenshot(env, payload, page, "cnd_spa_step2c_captcha_filled");

    // Step: submit
    await sendProgress(env, { job_id: payload.job_id, step: "submit_spa", message: "Enviando consulta (SPA)", provider: PROVIDER });
    const submitBtn = await trySelectors(page, [
      'button[type="submit"]:not([disabled])',
      'input[type="submit"]:not([disabled])',
    ]);
    if (submitBtn) {
      await (submitBtn as { click: () => Promise<void> }).click();
    } else {
      const clickedSubmit = await tryClickClickable(page, [/Emitir/i, /Gerar/i, /Consultar/i, /Confirmar/i]);
      if (!clickedSubmit) {
        throw new Error("layout_changed: spa_submit — botão Emitir/Consultar não encontrado");
      }
    }

    // Wait for result
    await sendProgress(env, { job_id: payload.job_id, step: "wait_result_spa", message: "Aguardando resposta (SPA)", provider: PROVIDER });
    try {
      await page.waitForLoadState("networkidle", { timeout: 30_000 });
    } catch { /* may stay busy */ }
    try {
      await page.waitForFunction(
        () => {
          const t = (document.body?.innerText || "").toLowerCase();
          return /certid[ãa]o|c[oó]digo de controle|n[ãa]o consta|positiva|negativa|c[oó]digo (incorreto|inv[áa]lido)/i.test(t);
        },
        { timeout: 30_000 },
      );
    } catch { /* fall through */ }
    await captureScreenshot(env, payload, page, "cnd_spa_step3_result");

    const content = await page.content();
    const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const lower = text.toLowerCase();

    if (/c[oó]digo (incorreto|inv[áa]lido)|captcha (inv[áa]lido|incorreto)/i.test(lower)) {
      throw new Error("captcha_failed: portal rejected OCR text");
    }

    let cnd_status: string | null = null;
    if (/positiva com efeitos de negativa/i.test(lower)) cnd_status = "positiva_com_efeitos";
    else if (/negativa de d[ée]bitos|certid[ãa]o negativa/i.test(lower)) cnd_status = "negativa";
    else if (/positiva/i.test(lower)) cnd_status = "positiva";
    else if (/n[ãa]o (consta|foi poss[íi]vel|emitir)/i.test(lower)) cnd_status = "nao_emitida";

    const certMatch = content.match(/c[óo]digo de controle[^A-Z0-9]*([A-Z0-9.\-]{6,})/i);
    const validityMatch = content.match(/v[áa]lida at[ée]\s*(\d{2}\/\d{2}\/\d{4})/i);
    const issuedMatch = content.match(/emitida em\s*(\d{2}\/\d{2}\/\d{4})/i);

    if (!cnd_status && !certMatch && !validityMatch) {
      throw new Error("layout_changed: spa_result — nenhum marcador conhecido na página de resultado");
    }

    await sendProgress(env, { job_id: payload.job_id, step: "done_spa", message: "Consulta CND concluída (SPA)", provider: PROVIDER });

    result = {
      job_id: payload.job_id,
      request_id: payload.request_id,
      type: "cnd",
      status: "success",
      cnd_status: cnd_status || "indisponivel",
      certificate_number: certMatch?.[1] || null,
      issued_at: issuedMatch ? toIsoDate(issuedMatch[1]) : new Date().toISOString(),
      valid_until: validityMatch ? toIsoDate(validityMatch[1]) : null,
      source_url: SPA_URL,
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

  if (!result) {
    throw new Error("layout_changed: spa_no_result — execução SPA não produziu resultado");
  }

  await sendFinal(env, result);
  return result;
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

/**
 * Click a clickable element (button/role/link/card) matching one of the given
 * text patterns. Avoids clicking generic spans inside institutional layout.
 */
async function tryClickClickable(page: Page, patterns: RegExp[]): Promise<boolean> {
  const roleStrategies = [
    (re: RegExp) => page.getByRole("button").filter({ hasText: re }).first(),
    (re: RegExp) => page.getByRole("link").filter({ hasText: re }).first(),
  ];
  for (const re of patterns) {
    for (const make of roleStrategies) {
      try {
        const loc = make(re);
        const count = await loc.count().catch(() => 0);
        if (count > 0) {
          await loc.click({ timeout: 8_000 });
          return true;
        }
      } catch { /* try next */ }
    }
    // Fallback: clickable containers (mat-card, [role=button], .card) with text
    try {
      const loc = page.locator(
        'button, [role="button"], a, mat-card, .card, .clickable',
      ).filter({ hasText: re }).first();
      const count = await loc.count().catch(() => 0);
      if (count > 0) {
        await loc.click({ timeout: 8_000 });
        return true;
      }
    } catch { /* try next */ }
  }
  return false;
}

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

function toIsoDate(br: string): string | null {
  const m = br.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}