// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = (Deno.env.get("APP_ORIGIN") || "").split(",").map((item) => item.trim());
  return {
    ...(origin && allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

async function hasAdminSession(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const auth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data, error } = await auth.auth.getUser(token);
  return !error && !!data.user;
}

serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  }
  if (!(await hasAdminSession(req))) {
    return new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers });
  }

  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/scan-guide-folder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": req.headers.get("authorization") || "",
    },
    body: JSON.stringify({ trigger: "manual" }),
  });
  return new Response(await response.text(), { status: response.status, headers });
});
