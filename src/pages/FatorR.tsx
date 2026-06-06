/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AlertTriangle, Archive, CheckCircle2, ExternalLink, FileText, FolderSync, Mail, Pencil, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { GlassCard } from '@/components/GlassCard';
import { type FatorRParseResult, type FatorRStatus } from '@/services/fatorRParser';
import { FatorRRecipientsCard } from '@/components/FatorRRecipientsCard';

type EmailResult = {
  attempted: boolean;
  sent: boolean;
  dryRun?: boolean;
  error: string | null;
  provider?: string;
};

type ManualPdfResult = {
  fileName: string;
  status: FatorRStatus;
  recommendation: string;
  alert: boolean;
  alertFrom: string;
  alertTo: string;
  parsed: FatorRParseResult | null;
  email?: EmailResult;
  driveWebUrl?: string | null;
  storageStatus?: string | null;
  cloudStoragePath?: string | null;
  driveFileId?: string | null;
  driveProcessedFileId?: string | null;
  movedToAnalyzed?: boolean;
  error?: string;
};

type PdfCardData = {
  id: string;
  fileName: string;
  parsed: Partial<FatorRParseResult> | null;
  status: FatorRStatus;
  recommendation?: string | null;
  alert: boolean;
  emailLabel: string;
  movedToAnalyzed: boolean;
  driveWebUrl?: string | null;
  error?: string | null;
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
  critical: 'Crítico',
  attention: 'Atenção',
  safe: 'OK',
  not_applicable: 'Não se aplica',
  parse_error: 'Erro de leitura',
  unknown: 'Erro de leitura',
};

const statusBadgeClass: Record<FatorRStatus, string> = {
  safe: 'border-emerald-700 bg-emerald-100 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200',
  attention: 'border-amber-700 bg-amber-100 text-amber-900 dark:border-amber-300 dark:bg-amber-950 dark:text-amber-200',
  critical: 'border-red-700 bg-red-100 text-red-900 dark:border-red-300 dark:bg-red-950 dark:text-red-200',
  not_applicable: 'border-sky-700 bg-sky-100 text-sky-900 dark:border-sky-300 dark:bg-sky-950 dark:text-sky-200',
  parse_error: 'border-slate-700 bg-slate-100 text-slate-900 dark:border-slate-300 dark:bg-slate-900 dark:text-slate-200',
  unknown: 'border-slate-700 bg-slate-100 text-slate-900 dark:border-slate-300 dark:bg-slate-900 dark:text-slate-200',
};

const normalizeStatus = (value?: string | null): FatorRStatus => {
  if (value === 'critical' || value === 'attention' || value === 'safe' || value === 'not_applicable' || value === 'parse_error') return value;
  return value === 'unknown' ? 'parse_error' : 'parse_error';
};

const formatMoney = (value: number | null | undefined) => value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—';
const formatPercent = (value: number | null | undefined) => value !== null && value !== undefined ? `${value.toFixed(2)}%` : '—';
const formatPeriod = (parsed?: Partial<FatorRParseResult> | null) => parsed?.period ?? (parsed?.referenceMonth && parsed?.referenceYear ? `${String(parsed.referenceMonth).padStart(2, '0')}/${parsed.referenceYear}` : 'Período não identificado');
const formatFatorR = (parsed?: Partial<FatorRParseResult> | null) => {
  if (!parsed) return '—';
  if (parsed.notApplicable) return 'Não se aplica';
  return formatPercent(parsed.fatorRPercent ?? (parsed.fatorRValue !== null && parsed.fatorRValue !== undefined ? parsed.fatorRValue * 100 : null));
};

const statusHeadline = (status: FatorRStatus, parsed?: Partial<FatorRParseResult> | null) => {
  if (status === 'not_applicable') return 'Não se aplica ao Fator R';
  if (status === 'critical') {
    const fator = parsed?.fatorR ?? parsed?.fatorRValue ?? null;
    return fator !== null && fator !== undefined && fator < 0.28 ? 'Crítico — Fator R abaixo do limite' : 'Crítico — Fator R no limite de 28%';
  }
  if (status === 'attention') {
    const percent = parsed?.fatorRPercent ?? null;
    return percent !== null ? `Atenção — Fator R em ${Number(percent.toFixed(2)).toLocaleString('pt-BR')}%` : 'Atenção — Fator R em faixa preventiva';
  }
  if (status === 'safe') return 'OK — Fator R seguro';
  return 'Erro de leitura — Não foi possível processar este PDF';
};

