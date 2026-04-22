import { launch, type Browser } from "@cloudflare/playwright";
import type { Env } from "../types";

export async function withBrowser<T>(env: Env, fn: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await launch(env.gestaoez);
  try {
    return await fn(browser);
  } finally {
    try { await browser.close(); } catch { /* noop */ }
  }
}