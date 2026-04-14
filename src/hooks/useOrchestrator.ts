import { useCallback } from 'react';
import { useAutomation } from '@/data/AutomationProvider';
import { useDataStore } from '@/data/DataProvider';
import { getConnectorIdForCND } from '@/lib/connector-registry';
import { parseCapture } from '@/lib/capture-parser';
import { avaliarResultado } from '@/lib/decision-engine';
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

    const cndItem = dataState.cnds.find(c => c.empresaId === empresaId && c.tipo === cndTipo);
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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
    const decision = avaliarResultado(capture);

    const run: ConnectorRun = {
      id: runId, connectorId, empresaId, cndItemId: cndItem?.id || null,
      status: decision.acao === 'criar_excecao' ? 'revisao' : 'sucesso',
      inicioExecucao: new Date().toISOString(),
      fimExecucao: new Date().toISOString(),
      tentativa: 1, duracao: connector.tempoMedio,
      resultadoBruto: resultado, statusNormalizado: capture.statusNormalizado,
      confianca: capture.confianca, evidencias: ['Mock: coleta simulada'],
      erroDetalhes: null, steps,
    };

    addRun(run);

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
      const exc: ExceptionItem = {
        id: `exc-${Date.now()}`, runId, empresaId, cndItemId: cndItem?.id || null,
        motivo: decision.motivo, criticidade: 'alta', statusExcecao: 'pendente',
        acaoSugerida: 'Revisão manual necessária',
        criadoEm: new Date().toISOString(), resolvidoEm: null, resolvidoPor: null,
        tipologia: 'baixa_confianca', tentativas: 1, slaHoras: 12, responsavel: null,
        cnpj: empresa.cnpj, cndTipo: cndTipo, connectorNome: connector.nome,
      };
      addException(exc);
    }

    return run;
  }, [dataState, autoState.connectors, addRun, updateRun, addException, dataDispatch]);

  return { getEmpresasElegiveis, executarColeta };
}
