import type { AnswerMap, AnswerValue, DocumentLike, Recommendation, RiskLevel, ScoreBreakdown, TaxReformAlert, TaxRegime } from './types';

export type { AnswerMap, AnswerValue, DocumentLike, Recommendation, RiskLevel, ScoreBreakdown, TaxReformAlert, TaxRegime } from './types';

const toNumber = (value: AnswerValue) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const hasOneOf = (value: AnswerValue, options: string[]) => Array.isArray(value) && value.some((item) => options.includes(item));
const isYes = (value: AnswerValue) => value === 'sim';
const isUnknown = (value: AnswerValue) => value === undefined || value === null || value === '' || value === 'nao_sei' || value === 'nao_informado';

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

export const REQUIRED_DOCUMENT_TYPES = ['dre', 'balancete', 'pgdas', 'faturamento_cliente', 'fornecedores'];

export function getMissingDocumentTypes(documents: DocumentLike[]) {
  const uploaded = new Set(documents.map((doc) => doc.documentType));
  return REQUIRED_DOCUMENT_TYPES.filter((type) => !uploaded.has(type));
}

function classifyRisk(total: number, insufficientData: boolean): RiskLevel {
  if (insufficientData) return 'dados_insuficientes';
  if (total <= 30) return 'baixo_risco';
  if (total <= 60) return 'risco_medio';
  return 'alto_risco';
}

function buildRecommendation(currentRegime: TaxRegime, answers: AnswerMap, total: number, riskLevel: RiskLevel): Recommendation {
  if (riskLevel === 'dados_insuficientes') return 'analise_manual_necessaria';

  const b2b = toNumber(answers.sales_b2b_percent);
  const b2c = toNumber(answers.sales_b2c_percent);
  const clientsUseCredits = answers.clients_use_tax_credits === 'sim' || answers.clients_use_tax_credits === 'parcialmente';
  const clientLossRisk = answers.client_loss_risk === 'alto' || answers.client_loss_risk === 'medio';
  const seeksSimplicity = answers.partners_main_goal === 'manter_simplicidade';
  const lowInputs = answers.inputs_revenue_percent === 'ate_20' || answers.inputs_revenue_percent === '21_40';

  if (currentRegime === 'simples_nacional') {
    if (total <= 30 && b2c >= 50 && !clientsUseCredits && !clientLossRisk && (seeksSimplicity || lowInputs)) {
      return 'permanecer_simples';
    }
    if (total > 30 || b2b >= 50 || clientsUseCredits || clientLossRisk) return 'avaliar_lucro_presumido';
    return 'permanecer_simples';
  }

  if (total <= 30 && b2c >= 50 && !clientsUseCredits && !clientLossRisk && (seeksSimplicity || lowInputs)) {
    return 'avaliar_simples_nacional';
  }
  if (total > 30 || b2b >= 50 || clientsUseCredits || clientLossRisk) return 'permanecer_lucro_presumido';
  return 'avaliar_simples_nacional';
}

function buildSummary(currentRegime: TaxRegime, recommendation: Recommendation, total: number, riskLevel: RiskLevel) {
  if (recommendation === 'analise_manual_necessaria') {
    return 'Análise manual necessária — faltam dados para recomendação segura.';
  }

  const regime = currentRegime === 'simples_nacional' ? 'Simples Nacional' : 'Lucro Presumido';
  const risk = riskLevel === 'baixo_risco' ? 'baixo risco' : riskLevel === 'risco_medio' ? 'risco médio' : 'alto risco';
  const base = `Score ${total}/100 com classificação de ${risk}. Regime atual: ${regime}.`;

  const explanations: Record<Recommendation, string> = {
    permanecer_simples: 'O perfil preliminar indica baixa pressão por créditos, maior simplicidade operacional e tendência de permanência no Simples Nacional.',
    avaliar_lucro_presumido: 'Há sinais de exposição B2B, uso de créditos por clientes ou pressão competitiva; recomenda-se simulação comparativa para avaliar Lucro Presumido.',
    permanecer_lucro_presumido: 'O perfil sugere manutenção cautelosa no Lucro Presumido enquanto houver relevância comercial de créditos e clientes B2B.',
    avaliar_simples_nacional: 'O perfil preliminar indica baixa exposição a créditos e potencial benefício operacional em avaliar Simples Nacional.',
    analise_manual_necessaria: '',
  };

  return `${base} ${explanations[recommendation]}`;
}

