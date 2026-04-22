// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: providers }, { count: queued }, { count: running }, { count: failed24h }, { count: success24h }] = await Promise.all([
      supabase.from("provider_health").select("*"),
      supabase.from("automation_jobs").select("*", { count: "exact", head: true }).eq("status", "queued"),
      supabase.from("automation_jobs").select("*", { count: "exact", head: true }).in("status", ["dispatched", "running"]),
      supabase.from("automation_jobs").select("*", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
      supabase.from("automation_jobs").select("*", { count: "exact", head: true }).eq("status", "success").gte("created_at", since),
    ]);

    const workerConfigured = !!Deno.env.get("CLOUDFLARE_WORKER_URL") && !!Deno.env.get("CLOUDFLARE_WORKER_HMAC_SECRET");

    let workerHealth: any = null;
    if (workerConfigured) {
      try {
        const url = Deno.env.get("CLOUDFLARE_WORKER_URL")!.replace(/\/$/, "") + "/health";
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        workerHealth = { ok: r.ok, status: r.status, body: r.ok ? await r.json() : null };
      } catch (err: any) {
        workerHealth = { ok: false, error: String(err?.message || err) };
      }
    }

    return new Response(JSON.stringify({
      worker_configured: workerConfigured,
      worker_health: workerHealth,
      providers: providers || [],
      queue: { queued: queued || 0, running: running || 0 },
      last_24h: { success: success24h || 0, failed: failed24h || 0 },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});