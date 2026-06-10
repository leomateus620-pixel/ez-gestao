/* eslint-disable @typescript-eslint/no-explicit-any */
import { isSupabaseConfigured, supabase } from '@/integrations/supabase/client';
import type {
  AnalysisStatus,
  AnswerMap,
  AnswerValue,
  ConfidenceLevel,
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
  UploadStatus,
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
    confidenceLevel: (row.confidence_level ?? undefined) as ConfidenceLevel | undefined,
    confidenceReason: row.confidence_reason ?? '',
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
    extractedValues: row.extracted_values ?? undefined,
    extractedFindings: row.extracted_findings ?? undefined,
    storageBucket: row.storage_bucket ?? undefined,
    storagePath: row.storage_path ?? undefined,
    uploadStatus: (row.upload_status ?? undefined) as UploadStatus | undefined,
    uploadError: row.upload_error ?? undefined,
    uploadedBy: row.uploaded_by ?? undefined,
    extractionConfidence: row.extraction_confidence !== null && row.extraction_confidence !== undefined ? Number(row.extraction_confidence) : undefined,
    documentConfidenceWeight: row.document_confidence_weight !== null && row.document_confidence_weight !== undefined ? Number(row.document_confidence_weight) : undefined,
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

export async function fetchTaxReformWorkspace(): Promise<TaxReformStore> {
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

export const fetchTaxReformStore = fetchTaxReformWorkspace;

const companyToRow = (company: TaxReformCompany) => ({
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
});

const analysisToRow = (analysis: TaxReformAnalysis) => ({
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
  confidence_level: analysis.confidenceLevel ?? null,
  confidence_reason: analysis.confidenceReason ?? null,
  created_at: analysis.createdAt,
  updated_at: analysis.updatedAt,
});

const documentToRow = (document: TaxReformDocument) => ({
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
  extracted_values: document.extractedValues ?? null,
  extracted_findings: document.extractedFindings ?? null,
  storage_bucket: document.storageBucket ?? null,
  storage_path: document.storagePath ?? null,
  upload_status: document.uploadStatus ?? null,
  upload_error: document.uploadError ?? null,
  uploaded_by: document.uploadedBy ?? null,
  extraction_confidence: document.extractionConfidence ?? null,
  document_confidence_weight: document.documentConfidenceWeight ?? null,
  uploaded_at: document.uploadedAt,
  updated_at: document.updatedAt,
});

const answerToRow = (analysis: TaxReformAnalysis, key: string, value: AnswerValue) => ({
  analysis_id: analysis.id,
  question_key: key,
  question_label: key,
  answer_value: value,
  answer_type: answerTypeFromValue(key, value),
  created_at: analysis.createdAt,
  updated_at: analysis.updatedAt,
});

const alertToRow = (alert: TaxReformAlertRecord) => ({
  id: alert.id,
  analysis_id: alert.analysisId,
  alert_type: alert.alertType,
  severity: alert.severity,
  title: alert.title,
  message: alert.message,
  created_at: alert.createdAt,
  updated_at: alert.updatedAt,
});

export async function upsertTaxReformCompany(company: TaxReformCompany) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado para Reforma Tributária.');
  const { error } = await db().from('tax_reform_companies').upsert(companyToRow(company), { onConflict: 'id' });
  if (error) throw error;
}

export async function createTaxReformAnalysis(analysis: TaxReformAnalysis) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado para Reforma Tributária.');
  const { error } = await db().from('tax_reform_analyses').upsert(analysisToRow(analysis), { onConflict: 'id' });
  if (error) throw error;
}

export async function upsertTaxReformAnswer(analysis: TaxReformAnalysis, questionKey: string, value: AnswerValue) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado para Reforma Tributária.');
  if (!valueIsPresent(value)) {
    const { error } = await db()
      .from('tax_reform_answers')
      .delete()
      .eq('analysis_id', analysis.id)
      .eq('question_key', questionKey);
    if (error) throw error;
    return;
  }
  const { error } = await db()
    .from('tax_reform_answers')
    .upsert(answerToRow(analysis, questionKey, value), { onConflict: 'analysis_id,question_key' });
  if (error) throw error;
}

export async function upsertTaxReformDocument(document: TaxReformDocument) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado para Reforma Tributária.');
  const { error } = await db().from('tax_reform_documents').upsert(documentToRow(document), { onConflict: 'id' });
  if (error) throw error;
}

export async function updateTaxReformAnalysisScore(analysis: TaxReformAnalysis) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado para Reforma Tributária.');
  const { error } = await db()
    .from('tax_reform_analyses')
    .update({
      status: analysis.status,
      score_total: analysis.scoreTotal,
      score_clients: analysis.scoreClients,
      score_costs: analysis.scoreCosts,
      score_current_tax: analysis.scoreCurrentTax,
      risk_level: analysis.riskLevel,
      recommendation: analysis.recommendation,
      automatic_summary: analysis.automaticSummary,
      confidence_level: analysis.confidenceLevel ?? null,
      confidence_reason: analysis.confidenceReason ?? null,
      updated_at: analysis.updatedAt,
    })
    .eq('id', analysis.id);
  if (error) throw error;
}

