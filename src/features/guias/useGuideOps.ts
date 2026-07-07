/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  guideCompanyName,
  normalizeBrazilianPhone,
  validateGuideContactForm,
  type GuideContactFormValues,
  type GuideContactIssue,
} from '@/features/guias/guide-contact-rules';
import type { Empresa } from '@/data/types';

const db = supabase as any;

export type TestConfig = {
  id: number;
  modo_global: 'teste' | 'producao';
  operation_level:
    | 'automacao_desligada'
    | 'somente_classificacao'
    | 'leitura_revisao'
    | 'envio_automatico_seguro'
    | 'producao_total';
  auto_dispatch_enabled: boolean;
  require_batch_approval: boolean;
  high_value_threshold: number | null;
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
      return (data || {
        id: 1,
        modo_global: 'teste',
        operation_level: 'somente_classificacao',
        auto_dispatch_enabled: false,
        require_batch_approval: true,
        high_value_threshold: null,
        email_teste: null,
        whatsapp_teste: null,
        updated_by: null,
      }) as TestConfig;
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

function mapGuideCompany(row: any): Empresa {
  return {
    id: row.id,
    razaoSocial: row.razao_social,
    nomeFantasia: row.nome_fantasia,
    cnpj: row.cnpj,
    regimeTributario: row.regime_tributario,
    municipio: row.municipio,
    estado: row.estado,
    responsavelInterno: row.responsavel_interno,
    responsavelCliente: row.responsavel_cliente,
    emailPrincipal: row.email_principal,
    whatsappPrincipal: row.whatsapp_principal,
    canalPreferido: row.canal_preferido ?? null,
    emailValidado: row.email_validado ?? false,
    whatsappOptInAt: row.whatsapp_opt_in_at ?? null,
    comunicacaoAtiva: row.comunicacao_ativa ?? true,
    saudacaoGuia: row.saudacao_guia ?? '',
    observacoes: row.observacoes ?? '',
    status: row.status,
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
  };
}

export function useGuideCompanies() {
  return useQuery({
    queryKey: ['empresas_for_guides'],
    queryFn: async () => {
      const { data, error } = await db.from('empresas')
        .select('id, razao_social, nome_fantasia, cnpj, regime_tributario, municipio, estado, responsavel_interno, responsavel_cliente, email_principal, whatsapp_principal, canal_preferido, email_validado, whatsapp_opt_in_at, comunicacao_ativa, saudacao_guia, observacoes, status, created_at, updated_at')
        .order('razao_social');
      if (error) throw error;
      return (data || []).map(mapGuideCompany);
    },
    staleTime: 30_000,
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
    mutationFn: async (params: { guide_id: string; overrides?: Record<string, unknown>; force_dispatch?: boolean; manual_approval?: boolean }) => {
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

function appendObservation(existing: string, observation: string) {
  if (!observation) return existing || '';
  const stamp = new Date().toLocaleString('pt-BR');
  const next = `[${stamp}] Pendência de guia: ${observation}`;
  return [existing, next].filter(Boolean).join('\n');
}

export function useResolveGuideContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (params: { issue: GuideContactIssue; values: GuideContactFormValues }) => {
      const validation = validateGuideContactForm(params.issue, params.values);
      if (!validation.ok) {
        const first = Object.values(validation.errors).find(Boolean) || 'Revise os dados do contato.';
        throw new Error(first);
      }

      const { issue } = params;
      const normalized = validation.normalized;
      const existing = issue.company;
      const now = new Date().toISOString();
      let empresaId = existing?.id || '';

      if (existing) {
        const patch = {
          email_principal: normalized.email || existing.emailPrincipal || '',
          whatsapp_principal: normalized.phone || normalizeBrazilianPhone(existing.whatsappPrincipal) || existing.whatsappPrincipal || '',
          canal_preferido: normalized.preferredChannel,
          email_validado: Boolean(normalized.email || existing.emailValidado),
          whatsapp_opt_in_at: normalized.phone ? now : existing.whatsappOptInAt,
          comunicacao_ativa: true,
          observacoes: appendObservation(existing.observacoes, normalized.observation),
        };
        const { error } = await db.from('empresas').update(patch).eq('id', existing.id);
        if (error) throw error;
      } else {
        const cnpj = (issue.guide.cnpjDetectado || '').replace(/\D/g, '');
        if (!cnpj) throw new Error('A guia não possui CNPJ identificado para criar o cliente.');
        const name = guideCompanyName(issue.guide);
        const { data, error } = await db.from('empresas').insert({
          razao_social: name,
          nome_fantasia: name,
          cnpj,
          regime_tributario: 'simples_nacional',
          municipio: '',
          estado: '',
          responsavel_interno: '',
          responsavel_cliente: '',
          email_principal: normalized.email,
          whatsapp_principal: normalized.phone,
          canal_preferido: normalized.preferredChannel,
          email_validado: Boolean(normalized.email),
          whatsapp_opt_in_at: normalized.phone ? now : null,
          comunicacao_ativa: true,
          saudacao_guia: '',
          observacoes: appendObservation('', normalized.observation),
          status: 'ativa',
        }).select('id').single();
        if (error) throw error;
        empresaId = data.id;
      }

      const { error: guideError } = await db.from('guias').update({
        empresa_id: empresaId,
        cnpj_detectado: issue.guide.cnpjDetectado,
        status: 'aguardando_processamento',
        dispatch_blocked_reason: null,
        authorized_reprocess: true,
      }).eq('id', issue.guide.id);
      if (guideError) throw guideError;

      const { error: exceptionError } = await db.from('guia_excecoes')
        .update({ status: 'resolved', resolved_at: now })
        .eq('guia_id', issue.guide.id)
        .in('exception_type', [
          'company_not_found',
          'missing_email',
          'missing_phone',
          'missing_contact_channels',
          'missing_channel',
          'invalid_channel',
          'dispatch_precondition_failed',
        ]);
      if (exceptionError) throw exceptionError;

      await db.from('guide_audit').insert({
        guia_id: issue.guide.id,
        action: 'contact_resolved_from_guides_flow',
        actor: 'manual',
        after: {
          empresa_id: empresaId,
          issue: issue.kind,
          preferred_channel: normalized.preferredChannel,
          email_added: Boolean(normalized.email),
          phone_added: Boolean(normalized.phone),
        },
      });

      const { data, error } = await supabase.functions.invoke('dispatch-guide', {
        body: {
          guide_id: issue.guide.id,
          force_dispatch: true,
          manual_approval: true,
          overrides: {
            empresa_id: empresaId,
            cnpj_detectado: issue.guide.cnpjDetectado,
          },
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      ['guias', 'guia_envios', 'guia_excecoes', 'guia_eventos', 'guide_batch_runs', 'empresas_for_guides'].forEach((k) =>
        client.invalidateQueries({ queryKey: [k] }));
      toast.success('Contato salvo e guia reenviada para processamento');
    },
    onError: (e: any) => toast.error('Não foi possível resolver a pendência', { description: e?.message }),
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

export function useWhatsAppDiagnostic() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('test-guide-connection', {
        body: { canal: 'whatsapp', destinatario: '' },
      });
      if (error) throw error;
      return data as any;
    },
    onError: (e: any) => toast.error('Diagnóstico falhou', { description: e?.message }),
  });
}

export function useSendWhatsAppTest() {
  return useMutation({
    mutationFn: async (params: { to: string; template_name: string; language?: string; parameters?: string[] }) => {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-test', { body: params });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (d: any) => {
      if (d?.ok) toast.success('Mensagem enviada', { description: d?.message_id ? `ID: ${d.message_id}` : 'OK' });
      else toast.error('Falha no envio', { description: d?.message || 'Verifique os logs.' });
    },
    onError: (e: any) => toast.error('Falha no envio', { description: e?.message }),
  });
}

export function useBootstrapFolders() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('bootstrap-guide-folders', {});
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

export function useDeleteGuide() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (params: { guia_id: string; motivo?: string }) => {
      const { data, error } = await supabase.functions.invoke('delete-guia', { body: params });
      if (error) throw error;
      if (data && (data as any).error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      ['guias', 'guia_envios', 'guia_excecoes', 'guia_eventos', 'guide_batch_runs'].forEach((k) =>
        client.invalidateQueries({ queryKey: [k] }));
      toast.success('Guia excluída');
    },
    onError: (e: any) => toast.error('Falha ao excluir guia', { description: e?.message }),
  });
}
