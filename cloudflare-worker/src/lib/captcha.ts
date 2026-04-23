import type { Page } from "@cloudflare/playwright";
import type { Env } from "../types";
import { signHmac } from "./security";

const CAPTCHA_IMG_SELECTORS = [
  'img[src*="captcha" i]',
  'img[alt*="captcha" i]',
  'img[id*="captcha" i]',
  'img[name*="captcha" i]',
  'img[src*="image.aspx" i]',
  'img[src*="hcaptcha"]',
];

export const CAPTCHA_INPUT_SELECTORS = [
  'input[name*="captcha" i]',
  'input[id*="captcha" i]',
  'input[placeholder*="c\u00f3digo" i]',
  'input[placeholder*="codigo" i]',
  'input[placeholder*="imagem" i]',
  'input[name="txtTexto_captcha_serpro_gov_br"]',
];

export async function findCaptchaImage(page: Page): Promise<unknown | null> {
  for (const sel of CAPTCHA_IMG_SELECTORS) {
    try {
      const handle = await page.$(sel);
      if (handle) return handle;
    } catch { /* ignore */ }
  }
  return null;
}

export async function findCaptchaInput(page: Page): Promise<unknown | null> {
  for (const sel of CAPTCHA_INPUT_SELECTORS) {
    try {
      const handle = await page.$(sel);
      if (handle) return handle;
    } catch { /* ignore */ }
  }
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export interface SolveResult {
  ok: boolean;
  text?: string;
  reason?: string;
  attempts?: number;
  latency_ms?: number;
}

/**
 * Captures the captcha image from the page and POSTs it (HMAC-signed) to the
 * Supabase edge function `solve-captcha`. Returns the OCR text or null on
 * failure. Bounded by a 25s timeout.
 */
export async function solveCaptcha(env: Env, page: Page): Promise<SolveResult> {
  const img = await findCaptchaImage(page);
  if (!img) return { ok: false, reason: "no_captcha_image" };

  let pngBytes: Uint8Array;
  try {
    const buf = await (img as { screenshot: (o: { type: string }) => Promise<Uint8Array> })
      .screenshot({ type: "png" });
    pngBytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
  } catch (err) {
    return { ok: false, reason: "screenshot_failed: " + (err instanceof Error ? err.message : String(err)) };
  }

  const base = (env.CALLBACK_BASE_URL || "").replace(/\/$/, "");
  if (!base) return { ok: false, reason: "missing_callback_base" };

  const url = base + "/solve-captcha";
  const body = JSON.stringify({
    image_base64: bytesToBase64(pngBytes),
    min_length: 5,
    max_retries: 2,
  });
  const ts = Date.now().toString();
  const nonce = crypto.randomUUID();
  const sig = await signHmac(env.CALLBACK_HMAC_SECRET, `${ts}.${nonce}.${body}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CF-Signature": sig,
        "X-CF-Timestamp": ts,
        "X-CF-Nonce": nonce,
      },
      body,
      signal: controller.signal,
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return { ok: false, reason: `solve_http_${r.status}: ${txt.slice(0, 200)}` };
    }
    const j = await r.json() as SolveResult;
    if (j.ok && j.text && j.text.length >= 4) return j;
    return { ok: false, reason: j.reason || "low_confidence", attempts: j.attempts, latency_ms: j.latency_ms };
  } catch (err) {
    return { ok: false, reason: "solve_fetch_error: " + (err instanceof Error ? err.message : String(err)) };
  } finally {
    clearTimeout(timeout);
  }
}