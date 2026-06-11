import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  Gauge,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import {
  calculateTaxReformScore,
  getCompanyAnalysisHistory,
  getLatestAnalysisForCompany,
  getMissingDocumentTypes,
} from '@/features/tax-reform/rules';
import {
  fetchTaxReformStore,
  saveTaxReformStore,
  uploadTaxReformDocumentFile,
  getTaxReformDocumentSignedUrl,
  processTaxReformDocument,
  deleteTaxReformDocument,
  upsertTaxReformDocument,
  upsertTaxReformAnswer,
} from '@/features/tax-reform/persistence';
import { computeConfidenceLevel, computeConfidenceReasons, confidenceLabels } from '@/features/tax-reform/confidence';
import type {
  AnalysisStatus,
  AnswerMap,
  AnswerValue,
  FinalDecision,
  MainActivity,
  Recommendation,
  RiskLevel,
  TaxReformAlertRecord,
  TaxReformAnalysis,
  TaxReformCompany,
  TaxReformDocument,
  TaxReformStore,
  TaxRegime,
} from '@/features/tax-reform/types';

const STORAGE_KEY = 'ez_tax_reform_workspace_v2';

const regimeLabels: Record<TaxRegime, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
};

const activityLabels: Record<MainActivity, string> = {
  comercio: 'Comércio',
  industria: 'Indústria',
  servicos: 'Serviços',
  misto: 'Misto',
};

const statusLabels: Record<AnalysisStatus, string> = {
  cadastro_iniciado: 'Cadastro iniciado',
  questionario_pendente: 'Questionário pendente',
  aguardando_documentos: 'Aguardando documentos',
  documentos_anexados: 'Documentos anexados',
  analise_concluida: 'Análise concluída',
  necessita_revisao_manual: 'Necessita revisão manual',
};

const riskLabels: Record<RiskLevel, string> = {
  baixo_risco: 'Baixo risco',
  risco_medio: 'Risco médio',
  alto_risco: 'Alto risco',
  dados_insuficientes: 'Dados insuficientes',
};

const recommendationLabels: Record<Recommendation, string> = {
  permanecer_simples: 'Permanecer no Simples Nacional',
  avaliar_lucro_presumido: 'Avaliar migração para Lucro Presumido',
  permanecer_lucro_presumido: 'Permanecer no Lucro Presumido',
  avaliar_simples_nacional: 'Avaliar migração para Simples Nacional',
  analise_manual_necessaria: 'Análise manual necessária',
};

const finalDecisionLabels: Record<FinalDecision, string> = {
  '': 'Sem decisão final',
  permanecer_regime_atual: 'Permanecer no regime atual',
  migrar_para_simples: 'Migrar para Simples Nacional',
  migrar_para_lucro_presumido: 'Migrar para Lucro Presumido',
  rodar_simulacao_detalhada: 'Rodar simulação detalhada',
  coletar_dados_adicionais: 'Coletar dados adicionais',
};

const documentTypeLabels: Record<string, string> = {
  dre: 'DRE',
  balancete: 'Balancete',
  pgdas: 'PGDAS',
  faturamento_cliente: 'Faturamento por cliente',
  fornecedores: 'Relação de fornecedores',
  folha_pagamento: 'Folha de pagamento',
  fluxo_caixa: 'Fluxo de caixa',
  vendas_cfop: 'Relatório por CFOP/natureza',
  nfse: 'NFS-e emitidas',
  outros: 'Outros',
};

const readingStatusLabels: Record<TaxReformDocument['readingStatus'], string> = {
  aguardando_leitura: 'Aguardando leitura',
  lendo: 'Lendo',
  lido: 'Lido',
  erro_leitura: 'Erro na leitura',
  nao_processavel: 'Não processável',
};

const missingDataLabels: Record<string, string> = {
  regime_atual: 'Regime tributário atual',
  atividade_principal: 'Atividade principal',
  sales_b2c_percent: 'Percentual B2C',
  sales_b2b_percent: 'Percentual B2B',
  clients_use_tax_credits: 'Clientes aproveitam créditos',
  inputs_revenue_percent: 'Custo de insumos',
};

const acceptedMimeTypes = '.pdf,.xls,.xlsx,.csv,image/png,image/jpeg,image/webp';
const allowedExtensions = ['pdf', 'xls', 'xlsx', 'csv', 'png', 'jpg', 'jpeg', 'webp'];
const currentYear = new Date().getFullYear();

const newId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const nowIso = () => new Date().toISOString();

const emptyAnalysisScore = {
  scoreTotal: 0,
  scoreClients: 0,
  scoreCosts: 0,
  scoreCurrentTax: 0,
  riskLevel: 'dados_insuficientes' as RiskLevel,
  recommendation: 'analise_manual_necessaria' as Recommendation,
  automaticSummary: 'Análise manual necessária — faltam dados para recomendação segura.',
};

const emptyStore: TaxReformStore = { companies: [], analyses: [], documents: [], alerts: [] };

const seedStore: TaxReformStore = {
  companies: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      companyName: 'Zimmermann Comércio Demonstrativo',
      cnpj: '12.345.678/0001-90',
      currentTaxRegime: 'simples_nacional',
      mainActivity: 'comercio',
      responsibleUser: 'Equipe Fiscal',
      rbt12: 2800000,
      projectedRevenue: 3400000,
      effectiveTaxRate: 9.8,
      notes: 'Empresa demonstrativa para validar a jornada de análise.',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ],
  analyses: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      companyId: '11111111-1111-4111-8111-111111111111',
      analysisYear: currentYear,
      status: 'questionario_pendente',
      answers: {
        sales_b2c_percent: 65,
        sales_b2b_percent: 30,
        sales_government_percent: 5,
        top_clients_over_50: 'nao',
        clients_use_tax_credits: 'nao_sei',
        inputs_revenue_percent: 'nao_sei',
      },
      ...emptyAnalysisScore,
      manualOpinion: '',
      finalDecision: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ],
  documents: [],
  alerts: [],
};

