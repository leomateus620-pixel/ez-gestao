import type { Page } from "@cloudflare/playwright";
import type { Env, ExecuteJobPayload } from "../types";
import { withBrowser } from "../lib/browser";
import { sendProgress, sendFinal, requestArtifactUpload, uploadArtifactBytes } from "../lib/progress";
import { findCaptchaImageSmart, solveCaptcha } from "../lib/captcha";
import { withRateLimitRetry, jitterDelay } from "../lib/rate-limit";
import { classifyError } from "../lib/classification";

const PORTAL_URL = "https://cndt-certidao.tst.jus.br/inicio.faces";
const PROVIDER = "provider_public_portal_cndt_cloudflare";

/**
 * Provider: Certidão Negativa de Débitos Trabalhistas (CNDT) — TST.
 *
 * Mesmo padrão hardening do cnd-spa-portal.ts:
 *   - withBrowser + withRateLimitRetry + jitterDelay (anti-thundering-herd)
 *   - timeouts rígidos (default 20s, navegação 30s) — nada espera para sempre
 *   - download via waitForEvent("download") com fallback para link visível
 *   - sendFinal sempre disparado (sucesso ou falha classificada)
 *
 * O resultado é gravado nas tabelas `cnd_lookup_requests` / `cnd_lookup_results`
 * com `source_provider='provider_public_portal_cndt_cloudflare'` para distinguir
 * de CND-RFB. O callback aceita `type: "cndt"` (mapeado para a tabela CND no
 * cf-final-callback).
 */
