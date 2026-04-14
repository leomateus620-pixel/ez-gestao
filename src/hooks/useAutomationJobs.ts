import { useCallback } from 'react';
import { useOrchestrator } from './useOrchestrator';
import { useDataStore } from '@/data/DataProvider';
import type { CNDTipo } from '@/data/types';

export function useAutomationJobs() {
  const { getEmpresasElegiveis, executarColeta } = useOrchestrator();
  const { state } = useDataStore();

  const executarLoteColeta = useCallback(async () => {
    const elegiveis = getEmpresasElegiveis().slice(0, 5);
    const results: { empresaId: string; tipo: CNDTipo; sucesso: boolean }[] = [];

    for (const { empresa } of elegiveis) {
      const cnds = state.cnds.filter(c => c.empresaId === empresa.id && (c.status === 'vencida' || c.status === 'vencendo' || c.status === 'pendente'));
      for (const cnd of cnds.slice(0, 2)) {
        try {
          await executarColeta(empresa.id, cnd.tipo);
          results.push({ empresaId: empresa.id, tipo: cnd.tipo, sucesso: true });
        } catch {
          results.push({ empresaId: empresa.id, tipo: cnd.tipo, sucesso: false });
        }
      }
    }
    return results;
  }, [getEmpresasElegiveis, executarColeta, state.cnds]);

  const revalidarPeriodica = useCallback(async () => {
    const cndsVencendo = state.cnds.filter(c => c.status === 'vencendo');
    for (const cnd of cndsVencendo.slice(0, 3)) {
      await executarColeta(cnd.empresaId, cnd.tipo);
    }
  }, [state.cnds, executarColeta]);

  return { executarLoteColeta, revalidarPeriodica };
}
