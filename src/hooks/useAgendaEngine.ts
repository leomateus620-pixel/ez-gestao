import { useMemo } from 'react';
import type { CNDItem, Empresa } from '@/data/types';
import { getPrioridadeVencimento } from '@/lib/status-utils';
import { differenceInDays, parseISO, isToday } from 'date-fns';

interface AgendaItem {
  cnd: CNDItem;
  empresa: Empresa;
  urgencia: number;
  label: string;
  color: string;
  dias: number;
}

interface AgendaCounts {
  vencidos: number;
  hoje: number;
  tresDias: number;
  seteDias: number;
  validos: number;
}

export function useAgendaEngine(cnds: CNDItem[], empresas: Empresa[]) {
  const items = useMemo((): AgendaItem[] => {
    return cnds
      .filter(c => c.dataVencimento && c.status !== 'nao_aplicavel')
      .map(c => {
        const empresa = empresas.find(e => e.id === c.empresaId);
        if (!empresa) return null;
        const prio = getPrioridadeVencimento(c.dataVencimento);
        const dias = differenceInDays(parseISO(c.dataVencimento!), new Date());
        return { cnd: c, empresa, urgencia: prio.urgencia, label: prio.label, color: prio.color, dias };
      })
      .filter(Boolean)
      .sort((a, b) => a!.urgencia - b!.urgencia) as AgendaItem[];
  }, [cnds, empresas]);

  const counts = useMemo((): AgendaCounts => {
    let vencidos = 0, hoje = 0, tresDias = 0, seteDias = 0, validos = 0;
    items.forEach(item => {
      if (item.dias < 0) vencidos++;
      else if (item.dias === 0) hoje++;
      else if (item.dias <= 3) tresDias++;
      else if (item.dias <= 7) seteDias++;
      else validos++;
    });
    return { vencidos, hoje, tresDias, seteDias, validos };
  }, [items]);

  const grouped = useMemo(() => {
    const groups: Record<string, AgendaItem[]> = {
      'Vencidos': [],
      'Vence Hoje': [],
      'Próximos 3 dias': [],
      'Próximos 7 dias': [],
      'Válidos': [],
    };
    items.forEach(item => {
      if (item.dias < 0) groups['Vencidos'].push(item);
      else if (item.dias === 0) groups['Vence Hoje'].push(item);
      else if (item.dias <= 3) groups['Próximos 3 dias'].push(item);
      else if (item.dias <= 7) groups['Próximos 7 dias'].push(item);
      else groups['Válidos'].push(item);
    });
    return groups;
  }, [items]);

  return { items, counts, grouped };
}
