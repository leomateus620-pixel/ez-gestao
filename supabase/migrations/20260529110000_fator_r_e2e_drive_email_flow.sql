-- Fator R E2E: PGDAS fields, Drive Analisados, email audit and owner-aware RLS.

alter table public.fator_r_companies
  add column if not exists user_id uuid null references auth.users(id);

alter table public.fator_r_documents
  add column if not exists user_id uuid null references auth.users(id),
  add column if not exists drive_processed_file_id text null,
  add column if not exists drive_processed_folder_id text null,
  add column if not exists rpa numeric null,
  add column if not exists rbt12 numeric null,
  add column if not exists payroll12 numeric null,
  add column if not exists fator_r numeric null,
  add column if not exists fator_r_percent numeric null,
  add column if not exists anexo text null,
  add column if not exists das_total numeric null,
  add column if not exists payment_recognized boolean null,
  add column if not exists alert_reason text null,
  add column if not exists email_sent_at timestamptz null,
  add column if not exists email_status text null,
  add column if not exists parse_json jsonb not null default '{}'::jsonb;

alter table public.fator_r_monthly_results
  add column if not exists user_id uuid null references auth.users(id),
  add column if not exists rpa numeric null,
  add column if not exists anexo text null,
  add column if not exists das_total numeric null,
  add column if not exists payment_recognized boolean null,
  add column if not exists alert_reason text null,
  add column if not exists email_sent_at timestamptz null,
  add column if not exists email_status text null;

alter table public.fator_r_alerts
  add column if not exists user_id uuid null references auth.users(id);

alter table public.fator_r_processing_logs
  add column if not exists user_id uuid null references auth.users(id);

alter table public.fator_r_sync_config
  add column if not exists user_id uuid null references auth.users(id);

alter table public.fator_r_drive_folders
  add column if not exists user_id uuid null references auth.users(id);

alter table public.fator_r_monthly_results
  drop constraint if exists fator_r_monthly_results_status_check;

alter table public.fator_r_monthly_results
  add constraint fator_r_monthly_results_status_check
  check (status in ('safe','attention','critical','not_applicable','unknown','parse_error'));

create index if not exists idx_fator_r_documents_processed_file_id on public.fator_r_documents(drive_processed_file_id);
create index if not exists idx_fator_r_documents_user_id on public.fator_r_documents(user_id);
create index if not exists idx_fator_r_monthly_results_user_id on public.fator_r_monthly_results(user_id);

drop policy if exists "Public can manage fator_r_companies" on public.fator_r_companies;
drop policy if exists "Public can manage fator_r_documents" on public.fator_r_documents;
drop policy if exists "Public can manage fator_r_monthly_results" on public.fator_r_monthly_results;
drop policy if exists "Public can manage fator_r_alerts" on public.fator_r_alerts;
drop policy if exists "Public can manage fator_r_processing_logs" on public.fator_r_processing_logs;
drop policy if exists "Public can manage fator_r_sync_config" on public.fator_r_sync_config;
drop policy if exists "Public can manage fator_r_audit_logs" on public.fator_r_audit_logs;
drop policy if exists "Public can manage fator_r_drive_folders" on public.fator_r_drive_folders;

drop policy if exists "authenticated read fator_r_companies" on public.fator_r_companies;
drop policy if exists "authenticated read fator_r_documents" on public.fator_r_documents;
drop policy if exists "authenticated read fator_r_monthly_results" on public.fator_r_monthly_results;
drop policy if exists "authenticated read fator_r_alerts" on public.fator_r_alerts;
drop policy if exists "authenticated read fator_r_processing_logs" on public.fator_r_processing_logs;
drop policy if exists "authenticated read fator_r_sync_config" on public.fator_r_sync_config;
drop policy if exists "authenticated read fator_r_audit_logs" on public.fator_r_audit_logs;

drop policy if exists "Users can manage own fator_r_companies" on public.fator_r_companies;
drop policy if exists "Users can manage own fator_r_documents" on public.fator_r_documents;
drop policy if exists "Users can manage own fator_r_monthly_results" on public.fator_r_monthly_results;
drop policy if exists "Users can manage own fator_r_alerts" on public.fator_r_alerts;
drop policy if exists "Users can read own fator_r_processing_logs" on public.fator_r_processing_logs;
drop policy if exists "Users can read own fator_r_sync_config" on public.fator_r_sync_config;
drop policy if exists "Users can manage own fator_r_audit_logs" on public.fator_r_audit_logs;
drop policy if exists "Users can read own fator_r_drive_folders" on public.fator_r_drive_folders;

create policy "Users can manage own fator_r_companies" on public.fator_r_companies
  for all to authenticated
  using (user_id is null or user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

create policy "Users can manage own fator_r_documents" on public.fator_r_documents
  for all to authenticated
  using (user_id is null or user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

create policy "Users can manage own fator_r_monthly_results" on public.fator_r_monthly_results
  for all to authenticated
  using (user_id is null or user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

create policy "Users can manage own fator_r_alerts" on public.fator_r_alerts
  for all to authenticated
  using (user_id is null or user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

create policy "Users can read own fator_r_processing_logs" on public.fator_r_processing_logs
  for select to authenticated
  using (user_id is null or user_id = auth.uid());

create policy "Users can read own fator_r_sync_config" on public.fator_r_sync_config
  for select to authenticated
  using (user_id is null or user_id = auth.uid());

create policy "Users can manage own fator_r_audit_logs" on public.fator_r_audit_logs
  for all to authenticated
  using (user_id is null or user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

create policy "Users can read own fator_r_drive_folders" on public.fator_r_drive_folders
  for select to authenticated
  using (user_id is null or user_id = auth.uid());