export async function runCndtLookup(env: Env, payload: ExecuteJobPayload): Promise<void> {
  const start = Date.now();
  let result: Record<string, unknown> | null = null;

  await sendProgress(env, {
    job_id: payload.job_id, step: "navigate_cndt",
    message: "Abrindo portal CNDT (TST)", status: "running", provider: PROVIDER,
  });

  await jitterDelay(2_000, 8_000);

  try {
    await withRateLimitRetry(() => withBrowser(env, async (browser) => {
      const page = await browser.newPage();
      try {
        page.setDefaultTimeout(20_000);
        page.setDefaultNavigationTimeout(30_000);
      } catch { /* sync defaults guarded */ }
      try {
        await page.setExtraHTTPHeaders({
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        });
      } catch { /* optional */ }

      try {
        await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
        try {
          await page.waitForLoadState("networkidle", { timeout: 15_000 });
        } catch { /* TST may keep polling */ }
        await captureScreenshot(env, payload, page, "cndt_step1_landing");

        // Step: fill CNPJ
        await sendProgress(env, { job_id: payload.job_id, step: "fill_cnpj_cndt", message: "Preenchendo CNPJ (CNDT)", provider: PROVIDER });
        const cnpjDigits = payload.cnpj.replace(/\D/g, "");
        const docInput = await trySelectors(page, [
          'input[name*="txtCnpjCpf" i]',
          'input[id*="txtCnpjCpf" i]',
          'input[id*="documento" i]',
          'input[name*="documento" i]',
          'input[placeholder*="CNPJ" i]',
          'input[placeholder*="CPF" i]',
          'input[type="text"]',
        ]);
        if (!docInput) {
          await captureScreenshot(env, payload, page, "cndt_no_input");
          throw new Error("layout_changed: cndt_fill_cnpj — input do CNPJ/CPF não encontrado");
        }
        await (docInput as { fill: (v: string) => Promise<void> }).fill(cnpjDigits);
        await captureScreenshot(env, payload, page, "cndt_step2_form");

        // Step: detect + solve captcha
        const { result: captchaFound, report: captchaScan } = await findCaptchaImageSmart(page);
        if (!captchaFound) {
          await captureScreenshot(env, payload, page, "cndt_no_captcha");
          await sendProgress(env, {
            job_id: payload.job_id, step: "solve_captcha_cndt",
            message: "Captcha esperado mas não encontrado no CNDT",
            provider: PROVIDER, status: "failed",
            details_json: { total_imgs: captchaScan.total_imgs, candidates: captchaScan.candidates.slice(0, 10) },
          });
          throw new Error("layout_changed: cndt_no_captcha — captcha esperado mas não encontrado");
        }
        await sendProgress(env, {
          job_id: payload.job_id, step: "solve_captcha_cndt",
          message: "Resolvendo captcha via OCR (CNDT)", provider: PROVIDER,
          details_json: {
            selector_used: captchaFound.selector_used,
            width: captchaFound.width, height: captchaFound.height,
            src_prefix: captchaFound.src_prefix, alt: captchaFound.alt,
          },
        });
        await captureScreenshot(env, payload, page, "cndt_step2b_captcha");
        const solved = await solveCaptcha(env, page);
        if (!solved.ok || !solved.text) {
          throw new Error(`captcha_unsolvable: ${solved.reason || "unknown"}`);
        }
        const captchaInput = await trySelectors(page, [
          'input[id*="captcha" i]',
          'input[name*="captcha" i]',
          'input[placeholder*="código" i]',
          'input[placeholder*="codigo" i]',
          'input[placeholder*="verifica" i]',
          'input[placeholder*="seguran" i]',
          'input[aria-label*="c\u00f3digo" i]',
        ]);
        if (!captchaInput) {
          throw new Error("layout_changed: cndt_captcha_input — campo do código do captcha não encontrado");
        }
        await (captchaInput as { fill: (v: string) => Promise<void> }).fill(solved.text);
        await captureScreenshot(env, payload, page, "cndt_step2c_captcha_filled");

        // Step: submit (Emitir Certidão)
        await sendProgress(env, { job_id: payload.job_id, step: "submit_cndt", message: "Enviando consulta (CNDT)", provider: PROVIDER });
        const downloadPromise = page.waitForEvent("download", { timeout: 25_000 }).catch(() => null);
        const submitBtn = await trySelectors(page, [
          'button[type="submit"]:not([disabled])',
          'input[type="submit"]:not([disabled])',
          'button[id*="emitir" i]',
          'input[id*="emitir" i]',
          'input[value*="Emitir" i]',
        ]);
        if (submitBtn) {
          try { await (submitBtn as { click: () => Promise<void> }).click(); } catch { /* try fallback below */ }
        } else {
          const clickedSubmit = await tryClickClickable(page, [/Emitir/i, /Consultar/i, /Gerar/i]);
          if (!clickedSubmit) {
            throw new Error("layout_changed: cndt_submit — botão Emitir/Consultar não encontrado");
          }
        }

        // Capture PDF download (best-effort, with fallback for link-based downloads)
        let pdfArtifactPath: string | null = null;
        let pdfSize = 0;
        try {
          let download = await downloadPromise;
          if (!download) {
            await page.waitForTimeout(2_000);
            const dlEl = await trySelectors(page, [
              'a[href$=".pdf"]',
              'a[href*=".pdf?"]',
              'a:has-text("Baixar")',
              'a:has-text("Download")',
              'button:has-text("Baixar")',
              'a:has-text("Certidão")',
            ]);
            if (dlEl) {
              const retryDownload = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
              try { await (dlEl as { click: (opts?: unknown) => Promise<void> }).click({ timeout: 5_000 }); } catch { /* best-effort */ }
              download = await retryDownload;
            }
          }
          if (download) {
            await sendProgress(env, {
              job_id: payload.job_id, step: "download_pdf_cndt",
              message: "Recebendo PDF da CNDT", provider: PROVIDER,
            });
            const stream = await (download as { createReadStream: () => Promise<ReadableStream<Uint8Array> | null> })
              .createReadStream().catch(() => null);
            let pdfBytes: Uint8Array | null = null;
            if (stream) {
              const chunks: Uint8Array[] = [];
              const reader = stream.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
              }
              pdfBytes = concatUint8(chunks);
            }
            if (pdfBytes && pdfBytes.byteLength > 0) {
              pdfSize = pdfBytes.byteLength;
              const ticket = await requestArtifactUpload(env, {
                job_id: payload.job_id, artifact_type: "pdf",
                filename: `cndt_${cnpjDigits}_${Date.now()}.pdf`,
                mime_type: "application/pdf",
              });
              if (ticket) {
                const okUpload = await uploadArtifactBytes(ticket.upload_url, pdfBytes, "application/pdf");
                if (okUpload) pdfArtifactPath = ticket.path;
              }
            }
            await sendProgress(env, {
              job_id: payload.job_id, step: "download_pdf_cndt",
              status: pdfArtifactPath ? "success" : "warning",
              level: pdfArtifactPath ? "info" : "warning",
              message: pdfArtifactPath ? "PDF CNDT salvo no storage" : "Download chegou mas upload falhou",
              provider: PROVIDER,
              details_json: { size_bytes: pdfSize, artifact_path: pdfArtifactPath },
            });
          }
        } catch { /* best-effort */ }

        // Wait for result
        await sendProgress(env, { job_id: payload.job_id, step: "wait_result_cndt", message: "Aguardando resposta (CNDT)", provider: PROVIDER });
        try {
          await page.waitForLoadState("networkidle", { timeout: 15_000 });
        } catch { /* may stay busy */ }
        try {
          await page.waitForFunction(
            () => {
              const t = (document.body?.innerText || "").toLowerCase();
              return /certid[ãa]o|n[ãa]o consta|consta como devedor|positiva|negativa|c[oó]digo (incorreto|inv[áa]lido)/i.test(t);
            },
            { timeout: 15_000 },
          );
        } catch { /* fall through */ }
        await captureScreenshot(env, payload, page, "cndt_step3_result");

        const content = await page.content();
        const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        const lower = text.toLowerCase();

        if (/c[oó]digo (incorreto|inv[áa]lido)|captcha (inv[áa]lido|incorreto)/i.test(lower)) {
          throw new Error("captcha_failed: portal rejected OCR text");
        }

        let cnd_status: string | null = null;
        if (/n[ãa]o consta como (inadimplente|devedor)|certid[ãa]o negativa/i.test(lower)) cnd_status = "negativa";
        else if (/consta como (inadimplente|devedor)|certid[ãa]o positiva/i.test(lower)) cnd_status = "positiva";
        else if (/positiva com efeitos de negativa/i.test(lower)) cnd_status = "positiva_com_efeitos";
        else if (/n[ãa]o (foi poss[íi]vel|consta|emitir)/i.test(lower)) cnd_status = "nao_emitida";

        const certMatch = content.match(/n[uú]mero(?:\s+da)?\s+certid[ãa]o[^A-Z0-9]*([A-Z0-9.\-/]{6,})/i)
          || content.match(/certid[ãa]o\s*n[º°ºo.]*\s*([A-Z0-9.\-/]{6,})/i);
        const validityMatch = content.match(/v[áa]lida\s+at[ée]\s*(\d{2}\/\d{2}\/\d{4})/i);
        const issuedMatch = content.match(/emit[ií]da\s+(?:em|aos)\s*(\d{2}\/\d{2}\/\d{4})/i)
          || content.match(/data\s+da\s+emiss[ãa]o[^0-9]*(\d{2}\/\d{2}\/\d{4})/i);

        // PDF presence is strong signal of negativa (TST só emite PDF para negativa)
        if (!cnd_status && pdfArtifactPath) cnd_status = "negativa";
        if (!cnd_status && !certMatch && !validityMatch && !pdfArtifactPath) {
          throw new Error("layout_changed: cndt_result — nenhum marcador conhecido na página de resultado");
        }

        await sendProgress(env, { job_id: payload.job_id, step: "done_cndt", message: "Consulta CNDT concluída", provider: PROVIDER });

        result = {
          job_id: payload.job_id,
          request_id: payload.request_id,
          type: "cndt",
          status: "success",
          cnd_status: cnd_status || "indisponivel",
          certificate_number: certMatch?.[1] || null,
          issued_at: issuedMatch ? toIsoDate(issuedMatch[1]) : new Date().toISOString(),
          valid_until: validityMatch ? toIsoDate(validityMatch[1]) : null,
          source_url: PORTAL_URL,
          pdf_path: pdfArtifactPath,
          raw_payload: { html_excerpt: content.slice(0, 5000), pdf_artifact_path: pdfArtifactPath, pdf_size_bytes: pdfSize },
          parsed_payload: {
            cnd_status: cnd_status || "indisponivel",
            certificate_number: certMatch?.[1] || null,
            valid_until: validityMatch ? toIsoDate(validityMatch[1]) : null,
            issued_at: issuedMatch ? toIsoDate(issuedMatch[1]) : null,
            certificate_pdf_path: pdfArtifactPath,
          },
          provider: PROVIDER,
          latency_ms: Date.now() - start,
        };
      } finally {
        await page.close().catch(() => {});
      }
    }), 2, (attempt, waitMs, err) => sendProgress(env, {
      job_id: payload.job_id,
      step: "retry_rate_limit",
      level: "warning",
      message: `Browser Rendering em limite de taxa; retry ${attempt} em ${Math.round(waitMs / 1000)}s`,
      provider: PROVIDER,
      details_json: { error: String((err as Error)?.message || err) },
    }));

    if (result) {
      await sendFinal(env, result);
    } else {
      throw new Error("layout_changed: cndt_no_result — execução CNDT não produziu resultado");
    }
  } catch (err) {
    const c = classifyError(err, "");
    await sendFinal(env, {
      job_id: payload.job_id,
      request_id: payload.request_id,
      type: "cndt",
      status: (c.error_type === "captcha_detected"
        || c.error_type === "captcha_unsolvable"
        || c.error_type === "captcha_failed"
        || c.error_type === "manual_required") ? "manual_required" : "failed",
      error_type: c.error_type,
      error_message: c.message,
      source_url: PORTAL_URL,
      provider: PROVIDER,
      latency_ms: Date.now() - start,
    });
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

async function tryClickClickable(page: Page, patterns: RegExp[]): Promise<boolean> {
  for (const re of patterns) {
    try {
      const loc = page.getByRole("button").filter({ hasText: re }).first();
      const count = await loc.count().catch(() => 0);
      if (count > 0) {
        await loc.click({ timeout: 8_000 });
        return true;
      }
    } catch { /* try next */ }
    try {
      const loc = page.locator('button, [role="button"], a, input[type="submit"]')
        .filter({ hasText: re }).first();
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

function concatUint8(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}