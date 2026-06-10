create or replace function public.tax_reform_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.tax_reform_companies
  alter column analysis_year drop not null,
  alter column created_at set not null,
  alter column updated_at set not null;

alter table public.tax_reform_analyses
  add column if not exists analysis_year int;

update public.tax_reform_analyses analysis
set analysis_year = coalesce(analysis.analysis_year, company.analysis_year, extract(year from now())::int)
from public.tax_reform_companies company
where company.id = analysis.company_id
  and analysis.analysis_year is null;

alter table public.tax_reform_analyses
  alter column analysis_year set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tax_reform_analyses_analysis_year_check'
  ) then
    alter table public.tax_reform_analyses
      add constraint tax_reform_analyses_analysis_year_check
      check (analysis_year between 2026 and 2100);
  end if;
end;
$$;

alter table public.tax_reform_answers
  alter column created_at set not null,
  alter column updated_at set not null;

alter table public.tax_reform_documents
  add column if not exists updated_at timestamptz not null default now();

alter table public.tax_reform_documents
  alter column uploaded_at set not null,
  alter column updated_at set not null;

alter table public.tax_reform_alerts
  add column if not exists updated_at timestamptz not null default now();

alter table public.tax_reform_alerts
  alter column created_at set not null,
  alter column updated_at set not null;

create index if not exists idx_tax_reform_analyses_company_year
  on public.tax_reform_analyses(company_id, analysis_year desc);
create index if not exists idx_tax_reform_analyses_updated_at
  on public.tax_reform_analyses(updated_at desc);
create index if not exists idx_tax_reform_documents_reading_status
  on public.tax_reform_documents(reading_status);

create unique index if not exists uq_tax_reform_analyses_id_company
  on public.tax_reform_analyses(id, company_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tax_reform_documents_analysis_company_fkey'
  ) then
    alter table public.tax_reform_documents
      add constraint tax_reform_documents_analysis_company_fkey
      foreign key (analysis_id, company_id)
      references public.tax_reform_analyses(id, company_id)
      on delete cascade;
  end if;
end;
$$;

drop trigger if exists trg_tax_reform_companies_updated_at on public.tax_reform_companies;
create trigger trg_tax_reform_companies_updated_at
before update on public.tax_reform_companies
for each row execute function public.tax_reform_touch_updated_at();

drop trigger if exists trg_tax_reform_analyses_updated_at on public.tax_reform_analyses;
create trigger trg_tax_reform_analyses_updated_at
before update on public.tax_reform_analyses
for each row execute function public.tax_reform_touch_updated_at();

drop trigger if exists trg_tax_reform_answers_updated_at on public.tax_reform_answers;
create trigger trg_tax_reform_answers_updated_at
before update on public.tax_reform_answers
for each row execute function public.tax_reform_touch_updated_at();

drop trigger if exists trg_tax_reform_documents_updated_at on public.tax_reform_documents;
create trigger trg_tax_reform_documents_updated_at
before update on public.tax_reform_documents
for each row execute function public.tax_reform_touch_updated_at();

drop trigger if exists trg_tax_reform_alerts_updated_at on public.tax_reform_alerts;
create trigger trg_tax_reform_alerts_updated_at
before update on public.tax_reform_alerts
for each row execute function public.tax_reform_touch_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tax-reform-documents',
  'tax-reform-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can read tax reform files" on storage.objects;
create policy "Authenticated users can read tax reform files"
on storage.objects for select to authenticated
using (bucket_id = 'tax-reform-documents');

drop policy if exists "Authenticated users can upload tax reform files" on storage.objects;
create policy "Authenticated users can upload tax reform files"
on storage.objects for insert to authenticated
with check (bucket_id = 'tax-reform-documents');

drop policy if exists "Authenticated users can update tax reform files" on storage.objects;
create policy "Authenticated users can update tax reform files"
on storage.objects for update to authenticated
using (bucket_id = 'tax-reform-documents')
with check (bucket_id = 'tax-reform-documents');

drop policy if exists "Authenticated users can delete tax reform files" on storage.objects;
create policy "Authenticated users can delete tax reform files"
on storage.objects for delete to authenticated
using (bucket_id = 'tax-reform-documents');
