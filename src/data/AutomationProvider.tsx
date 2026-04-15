import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  AutomationState, ConnectorRun, ExceptionItem,
  Connector, ExceptionTipologia,
} from './automation-types';

// ── Mappers ──

function mapConnector(row: any): Connector {
  return {
    id: row.id, nome: row.nome, tipo: row.tipo, orgao: row.orgao,
    status: row.status, versao: row.versao, ultimoTeste: row.ultimo_teste,
    taxaSucesso: Number(row.taxa_sucesso), tempoMedio: Number(row.tempo_medio),
    config: row.config, descricao: row.descricao,
  };
}

function mapRun(row: any): ConnectorRun {
  return {
    id: row.id, connectorId: row.connector_id, empresaId: row.empresa_id,
    cndItemId: row.cnd_item_id, status: row.status,
    inicioExecucao: row.inicio_execucao, fimExecucao: row.fim_execucao,
    tentativa: row.tentativa, duracao: row.duracao ? Number(row.duracao) : null,
    resultadoBruto: row.resultado_bruto, statusNormalizado: row.status_normalizado,
    confianca: row.confianca, evidencias: row.evidencias || [],
    erroDetalhes: row.erro_detalhes, steps: [],
    hashDocumento: row.hash_documento,
    validacaoErros: row.validacao_erros || [],
    validacaoAvisos: row.validacao_avisos || [],
  };
}

function mapException(row: any): ExceptionItem {
  return {
    id: row.id, runId: row.run_id, empresaId: row.empresa_id,
    cndItemId: row.cnd_item_id, motivo: row.motivo,
    criticidade: row.criticidade, statusExcecao: row.status_excecao,
    acaoSugerida: row.acao_sugerida, criadoEm: row.created_at,
    resolvidoEm: row.resolvido_em, resolvidoPor: row.resolvido_por,
    tipologia: row.tipologia, tentativas: row.tentativas,
    slaHoras: row.sla_horas, responsavel: row.responsavel,
    cnpj: row.cnpj, cndTipo: row.cnd_tipo, connectorNome: row.connector_nome,
  };
}

// ── Fetchers ──

async function fetchConnectors() {
  const { data, error } = await supabase.from('connectors').select('*').order('nome');
  if (error) throw error;
  return (data || []).map(mapConnector);
}

async function fetchRuns() {
  const { data, error } = await supabase.from('connector_runs').select('*').order('inicio_execucao', { ascending: false }).limit(500);
  if (error) throw error;
  return (data || []).map(mapRun);
}

async function fetchExceptions() {
  const { data, error } = await supabase.from('exceptions').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapException);
}

async function fetchBatches() {
  const { data, error } = await supabase.from('automation_batches').select('*').order('agendado_para', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id, agendadoPara: row.agendado_para, empresaIds: row.empresa_ids || [],
    status: row.status, progressoAtual: row.progresso_atual, totalItems: row.total_items,
  }));
}

async function fetchHealthLogs() {
  const { data, error } = await supabase.from('health_logs').select('*').order('timestamp', { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id, connectorId: row.connector_id, timestamp: row.timestamp,
    status: row.status, latencia: Number(row.latencia), detalhes: row.detalhes,
  }));
}

// ── Context ──

interface AutomationContextValue {
  state: AutomationState;
  isLoading: boolean;
  dispatch: React.Dispatch<any>;
  addRun: (run: ConnectorRun) => void;
  updateRun: (run: ConnectorRun) => void;
  addException: (exc: ExceptionItem) => void;
  resolveException: (id: string, user: string) => void;
  requeueException: (id: string) => void;
  discardException: (id: string) => void;
  assignException: (id: string, responsavel: string) => void;
  updateConnectorStatus: (id: string, status: Connector['status']) => void;
  pendingExceptions: number;
  criticalExceptions: ExceptionItem[];
  exceptionsByTipologia: Record<ExceptionTipologia, number>;
  unstableConnectors: Connector[];
}

const AutomationContext = createContext<AutomationContextValue | null>(null);

