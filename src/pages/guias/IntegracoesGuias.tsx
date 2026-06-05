import { useEffect, useState } from 'react';
import { Database, FileText, FolderInput, Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGuides } from '@/features/guias/GuideProvider';
import type { IntegracaoGuia, IntegrationProvider } from '@/data/types';
import { formatDateTime } from '@/lib/formatters';
import { supabase } from '@/integrations/supabase/client';
import googleDriveLogo from '@/assets/connectors/google-drive.svg';
import gmailLogo from '@/assets/connectors/gmail.svg';
import twilioLogo from '@/assets/connectors/twilio.svg';

const icons: Record<IntegrationProvider, typeof FileText> = {
  google_drive: FolderInput,
  gmail: Mail,
  twilio_whatsapp: MessageCircle,
  pdf_native_reader: FileText,
};

const logos: Record<IntegrationProvider, string | null> = {
  google_drive: googleDriveLogo,
  gmail: gmailLogo,
  twilio_whatsapp: twilioLogo,
  pdf_native_reader: null,
};

const providerLabels: Record<IntegrationProvider, string> = {
  google_drive: 'Google Drive',
  gmail: 'Gmail',
  twilio_whatsapp: 'Twilio WhatsApp',
  pdf_native_reader: 'Leitura PDF nativa',
};

const providerDescriptions: Partial<Record<IntegrationProvider, string>> = {
  pdf_native_reader:
    'Extração direta de texto em PDFs digitais, sem OCR externo. PDFs escaneados são enviados para Exceções.',
};

function ConnectorCard({ integration }: { integration: IntegracaoGuia }) {
  const Icon = icons[integration.provider];
  const logo = logos[integration.provider];
  const isConnected = integration.status === 'ativo' || integration.status === 'configurado';
  return (
    <GlassCard variant="elevated" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative rounded-xl bg-primary/10 p-3 text-primary">
            <Icon className="h-5 w-5" />
            {logo && (
              <img
                src={logo}
                alt={`${providerLabels[integration.provider]} logo`}
                className="absolute -bottom-1.5 -right-1.5 h-5 w-5 rounded-full bg-background p-0.5 shadow-md ring-1 ring-border"
              />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold">{providerLabels[integration.provider]}</p>
            <p className="text-xs text-foreground/68">
              {providerDescriptions[integration.provider] ?? integration.provider.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
        <Badge variant={isConnected ? 'default' : 'outline'} className="capitalize">
          {isConnected ? 'Conectado' : integration.status}
        </Badge>
      </div>
      {integration.provider === 'google_drive' && (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-xs text-foreground/76">
          <p>`a enviar`: {integration.sourceFolderId || 'Não configurada'}</p>
          <p className="mt-1">`enviados`: {integration.sentFolderId || 'Não configurada'}</p>
        </div>
      )}
      <p className="text-xs text-foreground/68">
        {integration.lastCheckAt ? `Última verificação: ${formatDateTime(integration.lastCheckAt)}` : 'Nenhuma verificação executada.'}
      </p>
      {integration.lastError && <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{integration.lastError}</p>}
    </GlassCard>
  );
}

export default function IntegracoesGuias() {
  const { integrations } = useGuides();
  const [liveStatus, setLiveStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.functions.invoke('integracoes-status').then(({ data }) => {
      if (data) setLiveStatus(data as Record<string, boolean>);
    }).catch(() => {});
  }, []);

  const buildIntegration = (provider: IntegrationProvider): IntegracaoGuia => {
    const existing = integrations.find((i) => i.provider === provider);
    // Native PDF reader is internal — always active and never depends on a secret.
    const connected = provider === 'pdf_native_reader' ? true : liveStatus[provider];
    return {
      provider,
      displayName: providerLabels[provider],
      status: connected ? 'ativo' : existing?.status ?? 'desconectado',
      sourceFolderId: existing?.sourceFolderId ?? null,
      sentFolderId: existing?.sentFolderId ?? null,
      senderIdentity: existing?.senderIdentity ?? null,
      scheduleMinutes: existing?.scheduleMinutes ?? 5,
      lastCheckAt: existing?.lastCheckAt ?? null,
      lastError: existing?.lastError ?? null,
    };
  };

  const providers: IntegrationProvider[] = ['google_drive', 'gmail', 'twilio_whatsapp', 'pdf_native_reader'];

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Integracoes" subtitle="Conectores e seguranca do envio automático de guias.">
        <Button disabled variant="outline">Gerenciar conexões</Button>
      </PageHeader>

      <GlassCard variant="elevated" className="overflow-hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
            <div>
              <p className="text-sm font-semibold">Segredos protegidos no servidor</p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-foreground/72">
                OAuth refresh token, credenciais Vision e token Twilio nunca são enviados ao frontend.
                URLs de documento para WhatsApp expiram e o webhook exige assinatura Twilio válida.
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
        {providers.map((provider) => (
          <ConnectorCard key={provider} integration={buildIntegration(provider)} />
        ))}
      </div>
    </div>
  );
}
