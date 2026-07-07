import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  FolderCog,
  Loader2,
  Play,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserRoundPlus,
} from 'lucide-react';
import { useGuides } from '@/features/guias/GuideProvider';
import {
  useBatchRuns,
  useBootstrapFolders,
  useDeleteGuide,
  useDispatchGuide,
  useGuideCompanies,
  useResolveGuideContact,
  useTestConfig,
  type TestConfig,
} from '@/features/guias/useGuideOps';
import {
  classifyGuideContactIssue,
  defaultGuideContactForm,
  guideCompanyName,
  hasValidGuideEmail,
  hasValidGuidePhone,
  normalizeBrazilianPhone,
  validateGuideContactForm,
  type GuideContactFormValues,
  type GuideContactIssue,
} from '@/features/guias/guide-contact-rules';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatCNPJ, formatDate, formatDateTime } from '@/lib/formatters';
import type { CanalEnvio, Empresa, Guia, GuiaExcecao, GuiaStatus } from '@/data/types';
import { cn } from '@/lib/utils';

type GuideView = 'fila' | 'enviadas' | 'excecoes';

type BatchPreviewRow = {
  file?: string;
  status?: string;
  reason?: string;
  error?: string;
  preview?: Record<string, unknown>;
  [key: string]: unknown;
};

const guideLabels: Record<GuiaStatus, string> = {
  aguardando: 'Aguardando',
  aguardando_processamento: 'Aguardando processamento',
  lendo: 'Lendo',
  ocr: 'OCR',
  processando: 'Processando',
  validando: 'Validando',
  identificada: 'Identificada',
  enviando: 'Enviando',
  enviada: 'Enviada',
  erro: 'Erro',
  revisao: 'Revisão',
  revisao_manual: 'Revisão manual',
  quarentena: 'Quarentena',
  pronta_envio: 'Pronta para envio',
  nao_identificada: 'Não identificada',
  duplicada: 'Duplicada',
};

const operationLabels = {
  automacao_desligada: 'Automação desligada',
  somente_classificacao: 'Somente classificação',
  leitura_revisao: 'Leitura + revisão',
  envio_automatico_seguro: 'Envio automático seguro',
  producao_total: 'Produção total',
} as const;

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function GuideBadge({ status }: { status: GuiaStatus }) {
  const tone =
    status === 'enviada' ? 'guide-pill-success'
      : ['erro', 'nao_identificada'].includes(status) ? 'guide-pill-danger'
        : ['revisao', 'revisao_manual', 'quarentena', 'duplicada'].includes(status) ? 'guide-pill-warning'
          : status === 'pronta_envio' ? 'guide-pill-info'
            : 'guide-pill-muted';
  return (
    <span className={cn('guide-pill', tone)}>
      <span className="guide-pill-dot" />
      {guideLabels[status]}
    </span>
  );
}

function guideValue(guide: Guia) {
  return guide.valor == null ? 'Valor não extraído' : currency.format(Number(guide.valor));
}

function guideDueDate(guide: Guia) {
  return guide.vencimento ? formatDate(guide.vencimento) : 'Sem vencimento';
}

function channelsLabel(company: Empresa | null) {
  if (!company) return 'Sem cliente';
  const emailOk = hasValidGuideEmail(company);
  const phoneOk = hasValidGuidePhone(company);
  const preferred = company.canalPreferido;
  if (preferred === 'ambos' && emailOk && phoneOk) return 'Enviar pelos dois canais';
  if (preferred === 'whatsapp' && phoneOk) return 'Enviar por WhatsApp';
  if (preferred === 'email' && emailOk) return 'Enviar por e-mail';
  if (emailOk && phoneOk) return 'Canais cadastrados';
  if (emailOk) return 'E-mail cadastrado';
  if (phoneOk) return 'WhatsApp cadastrado';
  return 'Contato pendente';
}

function channelOptions(company: Empresa | null) {
  if (!company) return [];
  const options: string[] = [];
  const emailOk = hasValidGuideEmail(company);
  const phoneOk = hasValidGuidePhone(company);
  const preferred = company.canalPreferido;
  if ((preferred === 'email' || preferred === 'ambos') && emailOk) options.push('Enviar por e-mail');
  if ((preferred === 'whatsapp' || preferred === 'ambos') && phoneOk) options.push('Enviar por WhatsApp');
  if (preferred === 'ambos' && emailOk && phoneOk) options.push('Enviar pelos dois canais');
  return options.length ? options : [channelsLabel(company)];
}

