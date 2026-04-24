import { signHmac } from "./security";
import type { Env } from "../types";

const PROGRESS_TIMEOUT_MS = 8_000;
const FINAL_TIMEOUT_MS = 20_000;
const ARTIFACT_TIMEOUT_MS = 12_000;

function callbackUrl(env: Env, path: string): string {
  return env.CALLBACK_BASE_URL.replace(/\/$/, "") + path;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout_${timeoutMs}ms`), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function postSigned(env: Env, url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const raw = JSON.stringify(body);
  const ts = Date.now().toString();
  const nonce = crypto.randomUUID();
  const sig = await signHmac(env.CALLBACK_HMAC_SECRET, `${ts}.${nonce}.${raw}`);
  return fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CF-Signature": sig,
      "X-CF-Timestamp": ts,
      "X-CF-Nonce": nonce,
    },
    body: raw,
  }, timeoutMs);
}

export async function sendProgress(env: Env, payload: {
  job_id: string; step: string; level?: "info" | "warning" | "error";
  message?: string; status?: string; provider?: string; details_json?: Record<string, unknown>;
}): Promise<void> {
  try {
    await postSigned(env, callbackUrl(env, "/cf-progress-callback"), payload, PROGRESS_TIMEOUT_MS);
  } catch (err) {
    console.error("progress callback failed", err);
  }
}

export async function sendFinal(env: Env, payload: Record<string, unknown>): Promise<void> {
  const r = await postSigned(env, callbackUrl(env, "/cf-final-callback"), payload, FINAL_TIMEOUT_MS);
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
    const r = await postSigned(env, callbackUrl(env, "/artifacts-sign"), payload, ARTIFACT_TIMEOUT_MS);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function uploadArtifactBytes(uploadUrl: string, bytes: ArrayBuffer | Uint8Array, mime: string): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mime, "x-upsert": "true" },
      body: bytes,
    }, ARTIFACT_TIMEOUT_MS);
    return r.ok;
  } catch {
    return false;
  }
}