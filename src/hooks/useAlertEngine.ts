import { useMemo } from 'react';
import type { CNDItem, Empresa, Alerta } from '@/data/types';
import { gerarAlertasAutomaticos } from '@/lib/status-utils';

export function useAlertEngine(cnds: CNDItem[], empresas: Empresa[], existingAlertas: Alerta[]) {
  const generatedAlertas = useMemo(() => {
    return gerarAlertasAutomaticos(cnds, empresas, existingAlertas);
  }, [cnds, empresas, existingAlertas]);

  return { generatedAlertas };
}
