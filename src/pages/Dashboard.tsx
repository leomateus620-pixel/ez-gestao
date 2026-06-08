import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, FileText, Inbox, Mail, MessageCircle, Plug, Send, ShieldCheck } from 'lucide-react';
import { useGuides } from '@/features/guias/GuideProvider';
import { useDataStore } from '@/data/DataProvider';
import { MetricCard } from '@/components/MetricCard';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/formatters';

export default function Dashboard() {
  const navigate = useNavigate();
  const { guides, dispatches, exceptions, integrations, metrics, isScanning, runScan } = useGuides();
  const { state } = useDataStore();
  const recent = guides.slice(0, 5);
  const openExceptions = exceptions.filter((entry) => entry.status === 'open' || entry.status === 'investigating').slice(0, 4);
  const delivered = dispatches.filter((entry) => entry.status === 'entregue').length;
  const averageMinutes = useMemo(() => {
    const durations = guides.filter((entry) => entry.sentAt && entry.receivedAt).map((entry) =>
      (new Date(entry.sentAt!).getTime() - new Date(entry.receivedAt).getTime()) / 60000
    );
    return durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;
  }, [guides]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Envio de Guias"
        eyebrow="Operação principal"
        icon={FileText}
        subtitle="Automação Drive, Gmail e WhatsApp com rastreabilidade completa para cada guia enviada."
      >
        <Button onClick={runScan} disabled={isScanning} className="gap-2">
          <FileText className="h-4 w-4 stroke-[2.1]" /> {isScanning ? 'Processando...' : 'Processar agora'}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <MetricCard title="Aguardando" value={metrics.waiting} icon={Clock} color="info" onClick={() => navigate('/guias/fila')} />
        <MetricCard title="Enviadas" value={metrics.sent} icon={Send} color="success" onClick={() => navigate('/guias/enviadas')} />
        <MetricCard title="Exceções" value={metrics.reviewing} icon={AlertTriangle} color="warning" onClick={() => navigate('/guias/excecoes')} />
        <MetricCard title="Falhas" value={metrics.failures} icon={AlertTriangle} color="destructive" onClick={() => navigate('/guias/excecoes')} />
        <MetricCard title="Tempo médio" value={`${averageMinutes} min`} icon={Clock} color="primary" />
        <MetricCard title="Entregues" value={delivered} icon={ShieldCheck} color="accent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard variant="elevated" className="lg:col-span-2">
          <SectionHeader title="Fluxo recente">
            <Button variant="ghost" size="sm" asChild><Link to="/guias/fila">Abrir fila <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
          </SectionHeader>
          <div className="space-y-2">
            {recent.length === 0 && (
              <EmptyState
                icon={Inbox}
                title="Nenhuma guia recente"
                description="A pasta “a enviar” ainda não retornou guias. Você pode iniciar uma varredura manual para atualizar a fila."
                actionLabel="Processar agora"
                onAction={runScan}
                className="border-dashed py-10"
              />
            )}
            {recent.map((guide) => {
              const company = state.empresas.find((entry) => entry.id === guide.empresaId);
              return (
                <Link key={guide.id} to={`/guias/${guide.id}`} className="data-row">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[hsl(var(--text-primary))]">{guide.fileName}</p>
                    <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">{company?.nomeFantasia || 'Identificando empresa'} · {formatDateTime(guide.receivedAt)}</p>
                  </div>
                  <Badge variant="outline" className="ml-3 shrink-0 capitalize">{guide.status}</Badge>
                </Link>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard variant="elevated">
          <SectionHeader title="Canais utilizados" />
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-[hsla(var(--surface-panel))] p-4">
              <div className="flex items-center gap-2.5 text-sm font-medium text-[hsl(var(--text-secondary))]"><Mail className="h-4 w-4 text-primary" /> E-mail</div>
              <span className="font-display text-2xl font-bold tabular-nums text-[hsl(var(--text-primary))]">{metrics.email}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-[hsla(var(--surface-panel))] p-4">
              <div className="flex items-center gap-2.5 text-sm font-medium text-[hsl(var(--text-secondary))]"><MessageCircle className="h-4 w-4 text-success" /> WhatsApp</div>
              <span className="font-display text-2xl font-bold tabular-nums text-[hsl(var(--text-primary))]">{metrics.whatsapp}</span>
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <SectionHeader title="Exceções abertas" icon={AlertTriangle}>
            <Button variant="ghost" size="sm" asChild><Link to="/guias/excecoes">Analisar <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
          </SectionHeader>
          <div className="space-y-2">
            {openExceptions.length === 0 && (
              <EmptyState
                icon={CheckCircle2}
                title="Nenhuma pendência operacional"
                description="As guias em acompanhamento estão sem bloqueios que exijam revisão no momento."
                className="bg-transparent py-9 shadow-none"
              />
            )}
            {openExceptions.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-warning/25 bg-warning/8 p-3.5">
                <p className="text-sm font-semibold text-[hsl(var(--text-primary))]">{entry.reason}</p>
                <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--text-secondary))]">{entry.actionRecommended}</p>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <SectionHeader title="Integridade dos conectores" icon={Plug}>
            <Button variant="ghost" size="sm" asChild><Link to="/integracoes">Configurar <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
          </SectionHeader>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {integrations.map((integration) => (
              <div key={integration.provider} className="rounded-2xl border border-border/60 bg-[hsla(var(--surface-panel))] p-3.5">
                <p className="text-xs font-medium text-[hsl(var(--text-tertiary))]">{integration.displayName}</p>
                <p className="mt-2 text-sm font-semibold capitalize text-[hsl(var(--text-primary))]">{integration.status}</p>
              </div>
            ))}
            {integrations.length === 0 && (
              <EmptyState
                icon={Plug}
                title="Conectores aguardando configuração"
                description="Configure Drive, Gmail ou WhatsApp para exibir a saúde operacional aqui."
                className="col-span-full bg-transparent py-9 shadow-none"
              />
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