export function AutomationProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data: connectors = [], isLoading: lC } = useQuery({ queryKey: ['connectors'], queryFn: fetchConnectors });
  const { data: runs = [], isLoading: lR } = useQuery({ queryKey: ['connector_runs'], queryFn: fetchRuns });
  const { data: exceptions = [], isLoading: lE } = useQuery({ queryKey: ['exceptions'], queryFn: fetchExceptions });
  const { data: batches = [] } = useQuery({ queryKey: ['batches'], queryFn: fetchBatches });
  const { data: healthLogs = [] } = useQuery({ queryKey: ['health_logs'], queryFn: fetchHealthLogs });

  const isLoading = lC || lR || lE;

  const state = useMemo<AutomationState>(() => ({
    connectors, runs, exceptions, batches, healthLogs,
    schedulingRules: [], retryPolicies: {},
    automationConfig: { confiancaMinima: 'media', maxConcorrenciaPorConector: 3, timeoutGlobalLote: 300000, circuitBreakerLimiar: 5 },
  }), [connectors, runs, exceptions, batches, healthLogs]);

  const addRun = useCallback((run: ConnectorRun) => {
    supabase.from('connector_runs').insert({
      connector_id: run.connectorId, empresa_id: run.empresaId, cnd_item_id: run.cndItemId,
      status: run.status, inicio_execucao: run.inicioExecucao, fim_execucao: run.fimExecucao,
      tentativa: run.tentativa, duracao: run.duracao, resultado_bruto: run.resultadoBruto,
      status_normalizado: run.statusNormalizado, confianca: run.confianca, evidencias: run.evidencias,
      erro_detalhes: run.erroDetalhes,
    }).then(() => queryClient.invalidateQueries({ queryKey: ['connector_runs'] }));
  }, [queryClient]);

  const updateRun = useCallback((run: ConnectorRun) => {
    supabase.from('connector_runs').update({
      status: run.status, fim_execucao: run.fimExecucao, duracao: run.duracao,
      resultado_bruto: run.resultadoBruto, status_normalizado: run.statusNormalizado,
      confianca: run.confianca, evidencias: run.evidencias, erro_detalhes: run.erroDetalhes,
    }).eq('id', run.id).then(() => queryClient.invalidateQueries({ queryKey: ['connector_runs'] }));
  }, [queryClient]);

  const addException = useCallback((exc: ExceptionItem) => {
    supabase.from('exceptions').insert({
      run_id: exc.runId, empresa_id: exc.empresaId, cnd_item_id: exc.cndItemId,
      motivo: exc.motivo, criticidade: exc.criticidade, status_excecao: exc.statusExcecao,
      acao_sugerida: exc.acaoSugerida, tipologia: exc.tipologia, tentativas: exc.tentativas,
      sla_horas: exc.slaHoras, responsavel: exc.responsavel, cnpj: exc.cnpj,
      cnd_tipo: exc.cndTipo, connector_nome: exc.connectorNome,
    }).then(() => queryClient.invalidateQueries({ queryKey: ['exceptions'] }));
  }, [queryClient]);

  const resolveException = useCallback((id: string, user: string) => {
    supabase.from('exceptions').update({
      status_excecao: 'resolvida', resolvido_em: new Date().toISOString(), resolvido_por: user,
    }).eq('id', id).then(() => queryClient.invalidateQueries({ queryKey: ['exceptions'] }));
  }, [queryClient]);

  const requeueException = useCallback((id: string) => {
    // Increment tentativas — need current value
    supabase.from('exceptions').select('tentativas').eq('id', id).single().then(({ data }) => {
      if (data) {
        supabase.from('exceptions').update({
          status_excecao: 'pendente', tentativas: data.tentativas + 1,
        }).eq('id', id).then(() => queryClient.invalidateQueries({ queryKey: ['exceptions'] }));
      }
    });
  }, [queryClient]);

  const discardException = useCallback((id: string) => {
    supabase.from('exceptions').update({ status_excecao: 'descartada' }).eq('id', id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['exceptions'] }));
  }, [queryClient]);

  const assignException = useCallback((id: string, responsavel: string) => {
    supabase.from('exceptions').update({ responsavel, status_excecao: 'em_analise' }).eq('id', id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['exceptions'] }));
  }, [queryClient]);

  const updateConnectorStatus = useCallback((id: string, status: Connector['status']) => {
    supabase.from('connectors').update({ status }).eq('id', id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['connectors'] }));
  }, [queryClient]);

  const pendingExceptions = useMemo(() =>
    exceptions.filter(e => e.statusExcecao === 'pendente' || e.statusExcecao === 'em_analise').length
  , [exceptions]);

  const criticalExceptions = useMemo(() =>
    exceptions.filter(e => e.criticidade === 'critica' && (e.statusExcecao === 'pendente' || e.statusExcecao === 'em_analise'))
  , [exceptions]);

  const exceptionsByTipologia = useMemo(() => {
    const active = exceptions.filter(e => e.statusExcecao === 'pendente' || e.statusExcecao === 'em_analise');
    const counts = {} as Record<ExceptionTipologia, number>;
    active.forEach(e => { counts[e.tipologia] = (counts[e.tipologia] || 0) + 1; });
    return counts;
  }, [exceptions]);

  const unstableConnectors = useMemo(() =>
    connectors.filter(c => c.taxaSucesso < 80 || c.status === 'erro' || c.status === 'manutencao')
  , [connectors]);

  const dispatch = useCallback(() => {}, []);

  const value = useMemo(() => ({
    state, isLoading, dispatch, addRun, updateRun, addException, resolveException, requeueException,
    discardException, assignException, updateConnectorStatus, pendingExceptions, criticalExceptions,
    exceptionsByTipologia, unstableConnectors,
  }), [state, isLoading, addRun, updateRun, addException, resolveException, requeueException,
    discardException, assignException, updateConnectorStatus, pendingExceptions, criticalExceptions,
    exceptionsByTipologia, unstableConnectors]);

  return <AutomationContext.Provider value={value}>{children}</AutomationContext.Provider>;
}

export function useAutomation() {
  const ctx = useContext(AutomationContext);
  if (!ctx) throw new Error('useAutomation must be used within AutomationProvider');
  return ctx;
}
