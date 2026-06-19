import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  FolderSync,
  Inbox,
  Mail,
  MessageCircle,
  Plug,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useGuides } from '@/features/guias/GuideProvider';
import { useDataStore } from '@/data/DataProvider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters';
import { useDeleteGuide } from '@/features/guias/useGuideOps';
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

type MetricTone = 'waiting' | 'sent' | 'exceptions' | 'failures' | 'time' | 'delivered';

interface GuideMetricCardProps {
  title: string;
  value: number | string;
  detail: string;
  icon: LucideIcon;
  tone: MetricTone;
  onClick?: () => void;
}

const guideStatusMeta: Record<string, { label: string; className: string }> = {
  aguardando: { label: 'Aguardando', className: 'guide-pill-info' },
  lendo: { label: 'Lendo', className: 'guide-pill-info' },
  ocr: { label: 'OCR', className: 'guide-pill-info' },
  identificada: { label: 'Identificada', className: 'guide-pill-primary' },
  enviando: { label: 'Enviando', className: 'guide-pill-warning' },
  enviada: { label: 'Enviada', className: 'guide-pill-success' },
  revisao: { label: 'Revisão', className: 'guide-pill-warning' },
  erro: { label: 'Falha', className: 'guide-pill-danger' },
};

const connectorStatusMeta: Record<string, { label: string; className: string }> = {
  ativo: { label: 'Ativo', className: 'guide-pill-success' },
  configurado: { label: 'Configurado', className: 'guide-pill-info' },
  desconectado: { label: 'Inativo', className: 'guide-pill-muted' },
  erro: { label: 'Erro', className: 'guide-pill-danger' },
};

const severityMeta: Record<string, { label: string; className: string }> = {
  critical: { label: 'Crítica', className: 'guide-pill-danger' },
  error: { label: 'Erro', className: 'guide-pill-danger' },
  warning: { label: 'Atenção', className: 'guide-pill-warning' },
  info: { label: 'Info', className: 'guide-pill-info' },
};

function humanizeKey(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getGuideStatus(status: string) {
  return guideStatusMeta[status] ?? { label: humanizeKey(status), className: 'guide-pill-muted' };
}

function getConnectorStatus(status: string) {
  return connectorStatusMeta[status] ?? { label: humanizeKey(status), className: 'guide-pill-muted' };
}

function getConnectorIcon(provider: string): LucideIcon {
  if (provider.includes('gmail')) return Mail;
  if (provider.includes('whatsapp') || provider.includes('twilio')) return MessageCircle;
  if (provider.includes('drive')) return FolderSync;
  if (provider.includes('pdf')) return FileText;
  return Plug;
}

function GuidePill({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn('guide-pill', className)}>
      <span aria-hidden className="guide-pill-dot" />
      {label}
    </span>
  );
}

