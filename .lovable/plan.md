

# Conteúdo final dos arquivos do Worker — copie 1:1 para seu local

Todos os arquivos abaixo estão no estado correto neste projeto Lovable. Seu local está antigo (ainda tem `BUILD_ID = "2026-04-22-debug-sign-v2"`). Substitua cada arquivo pelo conteúdo exato abaixo.

Depois rode:

```bash
cd cloudflare-worker
rm -rf node_modules package-lock.json
npm install
wrangler deploy
```

Após o deploy, valide em `https://gestaoez.leomateus620.workers.dev/health` que:
- `build_id` = `"2026-04-23-runtime-fix-v2-newpage"`
- `callback_base_valid` = `true`

Me devolva o JSON do `/health` e eu disparo o dry-run.

---

## 1. `cloudflare-worker/src/index.ts`

```ts
import { Hono } from "hono";
import type { Env, ExecuteJobPayload } from "./types";
import { verifyHmac } from "./lib/security";
import { runCnpjLookup } from "./providers/cnpj-public-portal";
import { runCndLookup } from "./providers/cnd-public-portal";
import { sendFinal } from "./lib/progress";

const app = new Hono<{ Bindings: Env }>();

const BUILD_ID = "2026-04-23-runtime-fix-v2-newpage";

function validateCallbackBase(raw: string | undefined | null) {
  if (!raw) return { value: null, valid: false, issue: "missing" as const };
  if (/[\x00-\x1F\x7F]/.test(raw)) {
    return { value: raw, valid: false, issue: "control_chars" as const };
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return { value: raw, valid: false, issue: "not_https" as const };
    return { value: raw, valid: true, issue: null };
  } catch {
    return { value: raw, valid: false, issue: "invalid_url" as const };
  }
}

app.get("/health", (c) => {
  const cb = validateCallbackBase(c.env.CALLBACK_BASE_URL);
  return c.json({
    ok: true,
    version: c.env.VERSION || "1.0.0",
    build_id: BUILD_ID,
    browser_binding: "gestaoez",
    has_lovable_secret: !!c.env.LOVABLE_HMAC_SECRET,
    has_callback_secret: !!c.env.CALLBACK_HMAC_SECRET,
    callback_base: cb.value,
    callback_base_valid: cb.valid,
    callback_base_issue: cb.issue,
    has_debug_sign: true,
  });
});

app.get("/version", (c) => c.json({ version: c.env.VERSION || "1.0.0" }));

app.post("/debug-sign", async (c) => {
  const { ts, nonce, body } = await c.req.json().catch(() => ({} as any));
  if (!ts || !nonce || typeof body !== "string") {
    return c.json({ error: "missing_fields", required: ["ts", "nonce", "body"] }, 400);
  }
  const { signHmac } = await import("./lib/security");
  const canonical = `${ts}.${nonce}.${body}`;
  const sig = await signHmac(c.env.LOVABLE_HMAC_SECRET || "", canonical);
  const secretBytes = new TextEncoder().encode(c.env.LOVABLE_HMAC_SECRET || "");
  const secretHash = await crypto.subtle.digest("SHA-256", secretBytes);
  const fingerprint = Array.from(new Uint8Array(secretHash))
    .slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
  return c.json({
    signature: sig,
    canonical_payload: canonical,
    secret_fingerprint: fingerprint,
    secret_length: (c.env.LOVABLE_HMAC_SECRET || "").length,
    has_secret: !!c.env.LOVABLE_HMAC_SECRET,
  });
});

app.post("/execute-job", async (c) => {
  const raw = await c.req.text();
  const sig = c.req.header("x-lovable-signature") || "";
  const ts = c.req.header("x-lovable-timestamp") || "";
  const nonce = c.req.header("x-lovable-nonce") || "";

  const tsNum = parseInt(ts);
  if (!tsNum || Math.abs(Date.now() - tsNum) > 5 * 60_000) {
    return c.json({ error: "stale_timestamp" }, 401);
  }
  const ok = await verifyHmac(c.env.LOVABLE_HMAC_SECRET, `${ts}.${nonce}.${raw}`, sig);
  if (!ok) return c.json({ error: "invalid_signature" }, 401);

  let payload: ExecuteJobPayload;
  try { payload = JSON.parse(raw); } catch { return c.json({ error: "invalid_json" }, 400); }
  if (!payload.job_id || !payload.job_type || !payload.cnpj) {
    return c.json({ error: "missing_fields" }, 400);
  }

  c.executionCtx.waitUntil((async () => {
    try {
      if (payload.job_type === "cnpj_lookup") await runCnpjLookup(c.env, payload);
      else if (payload.job_type === "cnd_lookup") await runCndLookup(c.env, payload);
      else {
        await sendFinal(c.env, {
          job_id: payload.job_id, type: "cnpj", status: "failed",
          error_type: "unknown", error_message: "unknown job_type",
        });
      }
    } catch (err) {
      await sendFinal(c.env, {
        job_id: payload.job_id,
        type: payload.job_type === "cnd_lookup" ? "cnd" : "cnpj",
        status: "failed", error_type: "unknown",
        error_message: err instanceof Error ? err.message : String(err),
      });
    }
  })());

  return c.json({ accepted: true, job_id: payload.job_id }, 202);
});

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error("worker error", err);
  return c.json({ error: err.message }, 500);
});

export default app;
```

