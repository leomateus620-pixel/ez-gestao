-- Evolução do monitoramento de Fator R para PGDAS com "Não se aplica" e auditoria de valores declarado/calculado.
alter table public.fator_r_monthly_results
  alter column fator_r_value drop not null,
  alter column fator_r_percent drop not null;

alter table public.fator_r_monthly_results
  drop constraint if exists fator_r_monthly_results_status_check;

alter table public.fator_r_monthly_results
  add constraint fator_r_monthly_results_status_check
  check (status in ('safe','attention','critical','not_applicable','unknown'));

alter table public.fator_r_monthly_results
  add column if not exists declared_fator_r numeric null,
  add column if not exists computed_fator_r numeric null,
  add column if not exists not_applicable boolean not null default false;

alter table public.fator_r_documents
  add column if not exists declared_fator_r numeric null,
  add column if not exists computed_fator_r numeric null,
  add column if not exists fator_r_status text null,
  add column if not exists not_applicable boolean not null default false;