function GuideMetricCard({ title, value, detail, icon: Icon, tone, onClick }: GuideMetricCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="guide-kpi-label">{title}</p>
          <p className="guide-kpi-value">{value}</p>
        </div>
        <div className="guide-kpi-icon">
          <Icon className="h-5 w-5 stroke-[2.1]" />
        </div>
      </div>
      <div className="guide-kpi-footer">
        <span>{detail}</span>
        {onClick && <ArrowRight className="h-3.5 w-3.5" />}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={cn('guide-kpi guide-tilt-card text-left', `guide-kpi-${tone}`)} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={cn('guide-kpi guide-tilt-card', `guide-kpi-${tone}`)}>{content}</div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { guides, dispatches, exceptions, integrations, metrics, isScanning, runScan } = useGuides();
  const { state } = useDataStore();
  const recent = guides.slice(0, 5);
  const openExceptions = exceptions.filter((entry) => entry.status === 'open' || entry.status === 'investigating').slice(0, 4);
  const delivered = dispatches.filter((entry) => entry.status === 'entregue').length;
  const channelTotal = metrics.email + metrics.whatsapp;
  const activeConnectors = metrics.healthyConnectors;
  const averageMinutes = useMemo(() => {
    const durations = guides
      .filter((entry) => entry.sentAt && entry.receivedAt)
      .map((entry) => (new Date(entry.sentAt!).getTime() - new Date(entry.receivedAt).getTime()) / 60000);
    return durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;
  }, [guides]);

  const metricCards: GuideMetricCardProps[] = [
    {
      title: 'Aguardando',
      value: metrics.waiting,
      detail: metrics.waiting === 1 ? '1 guia na fila' : `${metrics.waiting} guias na fila`,
      icon: Clock,
      tone: 'waiting',
      onClick: () => navigate('/guias/fila'),
    },
    {
      title: 'Enviadas',
      value: metrics.sent,
      detail: 'Guias finalizadas',
      icon: Send,
      tone: 'sent',
      onClick: () => navigate('/guias/enviadas'),
    },
    {
      title: 'Exceções',
      value: metrics.reviewing,
      detail: 'Pendências abertas',
      icon: AlertTriangle,
      tone: 'exceptions',
      onClick: () => navigate('/guias/excecoes'),
    },
    {
      title: 'Falhas',
      value: metrics.failures,
      detail: metrics.failures > 0 ? 'Exige revisão' : 'Sem falhas ativas',
      icon: AlertTriangle,
      tone: 'failures',
      onClick: () => navigate('/guias/excecoes'),
    },
    {
      title: 'Tempo médio',
      value: `${averageMinutes} min`,
      detail: 'Recebimento até envio',
      icon: Activity,
      tone: 'time',
    },
    {
      title: 'Entregues',
      value: delivered,
      detail: 'Confirmadas no canal',
      icon: ShieldCheck,
      tone: 'delivered',
    },
  ];

  const channelRows = [
    {
      id: 'email',
      label: 'E-mail',
      value: metrics.email,
      icon: Mail,
      className: 'guide-channel-email',
      status: metrics.email > 0 ? 'Em uso' : 'Sem envios',
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      value: metrics.whatsapp,
      icon: MessageCircle,
      className: 'guide-channel-whatsapp',
      status: metrics.whatsapp > 0 ? 'Em uso' : 'Sem uso',
    },
  ];

  const dominantChannel =
    channelTotal === 0
      ? 'Sem envios registrados'
      : metrics.whatsapp > metrics.email
        ? 'WhatsApp lidera o volume'
        : metrics.email > metrics.whatsapp
          ? 'E-mail lidera o volume'
          : 'Canais equilibrados';

  return (
    <div className="guide-dashboard space-y-5">
      <section className="guide-hero">
        <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="guide-hero-chip">
                <Sparkles className="h-3.5 w-3.5" />
                Operação principal
              </span>
              <span className="guide-hero-chip guide-hero-chip-live">
                <span className={cn('guide-live-dot', isScanning && 'guide-live-dot-processing')} />
                {isScanning ? 'Processando fila' : 'Fila pronta'}
              </span>
            </div>
            <h1 className="font-display text-3xl font-extrabold leading-tight text-white md:text-4xl">Envio de Guias</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80 md:text-base">
              Automação Drive, Gmail e WhatsApp com rastreabilidade operacional para cada guia enviada.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:flex-col xl:items-stretch">
            <Button onClick={runScan} disabled={isScanning} className="guide-primary-action h-12 justify-center gap-2 px-5 text-sm">
              <RefreshCw className={cn('h-4 w-4 stroke-[2.2]', isScanning && 'animate-spin')} />
              {isScanning ? 'Processando...' : 'Processar agora'}
            </Button>
            <div className="guide-hero-telemetry">
              <div>
                <span>{metrics.waiting}</span>
                <p>Aguardando</p>
              </div>
              <div>
                <span>{openExceptions.length}</span>
                <p>Exceções</p>
              </div>
              <div>
                <span>{integrations.length ? `${activeConnectors}/${integrations.length}` : '0/0'}</span>
                <p>Conectores</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metricCards.map((card) => (
          <GuideMetricCard key={card.title} {...card} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <div className="guide-section guide-section-flow p-5">
          <div className="guide-section-header">
            <div>
              <p className="guide-section-kicker">Timeline operacional</p>
              <h2>Fluxo recente</h2>
            </div>
            <Button variant="ghost" size="sm" className="guide-link-action" asChild>
              <Link to="/guias/fila">
                Abrir fila <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <div className="guide-flow-list">
            {recent.length === 0 && (
              <div className="guide-empty-state">
                <Inbox className="h-5 w-5" />
                <div>
                  <p>Nenhuma guia recente</p>
                  <span>A pasta a enviar ainda não retornou guias. Inicie uma varredura manual para atualizar a fila.</span>
                </div>
              </div>
            )}

            {recent.map((guide) => {
              const company = state.empresas.find((entry) => entry.id === guide.empresaId);
              const status = getGuideStatus(guide.status);
              return (
                <GuideFlowRow
                  key={guide.id}
                  guideId={guide.id}
                  fileName={guide.fileName}
                  companyLabel={company?.nomeFantasia || 'Identificando empresa'}
                  statusLabel={status.label}
                  statusClassName={status.className}
                  receivedAt={guide.receivedAt}
                  tipoGuia={guide.tipoGuia}
                  competencia={guide.competencia}
                />
              );
            })}
          </div>
        </div>

        <div className="guide-section p-5">
          <div className="guide-section-header">
            <div>
              <p className="guide-section-kicker">Distribuição</p>
              <h2>Canais utilizados</h2>
            </div>
            <span className="guide-compact-total">{channelTotal}</span>
          </div>

          <div className="space-y-3">
            {channelRows.map((channel) => {
              const Icon = channel.icon;
              const share = channelTotal ? Math.round((channel.value / channelTotal) * 100) : 0;
              return (
                <div key={channel.id} className={cn('guide-channel-row', channel.className)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="guide-channel-icon">
                        <Icon className="h-4 w-4 stroke-[2.1]" />
                      </div>
                      <div className="min-w-0">
                        <p>{channel.label}</p>
                        <span>{channel.status}</span>
                      </div>
                    </div>
                    <strong>{channel.value}</strong>
                  </div>
                  <div className="guide-channel-track" aria-hidden>
                    <span style={{ width: `${share}%` }} />
                  </div>
                  <div className="guide-channel-foot">
                    <span>{share}% do volume</span>
                    {channel.id === 'whatsapp' && <span>{metrics.whatsapp > 0 ? 'WhatsApp ativo no fluxo' : 'WhatsApp sem uso registrado'}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="guide-channel-summary">
            <Zap className="h-4 w-4" />
            <span>{dominantChannel}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="guide-section guide-section-exceptions p-5">
          <div className="guide-section-header">
            <div>
              <p className="guide-section-kicker">Prioridade</p>
              <h2>Exceções abertas</h2>
            </div>
            <Button variant="ghost" size="sm" className="guide-link-action" asChild>
              <Link to="/guias/excecoes">
                Analisar <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <div className="space-y-3">
            {openExceptions.length === 0 && (
              <div className="guide-empty-state guide-empty-state-success">
                <CheckCircle2 className="h-5 w-5" />
                <div>
                  <p>Nenhuma pendência operacional</p>
                  <span>As guias em acompanhamento estão sem bloqueios que exijam revisão no momento.</span>
                </div>
              </div>
            )}

            {openExceptions.map((entry) => {
              const severity = severityMeta[entry.severity] ?? severityMeta.warning;
              return (
                <div key={entry.id} className="guide-exception-row">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="guide-exception-type">{humanizeKey(entry.exceptionType)}</p>
                      <h3>{entry.reason}</h3>
                    </div>
                    <GuidePill label={severity.label} className={severity.className} />
                  </div>
                  <p>{entry.actionRecommended}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="guide-section p-5">
          <div className="guide-section-header">
            <div>
              <p className="guide-section-kicker">Saúde operacional</p>
              <h2>Integridade dos conectores</h2>
            </div>
            <Button variant="ghost" size="sm" className="guide-link-action" asChild>
              <Link to="/integracoes">
                Configurar <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <div className="guide-connector-summary">
            <div>
              <span>{integrations.length ? `${activeConnectors}/${integrations.length}` : '0/0'}</span>
              <p>conectores ativos</p>
            </div>
            <ShieldCheck className="h-5 w-5" />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {integrations.map((integration) => {
              const Icon = getConnectorIcon(integration.provider);
              const status = getConnectorStatus(integration.status);
              return (
                <div key={integration.provider} className="guide-connector-card guide-tilt-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="guide-connector-icon">
                      <Icon className="h-4 w-4 stroke-[2.1]" />
                    </div>
                    <GuidePill label={status.label} className={status.className} />
                  </div>
                  <p>{integration.displayName}</p>
                  <span>{integration.lastCheckAt ? `Última checagem ${formatDateTime(integration.lastCheckAt)}` : 'Aguardando primeira checagem'}</span>
                </div>
              );
            })}

            {integrations.length === 0 && (
              <div className="guide-empty-state sm:col-span-2">
                <Plug className="h-5 w-5" />
                <div>
                  <p>Conectores aguardando configuração</p>
                  <span>Configure Drive, Gmail ou WhatsApp para exibir a saúde operacional aqui.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ChevronIcon() {
  return (
    <span className="guide-flow-chevron" aria-hidden>
      <ArrowRight className="h-3.5 w-3.5" />
    </span>
  );
}
