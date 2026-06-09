import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
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
  Plus,
  Save,
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
import {
  calculateTaxReformScore,
  getMissingDocumentTypes,
} from '@/features/tax-reform/rules';
import type {
  AnalysisStatus,
  AnswerMap,
  AnswerValue,
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

const STORAGE_KEY = 'ez_tax_reform_workspace_v1';

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

const documentTypeLabels: Record<string, string> = {
  dre: 'DRE dos últimos 12 meses',
  balancete: 'Balancete dos últimos 12 meses',
  pgdas: 'PGDAS dos últimos 12 meses',
  faturamento_cliente: 'Relatório de faturamento por cliente',
  fornecedores: 'Relação de principais fornecedores',
  folha_pagamento: 'Folha de pagamento',
  fluxo_caixa: 'Fluxo de caixa',
  vendas_cfop: 'Relatório de vendas por CFOP/natureza da operação',
  nfse: 'NFS-e emitidas',
  outros: 'Outros documentos',
};

const acceptedMimeTypes = '.pdf,.xls,.xlsx,.csv,image/*';

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();
const currentYear = new Date().getFullYear();

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
      id: 'demo_01',
      companyName: 'Zimmermann Comércio Demonstrativo',
      cnpj: '12.345.678/0001-90',
      currentTaxRegime: 'simples_nacional',
      mainActivity: 'comercio',
      responsibleUser: 'Equipe Fiscal',
      analysisYear: currentYear,
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
      id: 'analysis_demo_01',
      companyId: 'demo_01',
      status: 'questionario_pendente',
      answers: {
        sales_b2c_percent: 65,
        sales_b2b_percent: 30,
        sales_government_percent: 5,
        top_clients_over_50: 'nao',
        clients_use_tax_credits: 'nao_sei',
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


function scoreToAnalysisFields(company: TaxReformCompany | undefined, analysis: TaxReformAnalysis, documents: TaxReformDocument[]) {
  if (!company) return { ...emptyAnalysisScore, automaticSummary: 'Empresa não localizada para recalcular a análise.' };
  const score = calculateTaxReformScore(company.currentTaxRegime, analysis.answers, documents);
  return {
    scoreTotal: score.total,
    scoreClients: score.clients,
    scoreCosts: score.costs,
    scoreCurrentTax: score.currentTax,
    riskLevel: score.riskLevel,
    recommendation: score.recommendation,
    automaticSummary: score.summary,
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
    const score = calculateTaxReformScore(company.currentTaxRegime, analysis.answers, documents);
    return score.alerts.map((alert) => {
      const key = `${analysis.id}:${alert.alertType}`;
      const previous = previousAlerts.get(key);
      return {
        id: previous?.id ?? `${analysis.id}_${alert.alertType}`,
        analysisId: analysis.id,
        createdAt: previous?.createdAt ?? analysis.updatedAt,
        ...alert,
      };
    });
  });

  return { ...emptyStore, ...store, analyses, alerts };
}

function loadStore(): TaxReformStore {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return withDerivedScores(seedStore);
  try {
    return withDerivedScores({ ...emptyStore, ...JSON.parse(raw) });
  } catch (error) {
    console.error('[reforma-tributaria] erro ao carregar localStorage', error);
    return withDerivedScores(seedStore);
  }
}

function formatDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

function normalizeNumber(value: string) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
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
      <NativeSelect
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </NativeSelect>
    </div>
  );
}

