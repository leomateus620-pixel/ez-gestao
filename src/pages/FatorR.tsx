/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, FolderSync, Info } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { GlassCard } from '@/components/GlassCard';
import type { FatorRStatus } from '@/services/fatorRParser';

type CompanyRow = {
  companyId: string;
  name: string;
  cnpj: string | null;
  fatorRPercent: number | null;
  status: FatorRStatus;
  period: string | null;
};

const FATOR_R_PROCESSING_TIMEOUT_MS = 25000;

const withProcessingTimeout = async <T,>(promise: Promise<T>, message: string): Promise<T> => {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), FATOR_R_PROCESSING_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

const errorMessageFrom = (error: unknown, fallback: string) => (
  error instanceof Error && error.message ? error.message : fallback
);

const normalizeStatus = (value?: string | null): FatorRStatus => {
  if (value === 'critical' || value === 'attention' || value === 'safe' || value === 'not_applicable' || value === 'parse_error') return value;
  return value === 'unknown' ? 'parse_error' : 'parse_error';
};

const formatPercent = (value: number | null | undefined) => value !== null && value !== undefined ? `${value.toFixed(2)}%` : '—';

const formatCnpj = (cnpj: string | null): string => {
  if (!cnpj) return '—';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const statusLabel: Record<FatorRStatus, string> = {
  critical: 'Crítico',
  attention: 'Atenção',
  safe: 'OK',
  not_applicable: 'Não se aplica',
  parse_error: 'Erro de leitura',
  unknown: 'Erro de leitura',
};

const columnConfig: { key: FatorRStatus; label: string; caption: string; badgeClass: string; icon: JSX.Element; accent: string }[] = [
  {
    key: 'critical',
    label: 'Crítico',
    caption: 'Fator R abaixo de 28%',
    badgeClass: 'border-red-700 bg-red-100 text-red-900 dark:border-red-300 dark:bg-red-950 dark:text-red-200',
    icon: <AlertTriangle className="h-4 w-4 text-red-700 dark:text-red-300" />,
    accent: 'var(--menu-rose)',
  },
  {
    key: 'attention',
    label: 'Atenção',
    caption: 'Fator R entre 28% e 32%',
    badgeClass: 'border-amber-700 bg-amber-100 text-amber-900 dark:border-amber-300 dark:bg-amber-950 dark:text-amber-200',
    icon: <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />,
    accent: 'var(--menu-amber)',
  },
  {
    key: 'safe',
    label: 'OK',
    caption: 'Fator R acima de 32%',
    badgeClass: 'border-emerald-700 bg-emerald-100 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />,
    accent: 'var(--menu-emerald)',
  },
];

function CompanyMiniCard({ row, badgeClass }: { row: CompanyRow; badgeClass: string }) {
  return (
    <div className="rounded-2xl border border-white/55 bg-white/60 p-3 shadow-inner dark:border-slate-700 dark:bg-slate-950/70">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-foreground truncate">{row.name}</div>
          <div className="text-xs text-foreground/70 font-medium mt-0.5">{formatCnpj(row.cnpj)}</div>
        </div>
        <Badge variant="outline" className={badgeClass}>{formatPercent(row.fatorRPercent)}</Badge>
      </div>
      {row.period && <div className="text-[11px] text-foreground/60 mt-2 uppercase tracking-wide">PA {row.period}</div>}
    </div>
  );
}

export default function FatorR() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [syncConfig, setSyncConfig] = useState<any>(null);
  const [loadingSync, setLoadingSync] = useState(false);

  const load = async () => {
    const db = supabase as any;
    const [c, r, s] = await Promise.all([
      db.from('fator_r_companies').select('id, name, cnpj, normalized_cnpj').order('name', { ascending: true }),
      db.from('fator_r_monthly_results').select('company_id, reference_month, reference_year, fator_r_percent, fator_r_value, status, not_applicable').order('reference_year', { ascending: false }).order('reference_month', { ascending: false }),
      db.from('fator_r_sync_config').select('last_run_at').limit(1).maybeSingle(),
    ]);
    setCompanies(c.data ?? []);
    setResults(r.data ?? []);
    setSyncConfig(s.data ?? null);
  };

  useEffect(() => { load(); }, []);

  // Último resultado por empresa
  const companyRows = useMemo<CompanyRow[]>(() => {
    const latest = new Map<string, any>();
    for (const r of results) {
      if (!r.company_id) continue;
      if (!latest.has(r.company_id)) latest.set(r.company_id, r);
    }
    const rows: CompanyRow[] = [];
    for (const company of companies) {
      const r = latest.get(company.id);
      if (!r) continue;
      const status: FatorRStatus = r.not_applicable ? 'not_applicable' : normalizeStatus(r.status);
      rows.push({
        companyId: company.id,
        name: company.name,
        cnpj: company.cnpj ?? company.normalized_cnpj,
        fatorRPercent: r.fator_r_percent ?? (r.fator_r_value !== null && r.fator_r_value !== undefined ? r.fator_r_value * 100 : null),
        status,
        period: r.reference_month && r.reference_year ? `${String(r.reference_month).padStart(2, '0')}/${r.reference_year}` : null,
      });
    }
    return rows;
  }, [companies, results]);

  const stats = useMemo(() => ({
    monitored: companyRows.length,
    safe: companyRows.filter((r) => r.status === 'safe').length,
    attention: companyRows.filter((r) => r.status === 'attention').length,
    critical: companyRows.filter((r) => r.status === 'critical').length,
    notApplicable: companyRows.filter((r) => r.status === 'not_applicable').length,
  }), [companyRows]);

  const runNow = async () => {
    setLoadingSync(true);
    try {
      const { data, error } = await withProcessingTimeout(
        supabase.functions.invoke('fator-r-drive-sync', { body: { trigger: 'manual' } }),
        'Tempo limite excedido ao processar a pasta do Drive.',
      );
      if (error || data?.ok === false) throw error ?? new Error(data?.error ?? 'Falha no processamento');
      toast.success('Pasta do Drive processada.');
      await load();
    } catch (error) {
      toast.error('Não foi possível processar a pasta do Drive.', {
        description: errorMessageFrom(error, 'Verifique a função fator-r-drive-sync.'),
      });
    } finally {
      setLoadingSync(false);
    }
  };

  const folderId = (import.meta.env.VITE_FATOR_R_DRIVE_FOLDER_ID as string | undefined) || null;
  const folderUrl = folderId ? `https://drive.google.com/drive/folders/${folderId}` : null;
  const lastRun = syncConfig?.last_run_at ? new Date(syncConfig.last_run_at).toLocaleString('pt-BR') : '—';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Monitoramento de Fator R"
        subtitle="Uma única pasta no Drive concentra todos os extratos PGDAS. O sistema varre automaticamente no dia 20 de cada mês."
      >
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {folderUrl && (
            <Button variant="outline" className="gap-1.5" onClick={() => window.open(folderUrl, '_blank')}>
              <ExternalLink className="h-4 w-4" /> Abrir pasta PGDAS
            </Button>
          )}
          <Button onClick={runNow} className="gap-1.5" disabled={loadingSync}>
            <FolderSync className="h-4 w-4" /> {loadingSync ? 'Processando...' : 'Rodar verificação'}
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ['Empresas', stats.monitored, 'Detectadas nos PDFs', 'var(--menu-violet)'],
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

      <GlassCard className="p-4 rounded-[24px]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Resultado da varredura</h3>
            <p className="text-sm text-foreground/75 mt-1 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              Última verificação: {lastRun}
            </p>
          </div>
        </div>

        {companyRows.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-5 text-sm text-foreground/75">
            Nenhum PGDAS processado ainda. Coloque os extratos na pasta <strong>PGDAS JULHO</strong> do Drive e clique em <strong>Rodar verificação</strong>.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3 mt-4">
            {columnConfig.map((col) => {
              const items = companyRows.filter((r) => r.status === col.key);
              return (
                <div key={col.key} className="rounded-2xl border border-white/55 bg-white/40 p-3 dark:border-slate-700 dark:bg-slate-950/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {col.icon}
                      <div>
                        <div className="font-semibold text-foreground">{col.label}</div>
                        <div className="text-[11px] text-foreground/60">{col.caption}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className={col.badgeClass}>{items.length}</Badge>
                  </div>
                  {items.length === 0 ? (
                    <div className="text-xs text-foreground/60 italic py-4 text-center">Sem empresas nesta faixa.</div>
                  ) : (
                    <div className="space-y-2">
                      {items.map((row) => (
                        <CompanyMiniCard key={row.companyId} row={row} badgeClass={col.badgeClass} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {stats.notApplicable > 0 && (
          <div className="mt-4 text-xs text-foreground/70">
            <strong>{stats.notApplicable}</strong> empresa(s) com PGDAS marcado como <em>Não se aplica</em> ao Fator R.
          </div>
        )}
      </GlassCard>
    </div>
  );
}
