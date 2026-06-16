// deno-lint-ignore-file no-explicit-any
// Re-dispatch de UMA guia já identificada (usado pela tela de Revisão Manual).
// Delegamos ao orquestrador run-guide-scan-now via guide_ids para reaproveitar toda
// a lógica de envio (templates, idempotência, modo teste/produção, movimentação).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

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
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors });
  if (!(await isAuthorized(req))) return new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers: cors });

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const guideIds: string[] = Array.isArray(body?.guide_ids)
    ? body.guide_ids.filter((x: unknown) => typeof x === 'string')
    : (typeof body?.guide_id === 'string' ? [body.guide_id] : []);
  if (guideIds.length === 0) {
    return new Response(JSON.stringify({ error: "missing_guide_id" }), { status: 400, headers: cors });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Aplica overrides manuais vindos da revisão antes do reprocesso
  if (body?.overrides && typeof body.overrides === 'object') {
    const allowed = ['empresa_id', 'tipo_guia', 'tipo_guia_normalized', 'competencia', 'vencimento', 'valor', 'cnpj_detectado'];
    const payload: Record<string, unknown> = { revisao_correcoes: body.overrides };
    for (const k of allowed) if (k in body.overrides) payload[k] = body.overrides[k];
    await db.from('guias').update(payload).in('id', guideIds);
    await db.from('guide_audit').insert(guideIds.map((id) => ({
      guia_id: id, action: 'review_override', actor: 'manual', after: body.overrides as any,
    })));
  }

  // Reseta status para que o orquestrador reprocesse
  await db.from('guias').update({ status: 'aguardando', provider_error: null }).in('id', guideIds);

  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/run-guide-scan-now`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ guide_ids: guideIds }),
  });
  const txt = await res.text();
  return new Response(txt, { status: res.status, headers: cors });
});