-- Add missing columns referenced by fator-r-drive-sync edge function.
ALTER TABLE public.fator_r_documents
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS rpa numeric,
  ADD COLUMN IF NOT EXISTS rbt12 numeric,
  ADD COLUMN IF NOT EXISTS payroll12 numeric,
  ADD COLUMN IF NOT EXISTS fator_r numeric,
  ADD COLUMN IF NOT EXISTS fator_r_percent numeric,
  ADD COLUMN IF NOT EXISTS anexo text,
  ADD COLUMN IF NOT EXISTS das_total numeric,
  ADD COLUMN IF NOT EXISTS payment_recognized boolean,
  ADD COLUMN IF NOT EXISTS alert_reason text,
  ADD COLUMN IF NOT EXISTS parse_json jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS drive_processed_file_id text,
  ADD COLUMN IF NOT EXISTS drive_processed_folder_id text,
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

ALTER TABLE public.fator_r_companies
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.fator_r_monthly_results
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS rpa numeric,
  ADD COLUMN IF NOT EXISTS anexo text,
  ADD COLUMN IF NOT EXISTS das_total numeric,
  ADD COLUMN IF NOT EXISTS payment_recognized boolean,
  ADD COLUMN IF NOT EXISTS alert_reason text;

ALTER TABLE public.fator_r_alerts
  ADD COLUMN IF NOT EXISTS user_id uuid;
