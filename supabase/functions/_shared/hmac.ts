// Shared HMAC helpers for Lovable<->Cloudflare Worker communication.
// NOTE: Deno edge runtime does not allow shared subfolders to be auto-deployed,
// so each function inlines what it needs. This file documents canonical impl.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lovable-signature, x-lovable-timestamp, x-lovable-nonce, x-cf-signature, x-cf-timestamp, x-cf-nonce",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export async function signHmac(secret: string, payload: string): Promise<string> {
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

export async function verifyHmac(
  secret: string,
  payload: string,
  signature: string,
): Promise<boolean> {
  const expected = await signHmac(secret, payload);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}