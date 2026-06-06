import { useMemo, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Clock, FileSearch, Mail, MessageCircle, ShieldAlert } from 'lucide-react';
import { useGuides } from '@/features/guias/GuideProvider';
import { useDataStore } from '@/data/DataProvider';
import { GlassCard } from '@/components/GlassCard';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCNPJ, formatDate, formatDateTime } from '@/lib/formatters';

export default function GuiaDetalhe() {
  const { id } = useParams();
  const { guides, dispatches, exceptions, events, enableEvents } = useGuides();
  useEffect(() => { enableEvents(); }, [enableEvents]);
  const { state } = useDataStore();
  const guide = guides.find((item) => item.id === id);
  const company = state.empresas.find((item) => item.id === guide?.empresaId);
  const dispatch = dispatches.find((item) => item.guiaId === id);
  const guideExceptions = exceptions.filter((item) => item.guiaId === id);
  const timeline = useMemo(() => events.filter((item) => item.guiaId === id), [events, id]);

  if (!guide) {
    return <EmptyState icon={FileSearch} title="Guia não encontrada" actionLabel="Voltar a fila" onAction={() => history.back()} />;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5">
        <Link to="/guias/fila"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
      </Button>
      <PageHeader title={guide.fileName} subtitle={`Recebida em ${formatDateTime(guide.receivedAt)}`}>
        <Badge variant="outline" className="capitalize">{guide.status}</Badge>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard variant="elevated" className="lg:col-span-2">
          <h2 className="text-sm font-semibold">Identificação e metadados</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs text-foreground/68">CNPJ detectado</p><p className="mt-1 font-mono text-sm">{guide.cnpjDetectado ? formatCNPJ(guide.cnpjDetectado) : 'Não identificado'}</p></div>
            <div><p className="text-xs text-foreground/68">Origem da identificação</p><p className="mt-1 text-sm capitalize">{guide.matchSource.replace('_', ' ')}</p></div>
            <div><p className="text-xs text-foreground/68">Tipo da guia</p><p className="mt-1 text-sm">{guide.tipoGuia || 'Não extraído'}</p></div>
            <div><p className="text-xs text-foreground/68">Competencia</p><p className="mt-1 text-sm">{guide.competencia || 'Não extraida'}</p></div>
            <div><p className="text-xs text-foreground/68">Vencimento</p><p className="mt-1 text-sm">{formatDate(guide.vencimento)}</p></div>
            <div><p className="text-xs text-foreground/68">Valor</p><p className="mt-1 text-sm">{guide.valor == null ? 'Não extraído' : `R$ ${guide.valor.toFixed(2).replace('.', ',')}`}</p></div>
          </div>
          {guide.textoExtraidoPreview && (
            <div className="mt-5 rounded-xl border border-border/50 bg-muted/30 p-4">
              <p className="text-xs font-medium text-foreground/70">Trecho extraído para auditoria</p>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-foreground/76">{guide.textoExtraidoPreview}</p>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <h2 className="text-sm font-semibold">Destinatario</h2>
          {company ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><span className="text-sm font-medium">{company.nomeFantasia}</span></div>
              <div className="flex items-center gap-2 text-sm text-foreground/76">
                {company.canalPreferido === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                {company.canalPreferido === 'whatsapp' ? company.whatsappPrincipal : company.emailPrincipal}
              </div>
              <Badge variant="outline">{company.canalPreferido || 'Sem canal preferido'}</Badge>
              {dispatch && <p className="text-xs text-foreground/70">Entrega: <span className="capitalize">{dispatch.status}</span></p>}
            </div>
          ) : <p className="mt-4 text-sm text-foreground/70">Empresa ainda não vinculada.</p>}
        </GlassCard>
      </div>

      {guideExceptions.length > 0 && (
        <GlassCard variant="critical">
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4" /> Exceções</div>
          <div className="mt-3 space-y-3">
            {guideExceptions.map((entry) => (
              <div key={entry.id} className="rounded-lg bg-background/45 p-3">
                <p className="text-sm">{entry.reason}</p>
                <p className="mt-1 text-xs text-foreground/70">{entry.actionRecommended}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <div className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4" /> Auditoria do fluxo</div>
        <div className="mt-4 space-y-3">
          {timeline.length === 0 ? <p className="text-sm text-foreground/70">Nenhum evento registrado ainda.</p> : timeline.map((entry) => (
            <div key={entry.id} className="flex gap-3 text-sm">
              <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
              <div>
                <p>{entry.message}</p>
                <p className="text-xs text-foreground/68">{formatDateTime(entry.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
