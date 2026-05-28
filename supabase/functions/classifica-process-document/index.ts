import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { DRIVE_GW, gwHeaders, reqEnv } from '../_shared/classifica-drive.ts';

serve(async (req) => {
  const { drive_file_id } = await req.json();
  const supabase = createClient(reqEnv('SUPABASE_URL'), reqEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const driveKey = reqEnv('GOOGLE_DRIVE_API_KEY');
  const dl = await fetch(`${DRIVE_GW}/files/${drive_file_id}?alt=media`, { headers: gwHeaders(driveKey) });
  const content = await dl.text();
  const { data: doc } = await supabase.from('classifica_documents').select('*').eq('drive_file_id', drive_file_id).single();
  if (!doc) return Response.json({ ok: false, error: 'doc_not_found' }, { status: 404 });
  const invoiceType = content.includes('<dest>') ? 'entrada' : 'saida';
  await supabase.from('classifica_documents').update({ invoice_type: invoiceType, status: 'classificado', processing_payload: { ...(doc.processing_payload ?? {}), parsed: true } }).eq('id', doc.id);
  await supabase.from('classifica_processing_logs').insert({ document_id: doc.id, level: 'info', message: 'Documento processado e enviado para classificação.' });
  await supabase.functions.invoke('classifica-run-classification', { body: { document_id: doc.id } });
  return Response.json({ ok: true });
});
