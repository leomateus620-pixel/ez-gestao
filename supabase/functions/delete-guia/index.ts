/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

async function isAuthorized(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false as const, user: null };
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return { ok: true as const, user: null };
  const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return { ok: false as const, user: null };
  return { ok: true as const, user: data.user };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors });

  const authResult = await isAuthorized(req);
  if (!authResult.ok) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid_body" }), { status: 400, headers: cors }); }
  const guideId = String(body.guia_id || body.guide_id || "").trim();
  const motivo = String(body.motivo || "").slice(0, 500) || null;
  if (!guideId) return new Response(JSON.stringify({ error: "missing_guia_id" }), { status: 400, headers: cors });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: guide, error: fetchErr } = await db.from("guias").select("id,file_name,status,tipo_guia").eq("id", guideId).maybeSingle();
  if (fetchErr) return new Response(JSON.stringify({ error: "fetch_failed", detail: fetchErr.message }), { status: 500, headers: cors });
  if (!guide) {
    // Idempotent: guide already gone — return success so the client can drop it from caches/UI.
    return new Response(JSON.stringify({ ok: true, already_deleted: true, guia_id: guideId }), { status: 200, headers: cors });
  }

  // Audit before deletion
  try {
    await db.from("guide_audit").insert({
      guia_id: guideId,
      action: "manual_delete",
      actor: authResult.user?.email || authResult.user?.id || "service_role",
      after: { motivo, file_name: guide.file_name, status: guide.status, tipo_guia: guide.tipo_guia },
    });
  } catch (_) { /* non-fatal */ }

  // Cascade delete related rows (no FK cascade assumed)
  const tables = ["guia_envios", "guia_eventos", "guia_excecoes"] as const;
  for (const t of tables) {
    const { error } = await db.from(t).delete().eq("guia_id", guideId);
    if (error) {
      return new Response(JSON.stringify({ error: `cascade_failed_${t}`, detail: error.message }), { status: 500, headers: cors });
    }
  }

  const { error: delErr } = await db.from("guias").delete().eq("id", guideId);
  if (delErr) return new Response(JSON.stringify({ error: "delete_failed", detail: delErr.message }), { status: 500, headers: cors });

  return new Response(JSON.stringify({ ok: true, guia_id: guideId }), { headers: cors });
});