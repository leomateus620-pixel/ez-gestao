import { describe, expect, it } from 'vitest';
import {
  calculateTaxReformScore,
  getCompanyAnalysisHistory,
  REQUIRED_DOCUMENT_TYPES,
} from './rules';
import type { AnswerMap, TaxReformAnalysis } from './types';

const completeDocs = REQUIRED_DOCUMENT_TYPES.map((documentType) => ({ documentType }));

const highB2BAnswers: AnswerMap = {
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
};

const lowB2CAnswers: AnswerMap = {
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
};

const scoreOptions = { mainActivity: 'comercio' as const, requireDocuments: true, requireMainActivity: true };

describe('calculateTaxReformScore', () => {
  it('recommends evaluating Lucro Presumido for high B2B Simples companies', () => {
    const result = calculateTaxReformScore('simples_nacional', highB2BAnswers, completeDocs, scoreOptions);

    expect(result.total).toBe(88);
    expect(result.riskLevel).toBe('alto_risco');
    expect(result.recommendation).toBe('avaliar_lucro_presumido');
    expect(result.alerts.some((alert) => alert.alertType === 'commercial_risk')).toBe(true);
  });

  it('recommends staying in Simples for low-risk B2C Simples companies', () => {
    const result = calculateTaxReformScore('simples_nacional', lowB2CAnswers, completeDocs, scoreOptions);

    expect(result.total).toBe(0);
    expect(result.riskLevel).toBe('baixo_risco');
    expect(result.recommendation).toBe('permanecer_simples');
  });

  it('recommends staying in Lucro Presumido for strong B2B Lucro Presumido companies', () => {
    const result = calculateTaxReformScore('lucro_presumido', highB2BAnswers, completeDocs, scoreOptions);

    expect(result.riskLevel).toBe('alto_risco');
    expect(result.recommendation).toBe('permanecer_lucro_presumido');
  });

  it('recommends evaluating Simples for low-complexity B2C Lucro Presumido companies', () => {
    const result = calculateTaxReformScore('lucro_presumido', lowB2CAnswers, completeDocs, scoreOptions);

    expect(result.total).toBe(0);
    expect(result.riskLevel).toBe('baixo_risco');
    expect(result.recommendation).toBe('avaliar_simples_nacional');
    expect(result.alerts.some((alert) => alert.alertType === 'likely_simples')).toBe(true);
  });

  it('does not force a recommendation with insufficient answers', () => {
    const result = calculateTaxReformScore('simples_nacional', { sales_b2b_percent: 80 }, completeDocs, scoreOptions);

    expect(result.riskLevel).toBe('dados_insuficientes');
    expect(result.recommendation).toBe('analise_manual_necessaria');
    expect(result.summary).toBe('Análise manual necessária — faltam dados para recomendação segura.');
  });

  it('caps the score at 100', () => {
    const result = calculateTaxReformScore('simples_nacional', {
      ...highB2BAnswers,
      relevant_operations: ['produtos_monofasicos', 'substituicao_tributaria', 'iss_retido', 'exportacao'],
      payroll_revenue_percent: 25,
    }, completeDocs, scoreOptions);

    expect(result.clients).toBe(60);
    expect(result.costs).toBeGreaterThanOrEqual(23);
    expect(result.currentTax).toBe(15);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.total).toBeGreaterThanOrEqual(95);
  });

  it('updates score when answers change', () => {
    const low = calculateTaxReformScore('simples_nacional', lowB2CAnswers, completeDocs, scoreOptions);
    const high = calculateTaxReformScore('simples_nacional', highB2BAnswers, completeDocs, scoreOptions);

    expect(low.total).toBeLessThan(high.total);
    expect(low.recommendation).toBe('permanecer_simples');
    expect(high.recommendation).toBe('avaliar_lucro_presumido');
  });

  it('generates alerts according to answers', () => {
    const result = calculateTaxReformScore('simples_nacional', highB2BAnswers, completeDocs, scoreOptions);

    expect(result.alerts.map((alert) => alert.alertType)).toContain('commercial_risk');
  });

  it('generates an alert for pending documents', () => {
    const result = calculateTaxReformScore('simples_nacional', highB2BAnswers, [], {
      mainActivity: 'comercio',
      requireDocuments: false,
      requireMainActivity: true,
    });

    expect(result.alerts.map((alert) => alert.alertType)).toContain('missing_documents');
  });
});

