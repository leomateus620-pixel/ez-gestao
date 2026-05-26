// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const DRIVE_GW = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const GMAIL_GW = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function gwHeaders(connectionKey: string) {
  return {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

async function findOrCreateFolder(driveKey: string, name: string, parentId?: string) {
  const parentQ = parentId ? `'${parentId}' in parents` : "'root' in parents";
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false and ${parentQ}`;
  const list = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: gwHeaders(driveKey),
  });
  if (!list.ok) throw new Error(`drive_list_failed: ${list.status} ${await list.text()}`);
  const existing = (await list.json()).files?.[0];
  if (existing) return existing.id as string;

  const create = await fetch(`${DRIVE_GW}/files?fields=id`, {
    method: "POST",
    headers: gwHeaders(driveKey),
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!create.ok) throw new Error(`drive_create_failed: ${create.status} ${await create.text()}`);
  return (await create.json()).id as string;
}

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
    const folderId = await findOrCreateFolder(driveKey, "teste guias");
    const sentId = await findOrCreateFolder(driveKey, "enviados", folderId);

    let senderEmail = "";
    const prof = await fetch(`${GMAIL_GW}/users/me/profile`, { headers: gwHeaders(gmailKey) });
    if (prof.ok) senderEmail = (await prof.json()).emailAddress || "";

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await db.from("integracoes_guias").update({
      source_folder_id: folderId, sent_folder_id: sentId,
      status: "ativo", last_error: null, last_check_at: new Date().toISOString(),
    }).eq("provider", "google_drive");
    await db.from("integracoes_guias").update({
      status: "ativo", sender_identity: senderEmail || null,
      last_error: null, last_check_at: new Date().toISOString(),
    }).eq("provider", "gmail");

    return new Response(JSON.stringify({
      ok: true,
      folder: { id: folderId, name: "teste guias", url: `https://drive.google.com/drive/folders/${folderId}` },
      sent: { id: sentId, name: "enviados", url: `https://drive.google.com/drive/folders/${sentId}` },
      sender: senderEmail,
    }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: "bootstrap_failed", message: String(err).slice(0, 800) }), {
      status: 500, headers: cors,
    });
  }
});