const emailLabelFrom = (result: ManualPdfResult) => {
  if (!result.alert) return 'Não enviado';
  if (result.email?.dryRun) return 'Simulado';
  if (result.email?.sent) return 'Enviado';
  if (result.email?.attempted) return 'Tentativa registrada';
  return 'Pendente';
};

const parsedFromDocument = (row: any): Partial<FatorRParseResult> | null => {
  const parseJson = row.parse_json && Object.keys(row.parse_json).length ? row.parse_json : null;
  const extracted = row.extracted_data ?? {};
  return parseJson ?? extracted.parsed ?? (extracted.companyName || extracted.status ? extracted : null);
};

function PdfResultCard({ card }: { card: PdfCardData }) {
  const parsed = card.parsed;
  const icon = card.status === 'critical' || card.status === 'attention'
    ? <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
    : card.status === 'parse_error'
      ? <FileText className="h-4 w-4 text-slate-700 dark:text-slate-300" />
      : <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />;

  const fields = [
    ['Empresa', parsed?.companyName || 'Não identificada'],
    ['CNPJ básico', parsed?.cnpjBase || parsed?.cnpj || 'Não identificado'],
    ['PA', formatPeriod(parsed)],
    ['Fator R', formatFatorR(parsed)],
    ['Status', statusLabel[card.status]],
    ['RPA', formatMoney(parsed?.rpa)],
    ['RBT12', formatMoney(parsed?.rbt12 ?? parsed?.revenue12m)],
    ['FS12', parsed?.folhaAusente ? 'Nenhuma' : formatMoney(parsed?.payroll12 ?? parsed?.payroll12m)],
    ['Anexo', parsed?.anexo || '—'],
    ['DAS total', formatMoney(parsed?.dasTotal)],
    ['Pagamento', parsed?.paymentRecognized === null || parsed?.paymentRecognized === undefined ? 'Não identificado' : parsed.paymentRecognized ? 'Reconhecido' : 'Não reconhecido'],
    ['E-mail', card.emailLabel],
    ['Analisados', card.movedToAnalyzed ? 'Movido' : 'Pendente'],
  ];

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="font-bold text-foreground flex items-center gap-2">
            {icon}
            <span className="truncate">{card.fileName}</span>
          </div>
          <div className="text-sm text-foreground/75 font-medium">{statusHeadline(card.status, parsed)}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge variant="outline" className={statusBadgeClass[card.status]}>{statusLabel[card.status]}</Badge>
          {card.driveWebUrl && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(card.driveWebUrl!, '_blank')}>
              <ExternalLink className="h-3.5 w-3.5" /> Abrir PDF
            </Button>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4 text-sm">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/55 bg-white/48 p-3 shadow-inner dark:border-slate-700 dark:bg-slate-950/70">
            <div className="text-xs text-foreground/75 font-medium uppercase tracking-wide">{label}</div>
            <strong className="text-foreground font-semibold">{String(value)}</strong>
          </div>
        ))}
      </div>

      {card.error && <p className="text-sm text-red-700 dark:text-red-300 mt-3 font-medium">Não foi possível processar este PDF.</p>}
      {!card.error && card.recommendation && <p className={`text-sm mt-3 font-medium ${card.status === 'critical' ? 'text-red-700 dark:text-red-300' : card.status === 'attention' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'}`}>{card.recommendation}</p>}
      <div className="flex items-center gap-2 text-sm mt-3 text-foreground/75 font-medium">
        <Archive className="h-3.5 w-3.5" />
        {card.movedToAnalyzed ? 'Arquivo salvo em Analisados.' : 'Arquivo ainda não confirmado em Analisados.'}
      </div>
      <div className="flex items-center gap-2 text-sm mt-2 text-foreground/75 font-medium">
        <Mail className="h-3.5 w-3.5" />
        {card.alert ? `Alerta: ${card.emailLabel}` : 'Sem alerta para este PDF.'}
      </div>
    </div>
  );
}