function MetricTile({ label, value, caption, icon: Icon, tone = 'blue' }: { label: string; value: string | number; caption: string; icon: React.ComponentType<{ className?: string }>; tone?: 'blue' | 'green' | 'amber' | 'red' | 'violet' }) {
  const tones = {
    blue: 'from-sky-500/15 text-sky-700 border-sky-200/70',
    green: 'from-emerald-500/15 text-emerald-700 border-emerald-200/70',
    amber: 'from-amber-500/15 text-amber-700 border-amber-200/70',
    red: 'from-rose-500/15 text-rose-700 border-rose-200/70',
    violet: 'from-violet-500/15 text-violet-700 border-violet-200/70',
  };
  return (
    <div className="liquid-stat-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/60">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-foreground">{value}</p>
        </div>
        <div className={cn('rounded-2xl border bg-gradient-to-br to-white/40 p-2.5 shadow-inner', tones[tone])}><Icon className="h-4 w-4" /></div>
      </div>
      <p className="mt-2 text-xs font-medium text-foreground/65">{caption}</p>
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

function formatAnswerValue(key: string, value: AnswerValue) {
  if (Array.isArray(value)) {
    const options = new Map((questionOptionsByKey[key] ?? []).map(([optionValue, label]) => [optionValue, label]));
    return value.map((item) => options.get(item) ?? item).join(', ');
  }
  const options = new Map((questionOptionsByKey[key] ?? []).map(([optionValue, label]) => [optionValue, label]));
  if (typeof value === 'string') return options.get(value) ?? value;
  if (typeof value === 'number') return `${value}%`;
  return '—';
}

function CompanyForm({ onSave, initial, compact = false }: { onSave: (company: TaxReformCompany) => void; initial?: TaxReformCompany; compact?: boolean }) {
  const [form, setForm] = useState({
    companyName: initial?.companyName ?? '',
    cnpj: initial?.cnpj ?? '',
    currentTaxRegime: initial?.currentTaxRegime ?? 'simples_nacional',
    mainActivity: initial?.mainActivity ?? 'comercio',
    responsibleUser: initial?.responsibleUser ?? '',
    analysisYear: String(initial?.analysisYear ?? currentYear),
    rbt12: initial?.rbt12 ? String(initial.rbt12) : '',
    projectedRevenue: initial?.projectedRevenue ? String(initial.projectedRevenue) : '',
    effectiveTaxRate: initial?.effectiveTaxRate ? String(initial.effectiveTaxRate) : '',
    notes: initial?.notes ?? '',
  });

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = () => {
    const required = ['companyName', 'cnpj', 'responsibleUser', 'analysisYear'];
    if (required.some((key) => !String(form[key as keyof typeof form]).trim())) {
      toast.error('Preencha os campos obrigatórios da empresa.');
      return;
    }
    const timestamp = nowIso();
    onSave({
      id: initial?.id ?? newId('company'),
      companyName: form.companyName.trim(),
      cnpj: form.cnpj.trim(),
      currentTaxRegime: form.currentTaxRegime as TaxRegime,
      mainActivity: form.mainActivity as MainActivity,
      responsibleUser: form.responsibleUser.trim(),
      analysisYear: Number(form.analysisYear) || currentYear,
      rbt12: normalizeNumber(form.rbt12),
      projectedRevenue: normalizeNumber(form.projectedRevenue),
      effectiveTaxRate: normalizeNumber(form.effectiveTaxRate),
      notes: form.notes,
      createdAt: initial?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
  };

  return (
    <GlassCard className="space-y-4">
      {!compact && <div><h2 className="text-lg font-bold">Cadastrar empresa</h2><p className="text-sm text-foreground/65">Informe os dados base para abrir a jornada de análise.</p></div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2"><Label>Nome da empresa <span className="text-destructive">*</span></Label><Input value={form.companyName} onChange={(e) => update('companyName', e.target.value)} placeholder="Ex.: Empresa ABC Ltda" /></div>
        <div className="space-y-2"><Label>CNPJ <span className="text-destructive">*</span></Label><Input value={form.cnpj} onChange={(e) => update('cnpj', e.target.value)} placeholder="00.000.000/0000-00" /></div>
        <SelectField label="Regime tributário atual" required value={form.currentTaxRegime} onChange={(value) => update('currentTaxRegime', value)} options={[{ value: 'simples_nacional', label: 'Simples Nacional' }, { value: 'lucro_presumido', label: 'Lucro Presumido' }]} />
        <SelectField label="Atividade principal" required value={form.mainActivity} onChange={(value) => update('mainActivity', value)} options={[{ value: 'comercio', label: 'Comércio' }, { value: 'industria', label: 'Indústria' }, { value: 'servicos', label: 'Serviços' }, { value: 'misto', label: 'Misto' }]} />
        <div className="space-y-2"><Label>Responsável interno <span className="text-destructive">*</span></Label><Input value={form.responsibleUser} onChange={(e) => update('responsibleUser', e.target.value)} /></div>
        <div className="space-y-2"><Label>Ano-base <span className="text-destructive">*</span></Label><Input type="number" value={form.analysisYear} onChange={(e) => update('analysisYear', e.target.value)} /></div>
        <div className="space-y-2"><Label>Faturamento últimos 12 meses</Label><Input value={form.rbt12} onChange={(e) => update('rbt12', e.target.value)} placeholder="R$" /></div>
        <div className="space-y-2"><Label>Faturamento projetado 12 meses</Label><Input value={form.projectedRevenue} onChange={(e) => update('projectedRevenue', e.target.value)} placeholder="R$" /></div>
        <div className="space-y-2"><Label>Alíquota efetiva atual (%)</Label><Input type="number" value={form.effectiveTaxRate} onChange={(e) => update('effectiveTaxRate', e.target.value)} /></div>
      </div>
      <div className="space-y-2"><Label>Observações internas</Label><Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Contexto, sazonalidade, premissas e pontos de atenção." /></div>
      <div className="flex justify-end"><Button onClick={submit} className="gap-2"><Save className="h-4 w-4" />{initial ? 'Salvar dados da empresa' : 'Cadastrar e abrir análise'}</Button></div>
    </GlassCard>
  );
}

function QuestionRenderer({ question, value, onChange }: { question: typeof questionBlocks[number]['questions'][number]; value: AnswerValue; onChange: (value: AnswerValue) => void }) {
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
            className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition', active ? 'border-primary bg-primary text-white' : 'border-white/70 bg-white/50 text-foreground/70 hover:bg-white/80')}
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
          <div><h3 className="font-bold">{block.title}</h3><p className="text-xs text-foreground/60">Respostas são salvas automaticamente e recalculam o score.</p></div>
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

function DocumentUpload({ company, analysis, documents, onAddDocuments, onAnalyze }: { company: TaxReformCompany; analysis: TaxReformAnalysis; documents: TaxReformDocument[]; onAddDocuments: (docs: TaxReformDocument[]) => void; onAnalyze: () => void }) {
  const [documentType, setDocumentType] = useState('dre');
  const missing = getMissingDocumentTypes(documents);
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const allowedExtensions = ['pdf', 'xls', 'xlsx', 'csv', 'png', 'jpg', 'jpeg', 'webp'];
    const validDocs: TaxReformDocument[] = [];
    files.forEach((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!allowedExtensions.includes(extension)) {
        console.error('[reforma-tributaria] upload bloqueado por tipo inválido', file.name);
        toast.error('Tipo de arquivo não aceito', { description: `${file.name} não será anexado.` });
        return;
      }
      validDocs.push({
        id: newId('doc'),
        companyId: company.id,
        analysisId: analysis.id,
        documentType,
        fileName: file.name,
        fileUrl: `local://${file.name}`,
        fileSize: file.size,
        mimeType: file.type || extension,
        readingStatus: 'aguardando_leitura',
        extractedSummary: 'Estrutura preparada para extração automática. Clique em Analisar documentos para registrar leitura simulada/placeholder.',
        uploadedAt: nowIso(),
      });
    });
    if (validDocs.length) {
      onAddDocuments(validDocs);
      toast.success('Documento anexado à análise correta.');
    }
    event.target.value = '';
  };

  return (
    <GlassCard className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div><h3 className="font-bold">Documentos e planilhas</h3><p className="text-sm text-foreground/65">Arquivos vinculados a {company.companyName} · ano-base {company.analysisYear}.</p></div>
        <Button onClick={onAnalyze} variant="outline" className="gap-2"><FileSpreadsheet className="h-4 w-4" />Analisar documentos</Button>
      </div>
      {missing.length > 0 && <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3 text-sm text-amber-900"><b>Faltam documentos-chave:</b> {missing.map((type) => documentTypeLabels[type]).join(', ')}.</div>}
      <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_1fr]">
        <SelectField label="Tipo do documento" value={documentType} onChange={setDocumentType} options={Object.entries(documentTypeLabels).map(([value, label]) => ({ value, label }))} />
        <div className="space-y-2"><Label>Anexar PDF/planilha</Label><label className="flex min-h-10 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-primary/35 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/10"><Upload className="mr-2 h-4 w-4" />Selecionar arquivos<input type="file" multiple accept={acceptedMimeTypes} onChange={upload} className="hidden" /></label></div>
      </div>
      <div className="space-y-2">
        {documents.length === 0 ? <div className="rounded-2xl border border-white/60 bg-white/45 p-4 text-sm text-foreground/60">Nenhum documento anexado ainda.</div> : documents.map((doc) => (
          <div key={doc.id} className="flex flex-col gap-2 rounded-2xl border border-white/60 bg-white/45 p-3 text-sm md:flex-row md:items-center md:justify-between">
            <div><p className="font-semibold">{doc.fileName}</p><p className="text-xs text-foreground/60">{documentTypeLabels[doc.documentType]} · {Math.ceil(doc.fileSize / 1024)} KB · enviado em {formatDate(doc.uploadedAt)}</p></div>
            <Badge variant="outline">{doc.readingStatus.replaceAll('_', ' ')}</Badge>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function ScoreAndRecommendation({ company, analysis, documents }: { company: TaxReformCompany; analysis: TaxReformAnalysis; documents: TaxReformDocument[] }) {
  const score = calculateTaxReformScore(company.currentTaxRegime, analysis.answers, documents);
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <GlassCard className="space-y-4">
        <div className="flex items-center justify-between"><h3 className="font-bold">Score da análise</h3><Badge>{riskLabels[score.riskLevel]}</Badge></div>
        <div className="text-center"><div className="text-6xl font-black tracking-tight text-primary">{score.total}</div><p className="text-sm text-foreground/60">de 100 pontos</p></div>
        <div className="space-y-3 text-sm">
          <div><div className="mb-1 flex justify-between"><span>Perfil dos clientes</span><b>{score.clients}/60</b></div><Progress value={(score.clients / 60) * 100} /></div>
          <div><div className="mb-1 flex justify-between"><span>Custos e créditos</span><b>{score.costs}/25</b></div><Progress value={(score.costs / 25) * 100} /></div>
          <div><div className="mb-1 flex justify-between"><span>Situação atual</span><b>{score.currentTax}/15</b></div><Progress value={(score.currentTax / 15) * 100} /></div>
        </div>
      </GlassCard>
      <GlassCard className="space-y-4">
        <div><h3 className="font-bold">Resultado e recomendação</h3><p className="text-sm text-foreground/65">Triagem inicial. Não substitui parecer técnico ou simulação tributária.</p></div>
        <div className="rounded-3xl border border-primary/20 bg-primary/5 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Recomendação automática</p><p className="mt-2 text-2xl font-black">{recommendationLabels[score.recommendation]}</p><p className="mt-2 text-sm text-foreground/70">{score.summary}</p></div>
        <div className="grid gap-2 md:grid-cols-3"><Badge variant="outline">{company.companyName}</Badge><Badge variant="outline">{company.cnpj}</Badge><Badge variant="outline">{regimeLabels[company.currentTaxRegime]}</Badge></div>
        <div className="space-y-2">
          <h4 className="font-semibold">Alertas automáticos</h4>
          {score.alerts.map((alert) => <div key={alert.alertType} className={cn('rounded-2xl border p-3 text-sm', alert.severity === 'critical' ? 'border-rose-200 bg-rose-50 text-rose-950' : alert.severity === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950')}><b>{alert.title}:</b> {alert.message}</div>)}
        </div>
        <div className="text-sm text-foreground/65">Perguntas obrigatórias respondidas: <b>{score.answeredRequired}</b>. Documentos usados: <b>{documents.length}</b>.</div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/60 bg-white/45 p-3">
            <h4 className="mb-2 text-sm font-semibold">Documentos usados</h4>
            {documents.length === 0 ? <p className="text-xs text-foreground/60">Nenhum documento anexado.</p> : documents.map((doc) => <p key={doc.id} className="text-xs text-foreground/70">{documentTypeLabels[doc.documentType]} · {doc.fileName} · {doc.readingStatus.replaceAll('_', ' ')}</p>)}
          </div>
          <div className="rounded-2xl border border-white/60 bg-white/45 p-3">
            <h4 className="mb-2 text-sm font-semibold">Perguntas respondidas</h4>
            {Object.entries(analysis.answers).filter(([, value]) => value !== '' && value !== undefined && value !== null).slice(0, 8).map(([key, value]) => <p key={key} className="text-xs text-foreground/70"><b>{questionLabelByKey[key] ?? key}:</b> {formatAnswerValue(key, value)}</p>)}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function ManualOpinion({ analysis, onChange }: { analysis: TaxReformAnalysis; onChange: (patch: Partial<TaxReformAnalysis>) => void }) {
  return (
    <GlassCard className="space-y-4">
      <div><h3 className="font-bold">Parecer manual do contador</h3><p className="text-sm text-foreground/65">Complemente ou ajuste a conclusão automática antes da decisão final.</p></div>
      <div className="space-y-2"><Label>Parecer manual</Label><Textarea value={analysis.manualOpinion} onChange={(event) => onChange({ manualOpinion: event.target.value })} placeholder="Registre premissas, riscos, documentos analisados e próximos passos." className="min-h-32" /></div>
      <div className="space-y-2"><Label>Decisão final</Label><Textarea value={analysis.finalDecision} onChange={(event) => onChange({ finalDecision: event.target.value })} placeholder="Ex.: manter regime atual, rodar simulação detalhada, coletar documentos adicionais..." /></div>
    </GlassCard>
  );
}

function HistoryPanel({ store }: { store: TaxReformStore }) {
  const rows = store.analyses.map((analysis) => ({ analysis, company: store.companies.find((company) => company.id === analysis.companyId) })).filter((row) => row.company);
  return <GlassCard className="space-y-3"><h3 className="font-bold">Histórico de análises</h3>{rows.map(({ analysis, company }) => <div key={analysis.id} className="rounded-2xl border border-white/60 bg-white/45 p-3 text-sm"><b>{company?.companyName}</b> · {statusLabels[analysis.status]} · atualizado em {formatDate(analysis.updatedAt)}</div>)}</GlassCard>;
}

function DashboardList({ store, openAnalysis }: { store: TaxReformStore; openAnalysis: (companyId: string) => void }) {
  const rows = store.companies.map((company) => {
    const analysis = store.analyses.find((item) => item.companyId === company.id);
    const docs = store.documents.filter((doc) => doc.companyId === company.id);
    const score = analysis ? calculateTaxReformScore(company.currentTaxRegime, analysis.answers, docs) : undefined;
    return { company, analysis, score };
  });
  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="font-bold">Empresas cadastradas</h2><Badge variant="outline">{rows.length} registros</Badge></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-foreground/55"><tr><th className="p-3">Empresa</th><th className="p-3">CNPJ</th><th className="p-3">Regime</th><th className="p-3">Status</th><th className="p-3">Score</th><th className="p-3">Recomendação</th><th className="p-3">Última análise</th><th className="p-3" /></tr></thead>
          <tbody>
            {rows.map(({ company, analysis, score }) => (
              <tr key={company.id} className="border-t border-white/50">
                <td className="p-3 font-semibold">{company.companyName}</td><td className="p-3">{company.cnpj}</td><td className="p-3">{regimeLabels[company.currentTaxRegime]}</td><td className="p-3"><Badge variant="outline">{analysis ? statusLabels[analysis.status] : 'Cadastro iniciado'}</Badge></td><td className="p-3 font-bold">{score?.total ?? 0}</td><td className="p-3">{score ? recommendationLabels[score.recommendation] : '—'}</td><td className="p-3">{formatDate(analysis?.updatedAt ?? company.updatedAt)}</td><td className="p-3"><Button size="sm" onClick={() => openAnalysis(company.id)}>Abrir análise</Button></td>
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
  const [store, setStore] = useState<TaxReformStore>(() => loadStore());
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [step, setStep] = useState<WizardStep>('empresa');

  useEffect(() => {
    const next = withDerivedScores(store);
    if (JSON.stringify(next.analyses) !== JSON.stringify(store.analyses) || JSON.stringify(next.alerts) !== JSON.stringify(store.alerts)) {
      setStore(next);
    }
  }, [store]);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(store)), [store]);

  const selectedCompany = store.companies.find((company) => company.id === selectedCompanyId) ?? null;
  const selectedAnalysis = selectedCompany ? store.analyses.find((analysis) => analysis.companyId === selectedCompany.id) ?? null : null;
  const selectedDocuments = selectedAnalysis ? store.documents.filter((doc) => doc.analysisId === selectedAnalysis.id) : [];

  const stats = useMemo(() => {
    const analyses = store.companies.map((company) => {
      const analysis = store.analyses.find((item) => item.companyId === company.id);
      const docs = store.documents.filter((doc) => doc.companyId === company.id);
      const score = analysis ? calculateTaxReformScore(company.currentTaxRegime, analysis.answers, docs) : null;
      return { company, analysis, score };
    });
    return {
      total: store.companies.length,
      simples: store.companies.filter((company) => company.currentTaxRegime === 'simples_nacional').length,
      presumido: store.companies.filter((company) => company.currentTaxRegime === 'lucro_presumido').length,
      incomplete: analyses.filter(({ analysis }) => !analysis || !['analise_concluida', 'necessita_revisao_manual'].includes(analysis.status)).length,
      stay: analyses.filter(({ score }) => score && ['permanecer_simples', 'permanecer_lucro_presumido'].includes(score.recommendation)).length,
      switchRegime: analyses.filter(({ score }) => score && ['avaliar_lucro_presumido', 'avaliar_simples_nacional'].includes(score.recommendation)).length,
      manual: analyses.filter(({ score }) => score?.recommendation === 'analise_manual_necessaria').length,
    };
  }, [store]);

  const upsertCompany = (company: TaxReformCompany) => {
    setStore((prev) => {
      const exists = prev.companies.some((item) => item.id === company.id);
      const companies = exists ? prev.companies.map((item) => item.id === company.id ? company : item) : [company, ...prev.companies];
      const analysisExists = prev.analyses.some((analysis) => analysis.companyId === company.id);
      const analyses = analysisExists ? prev.analyses : [{ id: newId('analysis'), companyId: company.id, status: 'questionario_pendente' as AnalysisStatus, answers: { effective_tax_rate: company.effectiveTaxRate ?? '' }, ...emptyAnalysisScore, manualOpinion: '', finalDecision: '', createdAt: nowIso(), updatedAt: nowIso() }, ...prev.analyses];
      return { ...prev, companies, analyses };
    });
    setSelectedCompanyId(company.id);
    setStep('empresa');
    toast.success('Empresa salva e análise aberta.');
  };

  const updateAnalysis = (analysisId: string, patch: Partial<TaxReformAnalysis>) => {
    setStore((prev) => ({ ...prev, analyses: prev.analyses.map((analysis) => analysis.id === analysisId ? { ...analysis, ...patch, updatedAt: nowIso() } : analysis) }));
  };

  const setStatusForCurrent = (targetStep: WizardStep, analysis = selectedAnalysis) => {
    if (!analysis) return;
    const statusByStep: Record<WizardStep, AnalysisStatus> = {
      empresa: 'cadastro_iniciado',
      questionario: 'questionario_pendente',
      documentos: selectedDocuments.length ? 'documentos_anexados' : 'aguardando_documentos',
      resultado: calculateTaxReformScore(selectedCompany!.currentTaxRegime, analysis.answers, selectedDocuments).insufficientData ? 'necessita_revisao_manual' : 'analise_concluida',
      parecer: 'analise_concluida',
    };
    updateAnalysis(analysis.id, { status: statusByStep[targetStep] });
  };

  const navigateStep = (direction: 1 | -1) => {
    const index = wizardSteps.findIndex((item) => item.id === step);
    const next = wizardSteps[Math.max(0, Math.min(wizardSteps.length - 1, index + direction))].id;
    setStep(next);
    setStatusForCurrent(next);
  };

  const analyzeDocuments = () => {
    if (!selectedAnalysis) return;
    setStore((prev) => ({ ...prev, documents: prev.documents.map((doc) => doc.analysisId === selectedAnalysis.id ? { ...doc, readingStatus: 'lido', extractedSummary: 'Placeholder de leitura: documento registrado para apoiar a análise; extração automática ainda será conectada ao pipeline definitivo.', extractionError: undefined } : doc) }));
    console.info('[reforma-tributaria] análise de documentos executada', { analysisId: selectedAnalysis.id, total: selectedDocuments.length });
    toast.success('Documentos marcados como lidos', { description: 'Extração automática preparada com logs e placeholder.' });
  };

  const generateReport = () => {
    if (!selectedCompany || !selectedAnalysis) return;
    setStep('parecer');
    window.setTimeout(() => window.print(), 150);
    toast.success('Relatório preparado para impressão/PDF.');
  };

  const openAnalysis = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setStep('empresa');
  };

  if (selectedCompany && selectedAnalysis) {
    const currentIndex = wizardSteps.findIndex((item) => item.id === step);
    return (
      <div className="space-y-5 print:space-y-3">
        <PageHeader title="Reforma Tributária" eyebrow="Assistente de análise" subtitle="Jornada guiada para triagem entre Simples Nacional e Lucro Presumido." icon={BarChart3}>
          <Button variant="outline" onClick={() => setSelectedCompanyId(null)} className="gap-2 print:hidden"><ArrowLeft className="h-4 w-4" />Voltar ao dashboard</Button>
          <Button onClick={generateReport} className="gap-2 print:hidden"><Download className="h-4 w-4" />Gerar relatório da análise</Button>
        </PageHeader>

        <GlassCard className="print:hidden">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-black">{selectedCompany.companyName}</h2><p className="text-sm text-foreground/65">{selectedCompany.cnpj} · {regimeLabels[selectedCompany.currentTaxRegime]} · {activityLabels[selectedCompany.mainActivity]}</p></div><Badge>{statusLabels[selectedAnalysis.status]}</Badge></div>
          <Progress value={((currentIndex + 1) / wizardSteps.length) * 100} />
          <div className="mt-4 grid gap-2 md:grid-cols-5">
            {wizardSteps.map((item, index) => <button key={item.id} onClick={() => { setStep(item.id); setStatusForCurrent(item.id); }} className={cn('rounded-2xl border p-3 text-left text-xs font-bold transition', step === item.id ? 'border-primary bg-primary text-white shadow-lg' : index < currentIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-white/60 bg-white/45 text-foreground/70')}><item.icon className="mb-2 h-4 w-4" />{item.label}</button>)}
          </div>
        </GlassCard>

        {step === 'empresa' && <CompanyForm initial={selectedCompany} compact onSave={upsertCompany} />}
        {step === 'questionario' && <Questionnaire analysis={selectedAnalysis} onAnswersChange={(answers) => updateAnalysis(selectedAnalysis.id, { answers, status: 'questionario_pendente' })} />}
        {step === 'documentos' && <DocumentUpload company={selectedCompany} analysis={selectedAnalysis} documents={selectedDocuments} onAddDocuments={(docs) => { setStore((prev) => ({ ...prev, documents: [...docs, ...prev.documents], analyses: prev.analyses.map((analysis) => analysis.id === selectedAnalysis.id ? { ...analysis, status: 'documentos_anexados', updatedAt: nowIso() } : analysis) })); }} onAnalyze={analyzeDocuments} />}
        {step === 'resultado' && <ScoreAndRecommendation company={selectedCompany} analysis={selectedAnalysis} documents={selectedDocuments} />}
        {step === 'parecer' && <><ScoreAndRecommendation company={selectedCompany} analysis={selectedAnalysis} documents={selectedDocuments} /><ManualOpinion analysis={selectedAnalysis} onChange={(patch) => updateAnalysis(selectedAnalysis.id, patch)} /></>}

        <div className="flex justify-between print:hidden">
          <Button variant="outline" disabled={currentIndex === 0} onClick={() => navigateStep(-1)} className="gap-2"><ArrowLeft className="h-4 w-4" />Voltar</Button>
          <Button disabled={currentIndex === wizardSteps.length - 1} onClick={() => navigateStep(1)} className="gap-2">Próximo<ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Reforma Tributária" eyebrow="Novo módulo" subtitle="Cadastre empresas, responda perguntas estratégicas, anexe documentos e gere uma recomendação inicial de regime." icon={BarChart3}>
        <Button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} className="gap-2"><Plus className="h-4 w-4" />Nova empresa</Button>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <MetricTile label="Total" value={stats.total} caption="Empresas cadastradas" icon={Building2} tone="blue" />
        <MetricTile label="Simples" value={stats.simples} caption="No Simples Nacional" icon={CheckCircle2} tone="green" />
        <MetricTile label="Presumido" value={stats.presumido} caption="No Lucro Presumido" icon={FileText} tone="violet" />
        <MetricTile label="Incompletas" value={stats.incomplete} caption="Análises em andamento" icon={ClipboardList} tone="amber" />
        <MetricTile label="Permanecer" value={stats.stay} caption="Recomendação de manter" icon={CheckCircle2} tone="green" />
        <MetricTile label="Trocar" value={stats.switchRegime} caption="Avaliar migração" icon={ArrowRight} tone="blue" />
        <MetricTile label="Manual" value={stats.manual} caption="Revisão necessária" icon={AlertTriangle} tone="red" />
      </div>
      <DashboardList store={store} openAnalysis={openAnalysis} />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><CompanyForm onSave={upsertCompany} /><HistoryPanel store={store} /></div>
    </div>
  );
}