---

## 2. `cloudflare-worker/src/providers/cnpj-public-portal.ts`

```ts
import type { Page } from "@cloudflare/playwright";
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
  let successPayload: Record<string, unknown> | null = null;

  try {
    await sendProgress(env, { job_id: payload.job_id, step: "navigate", message: "Abrindo portal CNPJ", status: "running", provider: PROVIDER });

    await withBrowser(env, async (browser) => {
      const page = await browser.newPage();
      try {
        await page.setExtraHTTPHeaders({ "User-Agent": "Mozilla/5.0 (compatible; GestaoEZ-CNPJ/1.0)" });
      } catch { /* ignore: optional */ }
      await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await captureScreenshot(env, payload, page, "step1_portal");

      html = (await page.content()).toLowerCase();
      if (/captcha|hcaptcha|recaptcha/i.test(html)) {
        throw new Error("captcha detected on landing page");
      }

      await sendProgress(env, { job_id: payload.job_id, step: "submit", message: "Enviando CNPJ", provider: PROVIDER });

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

      successPayload = {
        job_id: payload.job_id,
        request_id: payload.request_id,
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
      type: "cnpj",
      status: (c.error_type === "captcha_detected" || c.error_type === "manual_required") ? "manual_required" : "failed",
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
```

---

## 3. `cloudflare-worker/src/providers/cnd-public-portal.ts`

```ts
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
      const page = await browser.newPage();
      try {
        await page.setExtraHTTPHeaders({ "User-Agent": "Mozilla/5.0 (compatible; GestaoEZ-CND/1.0)" });
      } catch { /* ignore: optional */ }
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
```

---

## 4. `cloudflare-worker/src/lib/browser.ts`

```ts
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
```

---

## 5. `cloudflare-worker/src/lib/classification.ts`

```ts
import type { ErrorType } from "../types";

export function classifyError(err: unknown, html?: string): { error_type: ErrorType; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = (msg + " " + (html || "")).toLowerCase();

  if (/fs\.mkdtemp|\[unenv\]|is not implemented/i.test(lower)) {
    return {
      error_type: "runtime_incompatibility",
      message: "Runtime do Worker não suporta esta API (fs.mkdtemp/unenv). Atualizar @cloudflare/playwright e usar browser.newPage() direto sem newContext().",
    };
  }
  if (/connectovercdp|cdp.*error|protocol error.*target|browsertype\.connect/i.test(lower)) {
    return {
      error_type: "browser_unavailable",
      message: "Falha ao conectar ao Browser Rendering (CDP). Verificar binding 'gestaoez' e versão do @cloudflare/playwright.",
    };
  }
  if (/captcha|recaptcha|hcaptcha|i'm not a robot|não sou um robô/i.test(lower)) {
    return { error_type: "captcha_detected", message: "Portal exigiu captcha" };
  }
  if (/429|rate.?limit|too many requests|quota.*exceed/i.test(lower)) {
    return { error_type: "rate_limited", message: "Cloudflare Browser Rendering rate limit atingido. Reduza concorrência ou aguarde." };
  }
  if (/unable to create.*browser|browser.*unavailable|workers.*browser|browser binding|browser rendering.*not/i.test(lower)) {
    return { error_type: "browser_unavailable", message: "Browser Rendering indisponível ou binding incorreto." };
  }
  if (/cannot read propert.*of null|reading 'accept'|reading "accept"|null \(reading/i.test(lower)) {
    return { error_type: "browser_unavailable", message: "Falha ao iniciar Browser Rendering (binding nulo)." };
  }
  if (/callback.*(failed|error|non-2xx)|cf-final-callback|cf-progress-callback/i.test(lower)) {
    return { error_type: "callback_error", message: msg };
  }
  if (/timeout|timed out|navigation timeout/i.test(lower)) {
    return { error_type: "timeout", message: msg };
  }
  if (/cnpj.*(não|nao).*(encontrado|cadastrado|consta)|não consta no cadastro/i.test(lower)) {
    return { error_type: "cnpj_not_found", message: "CNPJ não encontrado no portal" };
  }
  if (/serviço.*indispon|sistema.*fora|503|502|gateway/i.test(lower)) {
    return { error_type: "portal_unavailable", message: "Portal indisponível" };
  }
  if (/selector|element not found|waiting for/i.test(lower)) {
    return { error_type: "layout_changed", message: "Layout do portal mudou" };
  }
  if (/parse|json|unexpected token/i.test(lower)) {
    return { error_type: "parsing_error", message: msg };
  }
  return { error_type: "unknown", message: msg.slice(0, 300) };
}
```

