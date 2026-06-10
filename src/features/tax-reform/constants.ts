import type { AnalysisStatus, FinalDecision, MainActivity, Recommendation, RiskLevel, TaxRegime } from './types';

export const TAX_REFORM_DRAFT_STORAGE_KEY = 'ez_tax_reform_workspace_v2';

export const taxRegimeLabels: Record<TaxRegime, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
};

export const taxActivityLabels: Record<MainActivity, string> = {
  comercio: 'Comércio',
  industria: 'Indústria',
  servicos: 'Serviços',
  misto: 'Misto',
};

export const taxAnalysisStatusLabels: Record<AnalysisStatus, string> = {
  cadastro_iniciado: 'Cadastro iniciado',
  questionario_pendente: 'Questionário pendente',
  aguardando_documentos: 'Aguardando documentos',
  documentos_anexados: 'Documentos anexados',
  analise_concluida: 'Análise concluída',
  necessita_revisao_manual: 'Necessita revisão manual',
};

export const taxRiskLabels: Record<RiskLevel, string> = {
  baixo_risco: 'Baixo risco',
  risco_medio: 'Risco médio',
  alto_risco: 'Alto risco',
  dados_insuficientes: 'Dados insuficientes',
};

export const taxRecommendationLabels: Record<Recommendation, string> = {
  permanecer_simples: 'Permanecer no Simples Nacional',
  avaliar_lucro_presumido: 'Avaliar migração para Lucro Presumido',
  permanecer_lucro_presumido: 'Permanecer no Lucro Presumido',
  avaliar_simples_nacional: 'Avaliar migração para Simples Nacional',
  analise_manual_necessaria: 'Análise manual necessária',
};

export const taxFinalDecisionLabels: Record<FinalDecision, string> = {
  '': 'Sem decisão final',
  permanecer_regime_atual: 'Permanecer no regime atual',
  migrar_para_simples: 'Migrar para Simples Nacional',
  migrar_para_lucro_presumido: 'Migrar para Lucro Presumido',
  rodar_simulacao_detalhada: 'Rodar simulação detalhada',
  coletar_dados_adicionais: 'Coletar dados adicionais',
};