describe('getCompanyAnalysisHistory', () => {
  it('keeps multiple analyses for the same company without overwriting history', () => {
    const analyses = [
      {
        id: 'analysis-2026',
        companyId: 'company-1',
        analysisYear: 2026,
        status: 'analise_concluida',
        answers: {},
        scoreTotal: 20,
        scoreClients: 20,
        scoreCosts: 0,
        scoreCurrentTax: 0,
        riskLevel: 'baixo_risco',
        recommendation: 'permanecer_simples',
        automaticSummary: '',
        manualOpinion: 'Parecer 2026',
        finalDecision: 'permanecer_regime_atual',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'analysis-2027',
        companyId: 'company-1',
        analysisYear: 2027,
        status: 'necessita_revisao_manual',
        answers: {},
        scoreTotal: 70,
        scoreClients: 60,
        scoreCosts: 10,
        scoreCurrentTax: 0,
        riskLevel: 'alto_risco',
        recommendation: 'avaliar_lucro_presumido',
        automaticSummary: '',
        manualOpinion: 'Parecer 2027',
        finalDecision: 'rodar_simulacao_detalhada',
        createdAt: '2027-01-01T00:00:00.000Z',
        updatedAt: '2027-01-02T00:00:00.000Z',
      },
    ] satisfies TaxReformAnalysis[];

    const history = getCompanyAnalysisHistory('company-1', analyses);

    expect(history).toHaveLength(2);
    expect(history.map((analysis) => analysis.id)).toEqual(['analysis-2027', 'analysis-2026']);
    expect(history[0].manualOpinion).toBe('Parecer 2027');
    expect(history[1].manualOpinion).toBe('Parecer 2026');
  });
});

describe('document driven Reforma Tributária analysis', () => {
  const doc = (documentType: string, extractedValues: Record<string, unknown>, extractionConfidence = 0.8, readingStatus = 'lido') => ({
    documentType,
    readingStatus,
    uploadStatus: 'enviado',
    storagePath: `${documentType}.csv`,
    extractionConfidence,
    extractedValues: { ...extractedValues, confidence: extractionConfidence },
  });

  it('generates a preliminary recommendation with low confidence when questionnaire is complete and documents are absent', () => {
    const result = calculateTaxReformScore('simples_nacional', lowB2CAnswers, [], scoreOptions);

    expect(result.riskLevel).toBe('baixo_risco');
    expect(result.recommendation).toBe('permanecer_simples');
    expect(result.insufficientData).toBe(false);
    expect(result.alerts.find((alert) => alert.alertType === 'missing_documents')?.message).toContain('Análise baseada apenas no questionário');
  });

  it('requires manual review when decisive questionnaire answers are missing and no documents can fill them', () => {
    const result = calculateTaxReformScore('simples_nacional', { sales_b2b_percent: 80 }, [], scoreOptions);

    expect(result.riskLevel).toBe('dados_insuficientes');
    expect(result.recommendation).toBe('analise_manual_necessaria');
    expect(result.missingRequiredData).toContain('sales_b2c_percent');
  });

  it('uses a DRE extraction with high input cost to increase the cost score', () => {
    const base = calculateTaxReformScore('simples_nacional', lowB2CAnswers, [], scoreOptions);
    const withDre = calculateTaxReformScore('simples_nacional', lowB2CAnswers, [doc('dre', { inputCostPercent: 65 })], scoreOptions);

    expect(withDre.costs).toBeGreaterThan(base.costs);
  });

  it('uses a PGDAS extraction with high effective tax rate to increase the current tax score', () => {
    const answers = { ...lowB2CAnswers, effective_tax_rate: 6 };
    const base = calculateTaxReformScore('simples_nacional', answers, [], scoreOptions);
    const withPgdas = calculateTaxReformScore('simples_nacional', answers, [doc('pgdas', { effectiveTaxRate: 14 })], scoreOptions);

    expect(withPgdas.currentTax).toBeGreaterThan(base.currentTax);
  });

  it('uses client revenue extraction with high B2B to increase client profile score', () => {
    const base = calculateTaxReformScore('simples_nacional', lowB2CAnswers, [], scoreOptions);
    const withClients = calculateTaxReformScore('simples_nacional', lowB2CAnswers, [doc('faturamento_cliente', { b2bPercent: 82, b2cPercent: 18, top10ClientsConcentration: 70 })], scoreOptions);

    expect(withClients.clients).toBeGreaterThan(base.clients);
  });

  it('flags divergence and can require manual review when documents contradict questionnaire', () => {
    const result = calculateTaxReformScore('simples_nacional', lowB2CAnswers, [doc('faturamento_cliente', { b2bPercent: 85, b2cPercent: 15 })], scoreOptions);

    expect(result.alerts.map((alert) => alert.alertType)).toContain('document_divergence');
    expect(result.riskLevel).toBe('dados_insuficientes');
    expect(result.recommendation).toBe('analise_manual_necessaria');
  });

  it('does not increase confidence or count a document with reading error as read evidence', () => {
    const result = calculateTaxReformScore('simples_nacional', lowB2CAnswers, [doc('dre', { inputCostPercent: 70 }, 0, 'erro_leitura')], scoreOptions);

    expect(result.costs).toBe(0);
    expect(result.alerts.map((alert) => alert.alertType)).toContain('document_reading');
  });
});
