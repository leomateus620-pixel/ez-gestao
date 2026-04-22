// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function signHmac(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fingerprint(secret: string): Promise<string> {
  const buf = new TextEncoder().encode(secret);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).slice(0, 6)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const workerUrl = Deno.env.get("CLOUDFLARE_WORKER_URL");
    const lovableSecret = Deno.env.get("CLOUDFLARE_WORKER_HMAC_SECRET");

    if (!workerUrl || !lovableSecret) {
      return new Response(JSON.stringify({
        ok: false,
        reason: "missing_lovable_config",
        message: "CLOUDFLARE_WORKER_URL ou CLOUDFLARE_WORKER_HMAC_SECRET ausentes no Lovable Cloud.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Reproducible test payload
    const ts = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = JSON.stringify({ probe: "lovable-hmac-diagnose", ts });
    const canonical = `${ts}.${nonce}.${body}`;

    const localSig = await signHmac(lovableSecret, canonical);
    const localFp = await fingerprint(lovableSecret);

    let workerResp: any = null;
    let workerError: string | null = null;
    let workerStatus = 0;
    try {
      const r = await fetch(workerUrl.replace(/\/$/, "") + "/debug-sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ts, nonce, body }),
      });
      workerStatus = r.status;
      const txt = await r.text();
      try { workerResp = JSON.parse(txt); }
      catch { workerError = `Worker respondeu não-JSON (${r.status}): ${txt.slice(0, 200)}`; }
      if (!r.ok && !workerError) workerError = `Worker HTTP ${r.status}: ${txt.slice(0, 200)}`;
    } catch (e: any) {
      workerError = `Falha ao alcançar Worker: ${String(e?.message || e)}`;
    }

    // Specific diagnosis: 404 on /debug-sign means the worker is online but running an OLD build.
    if (workerStatus === 404) {
      // Also fetch /health to confirm worker is reachable and surface its config
      let healthInfo: any = null;
      try {
        const h = await fetch(workerUrl.replace(/\/$/, "") + "/health");
        healthInfo = await h.json();
      } catch { /* ignore */ }
      return new Response(JSON.stringify({
        ok: false,
        reason: "worker_outdated",
        message: "Worker está online mas a rota /debug-sign não existe — faça `wrangler deploy` no projeto cloudflare-worker para publicar o build atual.",
        worker_url: workerUrl,
        worker_health: healthInfo,
        local_fingerprint: localFp,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (workerError && !workerResp) {
      return new Response(JSON.stringify({
        ok: false,
        reason: "worker_unreachable",
        message: workerError,
        worker_url: workerUrl,
        local_fingerprint: localFp,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const signaturesMatch = workerResp.signature === localSig;
    const fingerprintsMatch = workerResp.secret_fingerprint === localFp;

    // Also pull /health to validate callback_base (control chars / invalid URL).
    let healthInfo: any = null;
    try {
      const h = await fetch(workerUrl.replace(/\/$/, "") + "/health");
      healthInfo = await h.json();
    } catch { /* ignore */ }
    const callbackIssue = healthInfo?.callback_base_valid === false
      ? `CALLBACK_BASE_URL no Worker é inválido (${healthInfo.callback_base_issue}). Rode: wrangler secret put CALLBACK_BASE_URL`
      : null;

    const fullyOk = signaturesMatch && fingerprintsMatch && workerResp.has_secret && !callbackIssue;

    return new Response(JSON.stringify({
      ok: fullyOk,
      signatures_match: signaturesMatch,
      fingerprints_match: fingerprintsMatch,
      callback_base_ok: !callbackIssue,
      worker_health: healthInfo,
      local: {
        signature: localSig,
        fingerprint: localFp,
        secret_length: lovableSecret.length,
      },
      worker: {
        signature: workerResp.signature,
        fingerprint: workerResp.secret_fingerprint,
        secret_length: workerResp.secret_length,
        has_secret: workerResp.has_secret,
      },
      canonical_payload: canonical,
      message: fullyOk
        ? "Tudo OK — HMAC bate e callback URL é válida. Pode rodar dry-run."
        : callbackIssue
          ? callbackIssue
          : !workerResp.has_secret
            ? "Worker não tem LOVABLE_HMAC_SECRET configurado. Rode: wrangler secret put LOVABLE_HMAC_SECRET"
            : !signaturesMatch
              ? `Segredos diferentes entre Lovable e Worker. Reconfigure ambos com o MESMO valor. Lovable fp=${localFp} (${lovableSecret.length} chars), Worker fp=${workerResp.secret_fingerprint} (${workerResp.secret_length} chars).`
              : "HMAC OK mas alguma checagem secundária falhou.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, reason: "internal_error", message: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});