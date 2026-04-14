import type { CNDTipo } from '@/data/types';
import type { Connector, ConnectorRun, IntegrationHealthLog } from '@/data/automation-types';

const connectorMapping: Record<CNDTipo, string> = {
  receita_federal: 'conn-rf',
  fgts: 'conn-fgts',
  sefaz: 'conn-sefaz',
  municipal: 'conn-mun',
  trabalhista: 'conn-tst',
  personalizada: 'conn-manual',
};

export function getConnectorIdForCND(cndTipo: CNDTipo): string {
  return connectorMapping[cndTipo] || 'conn-manual';
}

export function getConnectorForCND(cndTipo: CNDTipo, connectors: Connector[]): Connector | undefined {
  const id = getConnectorIdForCND(cndTipo);
  return connectors.find(c => c.id === id);
}

export function getConnectorHealth(connectorId: string, healthLogs: IntegrationHealthLog[]): IntegrationHealthLog | null {
  return healthLogs
    .filter(h => h.connectorId === connectorId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] || null;
}

export function getConnectorStats(connectorId: string, runs: ConnectorRun[]) {
  const connRuns = runs.filter(r => r.connectorId === connectorId);
  const total = connRuns.length;
  const sucesso = connRuns.filter(r => r.status === 'sucesso').length;
  const falha = connRuns.filter(r => r.status === 'falha' || r.status === 'timeout').length;
  const revisao = connRuns.filter(r => r.status === 'revisao').length;
  const avgDuration = connRuns.filter(r => r.duracao).reduce((s, r) => s + (r.duracao || 0), 0) / (total || 1);

  return { total, sucesso, falha, revisao, avgDuration, taxaSucesso: total > 0 ? (sucesso / total) * 100 : 0 };
}

export function normalizarStatusExterno(statusBruto: string): string {
  const mapping: Record<string, string> = {
    'CERTIDAO_NEGATIVA_DEBITOS_VALIDA': 'valida',
    'REGULARIDADE_CONFIRMADA': 'valida',
    'NADA_CONSTA': 'valida',
    'NADA_CONSTA_TRIBUTOS_MUNICIPAIS': 'valida',
    'CERTIDAO_POSITIVA': 'positiva',
    'CERTIDAO_POSITIVA_COM_EFEITO_NEGATIVA': 'valida',
    'IRREGULARIDADE_CADASTRAL': 'erro',
    'SITUACAO_PARCIAL_REGULARIZADA': 'exige_revisao',
    'TIMEOUT_PORTAL': 'erro',
    'INDISPONIVEL': 'erro',
  };
  return mapping[statusBruto] || 'pendente';
}
