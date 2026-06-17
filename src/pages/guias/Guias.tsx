import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Download, FileText, FolderCog, Loader2, Play, Send, ShieldAlert, FlaskConical, Rocket } from 'lucide-react';
import { useGuides } from '@/features/guias/GuideProvider';
import { useTestConfig, useBatchRuns, useBootstrapFolders, type TestConfig } from '@/features/guias/useGuideOps';
import { PageHeader } from '@/components/PageHeader';
import { GlassCard } from '@/components/GlassCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCNPJ, formatDate, formatDateTime } from '@/lib/formatters';
import type { Guia, GuiaStatus } from '@/data/types';
import { cn } from '@/lib/utils';

type GuideView = 'fila' | 'enviadas' | 'excecoes';

const guideLabels: Record<GuiaStatus, string> = {
  aguardando: 'Aguardando',
  aguardando_processamento: 'Aguard. processamento',
  lendo: 'Lendo',
  ocr: 'OCR',
  processando: 'Processando',
  validando: 'Validando',
  identificada: 'Identificada',
  enviando: 'Enviando',
  enviada: 'Enviada',
  erro: 'Erro',
  revisao: 'Revisao',
  revisao_manual: 'Revisao manual',
  quarentena: 'Quarentena',
  pronta_envio: 'Pronta p/ envio',
  nao_identificada: 'Não identificada',
  duplicada: 'Duplicada',
};

const operationLabels = {
  automacao_desligada: 'Automacao desligada',
  somente_classificacao: 'Somente classificacao',
  leitura_revisao: 'Leitura + revisao',
  envio_automatico_seguro: 'Envio automatico seguro',
  producao_total: 'Producao total',
} as const;

type BatchPreviewRow = {
  file?: string;
  status?: string;
  reason?: string;
  error?: string;
  preview?: Record<string, unknown>;
  [key: string]: unknown;
};

function GuideBadge({ status }: { status: GuiaStatus }) {
  return (
    <Badge variant="outline" className={cn(
      'font-medium',
      status === 'enviada' && 'border-success/30 bg-success/10 text-success',
      ['lendo', 'ocr', 'processando', 'validando', 'identificada', 'enviando'].includes(status) && 'border-primary/30 bg-primary/10 text-primary',
      ['aguardando', 'aguardando_processamento', 'pronta_envio'].includes(status) && 'border-info/30 bg-info/10 text-info',
      ['revisao', 'revisao_manual', 'quarentena'].includes(status) && 'border-warning/30 bg-warning/10 text-warning',
      status === 'erro' && 'border-destructive/30 bg-destructive/10 text-destructive',
    )}>
      {guideLabels[status]}
    </Badge>
  );
}

