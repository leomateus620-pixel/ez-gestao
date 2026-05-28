/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, FolderSync, Mail, Pencil, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { GlassCard } from '@/components/GlassCard';
import { classifyFatorR, getFatorRRecommendation, parseFatorRFromText, type FatorRParseResult } from '@/services/fatorRParser';

type ManualPdfResult = {
  fileName: string;
  status: 'critical' | 'attention' | 'safe' | 'unknown';
  recommendation: string;
  alert: boolean;
  alertFrom: string;
  alertTo: string;
  parsed: FatorRParseResult;
  email?: { attempted: boolean; sent: boolean; error: string | null };
};

const ALERT_FROM = 'leomateus620@gmail.com';
const ALERT_TO = 'ricardo@escritoriozimmermann.com.br';

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const statusLabel: Record<ManualPdfResult['status'], string> = {
  critical: 'Crítica',
  attention: 'Atenção',
  safe: 'Segura',
  unknown: 'Revisar',
};

export default function FatorR() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [syncConfig, setSyncConfig] = useState<any>(null);
  const [loadingSync, setLoadingSync] = useState(false);
  const [processingManualPdfs, setProcessingManualPdfs] = useState(false);
  const [manualResults, setManualResults] = useState<ManualPdfResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const db = supabase as any;
    const [c, r, l, s] = await Promise.all([
      db.from('fator_r_companies').select('*').order('created_at', { ascending: false }).limit(20),
      db.from('fator_r_monthly_results').select('*').order('reference_year', { ascending: false }).limit(50),
      db.from('fator_r_processing_logs').select('*').order('created_at', { ascending: false }).limit(10),
      db.from('fator_r_sync_config').select('*').limit(1).maybeSingle(),
    ]);
    setCompanies(c.data ?? []);
    setResults(r.data ?? []);
    setLogs(l.data ?? []);
    setSyncConfig(s.data ?? null);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    monitored: companies.length,
    attention: results.filter((r) => r.status === 'attention').length + manualResults.filter((r) => r.status === 'attention').length,
    critical: results.filter((r) => r.status === 'critical').length + manualResults.filter((r) => r.status === 'critical').length,
    safe: results.filter((r) => r.status === 'safe').length + manualResults.filter((r) => r.status === 'safe').length,
  }), [companies, results, manualResults]);

  const runNow = async () => {
    setLoadingSync(true);
    await supabase.functions.invoke('fator-r-drive-sync', { body: { trigger: 'manual' } });
    await load();
    setLoadingSync(false);
  };

  const handleManualPdfUpload = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;

    const pdfs = selectedFiles.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length !== selectedFiles.length) toast.warning('Apenas arquivos PDF serão processados no teste de Fator R.');
    if (!pdfs.length) return;

    setProcessingManualPdfs(true);
    try {
      const payloadFiles = await Promise.all(pdfs.map(async (file) => ({ name: file.name, base64: await fileToBase64(file) })));
      const { data, error } = await supabase.functions.invoke('fator-r-process-upload', {
        body: { files: payloadFiles, alertFrom: ALERT_FROM, alertTo: ALERT_TO, persist: true, sendAlerts: true },
      });

      if (error) throw error;
      const processed = (data?.processed ?? []) as ManualPdfResult[];
      setManualResults(processed);
      toast.success(`${processed.length} PDF(s) interpretado(s) individualmente.`);
      await load();
    } catch (error) {
      console.warn('Falha no processamento remoto; usando leitura textual local como contingência.', error);
      const fallbackResults = await Promise.all(pdfs.map(async (file) => {
        const text = await file.text();
        const parsed = parseFatorRFromText(text, file.name);
        const status = classifyFatorR(parsed.fatorRValue);
        return {
          fileName: file.name,
          status,
          recommendation: getFatorRRecommendation(status),
          alert: status === 'attention' || status === 'critical',
          alertFrom: ALERT_FROM,
          alertTo: ALERT_TO,
          parsed,
          email: { attempted: false, sent: false, error: 'Processamento local: e-mail não disparado.' },
        } satisfies ManualPdfResult;
      }));
      setManualResults(fallbackResults);
      toast.error('Não foi possível acionar a função de PDF; exibindo interpretação local limitada.');
    } finally {
      setProcessingManualPdfs(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

    await (supabase as any)
      .from('fator_r_monthly_results')
      .update({
        ...newData,
        metadata: { ...(result.metadata ?? {}), manual_review_recommended: false, updated_by_ui: true },
      })
      .eq('id', result.id);

    await (supabase as any).from('fator_r_audit_logs').insert({
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
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {folderUrl && (
          <Button variant="outline" className="gap-1.5" onClick={() => window.open(folderUrl, '_blank')}>
            <ExternalLink className="h-4 w-4" /> Abrir pasta no Drive
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(event) => handleManualPdfUpload(event.target.files)}
        />
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1.5" disabled={processingManualPdfs}>
          <Upload className="h-4 w-4" /> {processingManualPdfs ? 'Interpretando PDFs...' : 'Anexar PDFs para teste'}
        </Button>
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
        ['Resultados', results.length + manualResults.length, 'from-sky-500/25 to-cyan-500/10'],
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
        <Badge variant="secondary">Teste manual por PDF</Badge>
        <Badge variant="secondary">E-mail: {ALERT_FROM} → {ALERT_TO}</Badge>
        <Badge variant="outline">Automação {syncConfig?.sync_enabled === false ? 'desativada' : 'ativa'}</Badge>
        {syncConfig?.last_run_at && <Badge variant="outline">Última: {new Date(syncConfig.last_run_at).toLocaleString('pt-BR')}</Badge>}
      </div>
    </GlassCard>

    <GlassCard className="p-4 rounded-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Validação manual dos 3 PDFs PGDAS</h3>
          <p className="text-sm text-foreground/65 mt-1">Anexe os PDFs dos clientes para interpretar CNPJ, período, Fator R, FS12/RBT12 e disparar alerta quando o índice ficar até 32%.</p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={processingManualPdfs}>
          <Upload className="h-4 w-4" /> Selecionar PDFs
        </Button>
      </div>

      {manualResults.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-5 text-sm text-foreground/70">
          Nenhum PDF anexado nesta sessão. O teste funciona sem pasta do Drive: cada PDF é enviado à função <strong>fator-r-process-upload</strong>, interpretado individualmente e registrado nos resultados/logs.
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {manualResults.map((result) => (
            <div key={result.fileName} className="rounded-2xl bg-muted/40 p-4 border border-white/20">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {result.alert ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    {result.fileName}
                  </div>
                  <div className="text-xs text-foreground/60 mt-1">
                    {result.parsed.companyName || 'Empresa não identificada'} • {result.parsed.cnpj || 'CNPJ não identificado'} • {result.parsed.referenceMonth && result.parsed.referenceYear ? `${result.parsed.referenceMonth}/${result.parsed.referenceYear}` : 'Período não identificado'}
                  </div>
                </div>
                <Badge variant={result.status === 'safe' ? 'default' : result.status === 'unknown' ? 'outline' : 'destructive'}>{statusLabel[result.status]}</Badge>
              </div>
              <div className="grid md:grid-cols-4 gap-2 mt-3 text-sm">
                <div className="rounded-xl bg-background/60 p-3"><div className="text-xs text-foreground/55">Fator R</div><strong>{result.parsed.fatorRPercent !== null ? `${result.parsed.fatorRPercent.toFixed(2)}%` : 'Não encontrado'}</strong></div>
                <div className="rounded-xl bg-background/60 p-3"><div className="text-xs text-foreground/55">FS12</div><strong>{result.parsed.payroll12m?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—'}</strong></div>
                <div className="rounded-xl bg-background/60 p-3"><div className="text-xs text-foreground/55">RBT12</div><strong>{result.parsed.revenue12m?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—'}</strong></div>
                <div className="rounded-xl bg-background/60 p-3"><div className="text-xs text-foreground/55">Confiança</div><strong>{Math.round(result.parsed.confidence * 100)}%</strong></div>
              </div>
              <p className="text-sm mt-3 text-foreground/75">{result.recommendation}</p>
              <div className="flex items-center gap-2 text-xs mt-3 text-foreground/65">
                <Mail className="h-3.5 w-3.5" />
                {result.alert
                  ? `Alerta para ${result.alertTo}: ${result.email?.sent ? 'enviado' : result.email?.attempted ? 'tentativa registrada' : 'pendente/não enviado'}`
                  : 'Sem alerta: Fator R acima de 32%.'}
              </div>
              {!!result.parsed.warnings.length && <div className="text-xs text-amber-600 mt-2">Avisos: {result.parsed.warnings.join(' ')}</div>}
              {result.email?.error && <div className="text-xs text-destructive mt-2">E-mail: {result.email.error}</div>}
            </div>
          ))}
        </div>
      )}
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