---

## 6. `cloudflare-worker/src/lib/progress.ts`

```ts
import { signHmac } from "./security";
import type { Env } from "../types";

function callbackUrl(env: Env, path: string): string {
  return env.CALLBACK_BASE_URL.replace(/\/$/, "") + path;
}

async function postSigned(env: Env, url: string, body: unknown): Promise<Response> {
  const raw = JSON.stringify(body);
  const ts = Date.now().toString();
  const nonce = crypto.randomUUID();
  const sig = await signHmac(env.CALLBACK_HMAC_SECRET, `${ts}.${nonce}.${raw}`);
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CF-Signature": sig,
      "X-CF-Timestamp": ts,
      "X-CF-Nonce": nonce,
    },
    body: raw,
  });
}

export async function sendProgress(env: Env, payload: {
  job_id: string; step: string; level?: "info" | "warning" | "error";
  message?: string; status?: string; provider?: string; details_json?: Record<string, unknown>;
}): Promise<void> {
  try {
    await postSigned(env, callbackUrl(env, "/cf-progress-callback"), payload);
  } catch (err) {
    console.error("progress callback failed", err);
  }
}

export async function sendFinal(env: Env, payload: Record<string, unknown>): Promise<void> {
  const r = await postSigned(env, callbackUrl(env, "/cf-final-callback"), payload);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    console.error("cf-final-callback non-2xx", r.status, txt.slice(0, 300));
    throw new Error(`callback_error cf-final-callback ${r.status}: ${txt.slice(0, 200)}`);
  }
}

export async function requestArtifactUpload(env: Env, payload: {
  job_id: string; artifact_type: string; filename: string; mime_type?: string;
}): Promise<{ upload_url: string; path: string; artifact_id: string } | null> {
  try {
    const r = await postSigned(env, callbackUrl(env, "/artifacts-sign"), payload);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function uploadArtifactBytes(uploadUrl: string, bytes: ArrayBuffer | Uint8Array, mime: string): Promise<boolean> {
  try {
    const r = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mime, "x-upsert": "true" },
      body: bytes,
    });
    return r.ok;
  } catch {
    return false;
  }
}
```

---

## 7. `cloudflare-worker/src/types.ts`

```ts
export interface Env {
  gestaoez: Fetcher; // Browser Rendering binding
  LOVABLE_HMAC_SECRET: string;
  CALLBACK_HMAC_SECRET: string;
  CALLBACK_BASE_URL: string;
  VERSION: string;
}

export interface ExecuteJobPayload {
  job_id: string;
  job_type: "cnpj_lookup" | "cnd_lookup";
  cnpj: string;
  correlation_id: string;
  callback_base?: string;
  request_id?: string;
}

export type ErrorType =
  | "captcha_detected"
  | "layout_changed"
  | "timeout"
  | "cnpj_not_found"
  | "portal_unavailable"
  | "navigation_error"
  | "parsing_error"
  | "rate_limited"
  | "browser_unavailable"
  | "callback_error"
  | "manual_required"
  | "runtime_incompatibility"
  | "unknown";
```

---

## Bônus: confirme estes 2 arquivos também (impactam o deploy)

### `cloudflare-worker/wrangler.toml`

```toml
name = "gestaoez"
main = "src/index.ts"
compatibility_date = "2026-04-22"
compatibility_flags = ["nodejs_compat"]

# Browser Rendering binding (already exists in this account)
browser = { binding = "gestaoez" }

[vars]
VERSION = "1.0.0"
```

### `cloudflare-worker/package.json`

```json
{
  "name": "gestaoez-worker",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "tail": "wrangler tail"
  },
  "dependencies": {
    "@cloudflare/playwright": "latest",
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240925.0",
    "typescript": "^5.6.0",
    "wrangler": "^3.78.0"
  }
}
```

---

## Verificação pós-deploy (obrigatória antes do dry-run)

1. `curl https://gestaoez.leomateus620.workers.dev/health | jq .build_id` deve retornar `"2026-04-23-runtime-fix-v2-newpage"`.
2. Se vier o BUILD_ID antigo, o deploy não pegou — verifique se o `wrangler` está autenticado na conta correta (`wrangler whoami`) e se está deployando o diretório certo.
3. Confirmado o BUILD_ID novo, me avise neste chat e eu disparo o dry-run Zimmermann automaticamente.

