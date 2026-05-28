export const DRIVE_GW = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

export const reqEnv = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Secret ausente: ${name}`);
  return v;
};

export const gwHeaders = (key: string) => ({
  Authorization: `Bearer ${reqEnv('LOVABLE_API_KEY')}`,
  'X-Connection-Api-Key': key,
  'Content-Type': 'application/json',
});

export async function listFolderFiles(folderId: string, driveKey: string) {
  const q = `'${folderId}' in parents and trashed=false`;
  const listRes = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink,createdTime,parents)&pageSize=100`, { headers: gwHeaders(driveKey) });
  if (!listRes.ok) throw new Error(`Falha ao listar Drive: HTTP ${listRes.status}`);
  const payload = await listRes.json() as any;
  return payload.files ?? [];
}
