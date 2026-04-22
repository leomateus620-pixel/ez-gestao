import { Hono } from "hono";
import type { Env, ExecuteJobPayload } from "./types";
import { verifyHmac } from "./lib/security";
import { runCnpjLookup } from "./providers/cnpj-public-portal";
import { runCndLookup } from "./providers/cnd-public-portal";
import { sendFinal } from "./lib/progress";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({
  ok: true,
  version: c.env.VERSION || "1.0.0",
  browser_binding: "gestaoez",
  has_lovable_secret: !!c.env.LOVABLE_HMAC_SECRET,
  has_callback_secret: !!c.env.CALLBACK_HMAC_SECRET,
  callback_base: c.env.CALLBACK_BASE_URL || null,
}));

app.get("/version", (c) => c.json({ version: c.env.VERSION || "1.0.0" }));

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