/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useContext, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Guia, GuiaEnvio, GuiaEvento, GuiaExcecao, IntegracaoGuia } from '@/data/types';

const database = supabase as any;

function mapGuide(row: any): Guia {
  return {
    id: row.id,
    driveFileId: row.drive_file_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sha256: row.sha256,
    status: row.status,
    matchSource: row.match_source,
    cnpjDetectado: row.cnpj_detectado,
    empresaId: row.empresa_id,
    tipoGuia: row.tipo_guia,
    competencia: row.competencia,
    vencimento: row.vencimento,
    valor: row.valor,
    textoExtraidoPreview: row.texto_extraido_preview,
    paginaCount: row.pagina_count ?? null,
    extractionMethod: row.extraction_method ?? null,
    hasTextLayer: row.has_text_layer ?? null,
    pastaAtual: row.pasta_atual,
    providerError: row.provider_error,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
    sentAt: row.sent_at,
  };
}

function mapDispatch(row: any): GuiaEnvio {
  return {
    id: row.id,
    guiaId: row.guia_id,
    empresaId: row.empresa_id,
    canal: row.canal,
    destinatario: row.destinatario,
    assunto: row.assunto,
    mensagemPreview: row.mensagem_preview,
    templateSid: row.template_sid,
    providerMessageId: row.provider_message_id,
    status: row.status,
    submittedAt: row.submitted_at,
    deliveredAt: row.delivered_at,
    failedAt: row.failed_at,
  };
}

function mapException(row: any): GuiaExcecao {
  return {
    id: row.id,
    guiaId: row.guia_id,
    exceptionType: row.exception_type,
    severity: row.severity,
    status: row.status,
    reason: row.reason,
    actionRecommended: row.action_recommended,
    createdAt: row.created_at,
  };
}

function mapEvent(row: any): GuiaEvento {
  return {
    id: row.id,
    guiaId: row.guia_id,
    eventType: row.event_type,
    level: row.level,
    message: row.message,
    createdAt: row.created_at,
  };
}

function mapIntegration(row: any): IntegracaoGuia {
  return {
    provider: row.provider,
    displayName: row.display_name,
    status: row.status,
    sourceFolderId: row.source_folder_id,
    sentFolderId: row.sent_folder_id,
    senderIdentity: row.sender_identity,
    scheduleMinutes: row.schedule_minutes,
    lastCheckAt: row.last_check_at,
    lastError: row.last_error,
  };
}

async function rows(table: string, order = 'created_at') {
  const { data, error } = await database.from(table).select('*').order(order, { ascending: false });
  if (error) throw error;
  return data || [];
}

interface GuideContextValue {
  guides: Guia[];
  dispatches: GuiaEnvio[];
  exceptions: GuiaExcecao[];
  events: GuiaEvento[];
  integrations: IntegracaoGuia[];
  isLoading: boolean;
  isScanning: boolean;
  metrics: {
    waiting: number;
    sent: number;
    failures: number;
    reviewing: number;
    email: number;
    whatsapp: number;
    healthyConnectors: number;
  };
  runScan: () => void;
  resolveException: (id: string) => void;
}

const GuideContext = createContext<GuideContextValue | null>(null);

export function GuideProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const guidesQuery = useQuery({ queryKey: ['guias'], queryFn: () => rows('guias', 'received_at').then((data) => data.map(mapGuide)) });
  const dispatchQuery = useQuery({ queryKey: ['guia_envios'], queryFn: () => rows('guia_envios').then((data) => data.map(mapDispatch)) });
  const exceptionsQuery = useQuery({ queryKey: ['guia_excecoes'], queryFn: () => rows('guia_excecoes').then((data) => data.map(mapException)) });
  const eventsQuery = useQuery({ queryKey: ['guia_eventos'], queryFn: () => rows('guia_eventos').then((data) => data.map(mapEvent)) });
  const integrationsQuery = useQuery({
    queryKey: ['integracoes_guias'],
    queryFn: async () => {
      const { data, error } = await database.from('integracoes_guias').select('*').order('display_name');
      if (error) throw error;
      return (data || []).map(mapIntegration);
    },
  });

  const refresh = () => {
    ['guias', 'guia_envios', 'guia_excecoes', 'guia_eventos', 'integracoes_guias'].forEach((key) => {
      client.invalidateQueries({ queryKey: [key] });
    });
  };
  const scan = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('run-guide-scan-now');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      refresh();
      toast.success('Varredura concluida', { description: `${data?.scanned ?? 0} arquivo(s) analisado(s).` });
    },
    onError: (error: any) => {
      toast.error('Varredura indisponivel', { description: error?.message || 'Ative o Google Drive antes de processar.' });
    },
  });
  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await database.from('guia_excecoes')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['guia_excecoes'] });
      toast.success('Exceção resolvida');
    },
  });

  const guides = useMemo(() => guidesQuery.data || [], [guidesQuery.data]);
  const dispatches = useMemo(() => dispatchQuery.data || [], [dispatchQuery.data]);
  const exceptions = useMemo(() => exceptionsQuery.data || [], [exceptionsQuery.data]);
  const integrations = useMemo(() => integrationsQuery.data || [], [integrationsQuery.data]);
  const metrics = useMemo(() => ({
    waiting: guides.filter((guide) => ['aguardando', 'lendo', 'ocr', 'identificada', 'enviando'].includes(guide.status)).length,
    sent: guides.filter((guide) => guide.status === 'enviada').length,
    failures: guides.filter((guide) => guide.status === 'erro').length,
    reviewing: exceptions.filter((entry) => entry.status === 'open' || entry.status === 'investigating').length,
    email: dispatches.filter((entry) => entry.canal === 'email').length,
    whatsapp: dispatches.filter((entry) => entry.canal === 'whatsapp').length,
    healthyConnectors: integrations.filter((entry) => entry.status === 'ativo').length,
  }), [dispatches, exceptions, guides, integrations]);

  return (
    <GuideContext.Provider value={{
      guides,
      dispatches,
      exceptions,
      events: eventsQuery.data || [],
      integrations,
      metrics,
      isLoading: guidesQuery.isLoading || dispatchQuery.isLoading || exceptionsQuery.isLoading || integrationsQuery.isLoading,
      isScanning: scan.isPending,
      runScan: () => scan.mutate(),
      resolveException: (id) => resolve.mutate(id),
    }}>
      {children}
    </GuideContext.Provider>
  );
}

export function useGuides() {
  const context = useContext(GuideContext);
  if (!context) throw new Error('useGuides must be used within GuideProvider');
  return context;
}
