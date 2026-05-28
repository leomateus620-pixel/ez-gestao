// deno-lint-ignore-file no-explicit-any
const DRIVE_GW = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const DRIVE_UPLOAD = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function gwHeaders(driveKey: string, lovableKey: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": driveKey,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function computeSha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "Sem nome";
}

async function logStep(supabase: any, eventType: string, message: string, data: any = {}, documentId: string | null = null, companyId: string | null = null) {
  try {
    await supabase.from("fator_r_processing_logs").insert({
      document_id: documentId, company_id: companyId, event_type: eventType, message, payload: data,
    });
  } catch (_e) { /* logging is best-effort */ }
}

async function findDriveFolder(name: string, parentId: string | null, driveKey: string, lovableKey: string): Promise<string | null> {
  const escaped = name.replace(/'/g, "\\'");
  const parts = [
    `mimeType='application/vnd.google-apps.folder'`,
    `trashed=false`,
    `name='${escaped}'`,
  ];
  if (parentId) parts.push(`'${parentId}' in parents`);
  const q = parts.join(" and ");
  const res = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents)&pageSize=10`, {
    headers: gwHeaders(driveKey, lovableKey),
  });
  if (!res.ok) throw new Error(`drive_list_failed_${res.status}`);
  const payload = await res.json() as any;
  return payload.files?.[0]?.id ?? null;
}

async function createDriveFolder(name: string, parentId: string | null, driveKey: string, lovableKey: string): Promise<string> {
  const body: any = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) body.parents = [parentId];
  const res = await fetch(`${DRIVE_GW}/files`, {
    method: "POST",
    headers: gwHeaders(driveKey, lovableKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`drive_folder_create_failed_${res.status}:${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.id;
}

export async function getOrCreateFolder(opts: {
  supabase: any;
  name: string;
  parentId: string | null;
  kind: "root" | "year" | "month" | "company";
  path: string;
  driveKey: string;
  lovableKey: string;
  documentId?: string | null;
  companyId?: string | null;
}): Promise<string> {
  const { supabase, parentId, kind, path, driveKey, lovableKey, documentId, companyId } = opts;
  const name = sanitizeFolderName(opts.name);

  const { data: cached } = await supabase.from("fator_r_drive_folders").select("drive_folder_id").eq("path", path).maybeSingle();
  if (cached?.drive_folder_id) {
    await logStep(supabase, `drive_${kind}_folder_ready`, `Pasta ${kind} reutilizada: ${name}`, { path, reused: true }, documentId, companyId);
    return cached.drive_folder_id;
  }

  let folderId = await findDriveFolder(name, parentId, driveKey, lovableKey);
  let created = false;
  if (!folderId) {
    folderId = await createDriveFolder(name, parentId, driveKey, lovableKey);
    created = true;
  }
  await supabase.from("fator_r_drive_folders").upsert({ path, drive_folder_id: folderId, parent_folder_id: parentId, kind }, { onConflict: "path" });
  await logStep(supabase, `drive_${kind}_folder_ready`, `Pasta ${kind} ${created ? "criada" : "encontrada"}: ${name}`, { path, created }, documentId, companyId);
  return folderId;
}

export async function resolveCompanyFolder(opts: {
  supabase: any;
  driveKey: string;
  lovableKey: string;
  rootName: string;
  rootParentId: string | null;
  companyName: string;
  cnpj: string;
  year: number;
  month: number;
  documentId?: string | null;
  companyId?: string | null;
}): Promise<{ folderId: string; logicalPath: string }> {
  const { supabase, driveKey, lovableKey, rootName, rootParentId, companyName, cnpj, year, month, documentId, companyId } = opts;
  const monthLabel = `${String(month).padStart(2, "0")} - ${MONTH_NAMES[month - 1] ?? "Mes"}`;
  const cnpjDigits = cnpj.replace(/\D/g, "");
  const companyLabel = sanitizeFolderName(`${companyName} - ${cnpjDigits}`);

  const rootPath = `root::${rootName}`;
  const yearPath = `${rootPath}/${year}`;
  const monthPath = `${yearPath}/${monthLabel}`;
  const companyPath = `${monthPath}/${companyLabel}`;

  const rootId = await getOrCreateFolder({ supabase, name: rootName, parentId: rootParentId, kind: "root", path: rootPath, driveKey, lovableKey, documentId, companyId });
  const yearId = await getOrCreateFolder({ supabase, name: String(year), parentId: rootId, kind: "year", path: yearPath, driveKey, lovableKey, documentId, companyId });
  const monthId = await getOrCreateFolder({ supabase, name: monthLabel, parentId: yearId, kind: "month", path: monthPath, driveKey, lovableKey, documentId, companyId });
  const companyFolderId = await getOrCreateFolder({ supabase, name: companyLabel, parentId: monthId, kind: "company", path: companyPath, driveKey, lovableKey, documentId, companyId });

  return { folderId: companyFolderId, logicalPath: `${rootName}/${year}/${monthLabel}/${companyLabel}` };
}

export async function findExistingByName(parentId: string, name: string, driveKey: string, lovableKey: string): Promise<{ id: string; webViewLink: string } | null> {
  const escaped = name.replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and name='${escaped}' and trashed=false`;
  const res = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=5`, {
    headers: gwHeaders(driveKey, lovableKey),
  });
  if (!res.ok) return null;
  const payload = await res.json() as any;
  const file = payload.files?.[0];
  return file ? { id: file.id, webViewLink: file.webViewLink } : null;
}

export async function uploadPdf(opts: {
  bytes: Uint8Array;
  name: string;
  parentId: string;
  driveKey: string;
  lovableKey: string;
}): Promise<{ id: string; webViewLink: string; name: string }> {
  const { bytes, name, parentId, driveKey, lovableKey } = opts;
  const boundary = `----lovable_${crypto.randomUUID()}`;
  const metadata = { name, parents: [parentId], mimeType: "application/pdf" };
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const res = await fetch(`${DRIVE_UPLOAD}&fields=id,name,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": driveKey,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`drive_upload_failed_${res.status}:${text.slice(0, 200)}`);
  }
  return await res.json();
}