export default function FatorR() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingSync, setLoadingSync] = useState(false);
  const [processingManualPdfs, setProcessingManualPdfs] = useState(false);
  const [manualResults, setManualResults] = useState<ManualPdfResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const db = supabase as any;
    const [c, r, d] = await Promise.all([
      db.from('fator_r_companies').select('*').order('created_at', { ascending: false }).limit(20),
      db.from('fator_r_monthly_results').select('*').order('reference_year', { ascending: false }).order('reference_month', { ascending: false }).limit(50),
      db.from('fator_r_documents').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setCompanies(c.data ?? []);
    setResults(r.data ?? []);
    setDocuments(d.data ?? []);
  };

  useEffect(() => { load(); }, []);

  const documentCards = useMemo<PdfCardData[]>(() => documents.map((row) => {
    const parsed = parsedFromDocument(row);
    const status = normalizeStatus(row.fator_r_status ?? parsed?.status ?? (row.processing_status === 'failed' ? 'parse_error' : null));
    const alert = status === 'attention' || status === 'critical';
    const movedToAnalyzed = row.storage_status === 'analyzed' || Boolean(row.drive_processed_file_id) || Boolean(row.extracted_data?.moved_to_analyzed);
    const emailLabel = row.email_status === 'sent'
      ? 'Enviado'
      : row.email_status === 'dry_run'
        ? 'Simulado'
        : alert
          ? 'Pendente'
          : 'Não enviado';
    return {
      id: row.id,
      fileName: row.drive_file_name,
      parsed,
      status,
      recommendation: parsed?.alertReason ?? row.alert_reason ?? row.extracted_data?.recommendation ?? null,
      alert,
      emailLabel,
      movedToAnalyzed,
      driveWebUrl: row.drive_web_url,
      error: row.processing_status === 'failed' ? 'parse_error' : null,
    };
  }), [documents]);

  const manualCards = useMemo<PdfCardData[]>(() => manualResults.map((result) => ({
    id: `manual-${result.fileName}`,
    fileName: result.fileName,
    parsed: result.parsed,
    status: normalizeStatus(result.status),
    recommendation: result.recommendation,
    alert: result.alert,
    emailLabel: emailLabelFrom(result),
    movedToAnalyzed: Boolean(result.movedToAnalyzed || result.driveProcessedFileId || result.storageStatus === 'analyzed' || result.storageStatus === 'skipped_duplicate'),
    driveWebUrl: result.driveWebUrl,
    error: result.error ?? null,
  })), [manualResults]);

  const allCards = useMemo(() => [...manualCards, ...documentCards], [manualCards, documentCards]);

  const stats = useMemo(() => ({
    monitored: companies.length,
    safe: allCards.filter((card) => card.status === 'safe').length,
    attention: allCards.filter((card) => card.status === 'attention').length,
    critical: allCards.filter((card) => card.status === 'critical').length,
    notApplicable: allCards.filter((card) => card.status === 'not_applicable').length,
  }), [companies.length, allCards]);

  const runNow = async () => {
    setLoadingSync(true);
    try {
      const { data, error } = await supabase.functions.invoke('fator-r-drive-sync', { body: { trigger: 'manual' } });
      if (error || data?.ok === false) throw error ?? new Error(data?.error ?? 'Falha no processamento');
      toast.success('Pasta do Drive processada.');
      await load();
    } catch (error) {
      toast.error('Não foi possível processar a pasta do Drive.', {
        description: error instanceof Error ? error.message : 'Verifique a função fator-r-drive-sync.',
      });
    } finally {
      setLoadingSync(false);
    }
  };

  const handleManualPdfUpload = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;

    const pdfs = selectedFiles.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length !== selectedFiles.length) toast.warning('Apenas arquivos PDF serão processados.');
    if (!pdfs.length) return;

    setProcessingManualPdfs(true);
    try {
      const payloadFiles = await Promise.all(pdfs.map(async (file) => ({ name: file.name, base64: await fileToBase64(file) })));
      const dryRun = (import.meta.env.VITE_FATOR_R_EMAIL_DRY_RUN as string | undefined) !== 'false';
      const { data, error } = await supabase.functions.invoke('fator-r-process-upload', {
        body: { files: payloadFiles, alertFrom: ALERT_FROM, alertTo: ALERT_TO, persist: true, sendAlerts: true, dryRun },
      });

      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error ?? 'Falha no processamento');
      const processed = (data?.processed ?? []) as ManualPdfResult[];
      setManualResults(processed);
      toast.success(`${processed.length} PDF(s) processado(s).`);
      await load();
    } catch (_error) {
      setManualResults([]);
      toast.error('Não foi possível processar este PDF.');
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
    if (!Number.isFinite(raw)) {
      toast.error('Fator R inválido', { description: 'Informe um decimal como 0,31 ou um percentual como 31%.' });
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const oldData = { fator_r_value: result.fator_r_value, fator_r_percent: result.fator_r_percent, status: result.status };
    const status: FatorRStatus = raw <= 0.28 ? 'critical' : raw <= 0.32 ? 'attention' : 'safe';
    const newData = { fator_r_value: raw, fator_r_percent: raw * 100, status, reason, manual: true };

    const { error: updateError } = await (supabase as any)
      .from('fator_r_monthly_results')
      .update({ ...newData, metadata: { ...(result.metadata ?? {}), manual_review_recommended: false, updated_by_ui: true } })
      .eq('id', result.id);
    if (updateError) {
      toast.error('Falha ao atualizar Fator R', { description: updateError.message });
      return;
    }

    const { error: auditError } = await (supabase as any).from('fator_r_audit_logs').insert({
      entity_type: 'fator_r_monthly_results',
      entity_id: result.id,
      action: 'manual_adjustment',
      old_data: oldData,
      new_data: newData,
      user_id: userData.user?.id ?? null,
    });
    if (auditError) {
      toast.error('Ajuste salvo sem auditoria', { description: auditError.message });
      return;
    }

    await load();
    toast.success('Fator R ajustado com auditoria');
  };

  const folderId = (import.meta.env.VITE_FATOR_R_DRIVE_FOLDER_ID as string | undefined) || null;
  const folderUrl = folderId ? `https://drive.google.com/drive/folders/${folderId}` : null;

  return <div className="space-y-5">
    <PageHeader title="Monitoramento de Fator R" subtitle="Acompanhamento dos PGDAS no Drive com leitura clara, cores por criticidade e alertas preventivos por e-mail.">
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
          <Upload className="h-4 w-4" /> {processingManualPdfs ? 'Processando PDFs...' : 'Anexar PDFs'}
        </Button>
        <Button onClick={runNow} className="gap-1.5" disabled={loadingSync}>
          <FolderSync className="h-4 w-4" /> {loadingSync ? 'Processando...' : 'Rodar verificação'}
        </Button>
      </div>
    </PageHeader>

    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {[
        ['Empresas', stats.monitored, 'Base monitorada', 'var(--menu-violet)'],
        ['OK', stats.safe, 'Dentro da faixa segura', 'var(--menu-emerald)'],
        ['Atenção', stats.attention, 'Faixa preventiva', 'var(--menu-amber)'],
        ['Críticos', stats.critical, 'Abaixo do limite', 'var(--menu-rose)'],
        ['Não se aplica', stats.notApplicable, 'Sem enquadramento', 'var(--menu-cyan)'],
      ].map(([label, value, caption, color]) => (
        <div key={String(label)} className="liquid-stat-card" style={{ '--stat-color': color } as CSSProperties}>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/66">{label}</div>
          <div className="mt-2 text-3xl font-black tracking-tight text-foreground">{String(value)}</div>
          <p className="text-xs font-medium text-foreground/70">{caption}</p>
        </div>
      ))}
    </div>

    <FatorRRecipientsCard />

    <GlassCard className="p-4 rounded-[24px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">PDFs processados</h3>
          <p className="text-sm text-foreground/75 mt-1">Cada PGDAS aparece em um card separado com status, alerta, e-mail e confirmação da pasta Analisados.</p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={processingManualPdfs}>
          <Upload className="h-4 w-4" /> Selecionar PDFs
        </Button>
      </div>

      {allCards.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-5 text-sm text-foreground/75">
          Nenhum PDF processado ainda. Anexe PGDAS manualmente ou rode a verificação da pasta do Drive.
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {allCards.map((card) => <PdfResultCard key={card.id} card={card} />)}
        </div>
      )}
    </GlassCard>

    <GlassCard className="p-4 rounded-[24px]">
      <h3 className="text-lg font-semibold mb-3 text-foreground">Resultados mensais</h3>
      <div className="space-y-2 text-sm max-h-80 overflow-auto">
        {results.length === 0 ? (
          <div className="rounded-2xl border border-white/55 bg-white/48 px-3 py-3 text-foreground/75 shadow-inner dark:border-slate-700 dark:bg-slate-950/70">
            Nenhum resultado mensal registrado.
          </div>
        ) : results.map((result) => (
          <div key={result.id} className="flex items-center justify-between gap-2 rounded-2xl border border-white/55 bg-white/48 px-3 py-2 shadow-inner dark:border-slate-700 dark:bg-slate-950/70">
            <span className="text-foreground font-medium">
              {String(result.reference_month).padStart(2, '0')}/{result.reference_year} • {formatPercent(result.fator_r_percent)} • {statusLabel[normalizeStatus(result.status)]}
            </span>
            <Button size="sm" variant="outline" onClick={() => adjustResult(result)}><Pencil className="h-3 w-3 mr-1" />Ajustar</Button>
          </div>
        ))}
      </div>
    </GlassCard>
  </div>;
}