function formatDate(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function normalizeNumber(value: string) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatMoney(value?: number) {
  if (value === undefined || value === null) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatMissingData(key: string) {
  if (key.startsWith('documento:')) {
    const documentType = key.replace('documento:', '');
    return `Documento: ${documentTypeLabels[documentType] ?? documentType}`;
  }
  return missingDataLabels[key] ?? key;
}

function scoreToAnalysisFields(company: TaxReformCompany | undefined, analysis: TaxReformAnalysis, documents: TaxReformDocument[]) {
  if (!company) return { ...emptyAnalysisScore, automaticSummary: 'Empresa não localizada para recalcular a análise.' };
  const score = calculateTaxReformScore(company.currentTaxRegime, analysis.answers, documents, {
    mainActivity: company.mainActivity,
    requireDocuments: true,
    requireMainActivity: true,
  });
  const confidenceLevel = computeConfidenceLevel(documents);
  const confidenceReason = computeConfidenceReasons(documents).join(' ');
  return {
    scoreTotal: score.total,
    scoreClients: score.clients,
    scoreCosts: score.costs,
    scoreCurrentTax: score.currentTax,
    riskLevel: score.riskLevel,
    recommendation: score.recommendation,
    automaticSummary: score.summary,
    confidenceLevel,
    confidenceReason,
  };
}

function withDerivedScores(store: TaxReformStore): TaxReformStore {
  const analyses = store.analyses.map((analysis) => {
    const company = store.companies.find((item) => item.id === analysis.companyId);
    const documents = store.documents.filter((document) => document.analysisId === analysis.id);
    return { ...emptyAnalysisScore, ...analysis, ...scoreToAnalysisFields(company, analysis, documents) };
  });

  const previousAlerts = new Map((store.alerts ?? []).map((alert) => [`${alert.analysisId}:${alert.alertType}`, alert]));
  const alerts: TaxReformAlertRecord[] = analyses.flatMap((analysis) => {
    const company = store.companies.find((item) => item.id === analysis.companyId);
    if (!company) return [];
    const documents = store.documents.filter((document) => document.analysisId === analysis.id);
    const score = calculateTaxReformScore(company.currentTaxRegime, analysis.answers, documents, {
      mainActivity: company.mainActivity,
      requireDocuments: true,
      requireMainActivity: true,
    });
    return score.alerts.map((alert) => {
      const key = `${analysis.id}:${alert.alertType}`;
      const previous = previousAlerts.get(key);
      return {
        id: previous?.id ?? newId(),
        analysisId: analysis.id,
        createdAt: previous?.createdAt ?? analysis.updatedAt,
        updatedAt: analysis.updatedAt,
        ...alert,
      };
    });
  });

  return { ...emptyStore, ...store, analyses, alerts };
}

function loadLocalStore(): TaxReformStore {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return withDerivedScores(seedStore);
  try {
    return withDerivedScores({ ...emptyStore, ...JSON.parse(raw) });
  } catch (error) {
    console.error('[reforma-tributaria] erro ao carregar localStorage', error);
    return withDerivedScores(seedStore);
  }
}

function buildEmptyAnalysis(company: TaxReformCompany, analysisYear: number): TaxReformAnalysis {
  const timestamp = nowIso();
  return {
    id: newId(),
    companyId: company.id,
    analysisYear,
    status: 'questionario_pendente',
    answers: { effective_tax_rate: company.effectiveTaxRate ?? '' },
    ...emptyAnalysisScore,
    manualOpinion: '',
    finalDecision: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function SelectField({ label, value, onChange, options, required = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <NativeSelect value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </NativeSelect>
    </div>
  );
}

function MetricTile({ label, value, caption, icon: Icon, tone = 'blue' }: {
  label: string;
  value: string | number;
  caption: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'violet';
}) {
  const tones = {
    blue: 'from-sky-500/15 text-sky-700 border-sky-200/70',
    green: 'from-emerald-500/15 text-emerald-700 border-emerald-200/70',
    amber: 'from-amber-500/15 text-amber-800 border-amber-200/70',
    red: 'from-rose-500/15 text-rose-700 border-rose-200/70',
    violet: 'from-violet-500/15 text-violet-700 border-violet-200/70',
  };
  return (
    <div className="liquid-stat-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-foreground">{value}</p>
        </div>
        <div className={cn('rounded-2xl border bg-gradient-to-br to-white/40 p-2.5 shadow-inner', tones[tone])}><Icon className="h-4 w-4" /></div>
      </div>
      <p className="mt-2 text-xs font-medium text-foreground">{caption}</p>
    </div>
  );
}

const questionBlocks = [
  {
    title: 'Bloco A — Perfil das vendas',
    questions: [
      { key: 'sales_b2c_percent', label: 'Qual percentual das vendas é para consumidor final — B2C?', type: 'percent' },
      { key: 'sales_b2b_percent', label: 'Qual percentual das vendas é para empresas — B2B?', type: 'percent' },
      { key: 'sales_government_percent', label: 'Qual percentual das vendas é para governo?', type: 'percent' },
      { key: 'top_clients_over_50', label: 'Os 10 maiores clientes representam mais de 50% do faturamento?', type: 'select', options: [['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei']] },
      { key: 'increase_b2b_next_3y', label: 'A empresa pretende aumentar vendas para clientes B2B nos próximos 3 anos?', type: 'select', options: [['sim', 'Sim'], ['nao', 'Não'], ['talvez', 'Talvez']] },
    ],
  },
  {
    title: 'Bloco B — Perfil dos clientes',
    questions: [
      { key: 'b2b_simples_percent', label: 'Entre os clientes B2B, qual percentual está no Simples Nacional?', type: 'percent' },
      { key: 'b2b_lucro_presumido_percent', label: 'Entre os clientes B2B, qual percentual está no Lucro Presumido?', type: 'percent' },
      { key: 'b2b_lucro_real_percent', label: 'Entre os clientes B2B, qual percentual está no Lucro Real?', type: 'percent' },
      { key: 'clients_use_tax_credits', label: 'Os principais clientes aproveitam créditos tributários?', type: 'select', options: [['sim', 'Sim'], ['nao', 'Não'], ['parcialmente', 'Parcialmente'], ['nao_sei', 'Não sei']] },
      { key: 'client_loss_risk', label: 'Existe risco de perda de clientes caso concorrentes gerem mais créditos tributários?', type: 'select', options: [['alto', 'Alto'], ['medio', 'Médio'], ['baixo', 'Baixo'], ['nenhum', 'Nenhum'], ['nao_sei', 'Não sei']] },
      { key: 'sales_profiles', label: 'A empresa vende para quais perfis?', type: 'multi', options: [['grandes_empresas', 'Grandes empresas'], ['industrias', 'Indústrias'], ['redes_franquias', 'Redes/franquias'], ['atacadistas', 'Atacadistas'], ['distribuidores', 'Distribuidores'], ['consumidor_final', 'Consumidor final'], ['governo', 'Governo']] },
    ],
  },
  {
    title: 'Bloco C — Custos, fornecedores e créditos',
    questions: [
      { key: 'inputs_revenue_percent', label: 'O custo com mercadorias, matéria-prima e insumos representa quanto do faturamento?', type: 'select', options: [['ate_20', 'Até 20%'], ['21_40', '21% a 40%'], ['41_60', '41% a 60%'], ['acima_60', 'Acima de 60%'], ['nao_sei', 'Não sei']] },
      { key: 'supplier_regime', label: 'Os fornecedores da empresa são predominantemente de qual regime?', type: 'select', options: [['simples_nacional', 'Simples Nacional'], ['lucro_presumido', 'Lucro Presumido'], ['lucro_real', 'Lucro Real'], ['nao_informado', 'Não informado']] },
      { key: 'credit_potential_items', label: 'A empresa possui potencial relevante de créditos sobre quais itens?', type: 'multi', options: [['mercadorias', 'Mercadorias'], ['materia_prima', 'Matéria-prima'], ['insumos', 'Insumos'], ['energia_eletrica', 'Energia elétrica'], ['fretes', 'Fretes'], ['servicos_contratados', 'Serviços contratados'], ['maquinas_equipamentos', 'Máquinas e equipamentos'], ['tecnologia_softwares', 'Tecnologia e softwares'], ['nenhum_relevante', 'Nenhum relevante'], ['nao_sei', 'Não sei']] },
      { key: 'payroll_revenue_percent', label: 'Qual o percentual aproximado da folha de pagamento sobre o faturamento?', type: 'percent' },
    ],
  },
  {
    title: 'Bloco D — Situação tributária atual',
    questions: [
      { key: 'effective_tax_rate', label: 'Qual a alíquota efetiva atual da empresa?', type: 'percent' },
      { key: 'relevant_operations', label: 'A empresa possui operações relevantes com:', type: 'multi', options: [['produtos_monofasicos', 'Produtos monofásicos'], ['substituicao_tributaria', 'Substituição Tributária'], ['iss_retido', 'ISS retido'], ['exportacao', 'Exportação'], ['nenhuma', 'Nenhuma das anteriores'], ['nao_sei', 'Não sei']] },
      { key: 'near_simples_limit', label: 'A empresa está próxima do limite do Simples Nacional?', type: 'select', options: [['sim', 'Sim'], ['nao', 'Não'], ['nao_se_aplica', 'Não se aplica'], ['nao_sei', 'Não sei']] },
    ],
  },
  {
    title: 'Bloco E — Estratégia empresarial',
    questions: [
      { key: 'business_complexity_acceptance', label: 'A empresa aceita maior complexidade fiscal e contábil se houver economia tributária ou ganho competitivo?', type: 'select', options: [['sim', 'Sim'], ['nao', 'Não'], ['depende_economia', 'Depende da economia'], ['precisa_avaliar', 'Precisa avaliar']] },
      { key: 'partners_main_goal', label: 'Qual o principal objetivo dos sócios?', type: 'select', options: [['reduzir_impostos', 'Reduzir impostos'], ['crescer', 'Crescer'], ['ganhar_mercado', 'Ganhar mercado'], ['manter_simplicidade', 'Manter simplicidade operacional'], ['atrair_grandes_clientes', 'Atrair grandes clientes'], ['melhorar_margem', 'Melhorar margem líquida']] },
    ],
  },
] as const;

const questionLabelByKey = Object.fromEntries(questionBlocks.flatMap((block) => block.questions.map((question) => [question.key, question.label])));
const questionOptionsByKey = Object.fromEntries(questionBlocks.flatMap((block) => block.questions.map((question) => [question.key, 'options' in question ? question.options : []])));

function formatAnswerValue(key: string, value: AnswerValue): string {
  if (Array.isArray(value)) {
    const options = new Map<string, string>((questionOptionsByKey[key] ?? []).map(([optionValue, label]: [string, string]) => [optionValue, label]));
    return value.map((item) => options.get(item) ?? item).join(', ');
  }
  const options = new Map<string, string>((questionOptionsByKey[key] ?? []).map(([optionValue, label]: [string, string]) => [optionValue, label]));
  if (typeof value === 'string') return options.get(value) ?? value;
  if (typeof value === 'number') return `${value}%`;
  return '-';
}

function CompanyForm({ onSave, initial, analysisYear = currentYear, compact = false }: {
  onSave: (company: TaxReformCompany, analysisYear: number) => void;
  initial?: TaxReformCompany;
  analysisYear?: number;
  compact?: boolean;
}) {
  const [form, setForm] = useState({
    companyName: initial?.companyName ?? '',
    cnpj: initial?.cnpj ?? '',
    currentTaxRegime: initial?.currentTaxRegime ?? 'simples_nacional',
    mainActivity: initial?.mainActivity ?? 'comercio',
    responsibleUser: initial?.responsibleUser ?? '',
    analysisYear: String(analysisYear),
    rbt12: initial?.rbt12 ? String(initial.rbt12) : '',
    effectiveTaxRate: initial?.effectiveTaxRate ? String(initial.effectiveTaxRate) : '',
    notes: initial?.notes ?? '',
  });

  useEffect(() => {
    setForm({
      companyName: initial?.companyName ?? '',
      cnpj: initial?.cnpj ?? '',
      currentTaxRegime: initial?.currentTaxRegime ?? 'simples_nacional',
      mainActivity: initial?.mainActivity ?? 'comercio',
      responsibleUser: initial?.responsibleUser ?? '',
      analysisYear: String(analysisYear),
      rbt12: initial?.rbt12 ? String(initial.rbt12) : '',
      effectiveTaxRate: initial?.effectiveTaxRate ? String(initial.effectiveTaxRate) : '',
      notes: initial?.notes ?? '',
    });
  }, [
    analysisYear,
    initial?.id,
    initial?.companyName,
    initial?.cnpj,
    initial?.currentTaxRegime,
    initial?.mainActivity,
    initial?.responsibleUser,
    initial?.rbt12,
    initial?.effectiveTaxRate,
    initial?.notes,
  ]);

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = () => {
    const required = ['companyName', 'cnpj', 'responsibleUser', 'analysisYear'];
    if (required.some((key) => !String(form[key as keyof typeof form]).trim())) {
      toast.error('Preencha os campos obrigatórios da empresa.');
      return;
    }
    if (form.cnpj.replace(/\D/g, '').length !== 14) {
      toast.error('Informe um CNPJ válido com 14 dígitos.');
      return;
    }
    const parsedYear = Number(form.analysisYear);
    if (!Number.isInteger(parsedYear) || parsedYear < 2026 || parsedYear > 2100) {
      toast.error('Ano-base deve estar entre 2026 e 2100.');
      return;
    }

    const effectiveRate = normalizeNumber(form.effectiveTaxRate);
    if (effectiveRate !== undefined && (effectiveRate < 0 || effectiveRate > 100)) {
      toast.error('Alíquota efetiva deve estar entre 0 e 100%.');
      return;
    }

    const timestamp = nowIso();
    onSave({
      id: initial?.id ?? newId(),
      companyName: form.companyName.trim(),
      cnpj: form.cnpj.trim(),
      currentTaxRegime: form.currentTaxRegime as TaxRegime,
      mainActivity: form.mainActivity as MainActivity,
      responsibleUser: form.responsibleUser.trim(),
      rbt12: normalizeNumber(form.rbt12),
      projectedRevenue: initial?.projectedRevenue,
      effectiveTaxRate: effectiveRate,
      notes: form.notes,
      createdAt: initial?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }, parsedYear);
  };

  return (
    <GlassCard className="space-y-4">
      {!compact && <div><h2 className="text-lg font-bold">Cadastrar empresa</h2><p className="text-sm text-foreground">Informe os dados base para abrir uma análise por ano-base.</p></div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2"><Label className="text-[hsl(var(--text-primary))]">Nome da empresa <span className="text-destructive">*</span></Label><Input className="placeholder:text-[hsl(var(--text-secondary))]" value={form.companyName} onChange={(e) => update('companyName', e.target.value)} placeholder="Ex.: Empresa ABC Ltda" /></div>
        <div className="space-y-2"><Label className="text-[hsl(var(--text-primary))]">CNPJ <span className="text-destructive">*</span></Label><Input className="placeholder:text-[hsl(var(--text-secondary))]" value={form.cnpj} onChange={(e) => update('cnpj', e.target.value)} placeholder="00.000.000/0000-00" /></div>
        <SelectField label="Regime tributário atual" required value={form.currentTaxRegime} onChange={(value) => update('currentTaxRegime', value)} options={[{ value: 'simples_nacional', label: 'Simples Nacional' }, { value: 'lucro_presumido', label: 'Lucro Presumido' }]} />
        <SelectField label="Atividade principal" required value={form.mainActivity} onChange={(value) => update('mainActivity', value)} options={[{ value: 'comercio', label: 'Comércio' }, { value: 'industria', label: 'Indústria' }, { value: 'servicos', label: 'Serviços' }, { value: 'misto', label: 'Misto' }]} />
        <div className="space-y-2"><Label className="text-[hsl(var(--text-primary))]">Responsável interno <span className="text-destructive">*</span></Label><Input value={form.responsibleUser} onChange={(e) => update('responsibleUser', e.target.value)} /></div>
        <div className="space-y-2"><Label className="text-[hsl(var(--text-primary))]">Ano-base da análise <span className="text-destructive">*</span></Label><Input type="number" min="2026" max="2100" value={form.analysisYear} onChange={(e) => update('analysisYear', e.target.value)} /></div>
        <div className="space-y-2"><Label className="text-[hsl(var(--text-primary))]">Faturamento últimos 12 meses</Label><Input className="placeholder:text-[hsl(var(--text-secondary))]" value={form.rbt12} onChange={(e) => update('rbt12', e.target.value)} placeholder="R$" /></div>
        <div className="space-y-2"><Label className="text-[hsl(var(--text-primary))]">Alíquota efetiva atual (%)</Label><Input type="text" inputMode="decimal" pattern="[0-9.,]*" placeholder="0,00" className="placeholder:text-[hsl(var(--text-secondary))]" value={form.effectiveTaxRate} onChange={(e) => update('effectiveTaxRate', e.target.value)} /></div>
      </div>
      <div className="space-y-2"><Label className="text-[hsl(var(--text-primary))]">Observações internas</Label><Textarea className="placeholder:text-[hsl(var(--text-secondary))]" value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Contexto, sazonalidade, premissas e pontos de atenção." /></div>
      <div className="flex justify-end"><Button onClick={submit} className="gap-2"><Save className="h-4 w-4" />{initial ? 'Salvar e continuar análise' : 'Cadastrar e abrir análise'}</Button></div>
    </GlassCard>
  );
}

function QuestionRenderer({ question, value, onChange }: {
  question: typeof questionBlocks[number]['questions'][number];
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}) {
  if (question.type === 'percent') {
    return <Input type="number" min="0" max="100" value={(value as number | string) ?? ''} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} placeholder="0%" />;
  }
  if (question.type === 'select') {
    return (
      <NativeSelect value={(value as string) ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecionar</option>
        {question.options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
      </NativeSelect>
    );
  }
  const selected = Array.isArray(value) ? value : [];
  return (
    <div className="flex flex-wrap gap-2">
      {question.options.map(([optionValue, label]) => {
        const active = selected.includes(optionValue);
        return (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(active ? selected.filter((item) => item !== optionValue) : [...selected, optionValue])}
            className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition', active ? 'border-primary bg-primary text-white' : 'border-white/70 bg-white/50 text-foreground hover:bg-white/80')}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Questionnaire({ analysis, onAnswersChange }: { analysis: TaxReformAnalysis; onAnswersChange: (answers: AnswerMap) => void }) {
  const setAnswer = (key: string, value: AnswerValue) => onAnswersChange({ ...analysis.answers, [key]: value });
  return (
    <div className="space-y-4">
      {questionBlocks.map((block) => (
        <GlassCard key={block.title} className="space-y-4">
          <div><h3 className="font-bold">{block.title}</h3><p className="text-xs text-foreground">Respostas são salvas e recalculam score, alertas e recomendação.</p></div>
          <div className="grid gap-4 lg:grid-cols-2">
            {block.questions.map((question) => (
              <div key={question.key} className="rounded-2xl border border-white/60 bg-white/45 p-3 shadow-sm backdrop-blur-xl">
                <Label className="mb-2 block text-sm font-semibold">{question.label}</Label>
                <QuestionRenderer question={question} value={analysis.answers[question.key]} onChange={(value) => setAnswer(question.key, value)} />
              </div>
            ))}
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

function DocumentUpload({ company, analysis, documents, onAddDocuments, onAnalyze, onRemoveDocument }: {
  company: TaxReformCompany;
  analysis: TaxReformAnalysis;
  documents: TaxReformDocument[];
  onAddDocuments: (docs: TaxReformDocument[]) => void;
  onAnalyze: () => void;
  onRemoveDocument: (doc: TaxReformDocument) => void;
}) {
  const [documentType, setDocumentType] = useState('dre');
  const [uploading, setUploading] = useState(false);
  const missing = getMissingDocumentTypes(documents);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    const validDocs: TaxReformDocument[] = [];

    try {
      for (const file of files) {
        const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (!allowedExtensions.includes(extension)) {
          console.error('[reforma-tributaria] upload bloqueado por tipo inválido', file.name);
          toast.error('Tipo de arquivo não aceito', { description: `${file.name} não será anexado.` });
          continue;
        }

        const uploadResult = await uploadTaxReformDocumentFile(company.id, analysis.id, file);
        const timestamp = nowIso();
        if (!uploadResult.ok) {
          toast.error('Falha ao enviar arquivo', { description: `${file.name}: ${uploadResult.error}` });
          validDocs.push({
            id: newId(),
            companyId: company.id,
            analysisId: analysis.id,
            documentType,
            fileName: file.name,
            fileUrl: '',
            fileSize: file.size,
            mimeType: file.type || extension,
            readingStatus: 'erro_leitura',
            extractedSummary: '',
            extractionError: uploadResult.error,
            uploadStatus: 'erro_upload',
            uploadError: uploadResult.error,
            uploadedAt: timestamp,
            updatedAt: timestamp,
          });
          continue;
        }
        const newDoc: TaxReformDocument = {
          id: newId(),
          companyId: company.id,
          analysisId: analysis.id,
          documentType,
          fileName: file.name,
          fileUrl: uploadResult.fileUrl,
          fileSize: file.size,
          mimeType: file.type || extension,
          readingStatus: 'aguardando_leitura',
          extractedSummary: 'Arquivo registrado e aguardando leitura real pelo pipeline de documentos.',
          storageBucket: uploadResult.storageBucket,
          storagePath: uploadResult.storagePath,
          uploadStatus: 'enviado',
          uploadedBy: uploadResult.uploadedBy,
          uploadedAt: timestamp,
          updatedAt: timestamp,
        };
        // Persistir IMEDIATAMENTE no banco para evitar race com o debounce
        // do saveTaxReformStore (sem isso, a Edge Function não encontra a linha
        // e devolve 500 ao clicar em "Analisar documentos" logo após o upload).
        try {
          await upsertTaxReformDocument(newDoc);
        } catch (persistError) {
          const persistMessage = persistError instanceof Error ? persistError.message : 'Falha ao registrar documento no banco.';
          console.error('[reforma-tributaria] falha ao persistir documento após upload', { fileName: file.name, persistMessage });
          toast.error('Falha ao registrar documento', { description: `${file.name}: ${persistMessage}` });
          newDoc.readingStatus = 'erro_leitura';
          newDoc.uploadStatus = 'erro_upload';
          newDoc.uploadError = persistMessage;
          newDoc.extractionError = persistMessage;
        }
        validDocs.push(newDoc);
        console.info('[reforma-tributaria] documento enviado', { companyId: company.id, analysisId: analysis.id, documentType, fileName: file.name, storagePath: uploadResult.storagePath });
      }

      if (validDocs.length) {
        onAddDocuments(validDocs);
        const success = validDocs.filter((doc) => doc.uploadStatus === 'enviado').length;
        if (success) toast.success(`${success} documento(s) anexado(s).`);
      }
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <GlassCard className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div><h3 className="font-bold">Documentos e planilhas</h3><p className="text-sm text-foreground">Arquivos vinculados a {company.companyName} · ano-base {analysis.analysisYear}.</p></div>
        <Button onClick={onAnalyze} variant="outline" className="gap-2" disabled={!documents.length}><FileSpreadsheet className="h-4 w-4" />Analisar documentos</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_1fr]">
        <SelectField label="Tipo do documento" value={documentType} onChange={setDocumentType} options={Object.entries(documentTypeLabels).map(([value, label]) => ({ value, label }))} />
        <div className="space-y-2">
          <Label>Anexar PDF/planilha</Label>
          <label className={cn('flex min-h-10 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-primary/35 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/10', uploading && 'pointer-events-none opacity-60')}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? 'Anexando...' : 'Selecionar arquivos'}
            <input type="file" multiple accept={acceptedMimeTypes} onChange={upload} className="hidden" disabled={uploading} />
          </label>
        </div>
      </div>
      <div className="space-y-2">
        {documents.length === 0 ? <div className="rounded-2xl border border-white/60 bg-white/45 p-4 text-sm text-foreground">Nenhum documento anexado ainda.</div> : documents.map((doc) => (
          <div key={doc.id} className="flex flex-col gap-2 rounded-2xl border border-white/60 bg-white/45 p-3 text-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">{doc.fileName}</p>
              <p className="text-xs text-foreground">{documentTypeLabels[doc.documentType]} · {Math.ceil(doc.fileSize / 1024)} KB · enviado em {formatDate(doc.uploadedAt)}</p>
              {doc.extractedSummary && <p className="mt-1 text-xs text-foreground">{doc.extractedSummary}</p>}
              {doc.extractionError && <p className="mt-1 text-xs text-amber-800">Leitura: {doc.extractionError}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{readingStatusLabels[doc.readingStatus]}</Badge>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remover ${doc.fileName}`}
                onClick={() => {
                  if (window.confirm(`Remover o documento "${doc.fileName}"?`)) onRemoveDocument(doc);
                }}
                className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}


function formatExtractedField(field: string, value: unknown) {
  const labels: Record<string, string> = {
    revenue: 'Receita',
    projectedRevenue: 'Receita projetada',
    grossRevenue12m: 'RBT12',
    effectiveTaxRate: 'Alíquota efetiva',
    taxRegimeDetected: 'Regime detectado',
    b2bPercent: 'B2B',
    b2cPercent: 'B2C',
    governmentPercent: 'Governo',
    top10ClientsConcentration: 'Concentração top 10',
    lucroRealClientsPercent: 'Clientes Lucro Real',
    inputCostPercent: 'Custos/insumos',
    supplierRegimeDetected: 'Regime fornecedores',
    payrollPercent: 'Folha/receita',
    hasSt: 'ST',
    hasMonophasic: 'Monofásico',
    hasIssRetido: 'ISS retido',
    hasExportation: 'Exportação',
    netProfit: 'Lucro líquido',
    grossMargin: 'Margem bruta',
    operatingExpenses: 'Despesas operacionais',
    cnpj: 'CNPJ',
    companyName: 'Empresa',
    period: 'Período',
    monthlyRevenue: 'Receita do PA (mensal)',
    rba: 'RBA (ano corrente)',
    rbaa: 'RBAA (ano anterior)',
    dasTotal: 'DAS total',
    simplesLimitUsagePercent: 'Uso do limite do Simples',
    sublimitUsagePercent: 'Uso do sublimite',
    nearSimplesLimit: 'Próximo do limite do Simples',
    factorRStatus: 'Fator R',
    assetsTotal: 'Ativo total',
    equity: 'Patrimônio líquido',
    afac: 'AFAC',
    grossRevenue: 'Receita bruta (DRE)',
    serviceRevenue: 'Prestação de serviços',
    simplesNacionalExpense: 'Simples Nacional (DRE)',
    netRevenue: 'Receita líquida',
    serviceCosts: 'Custo dos serviços',
    grossProfit: 'Lucro bruto',
    taxExpenses: 'Despesas tributárias',
    annualPayrollFromDre: 'Folha anual (DRE)',
    payrollPercentFromDre: 'Folha/receita (DRE)',
    annualEffectiveTaxRate: 'Alíquota anual (DRE)',
    netMargin: 'Margem líquida',
    employeesCount: 'Empregados',
    salaryTotal: 'Salários',
    inssValue: 'INSS',
    fgtsValue: 'FGTS',
    irrfValue: 'IRRF',
    grossPayroll: 'Folha bruta',
    netPayroll: 'Folha líquida',
    annualizedPayrollPercentByRbt12: 'Folha anualizada/RBT12',
    annualizedPayrollWithChargesPercentByRbt12: 'Folha+encargos anualizada/RBT12',
  };
  const label = labels[field] ?? field;
  if (typeof value === 'boolean') return `${label}: ${value ? 'Sim' : 'Não'}`;
  if (typeof value === 'number') {
    const currencyFields = new Set(['revenue', 'projectedRevenue', 'grossRevenue12m', 'netProfit', 'operatingExpenses',
      'monthlyRevenue', 'rba', 'rbaa', 'dasTotal', 'assetsTotal', 'equity', 'afac', 'grossRevenue', 'serviceRevenue',
      'simplesNacionalExpense', 'netRevenue', 'serviceCosts', 'grossProfit', 'taxExpenses', 'annualPayrollFromDre',
      'salaryTotal', 'inssValue', 'fgtsValue', 'irrfValue', 'grossPayroll', 'netPayroll']);
    if (field === 'employeesCount') return `${label}: ${value}`;
    return `${label}: ${currencyFields.has(field) ? formatMoney(value) : `${value}%`}`;
  }
  if (Array.isArray(value)) return `${label}: ${value.join(', ')}`;
  return `${label}: ${String(value)}`;
}

type ResultMetric = { label: string; value: string; highlight?: boolean };
type QuestionnaireGroup = { title: string; items: { key: string; label: string; fallback?: string }[] };

type AlertGroup = {
  title: string;
  items: { title: string; description: string; severity: 'info' | 'warning' | 'critical' }[];
};

const resultQuestionnaireGroups: QuestionnaireGroup[] = [
  {
    title: 'Perfil das vendas',
    items: [
      { key: 'sales_b2b_percent', label: 'B2B' },
      { key: 'sales_b2c_percent', label: 'B2C' },
      { key: 'sales_government_percent', label: 'Governo' },
      { key: 'top_clients_over_50', label: 'Top 10 clientes' },
    ],
  },
  {
    title: 'Perfil dos clientes',
    items: [
      { key: 'b2b_simples_percent', label: 'Simples' },
      { key: 'b2b_lucro_presumido_percent', label: 'Lucro Presumido' },
      { key: 'b2b_lucro_real_percent', label: 'Lucro Real' },
      { key: 'clients_use_tax_credits', label: 'Uso de créditos' },
      { key: 'client_loss_risk', label: 'Risco de perda' },
    ],
  },
  {
    title: 'Custos e créditos',
    items: [
      { key: 'inputs_revenue_percent', label: 'Insumos' },
      { key: 'supplier_regime', label: 'Fornecedores' },
      { key: 'payroll_revenue_percent', label: 'Folha' },
    ],
  },
  {
    title: 'Situação tributária',
    items: [
      { key: 'effective_tax_rate', label: 'Alíquota efetiva' },
      { key: 'near_simples_limit', label: 'Próxima do limite' },
      { key: 'relevant_operations', label: 'Operações relevantes', fallback: 'Nenhuma' },
    ],
  },
  {
    title: 'Estratégia',
    items: [
      { key: 'business_complexity_acceptance', label: 'Aceita complexidade' },
      { key: 'partners_main_goal', label: 'Objetivo' },
    ],
  },
];

const documentMetricFields: Record<string, ResultMetric[]> = {
  dre: [
    { label: 'Receita bruta', value: 'grossRevenue' },
    { label: 'Receita bruta', value: 'revenue' },
    { label: 'Custos/receita', value: 'inputCostPercent' },
    { label: 'Lucro líquido', value: 'netProfit' },
    { label: 'Folha/receita', value: 'payrollPercentFromDre' },
    { label: 'Folha/receita', value: 'payrollPercent' },
  ],
  balancete: [
    { label: 'Receita bruta', value: 'grossRevenue' },
    { label: 'Ativos totais', value: 'assetsTotal' },
    { label: 'Patrimônio líquido', value: 'equity' },
    { label: 'Fornecedores', value: 'suppliersBalance' },
  ],
  pgdas: [
    { label: 'RBT12', value: 'grossRevenue12m' },
    { label: 'Receita PA', value: 'monthlyRevenue' },
    { label: 'DAS', value: 'dasTotal' },
    { label: 'Alíquota efetiva', value: 'effectiveTaxRate' },
    { label: 'Fator R', value: 'factorRStatus' },
  ],
  folha_pagamento: [
    { label: 'Empregados', value: 'employeesCount' },
    { label: 'Proventos', value: 'grossPayroll' },
    { label: 'INSS', value: 'inssValue' },
    { label: 'FGTS', value: 'fgtsValue' },
    { label: 'Líquido', value: 'netPayroll' },
  ],
  faturamento_cliente: [
    { label: 'B2B', value: 'b2bPercent' },
    { label: 'B2C', value: 'b2cPercent' },
    { label: 'Governo', value: 'governmentPercent' },
    { label: 'Top 10 clientes', value: 'top10ClientsConcentration' },
  ],
  fornecedores: [
    { label: 'Regime detectado', value: 'supplierRegimeDetected' },
    { label: 'Custos/receita', value: 'inputCostPercent' },
  ],
};

const moneyExtractedFields = new Set(['revenue', 'projectedRevenue', 'grossRevenue12m', 'monthlyRevenue', 'dasTotal', 'assetsTotal', 'equity', 'suppliersBalance', 'grossRevenue', 'netProfit', 'grossPayroll', 'inssValue', 'fgtsValue', 'netPayroll']);
const plainNumberExtractedFields = new Set(['employeesCount']);

function hasResultAnswer(value: AnswerValue) {
  return !(value === '' || value === undefined || value === null || (Array.isArray(value) && value.length === 0));
}

function getAnswerSummary(answers: AnswerMap, key: string, fallback = 'Não informado') {
  const value = answers[key];
  return hasResultAnswer(value) ? formatAnswerValue(key, value) : fallback;
}

function formatConfidencePercent(value?: number) {
  if (value === undefined || value === null) return '0%';
  return `${Math.round((value <= 1 ? value * 100 : value))}%`;
}

function feedsScore(doc: TaxReformDocument) {
  if (doc.readingStatus !== 'lido') return false;
  const confidence = doc.extractionConfidence ?? 0;
  const minimumConfidence = doc.documentType === 'folha_pagamento' ? 0.7 : 0.45;
  return confidence >= minimumConfidence;
}

function formatDocumentMetricValue(field: string, value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') {
    if (plainNumberExtractedFields.has(field)) return String(value);
    if (moneyExtractedFields.has(field)) return formatMoney(value);
    return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  }
  if (field === 'factorRStatus') {
    const labels: Record<string, string> = { aplica: 'Aplica', nao_se_aplica: 'Não se aplica', desconhecido: 'Desconhecido' };
    return labels[String(value)] ?? String(value);
  }
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function getDocumentMetrics(doc: TaxReformDocument): ResultMetric[] {
  if (doc.readingStatus !== 'lido') return [];
  const extracted = doc.extractedValues as Record<string, unknown> | undefined;
  if (!extracted) return [];
  const seen = new Set<string>();
  return (documentMetricFields[doc.documentType] ?? [])
    .map((metric) => {
      if (seen.has(metric.label)) return undefined;
      const formatted = formatDocumentMetricValue(metric.value, extracted[metric.value]);
      if (!formatted) return undefined;
      seen.add(metric.label);
      return { label: metric.label, value: formatted };
    })
    .filter((metric): metric is ResultMetric => Boolean(metric));
}

function alertTone(severity: 'info' | 'warning' | 'critical') {
  if (severity === 'critical') return 'border-rose-300 bg-rose-50 text-rose-950';
  if (severity === 'warning') return 'border-amber-300 bg-amber-50 text-amber-950';
  return 'border-sky-200 bg-sky-50 text-sky-950';
}

function badgeTone(kind: 'risk' | 'confidence' | 'status', value: string) {
  if (kind === 'risk') {
    if (value === 'alto_risco') return 'border-rose-300 bg-rose-50 text-rose-800';
    if (value === 'risco_medio') return 'border-orange-300 bg-orange-50 text-orange-800';
    if (value === 'baixo_risco') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
    return 'border-slate-300 bg-slate-50 text-slate-800';
  }
  if (kind === 'confidence') {
    if (value === 'alta') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
    if (value === 'media') return 'border-orange-300 bg-orange-50 text-orange-800';
    return 'border-rose-300 bg-rose-50 text-rose-800';
  }
  return 'border-primary/30 bg-primary/10 text-primary';
}

function ScoreAndRecommendation({ company, analysis, documents }: { company: TaxReformCompany; analysis: TaxReformAnalysis; documents: TaxReformDocument[] }) {
  const score = calculateTaxReformScore(company.currentTaxRegime, analysis.answers, documents, {
    mainActivity: company.mainActivity,
    requireDocuments: true,
    requireMainActivity: true,
  });
  const confidenceLevel = computeConfidenceLevel(documents);
  const confidenceReasons = computeConfidenceReasons(documents);
  const essentialMissing = score.missingRequiredData.filter((key) => !key.startsWith('documento:'));
  const missingDocs = score.missingRequiredData.filter((key) => key.startsWith('documento:'));
  const uploaded = documents.filter((doc) => doc.uploadStatus !== 'erro_upload');
  const failed = documents.filter((doc) => doc.uploadStatus === 'erro_upload');
  const readDocuments = documents.filter((doc) => doc.readingStatus === 'lido');
  const pendingReading = documents.filter((doc) => doc.uploadStatus !== 'erro_upload' && (doc.readingStatus === 'aguardando_leitura' || doc.readingStatus === 'lendo'));
  const readingErrors = documents.filter((doc) => doc.readingStatus === 'erro_leitura' || doc.readingStatus === 'nao_processavel');
  const scoreDocuments = documents.filter(feedsScore);
  const hasCriticalDivergence = score.alerts.some((alert) => alert.alertType === 'document_divergence' && alert.severity === 'critical');
  let analysisStatus: { label: string; tone: string; description: string };
  if (essentialMissing.length > 0) {
    analysisStatus = { label: 'Bloqueada', tone: 'border-rose-200 bg-rose-50 text-rose-900', description: 'Responda as perguntas decisivas para liberar a recomendação confiável.' };
  } else if (score.recommendation === 'analise_manual_necessaria' || hasCriticalDivergence) {
    analysisStatus = { label: 'Revisão manual', tone: 'border-amber-200 bg-amber-50 text-amber-900', description: 'O cenário exige parecer manual do contador antes da decisão final.' };
  } else if (readDocuments.length === 0) {
    analysisStatus = { label: 'Preliminar', tone: 'border-sky-200 bg-sky-50 text-sky-900', description: 'Análise baseada apenas no questionário. A conclusão pode mudar após a leitura dos documentos.' };
  } else if (confidenceLevel === 'alta' && missingDocs.length === 0) {
    analysisStatus = { label: 'Final com documentos', tone: 'border-emerald-200 bg-emerald-50 text-emerald-900', description: 'Perguntas decisivas respondidas e documentos suficientes lidos com sucesso.' };
  } else {
    analysisStatus = { label: 'Parcial', tone: 'border-sky-200 bg-sky-50 text-sky-900', description: pendingReading.length > 0 ? `${pendingReading.length} documento(s) aguardando leitura. Clique em "Analisar documentos" para processar.` : 'Recomendação inicial. Envie mais documentos para subir a confiança.' };
  }

  const alertGroups: AlertGroup[] = [
    {
      title: 'Pendências',
      items: [
        ...readingErrors.map((doc) => ({ title: 'Documento com erro de leitura', description: `${documentTypeLabels[doc.documentType] ?? doc.documentType}: ${doc.extractionError || doc.extractedSummary || 'Nenhum dado deste documento foi usado no score.'}`, severity: 'warning' as const })),
        ...failed.map((doc) => ({ title: 'Erro no upload', description: `${documentTypeLabels[doc.documentType] ?? doc.documentType}: ${doc.uploadError || 'Reenvie o arquivo para análise.'}`, severity: 'critical' as const })),
      ],
    },
    {
      title: 'Riscos',
      items: score.alerts
        .filter((alert) => ['commercial_risk', 'document_divergence', 'likely_simples'].includes(alert.alertType))
        .map((alert) => ({ title: alert.title, description: alert.message, severity: alert.severity })),
    },
    {
      title: 'Validações',
      items: [
        ...essentialMissing.map((key) => ({ title: 'Pergunta decisiva pendente', description: formatMissingData(key), severity: 'critical' as const })),
        ...(scoreDocuments.length === 0 ? [{ title: 'Nenhum documento principal lido com sucesso', description: 'A conclusão permanece preliminar até que documentos válidos alimentem o score.', severity: 'warning' as const }] : []),
        ...score.alerts
          .filter((alert) => ['manual_review', 'document_reading'].includes(alert.alertType))
          .map((alert) => ({ title: alert.title, description: alert.message, severity: alert.severity })),
      ],
    },
  ];

  const openSignedUrl = async (doc: TaxReformDocument) => {
    if (!doc.storagePath) { toast.error('Documento sem storage path. Reenvie o arquivo.'); return; }
    const url = await getTaxReformDocumentSignedUrl(doc.storagePath, 3600, doc.storageBucket);
    if (!url) { toast.error('Não foi possível gerar link temporário.'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="space-y-5">
      <GlassCard className="overflow-hidden border-orange-200/70 bg-gradient-to-br from-orange-50 via-amber-50 to-stone-50 p-0 text-slate-950 shadow-lg shadow-orange-900/5">
        <div className="space-y-5 p-5 md:p-6">
          <div className="grid gap-2 md:grid-cols-4">
            {[
              ['Empresa', company.companyName],
              ['CNPJ', company.cnpj],
              ['Regime', regimeLabels[company.currentTaxRegime]],
              ['Ano-base', analysis.analysisYear],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-orange-200/70 bg-white/70 px-3 py-2 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-800">{label}</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-950">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div className="rounded-3xl border border-orange-200 bg-white/75 p-5 text-center shadow-inner">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-800">Score total</p>
              <div className="mt-2 flex items-end justify-center gap-1 text-primary">
                <span className="text-6xl font-black leading-none tracking-tight md:text-7xl">{score.total}</span>
                <span className="pb-2 text-2xl font-black">/100</span>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-800">
                <div className="flex justify-between gap-3"><span>Perfil dos clientes</span><b>{score.clients}/60</b></div>
                <Progress value={(score.clients / 60) * 100} />
                <div className="flex justify-between gap-3"><span>Custos e créditos</span><b>{score.costs}/25</b></div>
                <Progress value={(score.costs / 25) * 100} />
                <div className="flex justify-between gap-3"><span>Situação atual</span><b>{score.currentTax}/15</b></div>
                <Progress value={(score.currentTax / 15) * 100} />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <span className={cn('rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em]', badgeTone('risk', score.riskLevel))}>Risco: {riskLabels[score.riskLevel]}</span>
                <span className={cn('rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em]', badgeTone('confidence', confidenceLevel))}>Confiança: {confidenceLabels[confidenceLevel]}</span>
                <span className={cn('rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em]', badgeTone('status', analysisStatus.label))}>Status: {analysisStatus.label}</span>
              </div>

              <div className="rounded-3xl border border-primary/25 bg-primary/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Recomendação automática</p>
                <h3 className="mt-2 text-2xl font-black leading-tight text-slate-950">{recommendationLabels[score.recommendation]}</h3>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800">{score.summary}</p>
              </div>

              <div className={cn('rounded-2xl border p-3 text-sm font-medium', analysisStatus.tone)}>
                <b>Status da análise:</b> {analysisStatus.description}
                {confidenceReasons.length > 0 && <p className="mt-1 text-xs">{confidenceReasons.join(' ')}</p>}
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4 border-orange-100/80 bg-stone-50/90 text-slate-950">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-800">Base da análise</p>
            <h3 className="text-2xl font-black text-slate-950">Evidências e informações complementares</h3>
          </div>
          <p className="text-sm font-semibold text-slate-700">{score.answeredRequired} perguntas obrigatórias · {uploaded.length} documentos enviados · {scoreDocuments.length} alimentando score</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-orange-200/70 bg-white/75 p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h4 className="text-lg font-black text-slate-950">Questionário</h4>
              <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-800">Resumo respondido</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {resultQuestionnaireGroups.map((group) => (
                <div key={group.title} className="rounded-2xl border border-stone-200 bg-stone-50/90 p-3">
                  <h5 className="text-sm font-black text-slate-950">{group.title}</h5>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {group.items.map((item) => (
                      <div key={item.key} className="rounded-xl border border-orange-100 bg-white/85 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">{item.label}</p>
                        <p className="mt-1 text-sm font-bold text-slate-950">{getAnswerSummary(analysis.answers, item.key, item.fallback)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-orange-200/70 bg-white/75 p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h4 className="text-lg font-black text-slate-950">Documentos</h4>
                <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-800">{documents.length || 'Nenhum'} anexado(s)</Badge>
              </div>
              {documents.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-orange-300 bg-orange-50/70 p-4 text-sm font-semibold text-orange-900">Nenhum documento anexado. O resultado está baseado apenas nas respostas do questionário.</p>
              ) : (
                <div className="grid gap-3">
                  {documents.map((doc) => {
                    const canFeedScore = feedsScore(doc);
                    const hasReadingError = doc.readingStatus === 'erro_leitura' || doc.readingStatus === 'nao_processavel';
                    const metrics = getDocumentMetrics(doc);
                    const errorReason = doc.extractionError || doc.extractedSummary || 'Leitura falhou. Nenhum dado deste documento foi usado no score.';
                    return (
                      <article key={doc.id} className="rounded-2xl border border-stone-200 bg-stone-50/95 p-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h5 className="font-black text-slate-950">{documentTypeLabels[doc.documentType] ?? doc.documentType}</h5>
                            <p className="mt-0.5 max-w-sm truncate text-xs font-medium text-slate-600">{doc.fileName}</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" className={cn(hasReadingError ? 'border-rose-300 bg-rose-50 text-rose-800' : doc.readingStatus === 'lido' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-sky-300 bg-sky-50 text-sky-800')}>{readingStatusLabels[doc.readingStatus]}</Badge>
                            <Badge variant="outline" className="border-slate-300 bg-white text-slate-800">Confiança {formatConfidencePercent(doc.extractionConfidence)}</Badge>
                            <Badge variant="outline" className={canFeedScore ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}>Alimenta score: {canFeedScore ? 'Sim' : 'Não'}</Badge>
                          </div>
                        </div>

                        {hasReadingError ? (
                          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950">
                            <b>Motivo:</b> {errorReason}
                          </div>
                        ) : metrics.length > 0 ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {metrics.map((metric) => (
                              <div key={`${doc.id}-${metric.label}`} className="rounded-xl border border-orange-100 bg-white px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">{metric.label}</p>
                                <p className="mt-1 text-sm font-black text-slate-950">{metric.value}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-950">{doc.extractedSummary || (doc.readingStatus === 'lido' ? 'Documento lido, mas sem métricas principais para exibir.' : 'Documento aguardando processamento de leitura.')}</p>
                        )}

                        <div className="mt-3 flex justify-end">
                          <Button type="button" size="sm" variant="outline" onClick={() => openSignedUrl(doc)} disabled={!doc.storagePath} className="gap-2 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20">
                            <FileText className="h-4 w-4" />Abrir documento
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-orange-200/70 bg-white/75 p-4 shadow-sm">
              <h4 className="text-lg font-black text-slate-950">Alertas e pendências</h4>
              <div className="mt-3 space-y-3">
                {alertGroups.map((group) => (
                  <div key={group.title} className="rounded-2xl border border-stone-200 bg-stone-50/90 p-3">
                    <h5 className="text-sm font-black text-slate-950">{group.title}</h5>
                    {group.items.length === 0 ? (
                      <p className="mt-2 text-sm font-semibold text-slate-600">Nenhum item neste grupo.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {group.items.map((item, index) => (
                          <div key={`${group.title}-${item.title}-${index}`} className={cn('flex gap-2 rounded-xl border p-3 text-sm', alertTone(item.severity))}>
                            {item.severity === 'critical' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : item.severity === 'warning' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                            <div><b>{item.title}</b><p className="mt-0.5 leading-relaxed">{item.description}</p></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4 border-orange-100/80 bg-gradient-to-br from-stone-50 to-orange-50/80 text-slate-950">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-800">Fechamento da análise</p>
          <h3 className="text-2xl font-black text-slate-950">Resultado final, parecer e próximos passos</h3>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-primary/25 bg-white/80 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Resultado final</p>
            <h4 className="mt-2 text-xl font-black text-slate-950">{recommendationLabels[score.recommendation]}</h4>
            <p className="mt-3 text-sm font-black text-slate-900">Justificativa:</p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-slate-800">{score.summary}</p>
          </div>
          <div className="rounded-3xl border border-stone-200 bg-white/80 p-4">
            <div className="space-y-3 text-sm text-slate-800">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">Parecer manual</p>
                <p className="mt-1 font-bold text-slate-950">{analysis.manualOpinion?.trim() ? analysis.manualOpinion : 'Pendente'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">Decisão final</p>
                <p className="mt-1 font-bold text-slate-950">{finalDecisionLabels[analysis.finalDecision]}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">Próximos passos</p>
                <p className="mt-1 font-bold text-slate-950">{analysis.finalDecision ? 'Executar a decisão registrada e arquivar evidências da análise.' : 'Registrar parecer manual e confirmar a decisão final com o responsável técnico.'}</p>
              </div>
            </div>
          </div>
        </div>
        {analysisStatus.label === 'Preliminar' && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">
            Esta análise é preliminar e não substitui parecer técnico.
          </div>
        )}
      </GlassCard>
    </section>
  );
}

function ManualOpinion({ analysis, onChange }: { analysis: TaxReformAnalysis; onChange: (patch: Partial<TaxReformAnalysis>) => void }) {
  return (
    <GlassCard className="space-y-4">
      <div><h3 className="font-bold">Parecer manual do contador</h3><p className="text-sm text-foreground">Complemente ou ajuste a conclusão automática antes da decisão final.</p></div>
      <div className="space-y-2"><Label>Parecer manual</Label><Textarea value={analysis.manualOpinion} onChange={(event) => onChange({ manualOpinion: event.target.value })} placeholder="Registre premissas, riscos, documentos analisados e próximos passos." className="min-h-32" /></div>
      <SelectField label="Decisão final" value={analysis.finalDecision} onChange={(value) => onChange({ finalDecision: value as FinalDecision })} options={Object.entries(finalDecisionLabels).map(([value, label]) => ({ value, label }))} />
    </GlassCard>
  );
}

function AnalysisReport({ company, analysis, documents }: { company: TaxReformCompany; analysis: TaxReformAnalysis; documents: TaxReformDocument[] }) {
  const score = calculateTaxReformScore(company.currentTaxRegime, analysis.answers, documents, {
    mainActivity: company.mainActivity,
    requireDocuments: true,
    requireMainActivity: true,
  });
  const answered = Object.entries(analysis.answers).filter(([, value]) => value !== '' && value !== undefined && value !== null);
  return (
    <section className="hidden print:block">
      <div className="mb-5 border-b border-slate-300 pb-4">
        <h1 className="text-2xl font-black">Relatório da análise — Reforma Tributária</h1>
        <p className="text-sm">Gerado em {formatDateTime(nowIso())}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="glass-card p-4"><h2 className="font-bold">Empresa</h2><p>{company.companyName}</p><p>{company.cnpj}</p><p>{regimeLabels[company.currentTaxRegime]} · {activityLabels[company.mainActivity]}</p><p>Ano-base {analysis.analysisYear}</p></div>
        <div className="glass-card p-4"><h2 className="font-bold">Resultado</h2><p>Score: {score.total}/100</p><p>Classificação: {riskLabels[score.riskLevel]}</p><p>Recomendação: {recommendationLabels[score.recommendation]}</p><p>Status: {statusLabels[analysis.status]}</p></div>
      </div>
      <div className="glass-card mt-4 p-4"><h2 className="font-bold">Justificativa automática</h2><p>{score.summary}</p></div>
      <div className="glass-card mt-4 p-4"><h2 className="font-bold">Respostas principais</h2>{answered.length === 0 ? <p>Nenhuma resposta registrada.</p> : answered.map(([key, value]) => <p key={key}><b>{questionLabelByKey[key] ?? key}:</b> {formatAnswerValue(key, value)}</p>)}</div>
      <div className="glass-card mt-4 p-4"><h2 className="font-bold">Documentos anexados</h2>{documents.length === 0 ? <p>Nenhum documento anexado.</p> : documents.map((doc) => <p key={doc.id}>{documentTypeLabels[doc.documentType]} · {doc.fileName} · {readingStatusLabels[doc.readingStatus]}</p>)}</div>
      <div className="glass-card mt-4 p-4"><h2 className="font-bold">Alertas</h2>{score.alerts.length === 0 ? <p>Sem alertas.</p> : score.alerts.map((alert) => <p key={alert.alertType}><b>{alert.title}:</b> {alert.message}</p>)}</div>
      <div className="glass-card mt-4 p-4"><h2 className="font-bold">Parecer e decisão</h2><p><b>Parecer manual:</b> {analysis.manualOpinion || '-'}</p><p><b>Decisão final:</b> {finalDecisionLabels[analysis.finalDecision]}</p></div>
    </section>
  );
}

function HistoryPanel({ store, openAnalysis }: { store: TaxReformStore; openAnalysis: (analysisId: string, targetStep?: WizardStep) => void }) {
  const rows = store.companies.flatMap((company) => getCompanyAnalysisHistory(company.id, store.analyses).map((analysis) => ({ company, analysis })));
  return (
    <GlassCard className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h3 className="font-bold">Histórico de análises</h3><Badge variant="outline">{rows.length} análises</Badge></div>
      {rows.length === 0 ? <p className="text-sm text-foreground">Nenhum histórico registrado ainda.</p> : rows.slice(0, 8).map(({ analysis, company }) => (
        <button key={analysis.id} type="button" onClick={() => openAnalysis(analysis.id, 'resultado')} className="w-full rounded-2xl border border-white/60 bg-white/45 p-3 text-left text-sm transition hover:bg-white/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b>{company.companyName}</b>
            <Badge variant="outline">Ano-base {analysis.analysisYear}</Badge>
          </div>
          <p className="mt-1 text-foreground">Score {analysis.scoreTotal}/100 · {recommendationLabels[analysis.recommendation]} · {statusLabels[analysis.status]}</p>
          <p className="mt-1 text-xs text-foreground">Atualizado em {formatDate(analysis.updatedAt)} · Decisão: {finalDecisionLabels[analysis.finalDecision]}</p>
        </button>
      ))}
    </GlassCard>
  );
}

function DashboardList({ store, openAnalysis, startNewAnalysis }: {
  store: TaxReformStore;
  openAnalysis: (analysisId: string, targetStep?: WizardStep) => void;
  startNewAnalysis: (companyId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [regimeFilter, setRegimeFilter] = useState('todos');
  const [recommendationFilter, setRecommendationFilter] = useState('todos');

  const rows = useMemo(() => store.companies.map((company) => {
    const analysis = getLatestAnalysisForCompany(company.id, store.analyses);
    const docs = analysis ? store.documents.filter((doc) => doc.analysisId === analysis.id) : [];
    const score = analysis ? calculateTaxReformScore(company.currentTaxRegime, analysis.answers, docs, {
      mainActivity: company.mainActivity,
      requireDocuments: true,
      requireMainActivity: true,
    }) : undefined;
    return { company, analysis, score };
  }).filter(({ company, analysis, score }) => {
    const normalizedSearch = search.trim().toLowerCase();
    const matchesSearch = !normalizedSearch || `${company.companyName} ${company.cnpj}`.toLowerCase().includes(normalizedSearch);
    const matchesStatus = statusFilter === 'todos' || (analysis?.status ?? 'cadastro_iniciado') === statusFilter;
    const matchesRegime = regimeFilter === 'todos' || company.currentTaxRegime === regimeFilter;
    const matchesRecommendation = recommendationFilter === 'todos'
      || (recommendationFilter === 'permanecer' && score && ['permanecer_simples', 'permanecer_lucro_presumido'].includes(score.recommendation))
      || (recommendationFilter === 'trocar' && score && ['avaliar_lucro_presumido', 'avaliar_simples_nacional'].includes(score.recommendation))
      || (recommendationFilter === 'manual' && score?.recommendation === 'analise_manual_necessaria');
    return matchesSearch && matchesStatus && matchesRegime && matchesRecommendation;
  }), [recommendationFilter, regimeFilter, search, statusFilter, store]);

  return (
    <GlassCard className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><h2 className="font-bold">Empresas cadastradas</h2><p className="text-sm text-foreground">Abra, edite ou continue a última análise da empresa.</p></div>
        <Badge variant="outline">{rows.length} registros</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.9fr]">
        <div className="space-y-2"><Label>Buscar</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Empresa ou CNPJ" /></div></div>
        <SelectField label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'todos', label: 'Todos' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} />
        <SelectField label="Regime" value={regimeFilter} onChange={setRegimeFilter} options={[{ value: 'todos', label: 'Todos' }, { value: 'simples_nacional', label: 'Simples Nacional' }, { value: 'lucro_presumido', label: 'Lucro Presumido' }]} />
        <SelectField label="Recomendação" value={recommendationFilter} onChange={setRecommendationFilter} options={[{ value: 'todos', label: 'Todas' }, { value: 'permanecer', label: 'Permanecer' }, { value: 'trocar', label: 'Avaliar troca' }, { value: 'manual', label: 'Manual necessária' }]} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-foreground"><tr><th className="p-3">Empresa</th><th className="p-3">CNPJ</th><th className="p-3">Regime</th><th className="p-3">Ano-base</th><th className="p-3">Status</th><th className="p-3">Score</th><th className="p-3">Recomendação</th><th className="p-3">Última análise</th><th className="p-3" /></tr></thead>
          <tbody>
            {rows.map(({ company, analysis, score }) => (
              <tr key={company.id} className="border-t border-white/50">
                <td className="p-3 font-semibold">{company.companyName}</td>
                <td className="p-3">{company.cnpj}</td>
                <td className="p-3">{regimeLabels[company.currentTaxRegime]}</td>
                <td className="p-3">{analysis?.analysisYear ?? '-'}</td>
                <td className="p-3"><Badge variant="outline">{analysis ? statusLabels[analysis.status] : 'Cadastro iniciado'}</Badge></td>
                <td className="p-3 font-bold">{score?.total ?? 0}</td>
                <td className="p-3">{score ? recommendationLabels[score.recommendation] : '-'}</td>
                <td className="p-3">{formatDate(analysis?.updatedAt ?? company.updatedAt)}</td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {analysis && <Button size="sm" onClick={() => openAnalysis(analysis.id, 'questionario')}>Continuar</Button>}
                    {analysis && <Button size="sm" variant="outline" onClick={() => openAnalysis(analysis.id, 'empresa')}><Pencil className="mr-1 h-3 w-3" />Editar</Button>}
                    <Button size="sm" variant="outline" onClick={() => startNewAnalysis(company.id)}><Plus className="mr-1 h-3 w-3" />Nova análise</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

const wizardSteps = [
  { id: 'empresa', label: 'Dados da empresa', icon: Building2 },
  { id: 'questionario', label: 'Questionário', icon: ClipboardList },
  { id: 'documentos', label: 'Documentos', icon: Upload },
  { id: 'resultado', label: 'Resultado', icon: Gauge },
  { id: 'parecer', label: 'Parecer manual', icon: FileText },
] as const;

type WizardStep = typeof wizardSteps[number]['id'];

export default function ReformaTributaria() {
  const [store, setStore] = useState<TaxReformStore>(() => (isSupabaseConfigured ? emptyStore : loadLocalStore()));
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [step, setStep] = useState<WizardStep>('empresa');
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [remotePersistenceEnabled, setRemotePersistenceEnabled] = useState(false);
  const lastSavedHashRef = useRef<string>('');
  const previousAnswersRef = useRef<Map<string, AnswerMap>>(new Map());
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTaxReformStore()
      .then((remoteStore) => {
        if (cancelled) return;
        const derived = withDerivedScores(remoteStore);
        setStore(derived);
        setRemotePersistenceEnabled(true);
        // Snapshot inicial: evita re-save imediato e habilita diff de respostas removidas.
        lastSavedHashRef.current = JSON.stringify(derived);
        const map = new Map<string, AnswerMap>();
        derived.analyses.forEach((a) => map.set(a.id, { ...a.answers }));
        previousAnswersRef.current = map;
        console.info('[reforma-tributaria] fetch carregado', {
          analyses: derived.analyses.length,
          answersTotal: derived.analyses.reduce((acc, a) => acc + Object.keys(a.answers).length, 0),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('[reforma-tributaria] backend indisponível', error);
        // Fallback offline: usa snapshot local apenas quando o backend falhar.
        setStore(loadLocalStore());
        setRemotePersistenceEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setPersistenceReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const next = withDerivedScores(store);
    if (JSON.stringify(next.analyses) !== JSON.stringify(store.analyses) || JSON.stringify(next.alerts) !== JSON.stringify(store.alerts)) {
      setStore(next);
    }
  }, [store]);

  useEffect(() => {
    if (!persistenceReady) return undefined;
    // Só grava localStorage depois do fetch remoto resolver — evita envenenar o cache
    // com o seed antigo antes do Cloud responder.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    if (!isSupabaseConfigured || !remotePersistenceEnabled) return undefined;

    const derived = withDerivedScores(store);
    const hash = JSON.stringify(derived);
    if (hash === lastSavedHashRef.current) return undefined;

    const previousAnswers = new Map(previousAnswersRef.current);
    const doSave = async () => {
      try {
        await saveTaxReformStore(derived);
        // Diff: apaga respostas que existiam antes e foram removidas/limpas.
        for (const analysis of derived.analyses) {
          const prev = previousAnswers.get(analysis.id);
          if (!prev) continue;
          for (const key of Object.keys(prev)) {
            if (!(key in analysis.answers)) {
              try { await upsertTaxReformAnswer(analysis, key, ''); } catch (e) {
                console.warn('[reforma-tributaria] falha ao apagar resposta removida', key, e);
              }
            }
          }
        }
        lastSavedHashRef.current = hash;
        const nextMap = new Map<string, AnswerMap>();
        derived.analyses.forEach((a) => nextMap.set(a.id, { ...a.answers }));
        previousAnswersRef.current = nextMap;
      } catch (error) {
        console.error('[reforma-tributaria] falha ao persistir alterações', error);
        setRemotePersistenceEnabled(false);
        toast.error('Não foi possível salvar agora. Tente novamente em instantes.');
      }
    };
    pendingSaveRef.current = doSave;

    const handle = window.setTimeout(() => {
      pendingSaveRef.current = null;
      void doSave();
    }, 700);

    return () => window.clearTimeout(handle);
  }, [persistenceReady, remotePersistenceEnabled, store]);

  // Flush em reload/navegação: garante que a última alteração não fique presa no debounce.
  useEffect(() => {
    const flush = () => {
      const pending = pendingSaveRef.current;
      if (pending) {
        pendingSaveRef.current = null;
        void pending();
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const selectedAnalysis = selectedAnalysisId ? store.analyses.find((analysis) => analysis.id === selectedAnalysisId) ?? null : null;
  const selectedCompany = selectedAnalysis ? store.companies.find((company) => company.id === selectedAnalysis.companyId) ?? null : null;
  const selectedDocuments = selectedAnalysis ? store.documents.filter((doc) => doc.analysisId === selectedAnalysis.id) : [];

  const stats = useMemo(() => ({
    total: store.companies.length,
    simples: store.companies.filter((company) => company.currentTaxRegime === 'simples_nacional').length,
    presumido: store.companies.filter((company) => company.currentTaxRegime === 'lucro_presumido').length,
    incomplete: store.analyses.filter((analysis) => analysis.status !== 'analise_concluida').length,
    completed: store.analyses.filter((analysis) => analysis.status === 'analise_concluida').length,
    stay: store.analyses.filter((analysis) => ['permanecer_simples', 'permanecer_lucro_presumido'].includes(analysis.recommendation)).length,
    switchRegime: store.analyses.filter((analysis) => ['avaliar_lucro_presumido', 'avaliar_simples_nacional'].includes(analysis.recommendation)).length,
    manual: store.analyses.filter((analysis) => analysis.recommendation === 'analise_manual_necessaria').length,
  }), [store]);

  const upsertCompany = (company: TaxReformCompany, analysisYear: number) => {
    let openedAnalysisId = selectedAnalysisId;
    setStore((prev) => {
      const timestamp = nowIso();
      const exists = prev.companies.some((item) => item.id === company.id);
      const companies = exists
        ? prev.companies.map((item) => item.id === company.id ? { ...company, updatedAt: timestamp } : item)
        : [{ ...company, createdAt: company.createdAt || timestamp, updatedAt: timestamp }, ...prev.companies];

      const selectedBelongsToCompany = openedAnalysisId && prev.analyses.some((analysis) => analysis.id === openedAnalysisId && analysis.companyId === company.id);
      if (selectedBelongsToCompany) {
        return {
          ...prev,
          companies,
          analyses: prev.analyses.map((analysis) => analysis.id === openedAnalysisId
            ? { ...analysis, analysisYear, answers: { ...analysis.answers, effective_tax_rate: company.effectiveTaxRate ?? analysis.answers.effective_tax_rate ?? '' }, updatedAt: timestamp }
            : analysis),
        };
      }

      const nextAnalysis = buildEmptyAnalysis(company, analysisYear);
      openedAnalysisId = nextAnalysis.id;
      return { ...prev, companies, analyses: [nextAnalysis, ...prev.analyses] };
    });
    setSelectedAnalysisId(openedAnalysisId);
    setStep('questionario');
    toast.success('Empresa salva e análise aberta.');
  };

  const startNewAnalysis = (companyId: string) => {
    const company = store.companies.find((item) => item.id === companyId);
    if (!company) return;
    const analysis = buildEmptyAnalysis(company, currentYear);
    setStore((prev) => ({ ...prev, analyses: [analysis, ...prev.analyses] }));
    setSelectedAnalysisId(analysis.id);
    setStep('questionario');
    toast.success('Nova análise criada sem sobrescrever o histórico.');
  };

  const updateAnalysis = (analysisId: string, patch: Partial<TaxReformAnalysis>) => {
    setStore((prev) => ({ ...prev, analyses: prev.analyses.map((analysis) => analysis.id === analysisId ? { ...analysis, ...patch, updatedAt: nowIso() } : analysis) }));
  };

  const setStatusForCurrent = (targetStep: WizardStep, analysis = selectedAnalysis) => {
    if (!analysis || !selectedCompany) return;
    const score = calculateTaxReformScore(selectedCompany.currentTaxRegime, analysis.answers, selectedDocuments, {
      mainActivity: selectedCompany.mainActivity,
      requireDocuments: true,
      requireMainActivity: true,
    });
    const statusByStep: Record<WizardStep, AnalysisStatus> = {
      empresa: 'cadastro_iniciado',
      questionario: 'questionario_pendente',
      documentos: selectedDocuments.length ? 'documentos_anexados' : 'aguardando_documentos',
      resultado: score.insufficientData ? 'necessita_revisao_manual' : 'analise_concluida',
      parecer: analysis.finalDecision || analysis.manualOpinion ? 'analise_concluida' : 'necessita_revisao_manual',
    };
    updateAnalysis(analysis.id, { status: statusByStep[targetStep] });
  };

  const navigateStep = (direction: 1 | -1) => {
    const index = wizardSteps.findIndex((item) => item.id === step);
    const next = wizardSteps[Math.max(0, Math.min(wizardSteps.length - 1, index + direction))].id;
    setStep(next);
    setStatusForCurrent(next);
  };

  const analyzeDocuments = async () => {
    if (!selectedAnalysis) return;
    const processableDocuments = selectedDocuments.filter((doc) => doc.uploadStatus !== 'erro_upload' && doc.storagePath && doc.readingStatus !== 'lido');
    if (!processableDocuments.length) {
      toast.info('Nenhum documento pendente de leitura.');
      return;
    }

    setStore((prev) => ({
      ...prev,
      documents: prev.documents.map((doc) => processableDocuments.some((pending) => pending.id === doc.id) ? {
        ...doc,
        readingStatus: 'lendo',
        extractionError: '',
        updatedAt: nowIso(),
      } : doc),
    }));

    const processed: TaxReformDocument[] = [];
    let failures = 0;
    let nonProcessable = 0;
    for (const doc of processableDocuments) {
      try {
        // Garante a linha no banco antes da Edge Function tentar lê-la.
        try {
          await upsertTaxReformDocument(doc);
        } catch (syncError) {
          console.warn('[reforma-tributaria] pré-sync do documento falhou; tentando processar mesmo assim', syncError);
        }
        let updated: TaxReformDocument | null = null;
        try {
          updated = await processTaxReformDocument(doc.id);
        } catch (firstError) {
          const msg = firstError instanceof Error ? firstError.message : String(firstError);
          if (/n[aã]o encontrado|not found|no rows|404/i.test(msg)) {
            // Race: aguarda e re-tenta uma vez após reconfirmar persistência.
            await new Promise((resolve) => setTimeout(resolve, 1200));
            await upsertTaxReformDocument(doc);
            updated = await processTaxReformDocument(doc.id);
          } else {
            throw firstError;
          }
        }
        if (updated) {
          processed.push(updated);
          if (updated.readingStatus === 'nao_processavel') nonProcessable += 1;
        }
      } catch (error) {
        failures += 1;
        const message = error instanceof Error ? error.message : 'Falha ao chamar o processador real.';
        setStore((prev) => ({
          ...prev,
          documents: prev.documents.map((item) => item.id === doc.id ? {
            ...item,
            readingStatus: 'erro_leitura',
            extractionError: message,
            extractedSummary: 'Erro real ao executar a leitura do documento.',
            extractionConfidence: 0,
            updatedAt: nowIso(),
          } : item),
        }));
      }
    }

    if (processed.length) {
      setStore((prev) => ({
        ...prev,
        documents: prev.documents.map((doc) => processed.find((updated) => updated.id === doc.id) ?? doc),
      }));
      const ok = processed.length - nonProcessable;
      if (ok > 0) toast.success(`${ok} documento(s) processado(s) com leitura real.`);
      if (nonProcessable > 0) toast.info(`${nonProcessable} documento(s) marcado(s) como não processáveis (ex.: imagem/escaneado).`);
    }
    if (failures) toast.error(`${failures} documento(s) não puderam ser lidos.`);
  };

  const removeDocument = async (doc: TaxReformDocument) => {
    setStore((prev) => ({
      ...prev,
      documents: prev.documents.filter((item) => item.id !== doc.id),
    }));
    if (doc.uploadStatus === 'enviado') {
      try {
        await deleteTaxReformDocument({ id: doc.id, storagePath: doc.storagePath, storageBucket: doc.storageBucket });
      } catch (error) {
        console.error('[reforma-tributaria] falha ao remover documento', error);
        toast.error('Não foi possível remover o documento agora.');
        return;
      }
    }
    toast.success('Documento removido.');
  };

  const generateReport = () => {
    if (!selectedCompany || !selectedAnalysis) return;
    window.setTimeout(() => window.print(), 150);
    toast.success('Relatório preparado para impressão/PDF.');
  };

  const openAnalysis = (analysisId: string, targetStep: WizardStep = 'empresa') => {
    setSelectedAnalysisId(analysisId);
    setStep(targetStep);
  };

  if (selectedCompany && selectedAnalysis) {
    const currentIndex = wizardSteps.findIndex((item) => item.id === step);
    return (
      <div className="tax-reform-readable space-y-5 print:space-y-0">
        <AnalysisReport company={selectedCompany} analysis={selectedAnalysis} documents={selectedDocuments} />
        <div className="space-y-5 print:hidden">
          <PageHeader title="Reforma Tributária" eyebrow="Assistente de análise" subtitle="Jornada guiada para triagem entre Simples Nacional e Lucro Presumido." icon={BarChart3}>
            <Button variant="outline" onClick={() => setSelectedAnalysisId(null)} className="gap-2"><ArrowLeft className="h-4 w-4" />Voltar ao dashboard</Button>
            <Button onClick={generateReport} className="gap-2"><Download className="h-4 w-4" />Gerar relatório da análise</Button>
          </PageHeader>

          <GlassCard>
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div><h2 className="text-lg font-black">{selectedCompany.companyName}</h2><p className="text-sm text-foreground">{selectedCompany.cnpj} · {regimeLabels[selectedCompany.currentTaxRegime]} · {activityLabels[selectedCompany.mainActivity]} · ano-base {selectedAnalysis.analysisYear}</p></div>
              <Badge>{statusLabels[selectedAnalysis.status]}</Badge>
            </div>
            <Progress value={((currentIndex + 1) / wizardSteps.length) * 100} />
            <div className="mt-4 grid gap-2 md:grid-cols-5">
              {wizardSteps.map((item, index) => <button key={item.id} onClick={() => { setStep(item.id); setStatusForCurrent(item.id); }} className={cn('rounded-2xl border p-3 text-left text-xs font-bold transition', step === item.id ? 'border-primary bg-primary text-white shadow-lg' : index < currentIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-white/60 bg-white/45 text-foreground')}><item.icon className="mb-2 h-4 w-4" />{item.label}</button>)}
            </div>
          </GlassCard>

          {step === 'empresa' && <CompanyForm initial={selectedCompany} analysisYear={selectedAnalysis.analysisYear} compact onSave={upsertCompany} />}
          {step === 'questionario' && <Questionnaire analysis={selectedAnalysis} onAnswersChange={(answers) => updateAnalysis(selectedAnalysis.id, { answers, status: 'questionario_pendente' })} />}
          {step === 'documentos' && <DocumentUpload company={selectedCompany} analysis={selectedAnalysis} documents={selectedDocuments} onAddDocuments={(docs) => { setStore((prev) => ({ ...prev, documents: [...docs, ...prev.documents], analyses: prev.analyses.map((analysis) => analysis.id === selectedAnalysis.id ? { ...analysis, status: 'documentos_anexados', updatedAt: nowIso() } : analysis) })); }} onAnalyze={analyzeDocuments} onRemoveDocument={removeDocument} />}
          {step === 'resultado' && <ScoreAndRecommendation company={selectedCompany} analysis={selectedAnalysis} documents={selectedDocuments} />}
          {step === 'parecer' && <><ScoreAndRecommendation company={selectedCompany} analysis={selectedAnalysis} documents={selectedDocuments} /><ManualOpinion analysis={selectedAnalysis} onChange={(patch) => updateAnalysis(selectedAnalysis.id, patch)} /></>}

          <div className="flex justify-between">
            <Button variant="outline" disabled={currentIndex === 0} onClick={() => navigateStep(-1)} className="gap-2"><ArrowLeft className="h-4 w-4" />Voltar</Button>
            <Button disabled={currentIndex === wizardSteps.length - 1} onClick={() => navigateStep(1)} className="gap-2">Próximo<ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tax-reform-readable space-y-5">
      <PageHeader title="Reforma Tributária" eyebrow="Módulo operacional" subtitle="Cadastre empresas, responda perguntas estratégicas, anexe documentos e registre decisão final auditável." icon={BarChart3}>
        <Button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} className="gap-2"><Plus className="h-4 w-4" />Nova empresa</Button>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <MetricTile label="Total" value={stats.total} caption="Empresas cadastradas" icon={Building2} tone="blue" />
        <MetricTile label="Simples" value={stats.simples} caption="No Simples Nacional" icon={CheckCircle2} tone="green" />
        <MetricTile label="Presumido" value={stats.presumido} caption="No Lucro Presumido" icon={FileText} tone="violet" />
        <MetricTile label="Incompletas" value={stats.incomplete} caption="Análises em andamento" icon={ClipboardList} tone="amber" />
        <MetricTile label="Concluídas" value={stats.completed} caption="Análises finalizadas" icon={CheckCircle2} tone="green" />
        <MetricTile label="Permanecer" value={stats.stay} caption="Recomendação de manter" icon={CheckCircle2} tone="green" />
        <MetricTile label="Trocar" value={stats.switchRegime} caption="Avaliar migração" icon={ArrowRight} tone="blue" />
        <MetricTile label="Manual" value={stats.manual} caption="Revisão necessária" icon={AlertTriangle} tone="red" />
      </div>
      <DashboardList store={store} openAnalysis={openAnalysis} startNewAnalysis={startNewAnalysis} />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <CompanyForm onSave={upsertCompany} />
        <div className="space-y-4">
          <HistoryPanel store={store} openAnalysis={openAnalysis} />
        </div>
      </div>
    </div>
  );
}

export {
  DashboardList as TaxReformDashboard,
  CompanyForm as TaxReformCompanyForm,
  Questionnaire as TaxReformQuestionnaire,
  DocumentUpload as TaxReformDocumentUpload,
  ScoreAndRecommendation as TaxReformResultPanel,
  ManualOpinion as TaxReformManualOpinion,
  HistoryPanel as TaxReformHistoryPanel,
  AnalysisReport as TaxReformPrintableReport,
};
