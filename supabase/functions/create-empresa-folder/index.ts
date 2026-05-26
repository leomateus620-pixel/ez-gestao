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
const PARENT_FOLDER_ID = Deno.env.get("EMPRESA_DRIVE_PARENT_ID") || "1rlstvviGxs-qy12J2DPXwtZjJfQkqYfZ";

function gwHeaders(connectionKey: string) {
  return {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const driveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    if (!driveKey || !Deno.env.get("LOVABLE_API_KEY")) {
      return new Response(JSON.stringify({ error: "drive_connector_missing" }), { status: 409, headers: cors });
    }
    const { empresa_id } = await req.json();
    if (!empresa_id) return new Response(JSON.stringify({ error: "empresa_id_required" }), { status: 400, headers: cors });

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: empresa, error } = await db.from("empresas").select("*").eq("id", empresa_id).single();
    if (error || !empresa) return new Response(JSON.stringify({ error: "empresa_not_found" }), { status: 404, headers: cors });

    // If folder already exists, verify it still exists in Drive
    if (empresa.drive_folder_id) {
      const check = await fetch(`${DRIVE_GW}/files/${empresa.drive_folder_id}?fields=id,name,trashed`, { headers: gwHeaders(driveKey) });
      if (check.ok) {
        const info = await check.json();
        if (!info.trashed) {
          return new Response(JSON.stringify({ drive_folder_id: empresa.drive_folder_id, reused: true, name: info.name }), { headers: cors });
        }
      }
    }

    const name = `${empresa.razao_social} - ${empresa.cnpj}`.slice(0, 200);
    const created = await fetch(`${DRIVE_GW}/files`, {
      method: "POST",
      headers: gwHeaders(driveKey),
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [PARENT_FOLDER_ID] }),
    });
    if (!created.ok) {
      const t = await created.text();
      return new Response(JSON.stringify({ error: "drive_folder_create_failed", status: created.status, details: t.slice(0, 500) }), { status: 502, headers: cors });
    }
    const folder = await created.json();
    await db.from("empresas").update({ drive_folder_id: folder.id }).eq("id", empresa_id);
    await db.from("logs_acesso").insert({
      empresa_id, acao: "envio", usuario: "Sistema",
      detalhes: `Pasta no Drive criada: ${folder.id}`,
    });
    return new Response(JSON.stringify({ drive_folder_id: folder.id, name, reused: false }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: "unexpected", message: String(err).slice(0, 500) }), { status: 500, headers: cors });
  }
});