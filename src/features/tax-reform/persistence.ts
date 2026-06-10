/* eslint-disable @typescript-eslint/no-explicit-any */
import { isSupabaseConfigured, supabase } from '@/integrations/supabase/client';
import type {
  AnalysisStatus,
  AnswerMap,
  AnswerValue,
  FinalDecision,
  MainActivity,
  ReadingStatus,
  Recommendation,
  RiskLevel,
  TaxReformAlertRecord,
  TaxReformAnalysis,
  TaxReformCompany,
  TaxReformDocument,
  TaxReformStore,
  TaxRegime,
} from './types';

export const TAX_REFORM_DOCUMENT_BUCKET = 'tax-reform-documents';

const db = () => supabase as any;

const toNumberOrUndefined = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const valueIsPresent = (value: AnswerValue) => {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const answerTypeFromValue = (key: string, value: AnswerValue) => {
  if (Array.isArray(value)) return 'multi';
  if (typeof value === 'number') return key.includes('percent') || key.includes('rate') ? 'percent' : 'number';
  if (typeof value === 'string' && value.length > 140) return 'text';
  return 'select';
};

function mapCompany(row: any): TaxReformCompany {
  return {
    id: row.id,
    companyName: row.company_name,
    cnpj: row.cnpj,
    currentTaxRegime: row.current_tax_regime as TaxRegime,
    mainActivity: row.main_activity as MainActivity,
    responsibleUser: row.responsible_user,
    rbt12: toNumberOrUndefined(row.rbt12),
    projectedRevenue: toNumberOrUndefined(row.projected_revenue),
    effectiveTaxRate: toNumberOrUndefined(row.effective_tax_rate),
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAnalysis(row: any, answers: AnswerMap): TaxReformAnalysis {
  return {
    id: row.id,
    companyId: row.company_id,
    analysisYear: Number(row.analysis_year) || new Date().getFullYear(),
    status: row.status as AnalysisStatus,
    answers,
    scoreTotal: Number(row.score_total ?? 0),
    scoreClients: Number(row.score_clients ?? 0),
    scoreCosts: Number(row.score_costs ?? 0),
    scoreCurrentTax: Number(row.score_current_tax ?? 0),
    riskLevel: (row.risk_level ?? 'dados_insuficientes') as RiskLevel,
    recommendation: (row.recommendation ?? 'analise_manual_necessaria') as Recommendation,
    automaticSummary: row.automatic_summary ?? '',
    manualOpinion: row.manual_opinion ?? '',
    finalDecision: (row.final_decision ?? '') as FinalDecision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDocument(row: any): TaxReformDocument {
  return {
    id: row.id,
    companyId: row.company_id,
    analysisId: row.analysis_id,
    documentType: row.document_type,
    fileName: row.file_name,
    fileUrl: row.file_url ?? '',
    fileSize: Number(row.file_size ?? 0),
    mimeType: row.mime_type ?? '',
    readingStatus: row.reading_status as ReadingStatus,
    extractedSummary: row.extracted_summary ?? '',
    extractionError: row.extraction_error ?? '',
    uploadedAt: row.uploaded_at,
    updatedAt: row.updated_at ?? row.uploaded_at,
  };
}

function mapAlert(row: any): TaxReformAlertRecord {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    alertType: row.alert_type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

export async function fetchTaxReformStore(): Promise<TaxReformStore> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase não configurado para Reforma Tributária.');
  }

  const database = db();
  const [companiesResult, analysesResult, answersResult, documentsResult, alertsResult] = await Promise.all([
    database.from('tax_reform_companies').select('*').order('created_at', { ascending: false }),
    database.from('tax_reform_analyses').select('*').order('updated_at', { ascending: false }),
    database.from('tax_reform_answers').select('*').order('updated_at', { ascending: false }),
    database.from('tax_reform_documents').select('*').order('uploaded_at', { ascending: false }),
    database.from('tax_reform_alerts').select('*').order('created_at', { ascending: false }),
  ]);

  const firstError = [companiesResult, analysesResult, answersResult, documentsResult, alertsResult].find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const answersByAnalysis = new Map<string, AnswerMap>();
  (answersResult.data ?? []).forEach((row: any) => {
    const answers = answersByAnalysis.get(row.analysis_id) ?? {};
    answers[row.question_key] = row.answer_value as AnswerValue;
    answersByAnalysis.set(row.analysis_id, answers);
  });

  return {
    companies: (companiesResult.data ?? []).map(mapCompany),
    analyses: (analysesResult.data ?? []).map((row: any) => mapAnalysis(row, answersByAnalysis.get(row.id) ?? {})),
    documents: (documentsResult.data ?? []).map(mapDocument),
    alerts: (alertsResult.data ?? []).map(mapAlert),
  };
}

export async function saveTaxReformStore(store: TaxReformStore) {
  if (!isSupabaseConfigured) return;

  const database = db();
  const companies = store.companies.map((company) => ({
    id: company.id,
    company_name: company.companyName,
    cnpj: company.cnpj,
    current_tax_regime: company.currentTaxRegime,
    main_activity: company.mainActivity,
    responsible_user: company.responsibleUser,
    rbt12: company.rbt12 ?? null,
    projected_revenue: company.projectedRevenue ?? null,
    effective_tax_rate: company.effectiveTaxRate ?? null,
    notes: company.notes ?? null,
    created_at: company.createdAt,
    updated_at: company.updatedAt,
  }));

  const analyses = store.analyses.map((analysis) => ({
    id: analysis.id,
    company_id: analysis.companyId,
    analysis_year: analysis.analysisYear,
    status: analysis.status,
    score_total: analysis.scoreTotal,
    score_clients: analysis.scoreClients,
    score_costs: analysis.scoreCosts,
    score_current_tax: analysis.scoreCurrentTax,
    risk_level: analysis.riskLevel,
    recommendation: analysis.recommendation,
    automatic_summary: analysis.automaticSummary,
    manual_opinion: analysis.manualOpinion,
    final_decision: analysis.finalDecision,
    created_at: analysis.createdAt,
    updated_at: analysis.updatedAt,
  }));

  if (companies.length) {
    const { error } = await database.from('tax_reform_companies').upsert(companies, { onConflict: 'id' });
    if (error) throw error;
  }

  if (analyses.length) {
    const { error } = await database.from('tax_reform_analyses').upsert(analyses, { onConflict: 'id' });
    if (error) throw error;
  }

  await Promise.all(store.analyses.map(async (analysis) => {
    const { error: deleteError } = await database.from('tax_reform_answers').delete().eq('analysis_id', analysis.id);
    if (deleteError) throw deleteError;

    const rows = Object.entries(analysis.answers)
      .filter(([, value]) => valueIsPresent(value))
      .map(([key, value]) => ({
        analysis_id: analysis.id,
        question_key: key,
        question_label: key,
        answer_value: value,
        answer_type: answerTypeFromValue(key, value),
        created_at: analysis.createdAt,
        updated_at: analysis.updatedAt,
      }));

    if (!rows.length) return;
    const { error } = await database.from('tax_reform_answers').insert(rows);
    if (error) throw error;
  }));

  if (store.documents.length) {
    const documents = store.documents.map((document) => ({
      id: document.id,
      company_id: document.companyId,
      analysis_id: document.analysisId,
      document_type: document.documentType,
      file_name: document.fileName,
      file_url: document.fileUrl,
      file_size: document.fileSize,
      mime_type: document.mimeType,
      reading_status: document.readingStatus,
      extracted_summary: document.extractedSummary ?? null,
      extraction_error: document.extractionError ?? null,
      uploaded_at: document.uploadedAt,
      updated_at: document.updatedAt,
    }));
    const { error } = await database.from('tax_reform_documents').upsert(documents, { onConflict: 'id' });
    if (error) throw error;
  }

  await Promise.all(store.analyses.map(async (analysis) => {
    const { error } = await database.from('tax_reform_alerts').delete().eq('analysis_id', analysis.id);
    if (error) throw error;
  }));

  if (store.alerts.length) {
    const alerts = store.alerts.map((alert) => ({
      id: alert.id,
      analysis_id: alert.analysisId,
      alert_type: alert.alertType,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      created_at: alert.createdAt,
      updated_at: alert.updatedAt,
    }));
    const { error } = await database.from('tax_reform_alerts').insert(alerts);
    if (error) throw error;
  }
}

const sanitizeFileName = (fileName: string) => fileName
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

export async function uploadTaxReformDocumentFile(companyId: string, analysisId: string, file: File) {
  const fallbackUrl = `local://${file.name}`;

  if (!isSupabaseConfigured) {
    return { fileUrl: fallbackUrl, uploadError: 'Supabase não configurado; metadados salvos localmente.' };
  }

  try {
    const fileId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
    const storagePath = `${companyId}/${analysisId}/${fileId}-${sanitizeFileName(file.name)}`;
    const { error } = await db().storage
      .from(TAX_REFORM_DOCUMENT_BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });

    if (error) throw error;
    return { fileUrl: `storage://${TAX_REFORM_DOCUMENT_BUCKET}/${storagePath}`, uploadError: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload indisponível.';
    console.error('[reforma-tributaria] falha no upload para Storage', { companyId, analysisId, fileName: file.name, message });
    return { fileUrl: fallbackUrl, uploadError: message };
  }
}
