import type { AnswerMap, Recommendation, RiskLevel, TaxRegime } from './types';
import { isValidTaxRegime, toNumber } from './score';

export interface RecommendationInput {
  currentRegime?: TaxRegime | null;
  answers: AnswerMap;
  total: number;
  riskLevel: RiskLevel;
}

export function buildTaxReformRecommendation({
  currentRegime,
  answers,
  total,
  riskLevel,
}: RecommendationInput): Recommendation {
  if (!isValidTaxRegime(currentRegime) || riskLevel === 'dados_insuficientes') {
    return 'analise_manual_necessaria';
  }

  const b2b = toNumber(answers.sales_b2b_percent);
  const b2c = toNumber(answers.sales_b2c_percent);
  const b2bLR = toNumber(answers.b2b_lucro_real_percent);
  const clientsUseCredits = answers.clients_use_tax_credits === 'sim' || answers.clients_use_tax_credits === 'parcialmente';
  const clientLossRiskHigh = answers.client_loss_risk === 'alto' || answers.client_loss_risk === 'medio';
  const seeksSimplicity = answers.partners_main_goal === 'manter_simplicidade';
  const wantsGrowth = answers.partners_main_goal === 'crescer'
    || answers.partners_main_goal === 'ganhar_mercado'
    || answers.partners_main_goal === 'atrair_grandes_clientes';
  const lowInputs = answers.inputs_revenue_percent === 'ate_20' || answers.inputs_revenue_percent === '21_40';
  const lowComplexityProfile = answers.business_complexity_acceptance === 'nao' || answers.business_complexity_acceptance === 'depende_economia';

  // Perfil de baixa complexidade / B2C dominante.
  const isLowComplexityB2C =
    total <= 30 &&
    b2c >= 60 &&
    !clientsUseCredits &&
    !clientLossRiskHigh &&
    lowInputs &&
    (seeksSimplicity || lowComplexityProfile);

  // Pressão B2B / créditos / clientes grandes.
  const hasStrongB2BPressure =
    b2b >= 40 ||
    clientsUseCredits ||
    b2bLR >= 20 ||
    clientLossRiskHigh ||
    wantsGrowth;

  if (currentRegime === 'simples_nacional') {
    if (isLowComplexityB2C) return 'permanecer_simples';
    if (hasStrongB2BPressure) return 'avaliar_lucro_presumido';
    // Cenário meio-termo: recomendação preliminar de permanência no regime atual.
    return 'permanecer_simples';
  }

  // Lucro Presumido
  if (isLowComplexityB2C) return 'avaliar_simples_nacional';
  if (hasStrongB2BPressure) return 'permanecer_lucro_presumido';
  // Cenário meio-termo: recomendação preliminar de permanência no regime atual.
  return 'permanecer_lucro_presumido';
}

export function buildRecommendationSummary(
  currentRegime: TaxRegime | null | undefined,
  recommendation: Recommendation,
  total: number,
  riskLevel: RiskLevel,
) {
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
