/* eslint-disable @typescript-eslint/no-explicit-any, react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Alerta, AuditEntry, Documento, Empresa, Envio, LogAcesso } from '@/data/types';

interface DataState {
  empresas: Empresa[];
  documentos: Documento[];
  envios: Envio[];
  alertas: Alerta[];
  logs: LogAcesso[];
  auditTrail: AuditEntry[];
}

function mapEmpresa(row: any): Empresa {
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
    observacoes: row.observacoes,
    status: row.status,
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
  };
}

function mapDocumento(row: any): Documento {
  return {
    id: row.id,
    empresaId: row.empresa_id,
    nome: row.nome,
    categoria: row.categoria ?? row.tipo ?? 'outro',
    dataUpload: row.data_upload,
    responsavel: row.responsavel,
    validade: row.validade,
    observacao: row.observacao,
    versao: row.versao,
    tamanho: row.tamanho,
    url: row.storage_path,
  };
}

function mapEnvio(row: any): Envio {
  return {
    id: row.id,
    empresaId: row.empresa_id,
    canal: row.canal,
    destinatario: row.destinatario,
    assunto: row.assunto,
    mensagem: row.mensagem,
    documentoIds: row.documento_ids || [],
    status: row.status,
    dataEnvio: row.data_envio,
    usuario: row.usuario,
  };
}

function mapAlerta(row: any): Alerta {
  return {
    id: row.id,
    empresaId: row.empresa_id,
    tipo: row.tipo ?? 'operacional',
    prioridade: row.prioridade,
    titulo: row.titulo,
    descricao: row.descricao,
    lido: row.lido,
    resolvido: row.resolvido,
    snoozedAte: row.snoozed_ate,
    criadoEm: row.created_at,
  };
}

function mapLog(row: any): LogAcesso {
  return {
    id: row.id,
    empresaId: row.empresa_id,
    envioId: row.envio_id,
    documentoId: row.documento_id,
    acao: row.acao,
    canal: row.canal,
    usuario: row.usuario,
    destinatario: row.destinatario,
    dataHora: row.data_hora,
    detalhes: row.detalhes,
  };
}

function mapAudit(row: any): AuditEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    userId: row.user_id,
    action: row.action,
    entityType: row.entity_type as AuditEntry['entityType'],
    entityId: row.entity_id,
    details: row.details,
    metadata: row.metadata,
  };
}

async function fetchEmpresas() {
  const { data, error } = await supabase.from('empresas').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapEmpresa);
}

async function fetchDocumentos() {
  const { data, error } = await supabase.from('documentos').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapDocumento);
}

async function fetchEnvios() {
  const { data, error } = await supabase.from('envios').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapEnvio);
}

async function fetchAlertas() {
  const { data, error } = await supabase.from('alertas').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapAlerta);
}

async function fetchLogs() {
  const { data, error } = await supabase.from('logs_acesso').select('*').order('data_hora', { ascending: false }).limit(500);
  if (error) throw error;
  return (data || []).map(mapLog);
}

async function fetchAuditTrail() {
  const { data, error } = await supabase.from('audit_trail').select('*').order('timestamp', { ascending: false }).limit(500);
  if (error) throw error;
  return (data || []).map(mapAudit);
}

interface DataContextValue {
  state: DataState;
  isLoading: boolean;
  dispatch: (action: any) => void;
  addEmpresa: (empresa: Empresa) => boolean;
  updateEmpresa: (empresa: Empresa) => void;
  addDocumento: (doc: Documento) => void;
  addEnvio: (envio: Envio) => void;
  addLog: (log: LogAcesso) => void;
  resolveAlerta: (id: string) => void;
  markAlertaLido: (id: string) => void;
  resolveAllAlertas: () => void;
  markAllAlertasLidos: () => void;
  cnpjExists: (cnpj: string, excludeId?: string) => boolean;
  enableLogs: () => void;
  enableAuditTrail: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

function errMsg(e: any) {
  return e?.message || e?.error_description || 'Erro desconhecido';
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const dataDemand = useMemo(() => ({
    dashboard: pathname === '/',
    empresas: pathname === '/' || pathname.startsWith('/empresas'),
    documentos: pathname === '/' || pathname.startsWith('/documentos') || pathname.startsWith('/empresas/'),
    envios: pathname === '/' || pathname.startsWith('/envios') || pathname.startsWith('/empresas/'),
    alertas: pathname === '/' || pathname.startsWith('/alertas') || pathname.startsWith('/empresas/'),
  }), [pathname]);
  const [logsEnabled, setLogsEnabled] = React.useState(false);
  const [auditEnabled, setAuditEnabled] = React.useState(false);

  const { data: empresas = [], isLoading: loadingEmpresas } = useQuery({ queryKey: ['empresas'], queryFn: fetchEmpresas, enabled: dataDemand.empresas });
  const { data: documentos = [], isLoading: loadingDocumentos } = useQuery({ queryKey: ['documentos'], queryFn: fetchDocumentos, enabled: dataDemand.documentos });
  const { data: envios = [], isLoading: loadingEnvios } = useQuery({ queryKey: ['envios'], queryFn: fetchEnvios, enabled: dataDemand.envios });
  const { data: alertas = [], isLoading: loadingAlertas } = useQuery({ queryKey: ['alertas'], queryFn: fetchAlertas, enabled: dataDemand.alertas });
  const { data: logs = [], isLoading: loadingLogs } = useQuery({ queryKey: ['logs'], queryFn: fetchLogs, enabled: logsEnabled });
  const { data: auditTrail = [] } = useQuery({ queryKey: ['auditTrail'], queryFn: fetchAuditTrail, enabled: auditEnabled });

  const isLoading = loadingEmpresas || loadingDocumentos || loadingEnvios || loadingAlertas || (logsEnabled && loadingLogs);

  const state = useMemo<DataState>(() => ({
    empresas,
    documentos,
    envios,
    alertas,
    logs,
    auditTrail,
  }), [empresas, documentos, envios, alertas, logs, auditTrail]);

  const cnpjExists = useCallback((cnpj: string, excludeId?: string) => {
    const normalized = cnpj.replace(/\D/g, '');
    return empresas.some((empresa) => empresa.cnpj.replace(/\D/g, '') === normalized && empresa.id !== excludeId);
  }, [empresas]);

  const addEmpresaMutation = useMutation({
    mutationFn: async (empresa: Empresa) => {
      const { error } = await supabase.from('empresas').insert({
        razao_social: empresa.razaoSocial,
        nome_fantasia: empresa.nomeFantasia,
        cnpj: empresa.cnpj,
        regime_tributario: empresa.regimeTributario,
        municipio: empresa.municipio,
        estado: empresa.estado,
        responsavel_interno: empresa.responsavelInterno,
        responsavel_cliente: empresa.responsavelCliente,
        email_principal: empresa.emailPrincipal,
        whatsapp_principal: empresa.whatsappPrincipal,
        canal_preferido: empresa.canalPreferido,
        email_validado: empresa.emailValidado,
        whatsapp_opt_in_at: empresa.whatsappOptInAt,
        comunicacao_ativa: empresa.comunicacaoAtiva,
        saudacao_guia: empresa.saudacaoGuia,
        observacoes: empresa.observacoes,
        status: empresa.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      toast.success('Empresa criada com sucesso');
    },
    onError: (e) => toast.error('Erro ao salvar empresa', { description: errMsg(e) }),
  });

  const updateEmpresaMutation = useMutation({
    mutationFn: async (empresa: Empresa) => {
      const { error } = await supabase.from('empresas').update({
        razao_social: empresa.razaoSocial,
        nome_fantasia: empresa.nomeFantasia,
        cnpj: empresa.cnpj,
        regime_tributario: empresa.regimeTributario,
        municipio: empresa.municipio,
        estado: empresa.estado,
        responsavel_interno: empresa.responsavelInterno,
        responsavel_cliente: empresa.responsavelCliente,
        email_principal: empresa.emailPrincipal,
        whatsapp_principal: empresa.whatsappPrincipal,
        canal_preferido: empresa.canalPreferido,
        email_validado: empresa.emailValidado,
        whatsapp_opt_in_at: empresa.whatsappOptInAt,
        comunicacao_ativa: empresa.comunicacaoAtiva,
        saudacao_guia: empresa.saudacaoGuia,
        observacoes: empresa.observacoes,
        status: empresa.status,
      }).eq('id', empresa.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      toast.success('Empresa atualizada');
    },
    onError: (e) => toast.error('Erro ao atualizar empresa', { description: errMsg(e) }),
  });

  const addDocumentoMutation = useMutation({
    mutationFn: async (doc: Documento) => {
      const { error } = await supabase.from('documentos').insert({
        empresa_id: doc.empresaId,
        nome: doc.nome,
        categoria: doc.categoria,
        responsavel: doc.responsavel,
        validade: doc.validade,
        observacao: doc.observacao,
        versao: doc.versao,
        tamanho: doc.tamanho,
        storage_path: doc.url,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentos'] });
      toast.success('Documento salvo');
    },
    onError: (e) => toast.error('Erro ao salvar documento', { description: errMsg(e) }),
  });

  const addEnvioMutation = useMutation({
    mutationFn: async (envio: Envio) => {
      const { error } = await supabase.from('envios').insert({
        empresa_id: envio.empresaId,
        canal: envio.canal,
        destinatario: envio.destinatario,
        assunto: envio.assunto,
        mensagem: envio.mensagem,
        documento_ids: envio.documentoIds,
        status: envio.status,
        data_envio: envio.dataEnvio,
        usuario: envio.usuario,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['envios'] }),
    onError: (e) => toast.error('Erro ao registrar envio', { description: errMsg(e) }),
  });

  const addLogMutation = useMutation({
    mutationFn: async (log: LogAcesso) => {
      const { error } = await supabase.from('logs_acesso').insert({
        empresa_id: log.empresaId,
        envio_id: log.envioId,
        documento_id: log.documentoId,
        acao: log.acao,
        canal: log.canal,
        usuario: log.usuario,
        destinatario: log.destinatario,
        detalhes: log.detalhes,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['logs'] }),
    onError: (e) => toast.error('Erro ao registrar log', { description: errMsg(e) }),
  });

  const resolveAlertaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('alertas').update({ resolvido: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alertas'] }),
    onError: (e) => toast.error('Erro ao resolver alerta', { description: errMsg(e) }),
  });

  const markAlertaLidoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('alertas').update({ lido: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alertas'] }),
    onError: (e) => toast.error('Erro ao marcar alerta', { description: errMsg(e) }),
  });

  const resolveAllAlertasMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('alertas').update({ resolvido: true }).eq('resolvido', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertas'] });
      toast.success('Alertas resolvidos');
    },
    onError: (e) => toast.error('Erro ao resolver alertas', { description: errMsg(e) }),
  });

  const markAllAlertasLidosMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('alertas').update({ lido: true }).eq('lido', false);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alertas'] }),
    onError: (e) => toast.error('Erro ao marcar alertas', { description: errMsg(e) }),
  });

  const addEmpresa = useCallback((empresa: Empresa): boolean => {
    if (cnpjExists(empresa.cnpj)) {
      toast.error('CNPJ ja cadastrado');
      return false;
    }
    addEmpresaMutation.mutate(empresa);
    return true;
  }, [addEmpresaMutation, cnpjExists]);

  const updateEmpresa = useCallback((empresa: Empresa) => updateEmpresaMutation.mutate(empresa), [updateEmpresaMutation]);
  const addDocumento = useCallback((doc: Documento) => addDocumentoMutation.mutate(doc), [addDocumentoMutation]);
  const addEnvio = useCallback((envio: Envio) => addEnvioMutation.mutate(envio), [addEnvioMutation]);
  const addLog = useCallback((log: LogAcesso) => addLogMutation.mutate(log), [addLogMutation]);
  const resolveAlerta = useCallback((id: string) => resolveAlertaMutation.mutate(id), [resolveAlertaMutation]);
  const markAlertaLido = useCallback((id: string) => markAlertaLidoMutation.mutate(id), [markAlertaLidoMutation]);
  const resolveAllAlertas = useCallback(() => resolveAllAlertasMutation.mutate(), [resolveAllAlertasMutation]);
  const markAllAlertasLidos = useCallback(() => markAllAlertasLidosMutation.mutate(), [markAllAlertasLidosMutation]);
  const dispatch = useCallback(() => {}, []);
  const enableLogs = useCallback(() => setLogsEnabled(true), []);
  const enableAuditTrail = useCallback(() => setAuditEnabled(true), []);

  const value = useMemo(() => ({
    state,
    isLoading,
    dispatch,
    addEmpresa,
    updateEmpresa,
    addDocumento,
    addEnvio,
    addLog,
    resolveAlerta,
    markAlertaLido,
    resolveAllAlertas,
    markAllAlertasLidos,
    cnpjExists,
    enableLogs,
    enableAuditTrail,
  }), [
    state,
    isLoading,
    dispatch,
    addEmpresa,
    updateEmpresa,
    addDocumento,
    addEnvio,
    addLog,
    resolveAlerta,
    markAlertaLido,
    resolveAllAlertas,
    markAllAlertasLidos,
    cnpjExists,
    enableLogs,
    enableAuditTrail,
  ]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataStore() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useDataStore must be used within DataProvider');
  return ctx;
}
