alter table public.tax_reform_documents
  add column if not exists extracted_values jsonb,
  add column if not exists extracted_findings jsonb;

alter table public.tax_reform_documents
  drop constraint if exists tax_reform_documents_reading_status_check;

alter table public.tax_reform_documents
  add constraint tax_reform_documents_reading_status_check
  check (reading_status in ('aguardando_leitura','lendo','lido','erro_leitura','nao_processavel'));

create index if not exists idx_tax_reform_documents_extracted_values_gin
  on public.tax_reform_documents using gin (extracted_values);


alter table public.tax_reform_alerts
  drop constraint if exists tax_reform_alerts_alert_type_check;

alter table public.tax_reform_alerts
  add constraint tax_reform_alerts_alert_type_check
  check (alert_type in ('commercial_risk','likely_simples','missing_documents','manual_review','document_divergence','document_reading'));
