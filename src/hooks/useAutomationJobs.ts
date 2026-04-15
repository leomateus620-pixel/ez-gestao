import { useCallback } from 'react';
import { useOrchestrator } from './useOrchestrator';
import { useAutomation } from '@/data/AutomationProvider';
import { useDataStore } from '@/data/DataProvider';
import type { CNDTipo } from '@/data/types';

export function useAutomationJobs() {
  const { getEmpresasElegiveis, executarColeta } = useOrchestrator();
  const { state: autoState, updateConnectorStatus } = useAutomation();
  const { state } = useDataStore();

  const executarLoteColeta = useCallback(async () => {
    const elegiveis = getEmpresasElegiveis().slice(0, 5);
    const tasks: { empresaId: string; tipo: CNDTipo }[] = [];

    for (const { empresa } of elegiveis) {
      const cnds = state.cnds.filter(
        c => c.empresaId === empresa.id && (c.status === 'vencida' || c.status === 'vencendo' || c.status === 'pendente')
      );
      for (const cnd of cnds.slice(0, 2)) {
        tasks.push({ empresaId: empresa.id, tipo: cnd.tipo });
      }
    }

    // Process with controlled concurrency using Promise.allSettled + semaphore
    const maxParallel = autoState.automationConfig.maxConcorrenciaPorConector;
    const results: { empresaId: string; tipo: CNDTipo; sucesso: boolean }[] = [];

    for (let i = 0; i < tasks.length; i += maxParallel) {
      const batch = tasks.slice(i, i + maxParallel);
      const settled = await Promise.allSettled(
        batch.map(t => executarColeta(t.empresaId, t.tipo))
      );
      settled.forEach((result, idx) => {
        results.push({
          empresaId: batch[idx].empresaId,
          tipo: batch[idx].tipo,
          sucesso: result.status === 'fulfilled',
        });
      });
    }

    return results;
  }, [getEmpresasElegiveis, executarColeta, state.cnds, autoState.automationConfig]);

  const revalidarPeriodica = useCallback(async () => {
    const cndsVencendo = state.cnds.filter(c => c.status === 'vencendo');
    const tasks = cndsVencendo.slice(0, 3);
    await Promise.allSettled(
      tasks.map(cnd => executarColeta(cnd.empresaId, cnd.tipo))
    );
  }, [state.cnds, executarColeta]);

  const retryFalhasTransitorias = useCallback(async () => {
    const falhas = autoState.runs
      .filter(r => r.status === 'falha' && r.tentativa < 3)
      .slice(0, 5);

    for (const run of falhas) {
      const cndItem = state.cnds.find(c => c.id === run.cndItemId);
      if (cndItem) {
        await executarColeta(run.empresaId, cndItem.tipo);
      }
    }
  }, [autoState.runs, state.cnds, executarColeta]);

  const monitorarConectores = useCallback(() => {
    const LIMIAR_SUCESSO = 70;
    for (const connector of autoState.connectors) {
      const recentRuns = autoState.runs
        .filter(r => r.connectorId === connector.id)
        .slice(0, 20);

      if (recentRuns.length < 3) continue;

      const successRate = (recentRuns.filter(r => r.status === 'sucesso').length / recentRuns.length) * 100;

      if (successRate < LIMIAR_SUCESSO && connector.status === 'ativo') {
        updateConnectorStatus(connector.id, 'manutencao');
      }
    }
  }, [autoState.connectors, autoState.runs, updateConnectorStatus]);

  return { executarLoteColeta, revalidarPeriodica, retryFalhasTransitorias, monitorarConectores };
}
