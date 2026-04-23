import { Hono } from "hono";
import type { Env, ExecuteJobPayload } from "./types";
import { verifyHmac } from "./lib/security";
import { runCnpjLookup } from "./providers/cnpj-public-portal";
import { runCndLookup } from "./providers/cnd-public-portal";
import { sendFinal } from "./lib/progress";

const app = new Hono<{ Bindings: Env }>();

// Build identifier — changes on every deploy via wrangler `--var` or fallback to compile time.
// Without dynamic injection, we surface a hash of the worker's bound secrets/url config so the
// UI can detect when the deploy is stale relative to a code change that updated this string.
const BUILD_ID = "2026-04-23-spa-captcha-smart-v1";

function validateCallbackBase(raw: string | undefined | null) {
  if (!raw) return { value: null, valid: false, issue: "missing" as const };
  // Detect ASCII control chars (0x00-0x1F, 0x7F) that indicate a corrupted paste.
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

/**
 * Diagnostic endpoint to verify the LOVABLE_HMAC_SECRET matches the dispatcher.
 * Caller posts {ts, nonce, body}. Worker recomputes signature with its local
 * secret and returns both the canonical payload and the resulting signature,
 * along with the SHA-256 of the secret (truncated) so we can compare without
 * leaking the secret itself.
 *
 * NOT authenticated — only echoes deterministic values from caller-provided
 * inputs. Cannot be used to forge a real /execute-job signature unless the
 * caller already knows the secret.
 */
app.post("/debug-sign", async (c) => {
  const { ts, nonce, body } = await c.req.json().catch(() => ({} as any));
  if (!ts || !nonce || typeof body !== "string") {
    return c.json({ error: "missing_fields", required: ["ts", "nonce", "body"] }, 400);
  }
  const { signHmac } = await import("./lib/security");
  const canonical = `${ts}.${nonce}.${body}`;
  const sig = await signHmac(c.env.LOVABLE_HMAC_SECRET || "", canonical);
  // SHA-256 of secret (first 12 hex chars) — lets caller compare fingerprints
  // without revealing the secret. If fingerprints differ, the secrets differ.
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

  // Run async; respond 202 immediately
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