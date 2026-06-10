-- =====================================================================
-- Tax Reform V2 — schema + grants + RLS + storage policies
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.tax_reform_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL CHECK (length(trim(company_name)) > 0),
  cnpj text NOT NULL CHECK (length(regexp_replace(cnpj, '\D', '', 'g')) = 14),
  current_tax_regime text NOT NULL CHECK (current_tax_regime IN ('simples_nacional','lucro_presumido')),
  main_activity text NOT NULL CHECK (main_activity IN ('comercio','industria','servicos','misto')),
  responsible_user text NOT NULL CHECK (length(trim(responsible_user)) > 0),
  analysis_year int CHECK (analysis_year IS NULL OR analysis_year BETWEEN 2026 AND 2100),
  rbt12 numeric(14,2) CHECK (rbt12 IS NULL OR rbt12 >= 0),
  projected_revenue numeric(14,2) CHECK (projected_revenue IS NULL OR projected_revenue >= 0),
  effective_tax_rate numeric(6,2) CHECK (effective_tax_rate IS NULL OR effective_tax_rate BETWEEN 0 AND 100),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_reform_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.tax_reform_companies(id) ON DELETE CASCADE,
  analysis_year int NOT NULL CHECK (analysis_year BETWEEN 2026 AND 2100),
  status text NOT NULL DEFAULT 'cadastro_iniciado' CHECK (status IN ('cadastro_iniciado','questionario_pendente','aguardando_documentos','documentos_anexados','analise_concluida','necessita_revisao_manual')),
  score_total int DEFAULT 0 CHECK (score_total BETWEEN 0 AND 100),
  score_clients int DEFAULT 0 CHECK (score_clients BETWEEN 0 AND 60),
  score_costs int DEFAULT 0 CHECK (score_costs BETWEEN 0 AND 25),
  score_current_tax int DEFAULT 0 CHECK (score_current_tax BETWEEN 0 AND 15),
  risk_level text DEFAULT 'dados_insuficientes' CHECK (risk_level IN ('baixo_risco','risco_medio','alto_risco','dados_insuficientes')),
  recommendation text DEFAULT 'analise_manual_necessaria' CHECK (recommendation IN ('permanecer_simples','avaliar_lucro_presumido','permanecer_lucro_presumido','avaliar_simples_nacional','analise_manual_necessaria')),
  automatic_summary text,
  manual_opinion text,
  final_decision text,
  confidence_level text DEFAULT 'baixa',
  confidence_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_reform_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.tax_reform_analyses(id) ON DELETE CASCADE,
  question_key text NOT NULL CHECK (length(trim(question_key)) > 0),
  question_label text NOT NULL CHECK (length(trim(question_label)) > 0),
  answer_value jsonb,
  answer_type text NOT NULL CHECK (answer_type IN ('percent','select','multi','text','number','boolean')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, question_key)
);

