import type { AnswerMap, DocumentLike, TaxReformAlert } from './types';
import { getMissingDocumentTypes, toNumber } from './score';

export interface AlertInput {
  answers: AnswerMap;
  documents?: DocumentLike[];
  insufficientData: boolean;
}

export function buildTaxReformAlerts({ answers, documents = [], insufficientData }: AlertInput) {
  const alerts: TaxReformAlert[] = [];
  const missingDocuments = getMissingDocumentTypes(documents);

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

  return alerts;
}
