-- Supports granular, idempotent upserts from the Reforma Tributária workspace.
-- Applying this file in the repo does not apply it to Supabase Cloud automatically.

create unique index if not exists uq_tax_reform_answers_analysis_question
  on public.tax_reform_answers(analysis_id, question_key);

create unique index if not exists uq_tax_reform_alerts_analysis_type
  on public.tax_reform_alerts(analysis_id, alert_type);