export function calculateTaxReformScore(currentRegime: TaxRegime, answers: AnswerMap, documents: DocumentLike[] = []): ScoreBreakdown {
  let clients = 0;
  let costs = 0;
  let currentTax = 0;

  if (toNumber(answers.sales_b2b_percent) > 70) clients += 20;
  if (toNumber(answers.b2b_lucro_real_percent) > 50) clients += 15;
  if (isYes(answers.top_clients_over_50)) clients += 10;
  if (answers.clients_use_tax_credits === 'sim') clients += 10;
  if (answers.client_loss_risk === 'alto' || answers.client_loss_risk === 'medio') clients += 5;
  clients = Math.min(clients, 60);

  if (answers.inputs_revenue_percent === '41_60' || answers.inputs_revenue_percent === 'acima_60') costs += 10;
  if (answers.supplier_regime === 'lucro_real' || answers.supplier_regime === 'lucro_presumido') costs += 5;
  if (hasOneOf(answers.credit_potential_items, ['fretes', 'energia_eletrica', 'servicos_contratados'])) costs += 5;
  if (hasOneOf(answers.credit_potential_items, ['maquinas_equipamentos', 'tecnologia_softwares'])) costs += 5;
  costs = Math.min(costs, 25);

  if (currentRegime === 'simples_nacional' && toNumber(answers.effective_tax_rate) >= 12) currentTax += 5;
  if (isYes(answers.near_simples_limit)) currentTax += 5;
  if (hasOneOf(answers.relevant_operations, ['produtos_monofasicos', 'substituicao_tributaria', 'iss_retido', 'exportacao'])) currentTax += 5;
  currentTax = Math.min(currentTax, 15);

  const answeredRequired = REQUIRED_QUESTION_KEYS.filter((key) => !isUnknown(answers[key])).length;
  const insufficientData = answeredRequired < 8;
  const total = Math.min(100, clients + costs + currentTax);
  const riskLevel = classifyRisk(total, insufficientData);
  const recommendation = buildRecommendation(currentRegime, answers, total, riskLevel);
  const missingDocuments = getMissingDocumentTypes(documents);
  const alerts: TaxReformAlert[] = [];

  if (
    toNumber(answers.sales_b2b_percent) > 70 &&
    toNumber(answers.b2b_lucro_real_percent) > 50 &&
    (answers.clients_use_tax_credits === 'sim' || answers.clients_use_tax_credits === 'parcialmente') &&
    (answers.client_loss_risk === 'alto' || answers.client_loss_risk === 'medio')
  ) {
    alerts.push({
      alertType: 'commercial_risk',
      severity: 'critical',
      title: 'Alto risco comercial',
      message: 'A empresa possui forte exposição a clientes B2B que podem valorizar créditos tributários. Recomenda-se simulação comparativa entre Simples Nacional e Lucro Presumido.',
    });
  }

  if (
    toNumber(answers.sales_b2c_percent) > 70 &&
    (answers.inputs_revenue_percent === 'ate_20' || answers.inputs_revenue_percent === '21_40') &&
    answers.clients_use_tax_credits === 'nao' &&
    answers.partners_main_goal === 'manter_simplicidade'
  ) {
    alerts.push({
      alertType: 'likely_simples',
      severity: 'info',
      title: 'Permanência provável no Simples',
      message: 'A empresa possui perfil predominantemente B2C e baixa exposição a clientes que utilizam créditos tributários. Há tendência preliminar de permanência ou retorno ao Simples Nacional.',
    });
  }

  if (missingDocuments.length > 0) {
    alerts.push({
      alertType: 'missing_documents',
      severity: 'warning',
      title: 'Documentos pendentes',
      message: 'A análise está incompleta. Para maior segurança técnica, anexar DRE, balancete, PGDAS, faturamento por cliente e relação dos principais fornecedores.',
    });
  }

  if (insufficientData) {
    alerts.push({
      alertType: 'manual_review',
      severity: 'warning',
      title: 'Dados insuficientes',
      message: 'Análise manual necessária — faltam dados para recomendação segura.',
    });
  }

  return {
    total,
    clients,
    costs,
    currentTax,
    riskLevel,
    recommendation,
    summary: buildSummary(currentRegime, recommendation, total, riskLevel),
    alerts,
    answeredRequired,
    insufficientData,
  };
}
