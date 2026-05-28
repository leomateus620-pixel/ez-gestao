import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { reqEnv } from '../_shared/classifica-drive.ts';

serve(async (req) => {
  const { document_id, reason } = await req.json();
  const supabase = createClient(reqEnv('SUPABASE_URL'), reqEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: userData } = await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', '') ?? '');
  await supabase.from('classifica_audit_logs').insert({ entity_type: 'classifica_documents', entity_id: document_id, action: 'reprocess_requested', new_data: { reason }, user_id: userData.user?.id ?? null });
  await supabase.functions.invoke('classifica-run-classification', { body: { document_id } });
  return Response.json({ ok: true });
});
