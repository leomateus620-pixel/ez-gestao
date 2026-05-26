import { Cloud, Database, FolderInput, Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGuides } from '@/features/guias/GuideProvider';
import type { IntegracaoGuia, IntegrationProvider } from '@/data/types';
import { formatDateTime } from '@/lib/formatters';

const icons: Record<IntegrationProvider, typeof Cloud> = {
  google_drive: FolderInput,
  gmail: Mail,
  twilio_whatsapp: MessageCircle,
  google_vision: Cloud,
};

function ConnectorCard({ integration }: { integration: IntegracaoGuia }) {
  const Icon = icons[integration.provider];
  return (
    <GlassCard variant="elevated" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></div>
          <div>
            <p className="text-sm font-semibold">{integration.displayName}</p>
            <p className="text-xs text-foreground/50">{integration.provider.replace(/_/g, ' ')}</p>
          </div>
        </div>
        <Badge variant="outline" className="capitalize">{integration.status}</Badge>
      </div>
      {integration.provider === 'google_drive' && (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-xs text-foreground/65">
          <p>`a enviar`: {integration.sourceFolderId || 'Nao configurada'}</p>
          <p className="mt-1">`enviados`: {integration.sentFolderId || 'Nao configurada'}</p>
        </div>
      )}
      <p className="text-xs text-foreground/50">
        {integration.lastCheckAt ? `Ultima verificacao: ${formatDateTime(integration.lastCheckAt)}` : 'Nenhuma verificacao executada.'}
      </p>
      {integration.lastError && <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{integration.lastError}</p>}
    </GlassCard>
  );
}

export default function IntegracoesGuias() {
  const { integrations } = useGuides();
  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Integracoes" subtitle="Conectores e seguranca do envio automatico de guias.">
        <Button disabled variant="outline">Conectar Google OAuth</Button>
      </PageHeader>

      <GlassCard variant="elevated" className="overflow-hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
            <div>
              <p className="text-sm font-semibold">Segredos protegidos no servidor</p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-foreground/60">
                OAuth refresh token, credenciais Vision e token Twilio nunca sao enviados ao frontend.
                URLs de documento para WhatsApp expiram e o webhook exige assinatura Twilio valida.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3 text-xs">
            <Database className="h-4 w-4 text-primary" />
            Varredura: a cada 5 minutos
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 md:grid-cols-2">
        {integrations.length === 0
          ? (['google_drive', 'gmail', 'twilio_whatsapp', 'google_vision'] as IntegrationProvider[]).map((provider) => (
              <ConnectorCard key={provider} integration={{
                provider,
                displayName: provider.replace(/_/g, ' '),
                status: 'desconectado',
                sourceFolderId: null,
                sentFolderId: null,
                senderIdentity: null,
                scheduleMinutes: 5,
                lastCheckAt: null,
                lastError: null,
              }} />
            ))
          : integrations.map((integration) => <ConnectorCard key={integration.provider} integration={integration} />)}
      </div>
    </div>
  );
}
