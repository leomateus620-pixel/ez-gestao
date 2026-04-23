// deno-lint-ignore-file no-explicit-any
// OCR endpoint for solving CAPTCHA images using Tesseract.js (free, WASM).
// Called by the Cloudflare Worker via signed POST.
// Auth: HMAC using CF_CALLBACK_HMAC_SECRET (same as cf-progress-callback).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Tesseract from "npm:tesseract.js@5.0.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, x-cf-signature, x-cf-timestamp, x-cf-nonce",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function verifyHmac(secret: string, payload: string, signature: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Decode a PNG into RGBA pixels using a manual PNG parser would be heavy.
 * Tesseract.js accepts raw PNG bytes directly via its image input — we let
 * it handle decoding. For pre-processing, Tesseract.js v5 supports passing
 * PSM and tessedit options that already help.
 *
 * For "different threshold" retries, we re-run OCR with different parameters
 * (PSM mode and OEM) instead of pixel-level pre-processing — Canvas API in
 * Deno would require an extra heavy dep. Tesseract.js handles it well enough
 * for typical Receita captchas (5-7 alphanumeric characters).
 */
async function runOcr(
  pngBytes: Uint8Array,
  attempt: number,
): Promise<string> {
  // Different PSM per attempt to widen recognition strategies.
  const psm = attempt === 1 ? 7 : attempt === 2 ? 8 : 13; // 7=line, 8=word, 13=raw line
  const result = await Tesseract.recognize(pngBytes, "eng", {
    // logger: () => {}, // silence
    // @ts-ignore — params accepted at runtime
    tessedit_char_whitelist:
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    // @ts-ignore
    tessedit_pageseg_mode: String(psm),
  });
  const raw = (result?.data?.text || "").trim();
  return raw.replace(/[^0-9A-Za-z]/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const start = Date.now();
  try {
    const raw = await req.text();
    const sig = req.headers.get("x-cf-signature") || "";
    const ts = req.headers.get("x-cf-timestamp") || "";
    const nonce = req.headers.get("x-cf-nonce") || "";
    const secret = Deno.env.get("CF_CALLBACK_HMAC_SECRET") || "";

    if (!secret) {
      return new Response(JSON.stringify({ error: "missing_secret" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tsNum = parseInt(ts);
    if (!tsNum || Math.abs(Date.now() - tsNum) > 5 * 60_000) {
      return new Response(JSON.stringify({ error: "stale_timestamp" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!nonce) {
      return new Response(JSON.stringify({ error: "missing_nonce" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ok = await verifyHmac(secret, `${ts}.${nonce}.${raw}`, sig);
    if (!ok) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { image_base64?: string; min_length?: number; max_retries?: number };
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.image_base64 || typeof body.image_base64 !== "string") {
      return new Response(JSON.stringify({ error: "missing_image_base64" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const minLength = Math.max(3, Math.min(body.min_length || 5, 10));
    const maxRetries = Math.max(1, Math.min(body.max_retries || 2, 3));

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(body.image_base64);
    } catch {
      return new Response(JSON.stringify({ error: "invalid_base64" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (bytes.length < 50 || bytes.length > 2_000_000) {
      return new Response(JSON.stringify({ error: "image_size_out_of_bounds", size: bytes.length }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let lastText = "";
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const text = await runOcr(bytes, attempt);
        lastText = text;
        if (text.length >= minLength) {
          return new Response(JSON.stringify({
            ok: true,
            text,
            attempts: attempt,
            latency_ms: Date.now() - start,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } catch (err) {
        console.error("ocr attempt failed", attempt, err);
      }
    }

    return new Response(JSON.stringify({
      ok: false,
      reason: "low_confidence",
      last_text: lastText,
      attempts: maxRetries,
      latency_ms: Date.now() - start,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("solve-captcha fatal", err);
    return new Response(JSON.stringify({
      ok: false,
      reason: "internal_error",
      message: err instanceof Error ? err.message : String(err),
      latency_ms: Date.now() - start,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});