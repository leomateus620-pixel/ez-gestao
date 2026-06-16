/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export type TestConfig = {
  id: number;
  modo_global: 'teste' | 'producao';
  email_teste: string | null;
  whatsapp_teste: string | null;
  updated_by: string | null;
};

export function useTestConfig() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['guide_test_config'],
    queryFn: async () => {
      const { data, error } = await db.from('guide_test_config').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return (data || { id: 1, modo_global: 'teste', email_teste: null, whatsapp_teste: null }) as TestConfig;
    },
    staleTime: 30_000,
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<TestConfig>) => {
      const { error } = await db.from('guide_test_config').update(patch).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['guide_test_config'] });
      toast.success('Configuração atualizada');
    },
    onError: (e: any) => toast.error('Falha ao salvar', { description: e?.message }),
  });

  return { ...query, update };
}

export function useBatchRuns(limit = 10) {
  return useQuery({
    queryKey: ['guide_batch_runs', limit],
    queryFn: async () => {
      const { data, error } = await db.from('guide_batch_runs')
        .select('*').order('started_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return data || [];
    },
    staleTime: 15_000,
  });
}

export function useGuideTemplates() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['guide_templates'],
    queryFn: async () => {
      const { data, error } = await db.from('guide_templates').select('*').order('tipo_guia');
      if (error) throw error;
      return data || [];
    },
  });
  const upsert = useMutation({
    mutationFn: async (row: any) => {
      const { error } = row.id
        ? await db.from('guide_templates').update({
            assunto: row.assunto, corpo: row.corpo, twilio_content_sid: row.twilio_content_sid, ativo: row.ativo,
          }).eq('id', row.id)
        : await db.from('guide_templates').insert(row);
      if (error) throw error;
    },
    onSuccess: () => { client.invalidateQueries({ queryKey: ['guide_templates'] }); toast.success('Template salvo'); },
    onError: (e: any) => toast.error('Erro ao salvar template', { description: e?.message }),
  });
  return { ...query, upsert };
}

export function useDispatchGuide() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (params: { guide_id: string; overrides?: Record<string, unknown> }) => {
      const { data, error } = await supabase.functions.invoke('dispatch-guide', { body: params });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      ['guias', 'guia_envios', 'guia_excecoes', 'guide_batch_runs'].forEach((k) =>
        client.invalidateQueries({ queryKey: [k] }));
      toast.success('Reprocessamento enviado');
    },
    onError: (e: any) => toast.error('Falha no reenvio', { description: e?.message }),
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: async (params: { canal: 'email' | 'whatsapp'; destinatario: string }) => {
      const { data, error } = await supabase.functions.invoke('test-guide-connection', { body: params });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => toast.success('Teste enviado', { description: d?.ok ? 'OK' : 'Verifique destinatário' }),
    onError: (e: any) => toast.error('Teste falhou', { description: e?.message }),
  });
}

export function useBootstrapFolders() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('bootstrap-test-folder', {});
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['integracoes_guias'] });
      toast.success('Estrutura Drive recriada');
    },
    onError: (e: any) => toast.error('Falha ao recriar pastas', { description: e?.message }),
  });
}

export function pdfPreviewUrl(guideId: string): string {
  const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || '';
  return `https://${projectId}.supabase.co/functions/v1/get-guide-pdf?guide_id=${encodeURIComponent(guideId)}`;
}