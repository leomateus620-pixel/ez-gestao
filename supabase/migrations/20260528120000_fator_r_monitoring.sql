-- Fator R monitoring module
create table if not exists public.fator_r_companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  name text not null,
  cnpj text null,
  normalized_cnpj text null,
  responsible_email text null,
  secondary_emails text[] not null default '{}',
  active boolean not null default true,
  drive_folder_id text null,
  alert_threshold_attention numeric not null default 0.32,
  alert_threshold_critical numeric not null default 0.28,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fator_r_companies_normalized_cnpj on public.fator_r_companies(normalized_cnpj);
create index if not exists idx_fator_r_companies_tenant_id on public.fator_r_companies(tenant_id);
create index if not exists idx_fator_r_companies_active on public.fator_r_companies(active);

create table if not exists public.fator_r_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  company_id uuid null references public.fator_r_companies(id),
  drive_file_id text not null,
  drive_file_name text not null,
  drive_mime_type text null,
  drive_web_url text null,
  file_month integer null,
  file_year integer null,
  detected_cnpj text null,
  detected_company_name text null,
  processing_status text not null default 'pending' check (processing_status in ('pending','processing','processed','failed','ignored','duplicate')),
  extraction_confidence numeric null,
  raw_text text null,
  extracted_data jsonb not null default '{}'::jsonb,
  error_message text null,
  processed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (drive_file_id)
);

create table if not exists public.fator_r_monthly_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  company_id uuid not null references public.fator_r_companies(id),
  document_id uuid null references public.fator_r_documents(id),
  reference_month integer not null,
  reference_year integer not null,
  fator_r_value numeric not null,
  fator_r_percent numeric not null,
  payroll_12m numeric null,
  revenue_12m numeric null,
  source text not null default 'pgdas_document',
  status text not null check (status in ('safe','attention','critical','unknown')),
  recommendation text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, reference_month, reference_year)
);

create table if not exists public.fator_r_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  company_id uuid not null references public.fator_r_companies(id),
  monthly_result_id uuid null references public.fator_r_monthly_results(id),
  alert_type text not null check (alert_type in ('attention','critical','processing_error')),
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  recipient_email text not null,
  subject text not null,
  body text not null,
  sent_at timestamptz null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, monthly_result_id, alert_type, recipient_email)
);

create table if not exists public.fator_r_processing_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  document_id uuid null,
  company_id uuid null,
  event_type text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fator_r_sync_config (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  sync_enabled boolean not null default true,
  email_alerts_enabled boolean not null default true,
  last_run_at timestamptz null,
  next_run_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fator_r_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_data jsonb null,
  new_data jsonb null,
  user_id uuid null,
  created_at timestamptz not null default now()
);

alter table public.fator_r_companies enable row level security;
alter table public.fator_r_documents enable row level security;
alter table public.fator_r_monthly_results enable row level security;
alter table public.fator_r_alerts enable row level security;
alter table public.fator_r_processing_logs enable row level security;
alter table public.fator_r_sync_config enable row level security;
alter table public.fator_r_audit_logs enable row level security;

create policy "authenticated read fator_r_companies" on public.fator_r_companies for select to authenticated using (true);
create policy "authenticated read fator_r_documents" on public.fator_r_documents for select to authenticated using (true);
create policy "authenticated read fator_r_monthly_results" on public.fator_r_monthly_results for select to authenticated using (true);
create policy "authenticated read fator_r_alerts" on public.fator_r_alerts for select to authenticated using (true);
create policy "authenticated read fator_r_processing_logs" on public.fator_r_processing_logs for select to authenticated using (true);
create policy "authenticated read fator_r_sync_config" on public.fator_r_sync_config for select to authenticated using (true);
create policy "authenticated read fator_r_audit_logs" on public.fator_r_audit_logs for select to authenticated using (true);