CREATE TABLE IF NOT EXISTS public.tax_reform_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.tax_reform_analyses(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.tax_reform_companies(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('dre','balancete','pgdas','faturamento_cliente','fornecedores','folha_pagamento','fluxo_caixa','vendas_cfop','nfse','outros')),
  file_name text NOT NULL CHECK (length(trim(file_name)) > 0),
  file_url text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  mime_type text,
  reading_status text NOT NULL DEFAULT 'aguardando_leitura' CHECK (reading_status IN ('aguardando_leitura','lido','erro_leitura','nao_processavel')),
  extracted_summary text,
  extraction_error text,
  storage_bucket text DEFAULT 'tax-reform-documents',
  storage_path text,
  upload_status text DEFAULT 'enviado',
  upload_error text,
  uploaded_by uuid,
  extraction_confidence numeric(5,2),
  document_confidence_weight numeric(5,2) DEFAULT 1.0,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_reform_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.tax_reform_analyses(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('commercial_risk','likely_simples','missing_documents','manual_review')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  message text NOT NULL CHECK (length(trim(message)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Colunas adicionais para garantir compatibilidade
ALTER TABLE public.tax_reform_analyses
  ADD COLUMN IF NOT EXISTS confidence_level text DEFAULT 'baixa',
  ADD COLUMN IF NOT EXISTS confidence_reason text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_reform_analyses_confidence_level_check') THEN
    ALTER TABLE public.tax_reform_analyses
      ADD CONSTRAINT tax_reform_analyses_confidence_level_check
      CHECK (confidence_level IN ('baixa','media','alta'));
  END IF;
END $$;

ALTER TABLE public.tax_reform_documents
  ADD COLUMN IF NOT EXISTS storage_bucket text DEFAULT 'tax-reform-documents',
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS upload_status text DEFAULT 'enviado',
  ADD COLUMN IF NOT EXISTS upload_error text,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric(5,2),
  ADD COLUMN IF NOT EXISTS document_confidence_weight numeric(5,2) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_reform_documents_upload_status_check') THEN
    ALTER TABLE public.tax_reform_documents
      ADD CONSTRAINT tax_reform_documents_upload_status_check
      CHECK (upload_status IN ('enviado','erro_upload'));
  END IF;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_tax_reform_companies_cnpj ON public.tax_reform_companies(cnpj);
CREATE INDEX IF NOT EXISTS idx_tax_reform_companies_regime ON public.tax_reform_companies(current_tax_regime);
CREATE INDEX IF NOT EXISTS idx_tax_reform_analyses_company_id ON public.tax_reform_analyses(company_id);
CREATE INDEX IF NOT EXISTS idx_tax_reform_analyses_status ON public.tax_reform_analyses(status);
CREATE INDEX IF NOT EXISTS idx_tax_reform_analyses_company_year ON public.tax_reform_analyses(company_id, analysis_year DESC);
CREATE INDEX IF NOT EXISTS idx_tax_reform_analyses_updated_at ON public.tax_reform_analyses(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tax_reform_answers_analysis_id ON public.tax_reform_answers(analysis_id);
CREATE INDEX IF NOT EXISTS idx_tax_reform_documents_analysis_id ON public.tax_reform_documents(analysis_id);
CREATE INDEX IF NOT EXISTS idx_tax_reform_documents_company_id ON public.tax_reform_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_tax_reform_documents_type ON public.tax_reform_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_tax_reform_documents_upload_status ON public.tax_reform_documents(upload_status);
CREATE INDEX IF NOT EXISTS idx_tax_reform_alerts_analysis_id ON public.tax_reform_alerts(analysis_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_reform_analyses_id_company ON public.tax_reform_analyses(id, company_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_reform_documents_analysis_company_fkey') THEN
    ALTER TABLE public.tax_reform_documents
      ADD CONSTRAINT tax_reform_documents_analysis_company_fkey
      FOREIGN KEY (analysis_id, company_id)
      REFERENCES public.tax_reform_analyses(id, company_id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tax_reform_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_tax_reform_companies_updated_at ON public.tax_reform_companies;
CREATE TRIGGER trg_tax_reform_companies_updated_at BEFORE UPDATE ON public.tax_reform_companies FOR EACH ROW EXECUTE FUNCTION public.tax_reform_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tax_reform_analyses_updated_at ON public.tax_reform_analyses;
CREATE TRIGGER trg_tax_reform_analyses_updated_at BEFORE UPDATE ON public.tax_reform_analyses FOR EACH ROW EXECUTE FUNCTION public.tax_reform_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tax_reform_answers_updated_at ON public.tax_reform_answers;
CREATE TRIGGER trg_tax_reform_answers_updated_at BEFORE UPDATE ON public.tax_reform_answers FOR EACH ROW EXECUTE FUNCTION public.tax_reform_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tax_reform_documents_updated_at ON public.tax_reform_documents;
CREATE TRIGGER trg_tax_reform_documents_updated_at BEFORE UPDATE ON public.tax_reform_documents FOR EACH ROW EXECUTE FUNCTION public.tax_reform_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tax_reform_alerts_updated_at ON public.tax_reform_alerts;
CREATE TRIGGER trg_tax_reform_alerts_updated_at BEFORE UPDATE ON public.tax_reform_alerts FOR EACH ROW EXECUTE FUNCTION public.tax_reform_touch_updated_at();

-- GRANTs (obrigatórios para a Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_reform_companies TO authenticated;
GRANT ALL ON public.tax_reform_companies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_reform_analyses TO authenticated;
GRANT ALL ON public.tax_reform_analyses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_reform_answers TO authenticated;
GRANT ALL ON public.tax_reform_answers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_reform_documents TO authenticated;
GRANT ALL ON public.tax_reform_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_reform_alerts TO authenticated;
GRANT ALL ON public.tax_reform_alerts TO service_role;

-- RLS
ALTER TABLE public.tax_reform_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_reform_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_reform_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_reform_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_reform_alerts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tax_reform_companies','tax_reform_analyses','tax_reform_answers','tax_reform_documents','tax_reform_alerts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tr_auth_select_%1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "tr_auth_select_%1$s" ON public.%1$s FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "tr_auth_insert_%1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "tr_auth_insert_%1$s" ON public.%1$s FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "tr_auth_update_%1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "tr_auth_update_%1$s" ON public.%1$s FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "tr_auth_delete_%1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "tr_auth_delete_%1$s" ON public.%1$s FOR DELETE TO authenticated USING (true)', t);
  END LOOP;
END $$;

-- Políticas de storage (bucket criado via tool)
DROP POLICY IF EXISTS "tr_storage_select" ON storage.objects;
CREATE POLICY "tr_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tax-reform-documents');

DROP POLICY IF EXISTS "tr_storage_insert" ON storage.objects;
CREATE POLICY "tr_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tax-reform-documents');

DROP POLICY IF EXISTS "tr_storage_update" ON storage.objects;
CREATE POLICY "tr_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tax-reform-documents') WITH CHECK (bucket_id = 'tax-reform-documents');

DROP POLICY IF EXISTS "tr_storage_delete" ON storage.objects;
CREATE POLICY "tr_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tax-reform-documents');
