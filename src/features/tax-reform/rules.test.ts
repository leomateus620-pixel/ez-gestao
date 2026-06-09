import { describe, expect, it } from 'vitest';
import { calculateTaxReformScore } from './rules';

describe('calculateTaxReformScore', () => {
  it('recommends evaluating Lucro Presumido for high B2B Simples companies', () => {
    const result = calculateTaxReformScore('simples_nacional', {
      sales_b2c_percent: 10,
      sales_b2b_percent: 85,
      b2b_lucro_real_percent: 70,
      top_clients_over_50: 'sim',
      clients_use_tax_credits: 'sim',
      client_loss_risk: 'alto',
      inputs_revenue_percent: '41_60',
      supplier_regime: 'lucro_real',
      credit_potential_items: ['fretes', 'maquinas_equipamentos'],
      effective_tax_rate: 14,
      near_simples_limit: 'sim',
      business_complexity_acceptance: 'sim',
      partners_main_goal: 'ganhar_mercado',
    });

    expect(result.total).toBe(95);
    expect(result.riskLevel).toBe('alto_risco');
    expect(result.recommendation).toBe('avaliar_lucro_presumido');
    expect(result.alerts.some((alert) => alert.alertType === 'commercial_risk')).toBe(true);
  });

  it('recommends evaluating Simples for low-risk Lucro Presumido companies', () => {
    const result = calculateTaxReformScore('lucro_presumido', {
      sales_b2c_percent: 82,
      sales_b2b_percent: 12,
      b2b_lucro_real_percent: 5,
      top_clients_over_50: 'nao',
      clients_use_tax_credits: 'nao',
      client_loss_risk: 'baixo',
      inputs_revenue_percent: 'ate_20',
      supplier_regime: 'simples_nacional',
      credit_potential_items: ['nenhum_relevante'],
      effective_tax_rate: 8,
      near_simples_limit: 'nao_se_aplica',
      business_complexity_acceptance: 'nao',
      partners_main_goal: 'manter_simplicidade',
    });

    expect(result.total).toBe(0);
    expect(result.riskLevel).toBe('baixo_risco');
    expect(result.recommendation).toBe('avaliar_simples_nacional');
    expect(result.alerts.some((alert) => alert.alertType === 'likely_simples')).toBe(true);
  });

  it('does not force a recommendation with insufficient answers', () => {
    const result = calculateTaxReformScore('simples_nacional', { sales_b2b_percent: 80 });

    expect(result.riskLevel).toBe('dados_insuficientes');
    expect(result.recommendation).toBe('analise_manual_necessaria');
  });
});
