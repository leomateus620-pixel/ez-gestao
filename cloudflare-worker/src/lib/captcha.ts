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
  'img[src^="data:image"]',
  'img[alt*="imagem" i]',
  'img[alt*="verifica" i]',
  'img[alt*="seguran" i]',
  'img[alt*="c\u00f3digo" i]',
  'img[title*="captcha" i]',
  'img[title*="imagem" i]',
  'canvas',
];

export const CAPTCHA_INPUT_SELECTORS = [
  'input[name*="captcha" i]',
  'input[id*="captcha" i]',
  'input[placeholder*="c\u00f3digo" i]',
  'input[placeholder*="codigo" i]',
  'input[placeholder*="imagem" i]',
  'input[name="txtTexto_captcha_serpro_gov_br"]',
  'input[placeholder*="verifica" i]',
  'input[placeholder*="seguran" i]',
  'input[aria-label*="c\u00f3digo" i]',
  'input[aria-label*="captcha" i]',
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

export interface CaptchaFindResult {
  handle: unknown;
  selector_used: string;
  width?: number;
  height?: number;
  src_prefix?: string;
  alt?: string;
}

export interface CaptchaScanReport {
  total_imgs: number;
  candidates: Array<{ src_prefix: string; alt: string; w: number; h: number }>;
}

/**
 * Smart captcha finder. First tries known selectors; if none match, scans
 * every <img> on the page and applies dimension + src heuristics typical of
 * captcha images (60-300px wide, 20-100px tall, data: URL, or src containing
 * captcha/image/imagem/.aspx). Excludes obvious logos.
 */
export async function findCaptchaImageSmart(
  page: Page,
): Promise<{ result: CaptchaFindResult | null; report: CaptchaScanReport }> {
  // Try strict selectors first.
  for (const sel of CAPTCHA_IMG_SELECTORS) {
    try {
      const handle = await page.$(sel);
      if (handle) {
        const meta = await page.evaluate((s) => {
          const el = document.querySelector(s) as HTMLImageElement | HTMLCanvasElement | null;
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const src = (el as HTMLImageElement).src || "";
          const alt = (el as HTMLImageElement).alt || "";
          return { w: Math.round(rect.width), h: Math.round(rect.height), src: src.slice(0, 50), alt };
        }, sel).catch(() => null);
        return {
          result: {
            handle, selector_used: sel,
            width: meta?.w, height: meta?.h,
            src_prefix: meta?.src, alt: meta?.alt,
          },
          report: { total_imgs: 0, candidates: [] },
        };
      }
    } catch { /* ignore */ }
  }

  // Heuristic scan over all <img>.
  const scan = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    const all = imgs.map((el, idx) => {
      const r = el.getBoundingClientRect();
      return {
        idx,
        src: (el.getAttribute("src") || "").slice(0, 200),
        alt: el.getAttribute("alt") || "",
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    const isLogo = (alt: string, src: string) =>
      /logo|receita federal|minist[ée]rio|gov\.br|brand/i.test(alt) ||
      /logo|brand|gov\.br\/static/i.test(src);
    const candidates = all.filter((a) =>
      !isLogo(a.alt, a.src) &&
      a.w >= 60 && a.w <= 320 &&
      a.h >= 18 && a.h <= 120 &&
      (
        a.src.startsWith("data:image") ||
        /\/(captcha|image|imagem)/i.test(a.src) ||
        /\.aspx/i.test(a.src) ||
        a.src === ""
      )
    );
    return {
      total: all.length,
      candidates: candidates.map((c) => ({ idx: c.idx, src_prefix: c.src.slice(0, 50), alt: c.alt, w: c.w, h: c.h })),
    };
  }).catch(() => ({ total: 0, candidates: [] as Array<{ idx: number; src_prefix: string; alt: string; w: number; h: number }> }));

  const report: CaptchaScanReport = {
    total_imgs: scan.total,
    candidates: scan.candidates.map((c) => ({ src_prefix: c.src_prefix, alt: c.alt, w: c.w, h: c.h })),
  };

  if (scan.candidates.length === 0) {
    return { result: null, report };
  }

  // Pick the first candidate; bind via :nth-of-type using its index in document order.
  const pick = scan.candidates[0];
  try {
    const handle = await page.evaluateHandle((i) => {
      const list = document.querySelectorAll("img");
      return list[i] || null;
    }, pick.idx);
    if (handle) {
      return {
        result: {
          handle, selector_used: `heuristic:img#${pick.idx}`,
          width: pick.w, height: pick.h,
          src_prefix: pick.src_prefix, alt: pick.alt,
        },
        report,
      };
    }
  } catch { /* fall through */ }

  return { result: null, report };
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