// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { ensureGuideStructure, gwHeaders } from "../_shared/guide-drive.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const GMAIL_GW = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors });
  }
  if (!(await isAuthorized(req))) {
    return new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers: cors });
  }
  const driveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!driveKey || !gmailKey || !Deno.env.get("LOVABLE_API_KEY")) {
    return new Response(JSON.stringify({ error: "connectors_missing" }), { status: 409, headers: cors });
  }

  try {
    const folders = await ensureGuideStructure(driveKey, { createAuxFolders: false });

    let senderEmail = "";
    const prof = await fetch(`${GMAIL_GW}/users/me/profile`, { headers: gwHeaders(gmailKey) });
    if (prof.ok) senderEmail = (await prof.json()).emailAddress || "";

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await db.from("integracoes_guias").update({
      root_folder_id: folders.rootId,
      source_folder_id: folders.aEnviarId,
      sent_folder_id: folders.enviadasId,
      review_folder_id: null,
      not_identified_folder_id: null,
      errors_folder_id: null,
      duplicates_folder_id: null,
      status: "ativo", last_error: null, last_check_at: new Date().toISOString(),
    }).eq("provider", "google_drive");
    await db.from("integracoes_guias").update({
      status: "ativo", sender_identity: senderEmail || null,
      last_error: null, last_check_at: new Date().toISOString(),
    }).eq("provider", "gmail");

    return new Response(JSON.stringify({
      ok: true,
      folders,
      urls: {
        root: `https://drive.google.com/drive/folders/${folders.rootId}`,
        a_enviar: `https://drive.google.com/drive/folders/${folders.aEnviarId}`,
        enviadas: `https://drive.google.com/drive/folders/${folders.enviadasId}`,
      },
      sender: senderEmail,
    }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: "bootstrap_failed", message: String(err).slice(0, 800) }), {
      status: 500, headers: cors,
    });
  }
});