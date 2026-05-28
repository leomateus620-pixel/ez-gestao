
-- Base Fator R tables (referenced by existing edge functions and UI)
CREATE TABLE IF NOT EXISTS public.fator_r_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text,
  normalized_cnpj text UNIQUE,
  responsible_email text,
  secondary_emails text[] DEFAULT '{}',
  drive_folder_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_companies TO anon;
GRANT ALL ON public.fator_r_companies TO service_role;
ALTER TABLE public.fator_r_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage fator_r_companies" ON public.fator_r_companies FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.fator_r_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.fator_r_companies(id) ON DELETE SET NULL,
  drive_file_id text NOT NULL,
  drive_file_name text NOT NULL,
  drive_mime_type text DEFAULT 'application/pdf',
  drive_web_url text,
  drive_folder_id text,
  drive_parent_path text,
  cloud_storage_path text,
  file_hash text,
  storage_status text NOT NULL DEFAULT 'pending',
  uploaded_at timestamptz,
  file_month int,
  file_year int,
  detected_cnpj text,
  detected_company_name text,
  extraction_confidence numeric,
  declared_fator_r numeric,
  computed_fator_r numeric,
  fator_r_status text,
  not_applicable boolean DEFAULT false,
  raw_text text,
  extracted_data jsonb NOT NULL DEFAULT '{}',
  processing_status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fator_r_documents_drive_file_id_idx ON public.fator_r_documents(drive_file_id);
CREATE INDEX IF NOT EXISTS fator_r_documents_file_hash_idx ON public.fator_r_documents(file_hash);
CREATE INDEX IF NOT EXISTS fator_r_documents_company_period_idx ON public.fator_r_documents(company_id, file_year, file_month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_documents TO anon;
GRANT ALL ON public.fator_r_documents TO service_role;
ALTER TABLE public.fator_r_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage fator_r_documents" ON public.fator_r_documents FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.fator_r_monthly_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.fator_r_companies(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.fator_r_documents(id) ON DELETE SET NULL,
  reference_month int NOT NULL,
  reference_year int NOT NULL,
  fator_r_value numeric,
  fator_r_percent numeric,
  payroll_12m numeric,
  revenue_12m numeric,
  declared_fator_r numeric,
  computed_fator_r numeric,
  not_applicable boolean DEFAULT false,
  status text NOT NULL DEFAULT 'unknown',
  recommendation text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, reference_month, reference_year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_monthly_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_monthly_results TO anon;
GRANT ALL ON public.fator_r_monthly_results TO service_role;
ALTER TABLE public.fator_r_monthly_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage fator_r_monthly_results" ON public.fator_r_monthly_results FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.fator_r_processing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid,
  company_id uuid,
  event_type text NOT NULL,
  message text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_processing_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_processing_logs TO anon;
GRANT ALL ON public.fator_r_processing_logs TO service_role;
ALTER TABLE public.fator_r_processing_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage fator_r_processing_logs" ON public.fator_r_processing_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.fator_r_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.fator_r_companies(id) ON DELETE CASCADE,
  monthly_result_id uuid REFERENCES public.fator_r_monthly_results(id) ON DELETE SET NULL,
  alert_type text NOT NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_alerts TO anon;
GRANT ALL ON public.fator_r_alerts TO service_role;
ALTER TABLE public.fator_r_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage fator_r_alerts" ON public.fator_r_alerts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.fator_r_sync_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_enabled boolean NOT NULL DEFAULT true,
  email_alerts_enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_sync_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_sync_config TO anon;
GRANT ALL ON public.fator_r_sync_config TO service_role;
ALTER TABLE public.fator_r_sync_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage fator_r_sync_config" ON public.fator_r_sync_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.fator_r_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  old_data jsonb DEFAULT '{}',
  new_data jsonb DEFAULT '{}',
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_audit_logs TO anon;
GRANT ALL ON public.fator_r_audit_logs TO service_role;
ALTER TABLE public.fator_r_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage fator_r_audit_logs" ON public.fator_r_audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Folder cache for Drive structure
CREATE TABLE IF NOT EXISTS public.fator_r_drive_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL UNIQUE,
  drive_folder_id text NOT NULL,
  parent_folder_id text,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_drive_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fator_r_drive_folders TO anon;
GRANT ALL ON public.fator_r_drive_folders TO service_role;
ALTER TABLE public.fator_r_drive_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage fator_r_drive_folders" ON public.fator_r_drive_folders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
