create table if not exists public.tax_reform_companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (length(trim(company_name)) > 0),
  cnpj text not null check (length(regexp_replace(cnpj, '\\D', '', 'g')) = 14),
  current_tax_regime text not null check (current_tax_regime in ('simples_nacional','lucro_presumido')),
  main_activity text not null check (main_activity in ('comercio','industria','servicos','misto')),
  responsible_user text not null check (length(trim(responsible_user)) > 0),
  analysis_year int not null check (analysis_year between 2026 and 2100),
  rbt12 numeric(14,2) check (rbt12 is null or rbt12 >= 0),
  projected_revenue numeric(14,2) check (projected_revenue is null or projected_revenue >= 0),
  effective_tax_rate numeric(6,2) check (effective_tax_rate is null or effective_tax_rate between 0 and 100),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tax_reform_analyses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.tax_reform_companies(id) on delete cascade,
  status text not null default 'cadastro_iniciado' check (status in ('cadastro_iniciado','questionario_pendente','aguardando_documentos','documentos_anexados','analise_concluida','necessita_revisao_manual')),
  score_total int default 0 check (score_total between 0 and 100),
  score_clients int default 0 check (score_clients between 0 and 60),
  score_costs int default 0 check (score_costs between 0 and 25),
  score_current_tax int default 0 check (score_current_tax between 0 and 15),
  risk_level text default 'dados_insuficientes' check (risk_level in ('baixo_risco','risco_medio','alto_risco','dados_insuficientes')),
  recommendation text default 'analise_manual_necessaria' check (recommendation in ('permanecer_simples','avaliar_lucro_presumido','permanecer_lucro_presumido','avaliar_simples_nacional','analise_manual_necessaria')),
  automatic_summary text,
  manual_opinion text,
  final_decision text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tax_reform_answers (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tax_reform_analyses(id) on delete cascade,
  question_key text not null check (length(trim(question_key)) > 0),
  question_label text not null check (length(trim(question_label)) > 0),
  answer_value jsonb,
  answer_type text not null check (answer_type in ('percent','select','multi','text','number','boolean')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (analysis_id, question_key)
);

create table if not exists public.tax_reform_documents (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tax_reform_analyses(id) on delete cascade,
  company_id uuid not null references public.tax_reform_companies(id) on delete cascade,
  document_type text not null check (document_type in ('dre','balancete','pgdas','faturamento_cliente','fornecedores','folha_pagamento','fluxo_caixa','vendas_cfop','nfse','outros')),
  file_name text not null check (length(trim(file_name)) > 0),
  file_url text,
  file_size bigint check (file_size is null or file_size >= 0),
  mime_type text,
  reading_status text not null default 'aguardando_leitura' check (reading_status in ('aguardando_leitura','lido','erro_leitura','nao_processavel')),
  extracted_summary text,
  extraction_error text,
  uploaded_at timestamptz default now()
);

create table if not exists public.tax_reform_alerts (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tax_reform_analyses(id) on delete cascade,
  alert_type text not null check (alert_type in ('commercial_risk','likely_simples','missing_documents','manual_review')),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  title text not null check (length(trim(title)) > 0),
  message text not null check (length(trim(message)) > 0),
  created_at timestamptz default now()
);

create index if not exists idx_tax_reform_companies_cnpj on public.tax_reform_companies(cnpj);
create index if not exists idx_tax_reform_companies_regime on public.tax_reform_companies(current_tax_regime);
create index if not exists idx_tax_reform_analyses_company_id on public.tax_reform_analyses(company_id);
create index if not exists idx_tax_reform_analyses_status on public.tax_reform_analyses(status);
create index if not exists idx_tax_reform_analyses_recommendation on public.tax_reform_analyses(recommendation);
create index if not exists idx_tax_reform_answers_analysis_id on public.tax_reform_answers(analysis_id);
create index if not exists idx_tax_reform_documents_analysis_id on public.tax_reform_documents(analysis_id);
create index if not exists idx_tax_reform_documents_company_id on public.tax_reform_documents(company_id);
create index if not exists idx_tax_reform_documents_type on public.tax_reform_documents(document_type);
create index if not exists idx_tax_reform_alerts_analysis_id on public.tax_reform_alerts(analysis_id);
create index if not exists idx_tax_reform_alerts_type on public.tax_reform_alerts(alert_type);

alter table public.tax_reform_companies enable row level security;
alter table public.tax_reform_analyses enable row level security;
alter table public.tax_reform_answers enable row level security;
alter table public.tax_reform_documents enable row level security;
alter table public.tax_reform_alerts enable row level security;

-- MVP policies: authenticated users can operate the shared office workspace.
-- If per-user ownership is later added, replace these policies with user_id-scoped checks.
drop policy if exists "Authenticated users can select tax reform companies" on public.tax_reform_companies;
create policy "Authenticated users can select tax reform companies" on public.tax_reform_companies for select to authenticated using (true);
drop policy if exists "Authenticated users can insert tax reform companies" on public.tax_reform_companies;
create policy "Authenticated users can insert tax reform companies" on public.tax_reform_companies for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update tax reform companies" on public.tax_reform_companies;
create policy "Authenticated users can update tax reform companies" on public.tax_reform_companies for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated users can delete tax reform companies" on public.tax_reform_companies;
create policy "Authenticated users can delete tax reform companies" on public.tax_reform_companies for delete to authenticated using (true);

drop policy if exists "Authenticated users can select tax reform analyses" on public.tax_reform_analyses;
create policy "Authenticated users can select tax reform analyses" on public.tax_reform_analyses for select to authenticated using (true);
drop policy if exists "Authenticated users can insert tax reform analyses" on public.tax_reform_analyses;
create policy "Authenticated users can insert tax reform analyses" on public.tax_reform_analyses for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update tax reform analyses" on public.tax_reform_analyses;
create policy "Authenticated users can update tax reform analyses" on public.tax_reform_analyses for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated users can delete tax reform analyses" on public.tax_reform_analyses;
create policy "Authenticated users can delete tax reform analyses" on public.tax_reform_analyses for delete to authenticated using (true);

drop policy if exists "Authenticated users can select tax reform answers" on public.tax_reform_answers;
create policy "Authenticated users can select tax reform answers" on public.tax_reform_answers for select to authenticated using (true);
drop policy if exists "Authenticated users can insert tax reform answers" on public.tax_reform_answers;
create policy "Authenticated users can insert tax reform answers" on public.tax_reform_answers for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update tax reform answers" on public.tax_reform_answers;
create policy "Authenticated users can update tax reform answers" on public.tax_reform_answers for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated users can delete tax reform answers" on public.tax_reform_answers;
create policy "Authenticated users can delete tax reform answers" on public.tax_reform_answers for delete to authenticated using (true);

drop policy if exists "Authenticated users can select tax reform documents" on public.tax_reform_documents;
create policy "Authenticated users can select tax reform documents" on public.tax_reform_documents for select to authenticated using (true);
drop policy if exists "Authenticated users can insert tax reform documents" on public.tax_reform_documents;
create policy "Authenticated users can insert tax reform documents" on public.tax_reform_documents for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update tax reform documents" on public.tax_reform_documents;
create policy "Authenticated users can update tax reform documents" on public.tax_reform_documents for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated users can delete tax reform documents" on public.tax_reform_documents;
create policy "Authenticated users can delete tax reform documents" on public.tax_reform_documents for delete to authenticated using (true);

drop policy if exists "Authenticated users can select tax reform alerts" on public.tax_reform_alerts;
create policy "Authenticated users can select tax reform alerts" on public.tax_reform_alerts for select to authenticated using (true);
drop policy if exists "Authenticated users can insert tax reform alerts" on public.tax_reform_alerts;
create policy "Authenticated users can insert tax reform alerts" on public.tax_reform_alerts for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update tax reform alerts" on public.tax_reform_alerts;
create policy "Authenticated users can update tax reform alerts" on public.tax_reform_alerts for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated users can delete tax reform alerts" on public.tax_reform_alerts;
create policy "Authenticated users can delete tax reform alerts" on public.tax_reform_alerts for delete to authenticated using (true);
