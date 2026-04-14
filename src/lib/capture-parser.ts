import type { CaptureResult, ConfidenceLevel } from '@/data/automation-types';
import type { CNDTipo } from '@/data/types';
import { normalizarStatusExterno } from './connector-registry';

export function parseCapture(
  rawData: string,
  tipo: CNDTipo,
  cnpj: string,
  connectorId: string,
): CaptureResult {
  const statusNormalizado = normalizarStatusExterno(rawData);
  const emissao = extractEmissao(rawData);
  const validade = extractValidade(rawData);
  const confianca = calcularConfianca({ statusNormalizado, validade, emissao, cnpj });

  return {
    cnpjConsultado: cnpj,
    tipoCertidao: tipo,
    orgaoEmissor: getOrgaoLabel(tipo),
    statusBruto: rawData,
    statusNormalizado,
    dataEmissao: emissao,
    dataValidade: validade,
    numeroCertidao: generateMockNumero(),
    protocolo: generateMockProtocolo(),
    hashDocumento: generateMockHash(),
    nomeArquivo: statusNormalizado !== 'erro' ? `CND_${tipo}_${cnpj.slice(0, 8)}.pdf` : null,
    conectorUtilizado: connectorId,
    confianca,
    necessitaRevisao: confianca !== 'alta',
    motivoExcecao: confianca === 'baixa' ? 'Resultado com baixa confiança — revisão necessária' : null,
  };
}

export function extractValidade(_text: string): string | null {
  const dt = new Date();
  dt.setDate(dt.getDate() + 180);
  return dt.toISOString().split('T')[0];
}

export function extractEmissao(_text: string): string | null {
  return new Date().toISOString().split('T')[0];
}

export function calcularConfianca(result: {
  statusNormalizado: string;
  validade: string | null;
  emissao: string | null;
  cnpj: string;
}): ConfidenceLevel {
  let score = 0;
  if (result.cnpj && result.cnpj.length >= 11) score += 25;
  if (result.validade) score += 25;
  if (result.emissao) score += 20;
  if (result.statusNormalizado && result.statusNormalizado !== 'erro') score += 30;

  if (score >= 80) return 'alta';
  if (score >= 50) return 'media';
  return 'baixa';
}

function getOrgaoLabel(tipo: CNDTipo): string {
  const labels: Record<CNDTipo, string> = {
    receita_federal: 'Receita Federal do Brasil',
    fgts: 'Caixa Econômica Federal',
    sefaz: 'Secretaria da Fazenda Estadual',
    municipal: 'Prefeitura Municipal',
    trabalhista: 'Tribunal Superior do Trabalho',
    personalizada: 'Órgão Personalizado',
  };
  return labels[tipo];
}

function generateMockNumero(): string {
  return `${Math.random().toString().slice(2, 6)}.${Math.random().toString().slice(2, 10)}/${new Date().getFullYear()}`;
}

function generateMockProtocolo(): string {
  return `PROT-${Date.now().toString(36).toUpperCase()}`;
}

function generateMockHash(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
