// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { downloadFile } from "../_shared/guide-drive.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function isAuthorized(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await auth.auth.getUser(token);
  return !error && !!data.user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await isAuthorized(req))) {
    return new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const driveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!driveKey || !Deno.env.get("LOVABLE_API_KEY")) {
    return new Response(JSON.stringify({ error: "drive_not_configured" }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const url = new URL(req.url);
  const guideId = url.searchParams.get("guide_id");
  if (!guideId) {
    return new Response(JSON.stringify({ error: "missing_guide_id" }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: guide, error } = await db.from("guias").select("drive_file_id, file_name").eq("id", guideId).maybeSingle();
  if (error || !guide?.drive_file_id) {
    return new Response(JSON.stringify({ error: "guide_not_found" }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const bytes = await downloadFile(driveKey, guide.drive_file_id);
    return new Response(bytes, {
      headers: {
        ...cors,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${(guide.file_name || 'guia.pdf').replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=120',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "drive_download_failed", detail: String(err).slice(0, 300) }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});