export async function updateTaxReformManualOpinion(analysisId: string, manualOpinion: string, updatedAt: string) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado para Reforma Tributária.');
  const { error } = await db()
    .from('tax_reform_analyses')
    .update({ manual_opinion: manualOpinion, updated_at: updatedAt })
    .eq('id', analysisId);
  if (error) throw error;
}

export async function updateTaxReformFinalDecision(analysisId: string, finalDecision: FinalDecision, status: AnalysisStatus, updatedAt: string) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado para Reforma Tributária.');
  const { error } = await db()
    .from('tax_reform_analyses')
    .update({ final_decision: finalDecision, status, updated_at: updatedAt })
    .eq('id', analysisId);
  if (error) throw error;
}

export async function upsertTaxReformAlerts(analysisId: string, alerts: TaxReformAlertRecord[]) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado para Reforma Tributária.');
  const expectedTypes = alerts.map((alert) => alert.alertType);

  if (expectedTypes.length) {
    const { error } = await db()
      .from('tax_reform_alerts')
      .delete()
      .eq('analysis_id', analysisId)
      .not('alert_type', 'in', `(${expectedTypes.map((type) => `"${type}"`).join(',')})`);
    if (error) throw error;
  } else {
    const { error } = await db().from('tax_reform_alerts').delete().eq('analysis_id', analysisId);
    if (error) throw error;
    return;
  }

  const { error } = await db()
    .from('tax_reform_alerts')
    .upsert(alerts.map(alertToRow), { onConflict: 'analysis_id,alert_type' });
  if (error) throw error;
}

export async function saveTaxReformStore(store: TaxReformStore) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado para Reforma Tributária.');

  for (const company of store.companies) await upsertTaxReformCompany(company);
  for (const analysis of store.analyses) {
    await createTaxReformAnalysis(analysis);
    await Promise.all(Object.entries(analysis.answers).map(([key, value]) => upsertTaxReformAnswer(analysis, key, value)));
    await updateTaxReformAnalysisScore(analysis);
  }
  await Promise.all(store.documents.map(upsertTaxReformDocument));
  const alertsByAnalysis = new Map<string, TaxReformAlertRecord[]>();
  store.alerts.forEach((alert) => {
    const current = alertsByAnalysis.get(alert.analysisId) ?? [];
    current.push(alert);
    alertsByAnalysis.set(alert.analysisId, current);
  });
  await Promise.all([...alertsByAnalysis.entries()].map(([analysisId, alerts]) => upsertTaxReformAlerts(analysisId, alerts)));
}

const sanitizeFileName = (fileName: string) => fileName
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

export interface TaxReformUploadResult {
  ok: boolean;
  storageBucket?: string;
  storagePath?: string;
  fileUrl?: string;
  uploadedBy?: string;
  error?: string;
}

export async function uploadTaxReformDocumentFile(
  companyId: string,
  analysisId: string,
  file: File,
): Promise<TaxReformUploadResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Lovable Cloud não configurado. Conecte o backend para anexar documentos.' };
  }

  try {
    const fileId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
    const storagePath = `${companyId}/${analysisId}/${fileId}-${sanitizeFileName(file.name)}`;
    const client = db();
    const { error } = await client.storage
      .from(TAX_REFORM_DOCUMENT_BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });

    if (error) throw error;

    let uploadedBy: string | undefined;
    try {
      const { data } = await client.auth.getUser();
      uploadedBy = data?.user?.id ?? undefined;
    } catch (authError) {
      console.warn('[reforma-tributaria] não foi possível identificar uploader', authError);
    }

    return {
      ok: true,
      storageBucket: TAX_REFORM_DOCUMENT_BUCKET,
      storagePath,
      fileUrl: `storage://${TAX_REFORM_DOCUMENT_BUCKET}/${storagePath}`,
      uploadedBy,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no upload para o Storage.';
    console.error('[reforma-tributaria] falha no upload para Storage', { companyId, analysisId, fileName: file.name, message });
    return { ok: false, error: message };
  }
}

export async function getTaxReformDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
  bucket = TAX_REFORM_DOCUMENT_BUCKET,
): Promise<string | null> {
  if (!isSupabaseConfigured || !storagePath) return null;
  try {
    const { data, error } = await db().storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error) throw error;
    return data?.signedUrl ?? null;
  } catch (error) {
    console.error('[reforma-tributaria] falha ao gerar signed URL', { storagePath, error });
    return null;
  }
}


export async function processTaxReformDocument(documentId: string): Promise<TaxReformDocument | null> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase não configurado para processar documentos da Reforma Tributária.');
  }
  const { data, error } = await db().functions.invoke('process-tax-reform-document', {
    body: { document_id: documentId },
  });
  if (error) throw error;
  if (!data?.document) return null;
  return mapDocument(data.document);
}

export async function deleteTaxReformDocument(document: { id: string; storagePath?: string; storageBucket?: string }): Promise<void> {
  if (!isSupabaseConfigured) return;
  const client = db();
  if (document.storagePath) {
    try {
      await client.storage
        .from(document.storageBucket || TAX_REFORM_DOCUMENT_BUCKET)
        .remove([document.storagePath]);
    } catch (error) {
      console.warn('[reforma-tributaria] falha ao remover arquivo do storage', error);
    }
  }
  const { error } = await client.from('tax_reform_documents').delete().eq('id', document.id);
  if (error) throw error;
}
