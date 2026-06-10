import type { AnswerMap, AnswerValue, DocumentLike, MainActivity, RiskLevel, TaxRegime } from './types';

export const REQUIRED_QUESTION_KEYS = [
  'sales_b2c_percent',
  'sales_b2b_percent',
  'b2b_lucro_real_percent',
  'top_clients_over_50',
  'clients_use_tax_credits',
  'client_loss_risk',
  'inputs_revenue_percent',
  'supplier_regime',
  'credit_potential_items',
  'effective_tax_rate',
  'near_simples_limit',
  'business_complexity_acceptance',
  'partners_main_goal',
];

/**
 * Perguntas decisivas (sem elas a recomendação não é confiável).
 * Inclui regime e atividade principal, validados separadamente.
 */
export const ESSENTIAL_QUESTION_KEYS = [
  'sales_b2c_percent',
  'sales_b2b_percent',
  'clients_use_tax_credits',
  'client_loss_risk',
  'b2b_lucro_real_percent',
  'inputs_revenue_percent',
  'supplier_regime',
  'partners_main_goal',
  'business_complexity_acceptance',
];

export const REQUIRED_DOCUMENT_TYPES = ['dre', 'balancete', 'pgdas', 'faturamento_cliente', 'fornecedores'];

export interface ScoreParts {
  total: number;
  clients: number;
  costs: number;
  currentTax: number;
}

export interface RequiredDataContext {
  currentRegime?: TaxRegime | null;
  mainActivity?: MainActivity | null;
  answers: AnswerMap;
  documents?: DocumentLike[];
  requireDocuments?: boolean;
  requireMainActivity?: boolean;
}

export const toNumber = (value: AnswerValue) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const isYes = (value: AnswerValue) => value === 'sim';

export const hasOneOf = (value: AnswerValue, options: string[]) => (
  Array.isArray(value) && value.some((item) => options.includes(item))
);

export function isUnknown(value: AnswerValue) {
  if (value === undefined || value === null || value === '') return true;
  if (value === 'nao_sei' || value === 'nao_informado') return true;
  if (Array.isArray(value)) return value.length === 0 || value.every((item) => item === 'nao_sei' || item === 'nao_informado');
  return false;
}

export function isValidTaxRegime(value?: string | null): value is TaxRegime {
  return value === 'simples_nacional' || value === 'lucro_presumido';
}

export function isValidMainActivity(value?: string | null): value is MainActivity {
  return value === 'comercio' || value === 'industria' || value === 'servicos' || value === 'misto';
}

/**
 * Considera apenas documentos efetivamente enviados ao Storage.
 * Documentos com upload_status='erro_upload' ou sem storage_path não contam.
 */
export function isValidStorageDocument(doc: DocumentLike) {
  if (doc.uploadStatus && doc.uploadStatus !== 'enviado') return false;
  // Se o registro não trouxe metadados de storage (estado legado), aceitamos por
  // compatibilidade — o caminho novo sempre preenche storagePath.
  if (doc.storagePath === null) return false;
  return true;
}

export function getMissingDocumentTypes(documents: DocumentLike[] = [], requiredTypes = REQUIRED_DOCUMENT_TYPES) {
  const uploaded = new Set(documents.filter(isValidStorageDocument).map((doc) => doc.documentType));
  return requiredTypes.filter((type) => !uploaded.has(type));
}

export function getMissingRequiredData({
  currentRegime,
  mainActivity,
  answers,
  documents = [],
  requireDocuments = false,
  requireMainActivity = false,
}: RequiredDataContext) {
  const missing: string[] = [];

  if (!isValidTaxRegime(currentRegime)) missing.push('regime_atual');
  if (requireMainActivity && !isValidMainActivity(mainActivity)) missing.push('atividade_principal');

  ESSENTIAL_QUESTION_KEYS.forEach((key) => {
    if (isUnknown(answers[key])) missing.push(key);
  });

  // Alíquota efetiva é decisiva apenas no Simples.
  if (currentRegime === 'simples_nacional' && isUnknown(answers.effective_tax_rate)) {
    missing.push('effective_tax_rate');
  }
  // Proximidade do limite do Simples é decisiva apenas no Simples.
  if (currentRegime === 'simples_nacional' && isUnknown(answers.near_simples_limit)) {
    missing.push('near_simples_limit');
  }

  if (requireDocuments) {
    missing.push(...getMissingDocumentTypes(documents).map((type) => `documento:${type}`));
  }

  return missing;
}

export function classifyTaxReformRisk(total: number, insufficientData: boolean): RiskLevel {
  if (insufficientData) return 'dados_insuficientes';
  if (total <= 30) return 'baixo_risco';
  if (total <= 60) return 'risco_medio';
  return 'alto_risco';
}

export function calculateScoreParts(currentRegime: TaxRegime | null | undefined, answers: AnswerMap): ScoreParts {
  let clients = 0;
  let costs = 0;
  let currentTax = 0;

  // --- Perfil dos clientes (até 60) --------------------------------
  const b2b = toNumber(answers.sales_b2b_percent);
  if (b2b > 70) clients += 20;
  else if (b2b >= 40) clients += 10;

  const b2bLR = toNumber(answers.b2b_lucro_real_percent);
  if (b2bLR > 50) clients += 15;
  else if (b2bLR >= 20) clients += 8;

  if (isYes(answers.top_clients_over_50)) clients += 10;
  if (answers.clients_use_tax_credits === 'sim') clients += 10;
  else if (answers.clients_use_tax_credits === 'parcialmente') clients += 5;

  if (answers.client_loss_risk === 'alto') clients += 5;
  else if (answers.client_loss_risk === 'medio') clients += 3;
  clients = Math.min(clients, 60);

  // --- Custos, fornecedores e créditos (até 25) --------------------
  if (answers.inputs_revenue_percent === 'acima_60') costs += 10;
  else if (answers.inputs_revenue_percent === '41_60') costs += 8;
  else if (answers.inputs_revenue_percent === '21_40') costs += 4;

  if (answers.supplier_regime === 'lucro_real') costs += 5;
  else if (answers.supplier_regime === 'lucro_presumido') costs += 3;

  if (hasOneOf(answers.credit_potential_items, [
    'fretes', 'energia_eletrica', 'servicos_contratados', 'maquinas_equipamentos', 'tecnologia_softwares',
  ])) costs += 5;

  const payrollPct = toNumber(answers.payroll_revenue_percent);
  if (payrollPct >= 20) costs += 5;
  else if (payrollPct >= 10) costs += 3;
  costs = Math.min(costs, 25);

  // --- Situação tributária atual (até 15) --------------------------
  if (currentRegime === 'simples_nacional' && toNumber(answers.effective_tax_rate) >= 12) currentTax += 5;
  if (isYes(answers.near_simples_limit)) currentTax += 5;
  if (hasOneOf(answers.relevant_operations, ['produtos_monofasicos', 'substituicao_tributaria', 'iss_retido', 'exportacao'])) currentTax += 5;
  currentTax = Math.min(currentTax, 15);

  return {
    clients,
    costs,
    currentTax,
    total: Math.min(100, clients + costs + currentTax),
  };
}

export function countAnsweredRequiredQuestions(answers: AnswerMap) {
  return REQUIRED_QUESTION_KEYS.filter((key) => !isUnknown(answers[key])).length;
}
