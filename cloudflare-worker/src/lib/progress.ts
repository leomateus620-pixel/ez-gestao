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
  await postSigned(env, callbackUrl(env, "/cf-final-callback"), payload);
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