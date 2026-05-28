import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { reqEnv } from '../_shared/classifica-drive.ts';

serve(async (req) => {
  const { document_id } = await req.json();
  const supabase = createClient(reqEnv('SUPABASE_URL'), reqEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: rules } = await supabase.from('classifica_rules').select('*').eq('active', true).order('priority', { ascending: true });
  const seed = [{ description: 'Produto para revenda', cfop: '1102', ncm: '22030000', cst_csosn: '102', item_value: 100 }];
  for (const item of seed) {
    const suggested = item.cfop.startsWith('11') ? 'revenda' : 'revisao_necessaria';
    const confidence = suggested === 'revenda' ? 0.88 : 0.45;
    const { data: inserted } = await supabase.from('classifica_invoice_items').insert({ document_id, ...item, suggested_classification: suggested, final_classification: confidence >= 0.8 ? suggested : null, confidence_score: confidence }).select('*').single();
    await supabase.from('classifica_classifications').insert({ item_id: inserted?.id, suggestion: suggested, confidence_score: confidence, review_recommended: confidence < 0.8, auto_applied: confidence >= 0.8, reasoning: { rule_count: rules?.length ?? 0 } });
    if (confidence < 0.55) await supabase.from('classifica_review_queue').insert({ document_id, item_id: inserted?.id, reason: 'Baixa confiança na classificação' });
  }
  return Response.json({ ok: true });
});
