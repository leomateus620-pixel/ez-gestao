import { useCallback } from 'react';
import { useAutomation } from '@/data/AutomationProvider';
import { useDataStore } from '@/data/DataProvider';
import { getConnectorIdForCND } from '@/lib/connector-registry';
import { parseCapture } from '@/lib/capture-parser';
import { avaliarResultadoSeguro } from '@/lib/decision-engine';
import { validarCaptura } from '@/lib/capture-validator';
import {
  verificarCircuitBreaker, registrarSucesso, registrarFalha,
  acquireConcurrency, releaseConcurrency,
  acquireDedup, releaseDedup,
  derivarTipologia,
} from '@/lib/automation-resilience';
import type { ConnectorRun, ConnectorRunStep, ExceptionItem } from '@/data/automation-types';
import type { CNDTipo } from '@/data/types';

export function useOrchestrator() {
  const { state: autoState, addRun, updateRun, addException } = useAutomation();
  const { state: dataState, dispatch: dataDispatch } = useDataStore();

  const getEmpresasElegiveis = useCallback(() => {
    const ativas = dataState.empresas.filter(e => e.status === 'ativa');
    const scored = ativas.map(e => {
      const cnds = dataState.cnds.filter(c => c.empresaId === e.id);
      const vencidas = cnds.filter(c => c.status === 'vencida').length;
      const vencendo = cnds.filter(c => c.status === 'vencendo').length;
      const pendentes = cnds.filter(c => c.status === 'pendente').length;
      return { empresa: e, prioridade: vencidas * 10 + vencendo * 5 + pendentes * 2 };
    });
    return scored.sort((a, b) => b.prioridade - a.prioridade);
  }, [dataState.empresas, dataState.cnds]);

  const executarColeta = useCallback(async (empresaId: string, cndTipo: CNDTipo) => {
    const empresa = dataState.empresas.find(e => e.id === empresaId);
    if (!empresa) return;

    const connectorId = getConnectorIdForCND(cndTipo);
    const connector = autoState.connectors.find(c => c.id === connectorId);
    if (!connector || connector.status !== 'ativo') return;

    // Guard 1: Deduplication
    if (!acquireDedup(empresaId, cndTipo)) {
      console.warn(`[Orchestrator] Dedup blocked: ${empresaId}/${cndTipo}`);
      return;
    }

    // Guard 2: Circuit breaker
    const cb = verificarCircuitBreaker(connectorId);
    if (!cb.permitido) {
      releaseDedup(empresaId, cndTipo);
      const exc: ExceptionItem = {
        id: `exc-${Date.now()}`, runId: '', empresaId, cndItemId: null,
        motivo: `Circuit breaker aberto para ${connector.nome}`,
        criticidade: 'alta', statusExcecao: 'pendente',
        acaoSugerida: 'Aguardar recuperação do portal ou resetar circuit breaker',
        criadoEm: new Date().toISOString(), resolvidoEm: null, resolvidoPor: null,
        tipologia: 'portal_indisponivel', tentativas: 0, slaHoras: 4,
        responsavel: null, cnpj: empresa.cnpj, cndTipo, connectorNome: connector.nome,
      };
      addException(exc);
      return;
    }

    // Guard 3: Concurrency limiter
    const maxConcurrency = autoState.automationConfig.maxConcorrenciaPorConector;
    if (!acquireConcurrency(connectorId, maxConcurrency)) {
      releaseDedup(empresaId, cndTipo);
      console.warn(`[Orchestrator] Concurrency limit reached for ${connectorId}`);
      return;
    }

    const cndItem = dataState.cnds.find(c => c.empresaId === empresaId && c.tipo === cndTipo);
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      // Simulate execution steps
      const steps: ConnectorRunStep[] = ['autenticacao', 'consulta', 'captura', 'parsing', 'persistencia'].map((etapa, i) => ({
        id: `step-${runId}-${i}`,
        runId,
        etapa: etapa as ConnectorRunStep['etapa'],
        status: 'sucesso' as const,
        inicio: new Date().toISOString(),
        fim: new Date().toISOString(),
        detalhes: `${etapa} concluída`,
      }));

      const mockResultados = ['CERTIDAO_NEGATIVA_DEBITOS_VALIDA', 'REGULARIDADE_CONFIRMADA', 'NADA_CONSTA'];
      const resultado = mockResultados[Math.floor(Math.random() * mockResultados.length)];

      const capture = parseCapture(resultado, cndTipo, empresa.cnpj, connectorId);

      // Validation pipeline
      const validacao = validarCaptura(
        capture, empresa.cnpj, connector, autoState.runs,
        autoState.automationConfig.confiancaMinima,
      );

      const decision = avaliarResultadoSeguro(capture, validacao);

      const run: ConnectorRun = {
        id: runId, connectorId, empresaId, cndItemId: cndItem?.id || null,
        status: decision.acao === 'criar_excecao' ? 'revisao' : 'sucesso',
        inicioExecucao: new Date().toISOString(),
        fimExecucao: new Date().toISOString(),
        tentativa: 1, duracao: connector.tempoMedio,
        resultadoBruto: resultado, statusNormalizado: capture.statusNormalizado,
        confianca: capture.confianca, evidencias: ['Mock: coleta simulada'],
        erroDetalhes: null, steps,
        hashDocumento: capture.hashDocumento || undefined,
        validacaoErros: validacao.erros.length > 0 ? validacao.erros : undefined,
        validacaoAvisos: validacao.avisos.length > 0 ? validacao.avisos : undefined,
      };

      addRun(run);
      registrarSucesso(connectorId);

      // Audit log via console (LogAcesso has a fixed acao enum)
      console.info(`[Automação] ${decision.acao}: ${connector.nome} → ${empresa.nomeFantasia} (${cndTipo}): ${decision.motivo}`);

      if (decision.acao === 'aplicar_auto' && cndItem) {
        dataDispatch({
          type: 'UPDATE_CND',
          payload: {
            ...cndItem,
            status: 'valida',
            dataEmissao: capture.dataEmissao,
            dataVencimento: capture.dataValidade,
            origem: capture.orgaoEmissor,
          },
        });
      } else if (decision.acao === 'criar_excecao') {
        const tipologia = validacao.erros.length > 0
          ? (validacao.erros[0].includes('CNPJ') ? 'cnpj_inconsistente' as const
            : validacao.erros[0].includes('Tipo') ? 'documento_incompativel' as const
            : validacao.erros[0].includes('Validade') ? 'validade_ambigua' as const
            : 'baixa_confianca' as const)
          : 'baixa_confianca' as const;

        const exc: ExceptionItem = {
          id: `exc-${Date.now()}`, runId, empresaId, cndItemId: cndItem?.id || null,
          motivo: decision.motivo, criticidade: 'alta', statusExcecao: 'pendente',
          acaoSugerida: 'Revisão manual necessária',
          criadoEm: new Date().toISOString(), resolvidoEm: null, resolvidoPor: null,
          tipologia, tentativas: 1, slaHoras: 12, responsavel: null,
          cnpj: empresa.cnpj, cndTipo, connectorNome: connector.nome,
        };
        addException(exc);
      }

      return run;
    } catch (error) {
      registrarFalha(connectorId, {
        limiarFalhas: autoState.automationConfig.circuitBreakerLimiar,
        tempoRecuperacao: 60_000,
      });

      const tipologia = derivarTipologia(error);

      const failedRun: ConnectorRun = {
        id: runId, connectorId, empresaId, cndItemId: cndItem?.id || null,
        status: 'falha', inicioExecucao: new Date().toISOString(),
        fimExecucao: new Date().toISOString(),
        tentativa: 1, duracao: null,
        resultadoBruto: '', statusNormalizado: 'erro',
        confianca: 'baixa', evidencias: [],
        erroDetalhes: error instanceof Error ? error.message : String(error),
        steps: [],
      };
      addRun(failedRun);

      const exc: ExceptionItem = {
        id: `exc-${Date.now()}`, runId, empresaId, cndItemId: cndItem?.id || null,
        motivo: error instanceof Error ? error.message : 'Erro desconhecido',
        criticidade: 'alta', statusExcecao: 'pendente',
        acaoSugerida: 'Verificar conectividade e reprocessar',
        criadoEm: new Date().toISOString(), resolvidoEm: null, resolvidoPor: null,
        tipologia, tentativas: 1, slaHoras: 12, responsavel: null,
        cnpj: empresa.cnpj, cndTipo, connectorNome: connector.nome,
      };
      addException(exc);

      dataDispatch({
        type: 'ADD_LOG',
        payload: {
          id: `log-err-${Date.now()}`,
          tipo: 'sistema',
          acao: 'Falha de coleta',
          detalhes: `${connector.nome} → ${empresa.nomeFantasia}: ${exc.motivo}`,
          usuario: 'Sistema',
          timestamp: new Date().toISOString(),
          entidade: 'cnd',
          entidadeId: cndItem?.id || runId,
        },
      });
    } finally {
      releaseConcurrency(connectorId);
      releaseDedup(empresaId, cndTipo);
    }
  }, [dataState, autoState.connectors, autoState.runs, autoState.automationConfig, addRun, updateRun, addException, dataDispatch]);

  return { getEmpresasElegiveis, executarColeta };
}
