// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function responseHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = (Deno.env.get("APP_ORIGIN") || "").split(",").map((item) => item.trim());
  return {
    ...(origin && allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-guide-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

async function authorized(req: Request) {
  const cron = req.headers.get("x-guide-cron-secret");
  if (cron && cron === Deno.env.get("GUIDE_CRON_SECRET")) return true;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data } = await auth.auth.getUser(token);
  return !!data.user;
}

function bytesFromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function googleAccessToken(db: any) {
  if (Deno.env.get("GOOGLE_ACCESS_TOKEN")) return Deno.env.get("GOOGLE_ACCESS_TOKEN")!;
  const encryptionKey = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!encryptionKey || !clientId || !clientSecret) return null;
  const { data: stored } = await db.from("integracao_segredos")
    .select("*").eq("provider", "google_oauth").maybeSingle();
  if (!stored) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encryptionKey));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
  const refresh = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytesFromBase64(stored.encryption_iv) },
    key,
    bytesFromBase64(stored.encrypted_refresh_token),
  );
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: new TextDecoder().decode(refresh),
      grant_type: "refresh_token",
    }),
  });
  const body = await tokenResponse.json();
  return tokenResponse.ok ? body.access_token as string : null;
}

async function rateAllowed(db: any, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await db.rpc("consume_guide_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  return !error && data === true;
}

serve(async (req) => {
  const headers = responseHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  }
  if (!(await authorized(req))) {
    return new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const isCron = !!req.headers.get("x-guide-cron-secret");
  if (!(await rateAllowed(db, isCron ? "scan:cron" : "scan:manual", isCron ? 2 : 3, 60))) {
    return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), { status: 429, headers });
  }
  const { data: drive } = await db.from("integracoes_guias").select("*")
    .eq("provider", "google_drive").single();
  if (!drive?.source_folder_id || !drive?.sent_folder_id || drive.status !== "ativo") {
    return new Response(JSON.stringify({
      error: "drive_integration_inactive",
      message: "Configure e ative as pastas a enviar e enviados antes da varredura.",
    }), { status: 409, headers });
  }
  const accessToken = await googleAccessToken(db);
  if (!accessToken) {
    await db.from("integracoes_guias").update({
      status: "erro",
      last_error: "Credencial OAuth do Google indisponivel.",
      last_check_at: new Date().toISOString(),
    }).eq("provider", "google_drive");
    return new Response(JSON.stringify({ error: "google_credentials_unavailable" }), {
      status: 409, headers,
    });
  }

  const params = new URLSearchParams({
    q: `'${drive.source_folder_id}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,md5Checksum,modifiedTime)",
    pageSize: "100",
  });
  const driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!driveResponse.ok) {
    return new Response(JSON.stringify({ error: "drive_list_failed" }), {
      status: 502, headers,
    });
  }
  const files = (await driveResponse.json()).files || [];
  let queued = 0;
  let unsupported = 0;
  for (const file of files) {
    const { data: guide } = await db.from("guias").upsert({
      drive_file_id: file.id,
      file_name: file.name,
      mime_type: file.mimeType,
      sha256: file.md5Checksum || null,
      source_folder_id: drive.source_folder_id,
      sent_folder_id: drive.sent_folder_id,
    }, { onConflict: "drive_file_id", ignoreDuplicates: true }).select().maybeSingle();
    const { data: existing } = guide
      ? { data: guide }
      : await db.from("guias").select("*").eq("drive_file_id", file.id).single();
    if (!existing || ["enviada", "enviando", "identificada", "revisao", "erro"].includes(existing.status)) continue;

    if (file.mimeType !== "application/pdf") {
      await db.from("guias").update({ status: "revisao", provider_error: "Formato nao suportado." })
        .eq("id", existing.id);
      await db.from("guia_excecoes").insert({
        guia_id: existing.id,
        exception_type: "unsupported_file",
        reason: "Somente arquivos PDF podem ser enviados automaticamente.",
        action_recommended: "Substitua o arquivo por uma guia em formato PDF.",
      });
      unsupported++;
      continue;
    }
    const processResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/process-guide`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Guide-Internal-Secret": Deno.env.get("GUIDE_INTERNAL_SECRET") || "",
      },
      body: JSON.stringify({ guia_id: existing.id }),
    });
    if (processResponse.ok) queued++;
  }
  await db.from("integracoes_guias").update({
    last_check_at: new Date().toISOString(),
    last_error: null,
  }).eq("provider", "google_drive");
  return new Response(JSON.stringify({ scanned: files.length, queued, unsupported }), { headers });
});
