/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, FolderSync, Mail, Pencil, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { GlassCard } from '@/components/GlassCard';
import { type FatorRParseResult, type FatorRStatus } from '@/services/fatorRParser';

type ManualPdfResult = {
  fileName: string;
  status: FatorRStatus;
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

const statusLabel: Record<FatorRStatus, string> = {
  critical: 'Crítica',
  attention: 'Atenção',
  safe: 'Segura',
  not_applicable: 'Não se aplica',
  unknown: 'Revisar',
};

const statusBadgeClass: Record<FatorRStatus, string> = {
  safe: 'border-emerald-700 bg-emerald-100 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200',
  attention: 'border-amber-700 bg-amber-100 text-amber-900 dark:border-amber-300 dark:bg-amber-950 dark:text-amber-200',
  critical: 'border-red-700 bg-red-100 text-red-900 dark:border-red-300 dark:bg-red-950 dark:text-red-200',
  not_applicable: 'border-sky-700 bg-sky-100 text-sky-900 dark:border-sky-300 dark:bg-sky-950 dark:text-sky-200',
  unknown: 'border-slate-600 bg-slate-100 text-slate-900 dark:border-slate-300 dark:bg-slate-900 dark:text-slate-200',
};

const formatMoney = (value: number | null | undefined) => value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—';
const formatPercent = (value: number | null | undefined) => value !== null && value !== undefined ? `${value.toFixed(2)}%` : '—';
const formatFatorR = (parsed: FatorRParseResult) => parsed.notApplicable ? 'Não se aplica' : formatPercent(parsed.fatorRPercent);
const formatPeriod = (parsed: FatorRParseResult) => parsed.referenceMonth && parsed.referenceYear ? `${String(parsed.referenceMonth).padStart(2, '0')}/${parsed.referenceYear}` : 'Período não identificado';

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
      if (data?.ok === false) throw new Error(data.error ?? 'A função remota de processamento não respondeu. Verifique deploy e secrets no Supabase.');
      const processed = (data?.processed ?? []) as ManualPdfResult[];
      setManualResults(processed);
      toast.success(`${processed.length} PDF(s) interpretado(s) individualmente.`);
      await load();
    } catch (error) {
      console.error('Falha no processamento remoto de PDFs PGDAS.', error);
      setManualResults([]);
      const message = error instanceof Error && error.message
        ? error.message
        : 'Falha ao extrair texto do PDF na função remota. Verifique deploy da Edge Function e logs do Supabase.';
      toast.error(message.includes('FunctionsFetchError')
        ? 'A função remota de processamento não respondeu. Verifique deploy e secrets no Supabase.'
        : message);
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
    const status: FatorRStatus = raw <= 0.28 ? 'critical' : raw <= 0.32 ? 'attention' : 'safe';
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
        <GlassCard key={String(k)} className={`p-3 rounded-2xl bg-gradient-to-br ${bg} border border-slate-300/80 dark:border-slate-700 shadow-sm`}>
          <div className="text-xs uppercase tracking-wide text-foreground/75 font-medium">{k}</div>
          <div className="text-2xl font-bold mt-1 text-foreground">{String(v)}</div>
        </GlassCard>
      ))}
    </div>

    <GlassCard className="p-4 rounded-2xl border border-slate-300/80 dark:border-slate-700 bg-white/90 dark:bg-slate-900/85 shadow-sm">
      <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Status da integração</h3><Sparkles className="h-4 w-4 text-primary" /></div>
      <div className="flex gap-2 flex-wrap mt-3 text-xs">
        <Badge variant="default">Drive integrado</Badge>
        <Badge variant="secondary">Teste manual por PDF</Badge>
        <Badge variant="secondary">E-mail: {ALERT_FROM} → {ALERT_TO}</Badge>
        <Badge variant="outline">Automação {syncConfig?.sync_enabled === false ? 'desativada' : 'ativa'}</Badge>
        {syncConfig?.last_run_at && <Badge variant="outline">Última: {new Date(syncConfig.last_run_at).toLocaleString('pt-BR')}</Badge>}
      </div>
    </GlassCard>

    <GlassCard className="p-4 rounded-2xl border border-slate-300/80 dark:border-slate-700 bg-white/90 dark:bg-slate-900/85 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Validação manual dos 3 PDFs PGDAS</h3>
          <p className="text-sm text-foreground/75 mt-1">Anexe os PDFs dos clientes para interpretar CNPJ, período, Fator R, FS12/RBT12 e disparar alerta quando o índice ficar até 32%.</p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={processingManualPdfs}>
          <Upload className="h-4 w-4" /> Selecionar PDFs
        </Button>
      </div>

      {manualResults.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-5 text-sm text-foreground/75">
          Nenhum PDF anexado nesta sessão. O teste funciona sem pasta do Drive: cada PDF é enviado à função <strong>fator-r-process-upload</strong>, interpretado individualmente e registrado nos resultados/logs.
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {manualResults.map((result) => (
            <div key={result.fileName} className="rounded-2xl bg-white/90 dark:bg-slate-900/85 p-4 border border-slate-300/80 dark:border-slate-700 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-2">
                    {result.alert ? <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" /> : <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />}
                    {result.fileName}
                  </div>
                  <div className="text-sm text-foreground/75 font-medium">
                    {result.parsed.companyName || 'Empresa não identificada'} • {result.parsed.cnpj || 'CNPJ não identificado'} • {formatPeriod(result.parsed)}
                  </div>
                </div>
                <Badge variant="outline" className={statusBadgeClass[result.status]}>{statusLabel[result.status]}</Badge>
              </div>

              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4 text-sm">
                {[
                  ['Empresa', result.parsed.companyName || 'Não identificada'],
                  ['CNPJ', result.parsed.cnpj || 'Não identificado'],
                  ['Período', formatPeriod(result.parsed)],
                  ['Status', statusLabel[result.status]],
                  ['Fator R', formatFatorR(result.parsed)],
                  ['Fator R calculado', formatPercent(result.parsed.computedFatorRPercent)],
                  ['RBT12', formatMoney(result.parsed.revenue12m)],
                  ['FS12', result.parsed.folhaAusente ? 'Nenhuma' : formatMoney(result.parsed.payroll12m)],
                  ['Confiança', `${Math.round(result.parsed.confidence * 100)}%`],
                  ['Alerta de e-mail', result.alert ? (result.email?.sent ? 'Enviado' : result.email?.attempted ? 'Tentativa registrada' : 'Pendente') : 'Não aplicável'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700 p-3">
                    <div className="text-xs text-foreground/75 font-medium uppercase tracking-wide">{label}</div>
                    <strong className="text-foreground font-semibold">{value}</strong>
                  </div>
                ))}
              </div>

              <p className={`text-sm mt-3 font-medium ${result.status === 'critical' ? 'text-red-700 dark:text-red-300' : result.status === 'attention' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'}`}>{result.recommendation}</p>
              <div className="flex items-center gap-2 text-sm mt-3 text-foreground/75 font-medium">
                <Mail className="h-3.5 w-3.5" />
                {result.alert
                  ? `Alerta para ${result.alertTo}: ${result.email?.sent ? 'enviado' : result.email?.attempted ? 'tentativa registrada' : 'pendente/não enviado'}`
                  : result.status === 'not_applicable' ? 'Sem alerta: este PGDAS informa que o Fator R não se aplica.' : 'Sem alerta automático para este status.'}
              </div>
              {!!result.parsed.warnings.length && <div className="text-sm text-amber-700 dark:text-amber-300 mt-2 font-medium">Avisos: {result.parsed.warnings.join(' ')}</div>}
              {result.email?.error && <div className="text-sm text-red-700 dark:text-red-300 mt-2 font-medium">E-mail: {result.email.error}</div>}
            </div>
          ))}
        </div>
      )}
    </GlassCard>

    <div className="grid lg:grid-cols-2 gap-4">
      <GlassCard className="p-4 rounded-2xl border border-slate-300/80 dark:border-slate-700 bg-white/90 dark:bg-slate-900/85 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Resultados mensais (ajuste manual com auditoria)</h3>
        <div className="space-y-2 text-sm max-h-80 overflow-auto">
          {results.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700 px-3 py-2 gap-2">
              <span>{r.reference_month}/{r.reference_year} • {(r.fator_r_percent ?? 0).toFixed(2)}% • {r.status}</span>
              <Button size="sm" variant="outline" onClick={() => adjustResult(r)}><Pencil className="h-3 w-3 mr-1" />Ajustar</Button>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4 rounded-2xl border border-slate-300/80 dark:border-slate-700 bg-white/90 dark:bg-slate-900/85 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Logs de processamento</h3>
        <div className="space-y-2 text-sm">
          {logs.map((log) => (
            <div key={log.id} className="flex justify-between rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700 px-3 py-2 gap-2">
              <span className="truncate">{log.event_type}: {log.message}</span>
              <span className="text-xs text-foreground/75">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  </div>;
}
