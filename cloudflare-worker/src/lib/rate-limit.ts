/**
 * Rate-limit mitigation helpers for Cloudflare Browser Rendering.
 *
 * Browser Rendering enforces ~2 concurrent sessions and ~10 req/min on the
 * default plan. When a Worker exceeds these limits, `launch()` rejects with
 * a 429 / "rate limit" / "quota" error. We retry with exponential backoff
 * and add a small pre-execution jitter to spread bursts across time.
 *
 * Budget: stays under the 5min `executionCtx.waitUntil` envelope.
 * 2 retries × max 60s = 120s + actual job time. Safe.
 */

const RATE_LIMIT_PATTERNS = [
  /\b429\b/,
  /rate.?limit/i,
  /quota/i,
  /too many requests/i,
  /browser rendering.*(?:limit|quota|exceed)/i,
];

export function isRateLimitError(err: unknown): boolean {
  const msg = String((err as Error)?.message || err);
  if ((err as { status?: number })?.status === 429) return true;
  return RATE_LIMIT_PATTERNS.some((re) => re.test(msg));
}

/**
 * Wraps an async fn with bounded retries on rate-limit errors only. Other
 * errors propagate immediately. Backoff: 30s → 60s + 0–5s jitter.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  onRetry?: (attempt: number, waitMs: number, err: unknown) => Promise<void> | void,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err) || attempt === maxRetries) throw err;
      const baseMs = attempt === 0 ? 30_000 : 60_000;
      const jitter = Math.floor(Math.random() * 5_000);
      const wait = baseMs + jitter;
      console.warn(
        `withRateLimitRetry: rate-limited on attempt ${attempt + 1}/${maxRetries + 1}, waiting ${wait}ms`,
      );
      await onRetry?.(attempt + 1, wait, err);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/**
 * Random delay in [minMs, maxMs] to spread concurrent jobs over time and
 * avoid the "thundering herd" pattern of multiple Workers hitting Browser
 * Rendering simultaneously.
 */
export async function jitterDelay(minMs: number, maxMs: number): Promise<void> {
  const wait = minMs + Math.floor(Math.random() * Math.max(0, maxMs - minMs));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}