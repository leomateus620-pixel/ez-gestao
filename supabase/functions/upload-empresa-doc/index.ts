// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const DRIVE_UPLOAD = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart";

function authHeaders(connectionKey: string) {
  return {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": connectionKey,
  };
}

async function sha256Hex(bytes: Uint8Array) {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const driveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    if (!driveKey || !Deno.env.get("LOVABLE_API_KEY")) {
      return new Response(JSON.stringify({ error: "drive_connector_missing" }), { status: 409, headers: cors });
    }
    const { empresa_id, storage_path, file_name } = await req.json();
    if (!empresa_id || !storage_path || !file_name) {
      return new Response(JSON.stringify({ error: "missing_fields" }), { status: 400, headers: cors });
    }

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: empresa } = await db.from("empresas").select("*").eq("id", empresa_id).single();
    if (!empresa) return new Response(JSON.stringify({ error: "empresa_not_found" }), { status: 404, headers: cors });
    if (!empresa.drive_folder_id) {
      return new Response(JSON.stringify({ error: "drive_folder_missing", message: "Crie a pasta no Drive antes do upload." }), { status: 409, headers: cors });
    }

    const dl = await db.storage.from("empresa-documentos").download(storage_path);
    if (dl.error || !dl.data) {
      return new Response(JSON.stringify({ error: "storage_download_failed", details: dl.error?.message }), { status: 502, headers: cors });
    }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const hash = await sha256Hex(bytes);

    // Multipart upload to Drive
    const boundary = `lovable-${crypto.randomUUID()}`;
    const meta = JSON.stringify({ name: file_name, parents: [empresa.drive_folder_id], mimeType: "application/pdf" });
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    );
    const tail = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.length + bytes.length + tail.length);
    body.set(head, 0);
    body.set(bytes, head.length);
    body.set(tail, head.length + bytes.length);

    const up = await fetch(DRIVE_UPLOAD, {
      method: "POST",
      headers: { ...authHeaders(driveKey), "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!up.ok) {
      const t = await up.text();
      return new Response(JSON.stringify({ error: "drive_upload_failed", status: up.status, details: t.slice(0, 500) }), { status: 502, headers: cors });
    }
    const file = await up.json();

    const { data: guia, error: insErr } = await db.from("guias").insert({
      drive_file_id: file.id,
      file_name,
      mime_type: "application/pdf",
      sha256: hash,
      empresa_id,
      source_folder_id: empresa.drive_folder_id,
      pasta_atual: "empresa",
      status: "aguardando",
    }).select().single();
    if (insErr) {
      return new Response(JSON.stringify({ error: "guia_insert_failed", details: insErr.message }), { status: 500, headers: cors });
    }

    await db.from("logs_acesso").insert({
      empresa_id, acao: "envio", usuario: "Sistema",
      detalhes: `PDF enviado para Drive: ${file_name}`,
    });

    return new Response(JSON.stringify({ guia_id: guia.id, drive_file_id: file.id, file_name }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: "unexpected", message: String(err).slice(0, 500) }), { status: 500, headers: cors });
  }
});