function GuidesTable({ guides }: { guides: Guia[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50">
          <TableHead>Arquivo</TableHead>
          <TableHead>Identificação</TableHead>
          <TableHead>Guia</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Decisao</TableHead>
          <TableHead>Recebida</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {guides.map((guide) => (
          <TableRow key={guide.id} className="border-border/40">
            <TableCell>
              <div className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="max-w-64 truncate font-medium">{guide.fileName}</span>
              </div>
            </TableCell>
            <TableCell className="text-xs text-foreground/76">
              {guide.cnpjDetectado ? formatCNPJ(guide.cnpjDetectado) : 'Pendente'}
            </TableCell>
            <TableCell className="text-xs">
              {guide.tipoGuia || 'A extrair'}
              {guide.competencia && <span className="block text-foreground/68">{guide.competencia}</span>}
            </TableCell>
            <TableCell className="text-xs font-medium">
              {guide.confidenceScore == null ? '-' : `${Math.round(guide.confidenceScore * 100)}%`}
            </TableCell>
            <TableCell><GuideBadge status={guide.status} /></TableCell>
            <TableCell className="max-w-64 truncate text-xs text-foreground/72">
              {guide.decisionReason || '-'}
            </TableCell>
            <TableCell className="text-xs text-foreground/72">{formatDateTime(guide.receivedAt)}</TableCell>
            <TableCell>
              <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                <Link to={`/guias/${guide.id}`} aria-label="Abrir detalhe"><ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Guias({ view }: { view: GuideView }) {
  const { guides, exceptions, isInitialLoading, isScanning, runScan, resolveException } = useGuides();
  const testConfig = useTestConfig();
  const batches = useBatchRuns(5);
  const bootstrap = useBootstrapFolders();
  const [editEmail, setEditEmail] = useState<string>('');
  const [editWp, setEditWp] = useState<string>('');

  const modo = testConfig.data?.modo_global ?? 'teste';
  const isTeste = modo === 'teste';

  const pending = useMemo(() =>
    guides.filter((guide) => guide.status !== 'enviada'), [guides]);
  const sent = useMemo(() =>
    guides.filter((guide) => guide.status === 'enviada'), [guides]);
  const openExceptions = useMemo(() =>
    exceptions.filter((entry) => entry.status !== 'resolved' && entry.status !== 'ignored'), [exceptions]);
  const reviewing = useMemo(() => guides.filter((g) => ['revisao', 'revisao_manual', 'quarentena', 'nao_identificada', 'duplicada', 'erro'].includes(g.status)), [guides]);
  const byStatus = useMemo(() => {
    const out: Partial<Record<GuiaStatus, number>> = {};
    for (const g of guides) out[g.status] = (out[g.status] || 0) + 1;
    return out;
  }, [guides]);
  const lastBatch = batches.data?.[0];
  const totalGuides = guides.length || 1;
  const reliability = {
    autoReady: Math.round(((byStatus.pronta_envio ?? 0) + (byStatus.enviada ?? 0)) / totalGuides * 100),
    manualReview: Math.round(((byStatus.revisao ?? 0) + (byStatus.revisao_manual ?? 0) + (byStatus.quarentena ?? 0)) / totalGuides * 100),
    errors: Math.round(((byStatus.erro ?? 0) + (byStatus.nao_identificada ?? 0) + (byStatus.duplicada ?? 0)) / totalGuides * 100),
  };
  const exportLastBatch = () => {
    const rows = Array.isArray(lastBatch?.preview_json) ? lastBatch.preview_json : [];
    if (!rows.length) return;
    const headers = ['arquivo', 'guia_id', 'status', 'empresa', 'cnpj', 'tipo', 'competencia', 'vencimento', 'valor', 'score', 'motivo'];
    const csv = [
      headers.join(','),
      ...rows.map((row: BatchPreviewRow) => {
        const preview = row.preview || {};
        return headers.map((key) => {
          const value = key === 'arquivo'
            ? row.file
            : key === 'status'
              ? row.status
              : key === 'motivo'
                ? (row.reason || preview.motivo || row.error || '')
                : (row[key] ?? preview[key] ?? '');
          return `"${String(value ?? '').replace(/"/g, '""')}"`;
        }).join(',');
      }),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `guias-lote-${lastBatch?.id || 'preview'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const title = view === 'fila' ? 'Fila de Guias' : view === 'enviadas' ? 'Guias Enviadas' : 'Exceções de Guias';
  const subtitle = view === 'fila'
    ? 'PDFs em leitura, identificação, OCR ou aguardando despacho.'
    : view === 'enviadas'
      ? 'Documentos aceitos pelo canal e movidos para a pasta enviados.'
      : 'Tudo que exige revisão humana permanece rastreavel aqui.';

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => bootstrap.mutate()} disabled={bootstrap.isPending} className="gap-2">
            <FolderCog className="h-4 w-4" /> Recriar pastas
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/guias/revisao">Revisão manual ({reviewing.length})</Link>
          </Button>
          <Button onClick={runScan} disabled={isScanning} className="gap-2">
            {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Varredura agora
          </Button>
        </div>
      </PageHeader>

      {/* Toggle Modo Teste/Produção */}
      <GlassCard variant={isTeste ? 'critical' : 'elevated'} className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            {isTeste ? <FlaskConical className="h-5 w-5 text-warning" /> : <Rocket className="h-5 w-5 text-success" />}
            <div>
              <p className="text-sm font-semibold">
                Modo {isTeste ? 'TESTE' : 'PRODUÇÃO'}
                <Badge variant="outline" className={cn('ml-2', isTeste ? 'border-warning/40 bg-warning/10 text-warning' : 'border-success/40 bg-success/10 text-success')}>
                  {isTeste ? 'envios redirecionados' : 'envios reais'}
                </Badge>
              </p>
              <p className="mt-0.5 text-xs text-foreground/70">
                {isTeste
                  ? 'Em modo teste, e-mails e WhatsApp vão para os destinatários abaixo, PDFs NÃO são movidos no Drive.'
                  : 'Em produção, envios vão para os contatos reais da empresa e PDFs são movidos para Enviadas/[Empresa]/[AAAA-MM].'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-foreground/68">TESTE</span>
            <Switch
              checked={!isTeste}
              disabled={testConfig.update.isPending}
              onCheckedChange={(checked) => testConfig.update.mutate({ modo_global: checked ? 'producao' : 'teste' })}
            />
            <span className="text-xs text-foreground/68">PRODUÇÃO</span>
          </div>
        </div>

        {isTeste && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/72">E-mail de teste</label>
              <div className="flex gap-2">
                <Input
                  defaultValue={testConfig.data?.email_teste ?? ''}
                  placeholder="teste@exemplo.com"
                  onChange={(e) => setEditEmail(e.target.value)}
                />
                <Button size="sm" variant="outline" onClick={() => testConfig.update.mutate({ email_teste: editEmail || testConfig.data?.email_teste || null })}>Salvar</Button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/72">WhatsApp de teste (E.164)</label>
              <div className="flex gap-2">
                <Input
                  defaultValue={testConfig.data?.whatsapp_teste ?? ''}
                  placeholder="+5511999999999"
                  onChange={(e) => setEditWp(e.target.value)}
                />
                <Button size="sm" variant="outline" onClick={() => testConfig.update.mutate({ whatsapp_teste: editWp || testConfig.data?.whatsapp_teste || null })}>Salvar</Button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground/72">Nivel operacional</label>
            <Select
              value={testConfig.data?.operation_level ?? 'somente_classificacao'}
              onValueChange={(value) => testConfig.update.mutate({ operation_level: value as TestConfig['operation_level'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(operationLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs">
            <Switch
              checked={testConfig.data?.auto_dispatch_enabled ?? false}
              disabled={testConfig.update.isPending || isTeste}
              onCheckedChange={(checked) => testConfig.update.mutate({ auto_dispatch_enabled: checked })}
            />
            Envio automatico seguro
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs">
            <Switch
              checked={testConfig.data?.require_batch_approval ?? true}
              disabled={testConfig.update.isPending}
              onCheckedChange={(checked) => testConfig.update.mutate({ require_batch_approval: checked })}
            />
            Aprovar lote
          </label>
        </div>
      </GlassCard>

      {/* Cards de status */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {([
          ['aguardando', 'A processar', (byStatus.aguardando ?? 0) + (byStatus.aguardando_processamento ?? 0)],
          ['pronta_envio', 'Pronta envio', byStatus.pronta_envio ?? 0],
          ['enviada', 'Enviadas', byStatus.enviada ?? 0],
          ['revisao', 'Revisão', byStatus.revisao ?? 0],
          ['nao_identificada', 'Não ident.', byStatus.nao_identificada ?? 0],
          ['duplicada', 'Duplicadas', byStatus.duplicada ?? 0],
          ['erro', 'Erros', byStatus.erro ?? 0],
        ] as const).map(([key, label, count]) => (
          <GlassCard key={key} className="p-3">
            <p className="text-[10px] uppercase tracking-wide text-foreground/60">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{count}</p>
          </GlassCard>
        ))}
        <GlassCard className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-foreground/60">Revisao manual</p>
          <p className="mt-1 text-2xl font-semibold">{byStatus.revisao_manual ?? 0}</p>
        </GlassCard>
        <GlassCard className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-foreground/60">Quarentena</p>
          <p className="mt-1 text-2xl font-semibold">{byStatus.quarentena ?? 0}</p>
        </GlassCard>
      </div>

      {/* Métricas última varredura */}
      <GlassCard className="p-4">
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <p className="uppercase tracking-wide text-foreground/60">Prontas/seguras</p>
            <p className="mt-1 text-xl font-semibold text-success">{reliability.autoReady}%</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-foreground/60">Revisao/quarentena</p>
            <p className="mt-1 text-xl font-semibold text-warning">{reliability.manualReview}%</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-foreground/60">Erro/duplicidade</p>
            <p className="mt-1 text-xl font-semibold text-destructive">{reliability.errors}%</p>
          </div>
        </div>
      </GlassCard>

      {lastBatch && (
        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-foreground/60">Última varredura</p>
              <p className="mt-0.5 text-sm font-semibold">
                {formatDateTime(lastBatch.started_at)} • modo {lastBatch.modo}
              </p>
            </div>
            {Array.isArray(lastBatch.preview_json) && lastBatch.preview_json.length > 0 && (
              <Button size="sm" variant="outline" className="gap-2" onClick={exportLastBatch}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-foreground/72">
              <span>Total: <b>{lastBatch.total ?? 0}</b></span>
              <span>Prontas: <b className="text-info">{lastBatch.prontas_envio ?? 0}</b></span>
              <span>Identificadas: <b>{lastBatch.identificadas ?? 0}</b></span>
              <span>Enviadas: <b className="text-success">{lastBatch.enviadas ?? 0}</b></span>
              <span>Revisão: <b className="text-warning">{lastBatch.revisao ?? 0}</b></span>
              <span>Quarentena: <b className="text-warning">{lastBatch.quarentena ?? 0}</b></span>
              <span>Erros: <b className="text-destructive">{lastBatch.erros ?? 0}</b></span>
              <span>Duplicadas: <b>{lastBatch.duplicadas ?? 0}</b></span>
            </div>
          </div>
        </GlassCard>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={view === 'fila' ? 'default' : 'outline'}>
          <Link to="/guias/fila">Fila ({pending.length})</Link>
        </Button>
        <Button asChild size="sm" variant={view === 'enviadas' ? 'default' : 'outline'}>
          <Link to="/guias/enviadas">Enviadas ({sent.length})</Link>
        </Button>
        <Button asChild size="sm" variant={view === 'excecoes' ? 'default' : 'outline'}>
          <Link to="/guias/excecoes">Exceções ({openExceptions.length})</Link>
        </Button>
      </div>

      {view !== 'excecoes' && (
        <GlassCard variant="elevated" className="overflow-hidden p-0">
          {isInitialLoading && guides.length === 0 ? (
            <div className="flex items-center justify-center gap-2 p-16 text-sm text-foreground/72">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando guias
            </div>
          ) : (view === 'fila' ? pending : sent).length ? (
            <GuidesTable guides={view === 'fila' ? pending : sent} />
          ) : (
            <EmptyState
              icon={view === 'fila' ? FileText : Send}
              title={view === 'fila' ? 'Nenhuma guia aguardando processamento' : 'Nenhuma guia enviada ainda'}
              description={view === 'fila' ? 'Arquivos PDF da pasta a enviar aparecerao aqui.' : 'Os envios confirmados serao organizados nesta lista.'}
              className="border-0 shadow-none bg-transparent"
            />
          )}
        </GlassCard>
      )}

      {view === 'excecoes' && (
        <div className="space-y-3">
          {openExceptions.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="Nenhuma exceção aberta" description="Falhas de OCR, cadastro, consentimento ou conector serao exibidas aqui." />
          ) : openExceptions.map((entry) => (
            <GlassCard key={entry.id} variant={entry.severity === 'critical' || entry.severity === 'error' ? 'critical' : 'default'}>
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{entry.exceptionType.replace(/_/g, ' ')}</p>
                      <Badge variant="outline">{entry.severity}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-foreground/70">{entry.reason}</p>
                    <p className="mt-2 text-xs text-foreground/70">Acao recomendada: {entry.actionRecommended || 'Análise manual.'}</p>
                    <p className="mt-1 text-[11px] text-foreground/64">{formatDate(entry.createdAt)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {entry.guiaId && (
                    <Button variant="outline" size="sm" asChild><Link to={`/guias/${entry.guiaId}`}>Abrir guia</Link></Button>
                  )}
                  <Button size="sm" onClick={() => resolveException(entry.id)}>Resolver</Button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
