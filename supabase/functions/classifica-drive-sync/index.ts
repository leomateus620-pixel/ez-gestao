import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { listFolderFiles, reqEnv } from '../_shared/classifica-drive.ts';

serve(async () => {
  const supabase = createClient(reqEnv('SUPABASE_URL'), reqEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const driveKey = reqEnv('GOOGLE_DRIVE_API_KEY');
  const folderId = reqEnv('GOOGLE_DRIVE_FOLDER_ID');
  const files = await listFolderFiles(folderId, driveKey);
  for (const file of files) {
    if (!['application/pdf', 'application/xml', 'text/xml'].includes(file.mimeType)) continue;
    await supabase.from('classifica_documents').upsert({ drive_file_id: file.id, drive_file_name: file.name, drive_origin_path: folderId, status: 'processado', processing_payload: { source: 'classifica-drive-sync' } }, { onConflict: 'drive_file_id' });
    await supabase.functions.invoke('classifica-process-document', { body: { drive_file_id: file.id } });
  }
  return Response.json({ ok: true, files: files.length });
});
