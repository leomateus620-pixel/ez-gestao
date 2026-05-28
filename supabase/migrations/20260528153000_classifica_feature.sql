create table if not exists public.classifica_documents (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id),
  issuer_cnpj text,
  recipient_cnpj text,
  nfe_key text,
  invoice_number text,
  issued_at date,
  total_value numeric(14,2),
  invoice_type text check (invoice_type in ('entrada','saida')),
  status text default 'processado' check (status in ('processado','classificado','revisao','erro')),
  drive_origin_path text,
  drive_file_id text unique,
  drive_file_name text,
  processing_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.classifica_invoice_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.classifica_documents(id) on delete cascade,
  item_code text,
  description text,
  cfop text,
  ncm text,
  cst_csosn text,
  item_value numeric(14,2),
  suggested_classification text,
  final_classification text,
  confidence_score numeric(5,2) default 0,
  classification_inputs jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create table if not exists public.classifica_classifications (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.classifica_invoice_items(id) on delete cascade,
  engine_version text default 'v1',
  suggestion text,
  confidence_score numeric(5,2),
  review_recommended boolean default false,
  auto_applied boolean default false,
  reasoning jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create table if not exists public.classifica_rules (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id),
  rule_name text not null,
  priority int default 100,
  conditions jsonb not null default '{}'::jsonb,
  resulting_classification text not null,
  source text default 'manual',
  active boolean default true,
  created_by uuid,
  created_at timestamptz default now()
);
create table if not exists public.classifica_review_queue (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.classifica_documents(id) on delete cascade,
  item_id uuid references public.classifica_invoice_items(id) on delete cascade,
  reason text,
  status text default 'pending',
  assigned_to uuid,
  created_at timestamptz default now(),
  resolved_at timestamptz
);
create table if not exists public.classifica_processing_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.classifica_documents(id) on delete cascade,
  level text default 'info',
  message text not null,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create table if not exists public.classifica_audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  created_at timestamptz default now()
);
alter table public.classifica_documents enable row level security;
alter table public.classifica_invoice_items enable row level security;
alter table public.classifica_classifications enable row level security;
alter table public.classifica_rules enable row level security;
alter table public.classifica_review_queue enable row level security;
alter table public.classifica_processing_logs enable row level security;
alter table public.classifica_audit_logs enable row level security;
