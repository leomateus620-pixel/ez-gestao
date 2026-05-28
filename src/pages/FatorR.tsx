import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FolderSync, Pencil, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { GlassCard } from '@/components/GlassCard';

export default function FatorR() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [syncConfig, setSyncConfig] = useState<any>(null);
  const [loadingSync, setLoadingSync] = useState(false);

  const load = async () => {
    const [c, r, l, s] = await Promise.all([
      supabase.from('fator_r_companies').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('fator_r_monthly_results').select('*').order('reference_year', { ascending: false }).limit(50),
      supabase.from('fator_r_processing_logs').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('fator_r_sync_config').select('*').limit(1).maybeSingle(),
    ]);
    setCompanies(c.data ?? []);
    setResults(r.data ?? []);
    setLogs(l.data ?? []);
    setSyncConfig(s.data ?? null);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    monitored: companies.length,
    attention: results.filter((r) => r.status === 'attention').length,
    critical: results.filter((r) => r.status === 'critical').length,
    safe: results.filter((r) => r.status === 'safe').length,
  }), [companies, results]);

  const runNow = async () => {
    setLoadingSync(true);
    await supabase.functions.invoke('fator-r-drive-sync', { body: { trigger: 'manual' } });
    await load();
    setLoadingSync(false);
  };

  const adjustResult = async (result: any) => {
    const value = window.prompt('Novo Fator R (ex.: 0.31 ou 31%)', String(result.fator_r_value ?? ''));
    if (!value) return;
    const reason = window.prompt('Motivo da alteração (auditoria):', 'Ajuste manual após validação contábil');
    if (!reason) return;

    const raw = value.includes('%')
      ? Number(value.replace('%', '').replace(',', '.')) / 100
      : Number(value.replace(',', '.'));
    if (!Number.isFinite(raw)) return;

    const { data: userData } = await supabase.auth.getUser();
    const oldData = {
      fator_r_value: result.fator_r_value,
      fator_r_percent: result.fator_r_percent,
      status: result.status,
    };
    const status = raw <= 0.28 ? 'critical' : raw <= 0.32 ? 'attention' : 'safe';
    const newData = { fator_r_value: raw, fator_r_percent: raw * 100, status, reason, manual: true };

    await supabase
      .from('fator_r_monthly_results')
      .update({
        ...newData,
        metadata: { ...(result.metadata ?? {}), manual_review_recommended: false, updated_by_ui: true },
      })
      .eq('id', result.id);

    await supabase.from('fator_r_audit_logs').insert({
      entity_type: 'fator_r_monthly_results',
      entity_id: result.id,
      action: 'manual_adjustment',
      old_data: oldData,
      new_data: newData,
      user_id: userData.user?.id ?? null,
    });

    await load();
  };

  const folderId = (import.meta.env.VITE_FATOR_R_DRIVE_FOLDER_ID as string | undefined) || null;
  const folderUrl = folderId ? `https://drive.google.com/drive/folders/${folderId}` : null;

  return <div className="space-y-5 animate-fade-in">
    <PageHeader title="Monitoramento de Fator R" subtitle="Acompanhamento automático dos extratos PGDAS e alertas preventivos por e-mail.">
      <div className="flex items-center gap-2">
        {folderUrl && (
          <Button variant="outline" className="gap-1.5" onClick={() => window.open(folderUrl, '_blank')}>
            <ExternalLink className="h-4 w-4" /> Abrir pasta no Drive
          </Button>
        )}
        <Button onClick={runNow} className="gap-1.5" disabled={loadingSync}>
          <FolderSync className="h-4 w-4" /> {loadingSync ? 'Processando...' : 'Rodar verificação agora'}
        </Button>
      </div>
    </PageHeader>

    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {[
        ['Empresas', stats.monitored, 'from-violet-500/20 to-indigo-500/10'],
        ['Atenção', stats.attention, 'from-amber-500/25 to-orange-500/10'],
        ['Críticas', stats.critical, 'from-rose-500/25 to-red-500/10'],
        ['Seguras', stats.safe, 'from-emerald-500/25 to-green-500/10'],
        ['Resultados', results.length, 'from-sky-500/25 to-cyan-500/10'],
      ].map(([k, v, bg]) => (
        <GlassCard key={String(k)} className={`p-3 rounded-2xl bg-gradient-to-br ${bg} border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_24px_-18px_rgba(0,0,0,.8)]`}>
          <div className="text-xs uppercase tracking-wide text-foreground/70">{k}</div>
          <div className="text-2xl font-bold mt-1">{String(v)}</div>
        </GlassCard>
      ))}
    </div>

    <GlassCard className="p-4 rounded-2xl border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_18px_36px_-26px_rgba(0,0,0,.9)]">
      <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Status da integração</h3><Sparkles className="h-4 w-4 text-primary" /></div>
      <div className="flex gap-2 flex-wrap mt-3 text-xs">
        <Badge variant="default">Drive integrado</Badge>
        <Badge variant="secondary">E-mail automático</Badge>
        <Badge variant="outline">Automação {syncConfig?.sync_enabled === false ? 'desativada' : 'ativa'}</Badge>
        {syncConfig?.last_run_at && <Badge variant="outline">Última: {new Date(syncConfig.last_run_at).toLocaleString('pt-BR')}</Badge>}
      </div>
    </GlassCard>

    <div className="grid lg:grid-cols-2 gap-4">
      <GlassCard className="p-4 rounded-2xl">
        <h3 className="text-lg font-semibold mb-3">Resultados mensais (ajuste manual com auditoria)</h3>
        <div className="space-y-2 text-sm max-h-80 overflow-auto">
          {results.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 gap-2">
              <span>{r.reference_month}/{r.reference_year} • {(r.fator_r_percent ?? 0).toFixed(2)}% • {r.status}</span>
              <Button size="sm" variant="outline" onClick={() => adjustResult(r)}><Pencil className="h-3 w-3 mr-1" />Ajustar</Button>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4 rounded-2xl">
        <h3 className="text-lg font-semibold mb-3">Logs de processamento</h3>
        <div className="space-y-2 text-sm">
          {logs.map((log) => (
            <div key={log.id} className="flex justify-between rounded-xl bg-muted/40 px-3 py-2 gap-2">
              <span className="truncate">{log.event_type}: {log.message}</span>
              <span className="text-xs text-foreground/60">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  </div>;
}