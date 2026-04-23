import { launch, type Browser } from "@cloudflare/playwright";
import type { Env } from "../types";

export interface WithBrowserOpts {
  maxRetries?: number;
}

/**
 * Launches a Browser Rendering session with bounded retries for 429
 * (rate-limited) errors. Retries exponentially backoff (2s, 4s, 8s + jitter).
 * Runtime-incompatibility errors (fs.mkdtemp / unenv) are not retried — they
 * indicate a code path the Worker runtime cannot execute.
 */
export async function withBrowser<T>(
  env: Env,
  fn: (browser: Browser) => Promise<T>,
  opts: WithBrowserOpts = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const browser = await launch(env.gestaoez);
      try {
        return await fn(browser);
      } finally {
        try { await browser.close(); } catch { /* noop */ }
      }
    } catch (err) {
      lastErr = err;
      const msg = String((err as Error)?.message || err).toLowerCase();
      const is429 = /429|rate.?limit|too many requests/.test(msg);
      const isRuntimeIncompat = /fs\.mkdtemp|\[unenv\]|is not implemented/.test(msg);
      if (isRuntimeIncompat) throw err;
      if (!is429 || attempt === maxRetries) throw err;
      const wait = 2000 * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
      console.warn(`withBrowser: 429 on attempt ${attempt + 1}/${maxRetries + 1}, waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}