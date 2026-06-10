import type { ConfidenceLevel, DocumentLike } from './types';

/**
 * Tipos de documentos considerados "principais" para confiança.
 * Espelha REQUIRED_DOCUMENT_TYPES em score.ts, mas mantido aqui para isolar
 * a regra de confiança da regra de score.
 */
export const PRIMARY_CONFIDENCE_DOCUMENTS = [
  'dre',
  'balancete',
  'pgdas',
  'faturamento_cliente',
  'fornecedores',
] as const;

/**
 * Combinação que força confiança alta (cobre receita, regime atual e mix de clientes).
 */
const COMBO_FORCE_ALTA = ['dre', 'pgdas', 'faturamento_cliente'];

function uploadedPrimaryTypes(documents: DocumentLike[]): Set<string> {
  const accepted = documents.filter((doc) => {
    if (doc.uploadStatus && doc.uploadStatus !== 'enviado') return false;
    if (doc.storagePath === null) return false;
    return PRIMARY_CONFIDENCE_DOCUMENTS.includes(doc.documentType as typeof PRIMARY_CONFIDENCE_DOCUMENTS[number]);
  });
  return new Set(accepted.map((doc) => doc.documentType));
}

export function computeConfidenceLevel(documents: DocumentLike[] = []): ConfidenceLevel {
  const types = uploadedPrimaryTypes(documents);
  if (COMBO_FORCE_ALTA.every((type) => types.has(type))) return 'alta';
  if (types.size === 0) return 'baixa';
  if (types.size <= 2) return 'media';
  return 'alta';
}

export function computeConfidenceReasons(documents: DocumentLike[] = []): string[] {
  const types = uploadedPrimaryTypes(documents);
  const reasons: string[] = [];
  if (types.size === 0) {
    reasons.push('Nenhum documento principal enviado ao Storage.');
  } else {
    reasons.push(`${types.size} de ${PRIMARY_CONFIDENCE_DOCUMENTS.length} documentos principais enviados.`);
  }
  const hasCombo = COMBO_FORCE_ALTA.every((type) => types.has(type));
  if (hasCombo) {
    reasons.push('Combinação DRE + PGDAS + Faturamento por cliente garante confiança alta.');
  }
  const ignored = documents.filter((doc) => doc.uploadStatus === 'erro_upload').length;
  if (ignored > 0) {
    reasons.push(`${ignored} documento(s) ignorado(s) por erro de upload.`);
  }
  return reasons;
}

export const confidenceLabels: Record<ConfidenceLevel, string> = {
  baixa: 'Confiança baixa',
  media: 'Confiança média',
  alta: 'Confiança alta',
};