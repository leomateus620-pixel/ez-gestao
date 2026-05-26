// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const scopes = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = (Deno.env.get("APP_ORIGIN") || "").split(",").map((item) => item.trim());
  return {
    ...(origin && allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

async function isAdmin(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data } = await auth.auth.getUser(token);
  return !!data.user;
}

async function aesKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
}

function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

async function signedState() {
  const secret = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET");
  if (!secret) return null;
  const value = `${Date.now()}.${crypto.randomUUID()}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return `${value}.${base64(new Uint8Array(signature))}`;
}

async function validateState(state: string) {
  const secret = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET");
  const pieces = (state || "").split(".");
  if (!secret || pieces.length !== 3 || Date.now() - Number(pieces[0]) > 10 * 60_000) return false;
  const value = `${pieces[0]}.${pieces[1]}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64(new Uint8Array(signed)) === pieces[2];
}

serve(async (req) => {
  const responseHeaders = headers(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });
  if (!(await isAdmin(req))) {
    return new Response(JSON.stringify({ error: "authentication_required" }), {
      status: 401, headers: responseHeaders,
    });
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    return new Response(JSON.stringify({ error: "google_oauth_not_configured" }), {
      status: 409, headers: responseHeaders,
    });
  }

  if (req.method === "GET") {
    const state = await signedState();
    if (!state) {
      return new Response(JSON.stringify({ error: "oauth_state_secret_required" }), {
        status: 409, headers: responseHeaders,
      });
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: scopes,
      state,
    });
    return new Response(JSON.stringify({
      authorization_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
      scopes: scopes.split(" "),
    }), { headers: responseHeaders });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.code || !(await validateState(body.state))) {
    return new Response(JSON.stringify({ error: "authorization_code_required" }), {
      status: 400, headers: responseHeaders,
    });
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code: body.code,
    }),
  });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.refresh_token) {
    return new Response(JSON.stringify({ error: "google_token_exchange_failed" }), {
      status: 502, headers: responseHeaders,
    });
  }

  const encryptionSecret = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!encryptionSecret) {
    return new Response(JSON.stringify({ error: "token_encryption_key_required" }), {
      status: 409, headers: responseHeaders,
    });
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(encryptionSecret),
    new TextEncoder().encode(tokens.refresh_token),
  );
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await service.from("integracao_segredos").upsert({
    provider: "google_oauth",
    encrypted_refresh_token: base64(new Uint8Array(encrypted)),
    encryption_iv: base64(iv),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  await service.from("integracoes_guias").update({
    status: "configurado",
    secret_reference: "integracao_segredos:google_oauth",
    configured_at: new Date().toISOString(),
  }).in("provider", ["google_drive", "gmail"]);

  return new Response(JSON.stringify({ connected: true }), { headers: responseHeaders });
});
