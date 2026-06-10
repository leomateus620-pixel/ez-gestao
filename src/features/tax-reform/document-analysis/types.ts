import type { AnswerMap, TaxReformCompany, TaxReformDocument } from '../types';

export type TaxReformExtractedValues = {
  revenue?: number;
  projectedRevenue?: number;
  grossRevenue12m?: number;
  effectiveTaxRate?: number;
  taxRegimeDetected?: string;

  b2bPercent?: number;
  b2cPercent?: number;
  governmentPercent?: number;
  top10ClientsConcentration?: number;
  lucroRealClientsPercent?: number;

  inputCostPercent?: number;
  supplierRegimeDetected?: string;
  payrollPercent?: number;

  hasSt?: boolean;
  hasMonophasic?: boolean;
  hasIssRetido?: boolean;
  hasExportation?: boolean;

  netProfit?: number;
  grossMargin?: number;
  operatingExpenses?: number;

  warnings?: string[];
  confidence?: number;

  // ---- Identificação genérica ----
  cnpj?: string;
  companyName?: string;
  period?: string;

  // ---- PGDAS específicos ----
  monthlyRevenue?: number;
  rba?: number;
  rbaa?: number;
  simplesLimit?: number;
  sublimit?: number;
  dasTotal?: number;
  irpj?: number;
  csll?: number;
  cofins?: number;
  pis?: number;
  inssCpp?: number;
  icms?: number;
  ipi?: number;
  iss?: number;
  simplesLimitUsagePercent?: number;
  sublimitUsagePercent?: number;
  nearSimplesLimit?: boolean;
  factorRStatus?: 'aplica' | 'nao_se_aplica' | 'desconhecido';
  shouldCalculateFactorR?: boolean;

  // ---- Balanço ----
  assetsTotal?: number;
  currentAssets?: number;
  cashAndBanks?: number;
  financialInvestments?: number;
  accountsReceivable?: number;
  nonCurrentAssets?: number;
  liabilitiesTotal?: number;
  currentLiabilities?: number;
  suppliersBalance?: number;
  laborObligations?: number;
  taxObligations?: number;
  simplesPayable?: number;
  irrfPayable?: number;
  equity?: number;
  capitalStock?: number;
  accumulatedProfits?: number;
  afac?: number;

  // ---- DRE ----
  grossRevenue?: number;
  serviceRevenue?: number;
  simplesNacionalExpense?: number;
  netRevenue?: number;
  serviceCosts?: number;
  grossProfit?: number;
  adminExpenses?: number;
  proLabore?: number;
  pjServices?: number;
  taxExpenses?: number;
  financialResult?: number;
  otherOperatingExpenses?: number;
  annualPayrollFromDre?: number;
  payrollPercentFromDre?: number;
  annualEffectiveTaxRate?: number;
  netMargin?: number;

  // ---- Folha de pagamento ----
  employeesCount?: number;
  salaryTotal?: number;
  inssBase?: number;
  inssValue?: number;
  irrfBase?: number;
  irrfValue?: number;
  fgtsBase?: number;
  fgtsValue?: number;
  grossPayroll?: number;
  discounts?: number;
  netPayroll?: number;
  familySalary?: number;
  establishmentsAggregated?: number;

  // ---- Folha × PGDAS (cross-document) ----
  payrollPercentByMonthlyRevenue?: number;
  payrollWithChargesPercentByMonthlyRevenue?: number;
  annualizedPayrollPercentByRbt12?: number;
  annualizedPayrollWithChargesPercentByRbt12?: number;

  // ---- Perfil comercial estimado pelo saldo CLIENTES do Balanço ----
  balanceClientsTotal?: number;
  b2bBalanceAmount?: number;
  b2cBalanceAmount?: number;
  entityBalanceAmount?: number;
  b2bPercentFromBalanceClients?: number;
  b2cPercentFromBalanceClients?: number;
  entityPercentFromBalanceClients?: number;
  top10BalanceClientsConcentration?: number;
  clientProfileSource?: 'balance_clients_account' | 'faturamento_cliente';
  clientProfileConfidence?: 'low' | 'medium' | 'high';
};

export type TaxReformDocumentFinding = {
  documentType: string;
  field: string;
  value: string | number | boolean;
  confidence: number;
  sourceLabel?: string;
  explanation?: string;
};

export type TaxReformDocumentExtraction = {
  documentType: string;
  values: TaxReformExtractedValues;
  findings: TaxReformDocumentFinding[];
  summary: string;
  confidence: number;
  warnings: string[];
};

export type TaxReformAnalysisInput = {
  company?: TaxReformCompany | null;
  answers: AnswerMap;
  documents: TaxReformDocument[];
  adjustedAnswers: AnswerMap;
  extractedValues: TaxReformExtractedValues;
  findings: TaxReformDocumentFinding[];
  documentConfidence: number;
  hasReadDocuments: boolean;
};

export type ReconciliationAlert = {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  field?: string;
  manualReviewRecommended?: boolean;
};
