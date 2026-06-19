import { useEffect, useState } from 'react';
import { Database, FileText, FolderCog, FolderInput, Mail, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGuides } from '@/features/guias/GuideProvider';
import { useBootstrapFolders, useTestConnection } from '@/features/guias/useGuideOps';
import type { IntegracaoGuia, IntegrationProvider } from '@/data/types';
import { formatDateTime } from '@/lib/formatters';
import { supabase } from '@/integrations/supabase/client';
import googleDriveLogo from '@/assets/connectors/google-drive.svg';
import gmailLogo from '@/assets/connectors/gmail.svg';
import twilioLogo from '@/assets/connectors/twilio.svg';
import { toast } from 'sonner';

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

type Folders = {
  root_folder_id: string | null;
  source_folder_id: string | null;
  sent_folder_id: string | null;
  review_folder_id: string | null;
  not_identified_folder_id: string | null;
  errors_folder_id: string | null;
  duplicates_folder_id: string | null;
};

function ConnectorCard({ integration, folders, onTest, onBootstrap, bootstrapping }: {
  integration: IntegracaoGuia;
  folders?: Folders | null;
  onTest?: (canal: 'email' | 'whatsapp', dest: string) => void;
  onBootstrap?: () => void;
  bootstrapping?: boolean;
}) {
  const Icon = icons[integration.provider];
  const logo = logos[integration.provider];
  const isConnected = integration.status === 'ativo' || integration.status === 'configurado';
  const [testDest, setTestDest] = useState('');
  const testCanal: 'email' | 'whatsapp' | null = integration.provider === 'gmail' ? 'email'
    : integration.provider === 'twilio_whatsapp' ? 'whatsapp' : null;
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
        <div className="space-y-2">
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-[11px] text-foreground/76 space-y-1 font-mono">
            <p>A Enviar: {folders?.source_folder_id || '—'}</p>
            <p>Enviadas: {folders?.sent_folder_id || '—'}</p>
            {folders?.review_folder_id && <p>Revisão Manual: {folders.review_folder_id}</p>}
            {folders?.not_identified_folder_id && <p>Não Identificadas: {folders.not_identified_folder_id}</p>}
            {folders?.errors_folder_id && <p>Erros: {folders.errors_folder_id}</p>}
            {folders?.duplicates_folder_id && <p>Duplicadas: {folders.duplicates_folder_id}</p>}
            {!folders?.review_folder_id && (
              <p className="text-foreground/55 not-italic">
                Modo simplificado: PDFs com problema ficam registrados apenas no app (sem mover de pasta no Drive).
              </p>
            )}
          </div>
          {onBootstrap && (
            <Button size="sm" variant="outline" onClick={onBootstrap} disabled={bootstrapping} className="w-full">
              <FolderCog className="mr-2 h-3.5 w-3.5" /> {bootstrapping ? 'Revalidando...' : 'Revalidar pastas no Drive'}
            </Button>
          )}
        </div>
      )}
      {testCanal && onTest && (
        <div className="flex gap-2">
          <Input
            value={testDest}
            placeholder={testCanal === 'email' ? 'teste@exemplo.com' : '+5511999999999'}
            onChange={(e) => setTestDest(e.target.value)}
            className="text-xs"
          />
          <Button size="sm" variant="outline" disabled={!testDest} onClick={() => onTest(testCanal, testDest)}>
            <Send className="mr-1 h-3.5 w-3.5" /> Testar
          </Button>
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
  const [folders, setFolders] = useState<Folders | null>(null);
  const bootstrap = useBootstrapFolders();
  const testConn = useTestConnection();

  useEffect(() => {
    supabase.functions.invoke('integracoes-status').then(({ data }) => {
      if (data) setLiveStatus(data as Record<string, boolean>);
    }).catch(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('integracoes_guias').select('*').eq('provider', 'google_drive').maybeSingle()
      .then(({ data }: any) => { if (data) setFolders(data as Folders); });
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
    <div className="space-y-6">
      <PageHeader title="Integracoes" subtitle="Conectores e seguranca do envio automático de guias.">
        <Button variant="outline" onClick={() => toast.info('Gerenciar conexões', { description: 'As credenciais são configuradas como secrets no Supabase.' })}>Gerenciar conexões</Button>
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
          <ConnectorCard
            key={provider}
            integration={buildIntegration(provider)}
            folders={provider === 'google_drive' ? folders : null}
            onBootstrap={provider === 'google_drive' ? () => bootstrap.mutate() : undefined}
            bootstrapping={bootstrap.isPending}
            onTest={provider === 'gmail' || provider === 'twilio_whatsapp'
              ? (canal, dest) => testConn.mutate({ canal, destinatario: dest })
              : undefined}
          />
        ))}
      </div>
    </div>
  );
}