function SummaryCard({
  label,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  caption: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className={cn('guide-kpi guide-tilt-card', tone)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="guide-kpi-label">{label}</p>
          <p className="guide-kpi-value">{value}</p>
        </div>
        <span className="guide-kpi-icon"><Icon className="h-5 w-5" /></span>
      </div>
      <p className="guide-kpi-footer">{caption}</p>
    </div>
  );
}

function GuideFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.68rem] font-black uppercase text-[hsl(var(--text-tertiary))]">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-[hsl(var(--text-primary))]">{value}</p>
    </div>
  );
}

function GuideRow({
  guide,
  company,
  contactIssue,
  onResolve,
  compact = false,
}: {
  guide: Guia;
  company: Empresa | null;
  contactIssue?: GuideContactIssue | null;
  onResolve?: (issue: GuideContactIssue) => void;
  compact?: boolean;
}) {
  const dispatchGuide = useDispatchGuide();
  const deleteGuide = useDeleteGuide();
  const availableChannels = channelOptions(company);
  const canDispatch = guide.status === 'pronta_envio' && !contactIssue;

  return (
    <div className={cn(
      'guide-flow-row guide-tilt-card',
      contactIssue && 'border-[hsl(var(--brand-orange)/0.32)] bg-[hsl(var(--brand-orange)/0.08)]',
      compact && 'py-3',
    )}>
      <div className="guide-flow-marker"><span /></div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-display text-[0.98rem] font-black text-[hsl(var(--text-primary))]">
            {guideCompanyName(guide, company)}
          </p>
          <GuideBadge status={guide.status} />
          {guide.confidenceScore != null && (
            <span className="guide-pill guide-pill-muted">
              {Math.round(guide.confidenceScore * 100)}% confiança
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-xs font-semibold text-[hsl(var(--text-secondary))]">{guide.fileName}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <GuideFact label="CNPJ" value={guide.cnpjDetectado ? formatCNPJ(guide.cnpjDetectado) : 'Não identificado'} />
          <GuideFact label="Guia" value={guide.tipoGuia || 'A extrair'} />
          <GuideFact label="Vencimento" value={guideDueDate(guide)} />
          <GuideFact label="Valor" value={guideValue(guide)} />
          <GuideFact label="Canal" value={channelsLabel(company)} />
        </div>
        {contactIssue ? (
          <p className="mt-3 text-sm font-semibold text-[hsl(var(--brand-orange-deep))]">{contactIssue.title}</p>
        ) : guide.decisionReason ? (
          <p className="mt-3 line-clamp-2 text-xs font-semibold text-[hsl(var(--text-secondary))]">{guide.decisionReason}</p>
        ) : null}
        {canDispatch && availableChannels.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {availableChannels.map((option) => (
              <span key={option} className="guide-pill guide-pill-success">{option}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col items-stretch justify-center gap-2 sm:min-w-36">
        {contactIssue && onResolve ? (
          <Button size="sm" className="gap-2" onClick={() => onResolve(contactIssue)}>
            <UserRoundPlus className="h-4 w-4" />
            Resolver pendência
          </Button>
        ) : canDispatch ? (
          <Button
            size="sm"
            className="gap-2"
            disabled={dispatchGuide.isPending}
            onClick={() => dispatchGuide.mutate({ guide_id: guide.id, force_dispatch: true, manual_approval: true })}
          >
            {dispatchGuide.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Confirmar forma de envio
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline" className="guide-link-action gap-2">
            <Link to={`/guias/${guide.id}`}>Ver detalhes <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        )}
        <div className="flex justify-end gap-1">
          <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Ver detalhes da guia">
            <Link to={`/guias/${guide.id}`} aria-label="Ver detalhes da guia"><ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-foreground/70 hover:text-destructive" title="Excluir guia">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir esta guia?</AlertDialogTitle>
                <AlertDialogDescription>
                  A guia <strong>{guide.fileName}</strong> será removida da fila junto com envios, eventos e exceções.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteGuide.mutate({ guia_id: guide.id, motivo: 'Excluída pelo operador na lista de guias' })}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

function GuideSection({
  kicker,
  title,
  count,
  children,
  variant,
}: {
  kicker: string;
  title: string;
  count: number;
  children: React.ReactNode;
  variant?: 'flow' | 'exceptions';
}) {
  return (
    <section className={cn(
      'guide-section p-4 sm:p-5',
      variant === 'flow' && 'guide-section-flow',
      variant === 'exceptions' && 'guide-section-exceptions',
    )}>
      <div className="guide-section-header">
        <div>
          <p className="guide-section-kicker">{kicker}</p>
          <h2>{title}</h2>
        </div>
        <span className="guide-compact-total">{count}</span>
      </div>
      {children}
    </section>
  );
}

function EmptyGuidePanel({
  icon: Icon,
  title,
  description,
  success,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  success?: boolean;
}) {
  return (
    <div className={cn('guide-empty-state', success && 'guide-empty-state-success')}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p>{title}</p>
        <span>{description}</span>
      </div>
    </div>
  );
}

function SettingsPanel({ testConfig }: { testConfig: ReturnType<typeof useTestConfig> }) {
  const [editEmail, setEditEmail] = useState('');
  const [editWp, setEditWp] = useState('');
  const modo = testConfig.data?.modo_global ?? 'teste';
  const isTeste = modo === 'teste';

  return (
    <section className="guide-section p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <span className={cn('guide-channel-icon', isTeste ? 'text-warning' : 'text-success')}>
            {isTeste ? <Sparkles className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-sm font-black">Modo {isTeste ? 'TESTE' : 'PRODUÇÃO'}</p>
            <p className="mt-1 max-w-3xl text-xs font-semibold text-[hsl(var(--text-secondary))]">
              {isTeste
                ? 'A varredura valida dados reais, mas envios ficam controlados por destinatários de teste.'
                : 'Envios usam os contatos cadastrados nas empresas e seguem as regras do pipeline.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-[hsl(var(--text-tertiary))]">TESTE</span>
          <Switch
            checked={!isTeste}
            disabled={testConfig.update.isPending}
            onCheckedChange={(checked) => testConfig.update.mutate({ modo_global: checked ? 'producao' : 'teste' })}
          />
          <span className="text-xs font-bold text-[hsl(var(--text-tertiary))]">PRODUÇÃO</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
        <div className="space-y-1">
          <Label className="text-xs font-bold">Nível operacional</Label>
          <Select
            value={testConfig.data?.operation_level ?? 'somente_classificacao'}
            onValueChange={(value) => testConfig.update.mutate({ operation_level: value as TestConfig['operation_level'] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(operationLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border/50 bg-white/45 px-3 py-2 text-xs font-semibold">
          <Switch
            checked={testConfig.data?.auto_dispatch_enabled ?? false}
            disabled={testConfig.update.isPending || isTeste}
            onCheckedChange={(checked) => testConfig.update.mutate({ auto_dispatch_enabled: checked })}
          />
          Envio automático seguro
        </label>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border/50 bg-white/45 px-3 py-2 text-xs font-semibold">
          <Switch
            checked={testConfig.data?.require_batch_approval ?? true}
            disabled={testConfig.update.isPending}
            onCheckedChange={(checked) => testConfig.update.mutate({ require_batch_approval: checked })}
          />
          Aprovar lote
        </label>
      </div>

      {isTeste && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs font-bold">E-mail de teste</Label>
            <div className="flex gap-2">
              <Input
                defaultValue={testConfig.data?.email_teste ?? ''}
                placeholder="teste@exemplo.com"
                onChange={(event) => setEditEmail(event.target.value)}
              />
              <Button size="sm" variant="outline" onClick={() => testConfig.update.mutate({ email_teste: editEmail || testConfig.data?.email_teste || null })}>
                Salvar
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-bold">WhatsApp de teste</Label>
            <div className="flex gap-2">
              <Input
                defaultValue={testConfig.data?.whatsapp_teste ?? ''}
                placeholder="+5511999999999"
                onChange={(event) => setEditWp(event.target.value)}
              />
              <Button size="sm" variant="outline" onClick={() => testConfig.update.mutate({ whatsapp_teste: normalizeBrazilianPhone(editWp) || editWp || testConfig.data?.whatsapp_teste || null })}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ContactResolutionDialog({
  issue,
  queue,
  open,
  onOpenChange,
  onResolvedNext,
}: {
  issue: GuideContactIssue | null;
  queue: GuideContactIssue[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolvedNext: (nextIssue: GuideContactIssue | null) => void;
}) {
  const resolveContact = useResolveGuideContact();
  const [form, setForm] = useState<GuideContactFormValues>({
    email: '',
    phone: '',
    preferredChannel: 'email',
    observation: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof GuideContactFormValues, string>>>({});

  useEffect(() => {
    if (!issue) return;
    setForm(defaultGuideContactForm(issue));
    setErrors({});
  }, [issue]);

  if (!issue) return null;

  const currentIndex = queue.findIndex((entry) => entry.guide.id === issue.guide.id);
  const current = currentIndex + 1;
  const nextIssue = currentIndex >= 0 ? queue.slice(currentIndex + 1).find((entry) => entry.guide.id !== issue.guide.id) || null : null;
  const hasNext = Boolean(nextIssue);
  const primaryLabel = hasNext ? 'Salvar e resolver próxima pendência' : 'Salvar e processar envio';
  const submit = async () => {
    const validation = validateGuideContactForm(issue, form);
    setErrors(validation.errors);
    if (!validation.ok) return;
    try {
      await resolveContact.mutateAsync({ issue, values: form });
    } catch {
      // erro já tratado via toast em useResolveGuideContact
      return;
    }
    if (hasNext) {
      onResolvedNext(nextIssue);
    } else {
      onResolvedNext(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl border-white/20 bg-[hsl(var(--background))] p-0 sm:max-w-2xl">
        <div className="guide-hero rounded-b-none p-5">
          <DialogHeader className="relative z-10 text-left">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="guide-hero-chip">Pendências encontradas</span>
              {queue.length > 1 && <span className="guide-hero-chip">Pendência {current} de {queue.length}</span>}
            </div>
            <DialogTitle className="text-2xl font-black text-white">{issue.title}</DialogTitle>
            <DialogDescription className="text-sm font-semibold text-white/78">
              {issue.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-white/55 p-3">
              <p className="text-[0.68rem] font-black uppercase text-[hsl(var(--text-tertiary))]">Razão social identificada</p>
              <p className="mt-1 text-sm font-black">{guideCompanyName(issue.guide, issue.company)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white/55 p-3">
              <p className="text-[0.68rem] font-black uppercase text-[hsl(var(--text-tertiary))]">CNPJ identificado</p>
              <p className="mt-1 font-mono text-sm font-black">{issue.guide.cnpjDetectado ? formatCNPJ(issue.guide.cnpjDetectado) : 'Não identificado'}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white/55 p-3">
              <p className="text-[0.68rem] font-black uppercase text-[hsl(var(--text-tertiary))]">Guia/documento</p>
              <p className="mt-1 text-sm font-black">{issue.guide.tipoGuia || 'Guia em processamento'}</p>
              <p className="mt-1 truncate text-xs font-semibold text-[hsl(var(--text-secondary))]">{issue.guide.fileName}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white/55 p-3">
              <p className="text-[0.68rem] font-black uppercase text-[hsl(var(--text-tertiary))]">Motivo</p>
              <p className="mt-1 text-sm font-black">{issue.exception?.reason || issue.guide.decisionReason || 'Cadastro incompleto para envio.'}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[hsl(var(--brand-orange)/0.18)] bg-white/55 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="guide-contact-email" className="text-xs font-black">E-mail</Label>
                <Input
                  id="guide-contact-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((currentForm) => ({ ...currentForm, email: event.target.value }))}
                  className={errors.email ? 'border-destructive' : ''}
                  placeholder="financeiro@empresa.com.br"
                />
                {errors.email && <p className="text-xs font-semibold text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guide-contact-phone" className="text-xs font-black">WhatsApp/celular</Label>
                <Input
                  id="guide-contact-phone"
                  value={form.phone}
                  onChange={(event) => setForm((currentForm) => ({ ...currentForm, phone: event.target.value }))}
                  className={errors.phone ? 'border-destructive' : ''}
                  placeholder="+55 55 99999-9999"
                />
                {errors.phone && <p className="text-xs font-semibold text-destructive">{errors.phone}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black">Forma preferida de envio</Label>
                <Select
                  value={form.preferredChannel}
                  onValueChange={(value) => setForm((currentForm) => ({ ...currentForm, preferredChannel: value as CanalEnvio }))}
                >
                  <SelectTrigger className={errors.preferredChannel ? 'border-destructive' : ''}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Enviar por e-mail</SelectItem>
                    <SelectItem value="whatsapp">Enviar por WhatsApp</SelectItem>
                    <SelectItem value="ambos">Enviar pelos dois canais</SelectItem>
                  </SelectContent>
                </Select>
                {errors.preferredChannel && <p className="text-xs font-semibold text-destructive">{errors.preferredChannel}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guide-contact-observation" className="text-xs font-black">Observação opcional</Label>
                <Textarea
                  id="guide-contact-observation"
                  value={form.observation}
                  onChange={(event) => setForm((currentForm) => ({ ...currentForm, observation: event.target.value }))}
                  className="min-h-[76px]"
                  placeholder="Ex.: contato informado pelo financeiro."
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 bg-white/40 p-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Resolver depois</Button>
          <Button onClick={submit} disabled={resolveContact.isPending} className="gap-2">
            {resolveContact.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Guias({ view }: { view: GuideView }) {
  const { guides, exceptions, isInitialLoading, isScanning, runScan, resolveException } = useGuides();
  const testConfig = useTestConfig();
  const batches = useBatchRuns(5);
  const companiesQuery = useGuideCompanies();
  const bootstrap = useBootstrapFolders();
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [autoOpenedBatchId, setAutoOpenedBatchId] = useState<string | null>(null);

  const companyById = useMemo(() => {
    const map = new Map<string, Empresa>();
    for (const company of companiesQuery.data || []) map.set(company.id, company);
    return map;
  }, [companiesQuery.data]);

  const openExceptions = useMemo(() =>
    exceptions.filter((entry) => entry.status !== 'resolved' && entry.status !== 'ignored'), [exceptions]);

  const enrichedGuides = useMemo(() => guides.map((guide) => {
    const company = guide.empresaId ? companyById.get(guide.empresaId) || null : null;
    const contactIssue = classifyGuideContactIssue(guide, company, openExceptions);
    return { guide, company, contactIssue };
  }), [companyById, guides, openExceptions]);

  const pendingContact = useMemo(() =>
    enrichedGuides.filter((entry): entry is typeof entry & { contactIssue: GuideContactIssue } => Boolean(entry.contactIssue)), [enrichedGuides]);

  const readyToSend = useMemo(() =>
    enrichedGuides.filter(({ guide, contactIssue }) => guide.status === 'pronta_envio' && !contactIssue), [enrichedGuides]);

  const sent = useMemo(() =>
    enrichedGuides.filter(({ guide }) => guide.status === 'enviada'), [enrichedGuides]);

  const processing = useMemo(() =>
    enrichedGuides.filter(({ guide, contactIssue }) =>
      guide.status !== 'enviada' &&
      guide.status !== 'pronta_envio' &&
      !contactIssue &&
      !['erro', 'duplicada', 'nao_identificada'].includes(guide.status),
    ), [enrichedGuides]);

  const failed = useMemo(() =>
    enrichedGuides.filter(({ guide }) => ['erro', 'duplicada', 'nao_identificada', 'quarentena', 'revisao_manual'].includes(guide.status)), [enrichedGuides]);

  const lastBatch = batches.data?.[0];
  const selectedIssue = pendingContact.find((entry) => entry.guide.id === selectedIssueId)?.contactIssue || null;

  useEffect(() => {
    if (isScanning || pendingContact.length === 0) return;
    const batchId = lastBatch?.id || 'sem-lote';
    if (autoOpenedBatchId === batchId) return;
    setSelectedIssueId(pendingContact[0].guide.id);
    setAutoOpenedBatchId(batchId);
  }, [autoOpenedBatchId, isScanning, lastBatch?.id, pendingContact]);

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

  return (
    <div className="guide-dashboard space-y-6">
      <section className="guide-hero">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              <span className="guide-hero-chip">Drive + CNPJ + contatos</span>
              <span className={cn('guide-hero-chip guide-hero-chip-live', isScanning && 'guide-live-dot-processing')}>
                <span className={cn('guide-live-dot', isScanning && 'guide-live-dot-processing')} />
                {isScanning ? 'Verificando agora' : 'Fluxo monitorado'}
              </span>
            </div>
            <h1 className="mt-4 font-display text-3xl font-black tracking-tight text-white md:text-4xl">Envio de Guias</h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/76">
              O sistema verifica a pasta do Drive, identifica razão social e CNPJ, cruza com o cadastro de empresas e libera o envio somente quando há canal válido.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:min-w-[26rem]">
            <div className="guide-hero-telemetry">
              <div><span>{guides.length}</span><p>Guias encontradas</p></div>
              <div><span>{readyToSend.length}</span><p>Prontas</p></div>
              <div><span>{pendingContact.length}</span><p>Pendências</p></div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button onClick={runScan} disabled={isScanning} className="guide-primary-action gap-2">
                {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Verificar guias no Drive
              </Button>
              <Button asChild variant="outline" className="guide-link-action gap-2">
                <Link to="/guias/revisao">Revisão manual</Link>
              </Button>
              <Button variant="outline" className="guide-link-action gap-2" onClick={() => bootstrap.mutate()} disabled={bootstrap.isPending}>
                <FolderCog className="h-4 w-4" />
                Pastas
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Guias encontradas" value={guides.length} caption="Itens detectados no fluxo atual" icon={FileText} tone="guide-kpi-waiting" />
        <SummaryCard label="Prontas para envio" value={readyToSend.length} caption="Com cliente e canal válidos" icon={FileCheck2} tone="guide-kpi-delivered" />
        <SummaryCard label="Pendências de cadastro" value={pendingContact.length} caption="Exigem contato ou cliente" icon={UserRoundPlus} tone="guide-kpi-exceptions" />
        <SummaryCard label="Enviadas" value={sent.length} caption="Aceitas pelo fluxo de envio" icon={Send} tone="guide-kpi-sent" />
        <SummaryCard label="Falhas/exceções" value={openExceptions.length} caption="Bloqueios técnicos ou revisão" icon={ShieldAlert} tone="guide-kpi-failures" />
      </div>

      <SettingsPanel testConfig={testConfig} />

      {lastBatch && (
        <section className="guide-section p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="guide-section-kicker">Última varredura</p>
              <h2>{formatDateTime(lastBatch.started_at)} · modo {lastBatch.modo}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[hsl(var(--text-secondary))]">
              <span>Total: {lastBatch.total ?? 0}</span>
              <span>Prontas: {lastBatch.prontas_envio ?? 0}</span>
              <span>Revisão: {lastBatch.revisao ?? 0}</span>
              <span>Quarentena: {lastBatch.quarentena ?? 0}</span>
              <span>Erros: {lastBatch.erros ?? 0}</span>
              {Array.isArray(lastBatch.preview_json) && lastBatch.preview_json.length > 0 && (
                <Button size="sm" variant="outline" className="guide-link-action gap-2" onClick={exportLastBatch}>
                  <Download className="h-4 w-4" /> CSV
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={view === 'fila' ? 'default' : 'outline'}>
          <Link to="/guias/fila">Fila ({guides.length - sent.length})</Link>
        </Button>
        <Button asChild size="sm" variant={view === 'enviadas' ? 'default' : 'outline'}>
          <Link to="/guias/enviadas">Enviadas ({sent.length})</Link>
        </Button>
        <Button asChild size="sm" variant={view === 'excecoes' ? 'default' : 'outline'}>
          <Link to="/guias/excecoes">Exceções ({openExceptions.length})</Link>
        </Button>
      </div>

      {isInitialLoading || companiesQuery.isLoading ? (
        <div className="guide-section flex items-center justify-center gap-2 p-12 text-sm font-semibold text-[hsl(var(--text-secondary))]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando fluxo de guias
        </div>
      ) : view === 'enviadas' ? (
        <GuideSection kicker="Concluídas" title="Guias enviadas" count={sent.length} variant="flow">
          {sent.length ? (
            <div className="guide-flow-list">
              {sent.map(({ guide, company }) => <GuideRow key={guide.id} guide={guide} company={company} compact />)}
            </div>
          ) : (
            <EmptyGuidePanel icon={Send} title="Nenhuma guia enviada ainda" description="Os envios confirmados pelo fluxo aparecerão aqui." success />
          )}
        </GuideSection>
      ) : view === 'excecoes' ? (
        <GuideSection kicker="Atenção" title="Exceções e erros" count={openExceptions.length} variant="exceptions">
          {openExceptions.length ? (
            <div className="space-y-3">
              {openExceptions.map((entry: GuiaExcecao) => (
                <div key={entry.id} className="guide-exception-row">
                  <p className="guide-exception-type">{entry.exceptionType.replace(/_/g, ' ')}</p>
                  <h3>{entry.reason}</h3>
                  <p>Ação recomendada: {entry.actionRecommended || 'Análise manual.'}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[hsl(var(--text-tertiary))]">{formatDate(entry.createdAt)}</span>
                    <div className="flex gap-2">
                      {entry.guiaId && (
                        <Button variant="outline" size="sm" asChild className="guide-link-action">
                          <Link to={`/guias/${entry.guiaId}`}>Ver detalhes da guia</Link>
                        </Button>
                      )}
                      <Button size="sm" onClick={() => resolveException(entry.id)}>Resolver</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyGuidePanel icon={ShieldAlert} title="Nenhuma exceção aberta" description="Falhas de leitura, cadastro, conector ou envio serão destacadas aqui." success />
          )}
        </GuideSection>
      ) : (
        <div className="space-y-5">
          <GuideSection kicker="Cadastro e contato" title="Pendências de cadastro" count={pendingContact.length} variant="exceptions">
            {pendingContact.length ? (
              <div className="guide-flow-list">
                {pendingContact.map(({ guide, company, contactIssue }) => (
                  <GuideRow
                    key={guide.id}
                    guide={guide}
                    company={company}
                    contactIssue={contactIssue}
                    onResolve={(issue) => setSelectedIssueId(issue.guide.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyGuidePanel icon={CheckCircle2} title="Sem pendências de cadastro" description="Clientes encontrados possuem dados suficientes para seguir conforme a regra de envio." success />
            )}
          </GuideSection>

          <GuideSection kicker="Próximo passo" title="Prontas para envio" count={readyToSend.length} variant="flow">
            {readyToSend.length ? (
              <div className="guide-flow-list">
                {readyToSend.map(({ guide, company }) => <GuideRow key={guide.id} guide={guide} company={company} />)}
              </div>
            ) : (
              <EmptyGuidePanel icon={Clock3} title="Nenhuma guia pronta no momento" description="Depois da verificação, itens com cliente e canal válidos aparecem aqui para confirmação." />
            )}
          </GuideSection>

          <GuideSection kicker="Fila operacional" title="Guias encontradas" count={processing.length + failed.length} variant="flow">
            {processing.length || failed.length ? (
              <div className="guide-flow-list">
                {[...processing, ...failed]
                  .filter(({ guide }) => !pendingContact.some((entry) => entry.guide.id === guide.id))
                  .map(({ guide, company }) => <GuideRow key={guide.id} guide={guide} company={company} compact />)}
              </div>
            ) : (
              <EmptyGuidePanel icon={FileText} title="Nenhuma guia aguardando processamento" description="Arquivos PDF da pasta do Drive aparecerão aqui após a verificação." />
            )}
          </GuideSection>
        </div>
      )}

      <ContactResolutionDialog
        issue={selectedIssue}
        queue={pendingContact.map((entry) => entry.contactIssue)}
        open={Boolean(selectedIssue)}
        onOpenChange={(open) => {
          if (!open) setSelectedIssueId(null);
        }}
        onResolvedNext={(next) => setSelectedIssueId(next ? next.guide.id : null)}
      />
    </div>
  );
}
