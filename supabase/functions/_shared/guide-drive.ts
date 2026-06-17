// deno-lint-ignore-file no-explicit-any
export const DRIVE_GW = 'https://connector-gateway.lovable.dev/google_drive/drive/v3';

export function gwHeaders(connectionKey: string) {
  return {
    Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
    'X-Connection-Api-Key': connectionKey,
    'Content-Type': 'application/json',
  };
}

export async function findOrCreateFolder(driveKey: string, name: string, parentId?: string): Promise<string> {
  const parentQ = parentId ? `'${parentId}' in parents` : "'root' in parents";
  const safeName = name.replace(/'/g, "\\'");
  const q = `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false and ${parentQ}`;
  const list = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: gwHeaders(driveKey),
  });
  if (!list.ok) throw new Error(`drive_list_failed: ${list.status} ${await list.text()}`);
  const existing = (await list.json()).files?.[0];
  if (existing) return existing.id as string;

  const create = await fetch(`${DRIVE_GW}/files?fields=id`, {
    method: 'POST',
    headers: gwHeaders(driveKey),
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!create.ok) throw new Error(`drive_create_failed: ${create.status} ${await create.text()}`);
  return (await create.json()).id as string;
}

export async function moveFile(driveKey: string, fileId: string, addParent: string, removeParent: string) {
  const url = `${DRIVE_GW}/files/${fileId}?addParents=${encodeURIComponent(addParent)}&removeParents=${encodeURIComponent(removeParent)}&fields=id,parents`;
  const res = await fetch(url, { method: 'PATCH', headers: gwHeaders(driveKey), body: '{}' });
  if (!res.ok) throw new Error(`drive_move_failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function renameFile(driveKey: string, fileId: string, name: string) {
  const url = `${DRIVE_GW}/files/${fileId}?fields=id,name`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: gwHeaders(driveKey),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`drive_rename_failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function downloadFile(driveKey: string, fileId: string): Promise<Uint8Array> {
  const res = await fetch(`${DRIVE_GW}/files/${fileId}?alt=media`, { headers: gwHeaders(driveKey) });
  if (!res.ok) throw new Error(`drive_download_failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export interface GuideFolders {
  rootId: string;
  aEnviarId: string;
  enviadasId: string;
  revisaoId: string;
  naoIdentificadasId: string;
  errosId: string;
  duplicadasId: string;
}

export async function ensureGuideStructure(driveKey: string): Promise<GuideFolders> {
  const rootId = await findOrCreateFolder(driveKey, 'Guias');
  const [aEnviarId, enviadasId, revisaoId, naoIdentificadasId, errosId, duplicadasId] = await Promise.all([
    findOrCreateFolder(driveKey, 'A Enviar', rootId),
    findOrCreateFolder(driveKey, 'Enviadas', rootId),
    findOrCreateFolder(driveKey, 'Revisão Manual', rootId),
    findOrCreateFolder(driveKey, 'Não Identificadas', rootId),
    findOrCreateFolder(driveKey, 'Erros', rootId),
    findOrCreateFolder(driveKey, 'Duplicadas', rootId),
  ]);
  return { rootId, aEnviarId, enviadasId, revisaoId, naoIdentificadasId, errosId, duplicadasId };
}
