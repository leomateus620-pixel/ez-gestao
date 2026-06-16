
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS regra_envio_especial TEXT;

ALTER TABLE public.guias
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS tipo_guia_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS tipo_guia_normalized public.tipo_guia,
  ADD COLUMN IF NOT EXISTS valor_extraido_raw TEXT,
  ADD COLUMN IF NOT EXISTS codigo_barras TEXT,
  ADD COLUMN IF NOT EXISTS identificador_guia TEXT,
  ADD COLUMN IF NOT EXISTS dedup_hash TEXT,
  ADD COLUMN IF NOT EXISTS revisao_correcoes JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS modo TEXT NOT NULL DEFAULT 'producao' CHECK (modo IN ('teste','producao')),
  ADD COLUMN IF NOT EXISTS razao_social_detectada TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS guias_dedup_hash_active_uidx
  ON public.guias(dedup_hash)
  WHERE dedup_hash IS NOT NULL AND status <> 'duplicada'::guia_status AND status <> 'erro'::guia_status;

CREATE INDEX IF NOT EXISTS guias_status_idx ON public.guias(status);
CREATE INDEX IF NOT EXISTS guias_empresa_idx ON public.guias(empresa_id);

ALTER TABLE public.integracoes_guias
  ADD COLUMN IF NOT EXISTS review_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS not_identified_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS errors_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS duplicates_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS root_folder_id TEXT;

CREATE TABLE IF NOT EXISTS public.guide_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_guia public.tipo_guia NOT NULL,
  canal TEXT NOT NULL CHECK (canal IN ('email','whatsapp')),
  assunto TEXT,
  corpo TEXT NOT NULL,
  twilio_content_sid TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo_guia, canal)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guide_templates TO authenticated;
GRANT ALL ON public.guide_templates TO service_role;
ALTER TABLE public.guide_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage guide templates" ON public.guide_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER guide_templates_updated_at BEFORE UPDATE ON public.guide_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.guide_templates (tipo_guia, canal, assunto, corpo) VALUES
('das','email','Guia DAS - [EMPRESA] - Competência [COMPETENCIA]', E'Olá,\n\nSegue em anexo a guia DAS (Simples Nacional) da empresa [EMPRESA] (CNPJ: [CNPJ]), referente à competência [COMPETENCIA].\n\nVencimento: [VENCIMENTO]\nValor: [VALOR]\n\nAtenciosamente.'),
('das','whatsapp',NULL, E'Segue a guia DAS da empresa [EMPRESA].\n\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('fgts','email','Guia FGTS - [EMPRESA] - Competência [COMPETENCIA]', E'Olá,\n\nSegue em anexo a guia FGTS Digital da empresa [EMPRESA] (CNPJ: [CNPJ]), referente à competência [COMPETENCIA].\n\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('fgts','whatsapp',NULL, E'Segue a guia FGTS da empresa [EMPRESA].\n\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('darf','email','Guia DARF - [EMPRESA] - Competência [COMPETENCIA]', E'Olá,\n\nSegue em anexo o DARF da empresa [EMPRESA] (CNPJ: [CNPJ]), referente à competência [COMPETENCIA].\n\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('darf','whatsapp',NULL, E'Segue o DARF da empresa [EMPRESA].\n\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('daf','email','Guia DAF - [EMPRESA] - Competência [COMPETENCIA]', E'Segue em anexo o DAF da empresa [EMPRESA] (CNPJ: [CNPJ]), competência [COMPETENCIA].\n\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('daf','whatsapp',NULL, E'Segue o DAF da empresa [EMPRESA].\n\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('gps_inss','email','Guia GPS/INSS - [EMPRESA] - Competência [COMPETENCIA]', E'Segue em anexo a guia GPS (INSS) da empresa [EMPRESA] (CNPJ: [CNPJ]), competência [COMPETENCIA].\n\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('gps_inss','whatsapp',NULL, E'Segue a guia GPS/INSS da empresa [EMPRESA].\n\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('iss','email','Guia ISS - [EMPRESA] - Competência [COMPETENCIA]', E'Segue em anexo a guia ISS da empresa [EMPRESA] (CNPJ: [CNPJ]), competência [COMPETENCIA].\n\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('iss','whatsapp',NULL, E'Segue a guia ISS da empresa [EMPRESA].\n\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('icms','email','Guia ICMS - [EMPRESA] - Competência [COMPETENCIA]', E'Segue em anexo a guia ICMS da empresa [EMPRESA] (CNPJ: [CNPJ]), competência [COMPETENCIA].\n\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('icms','whatsapp',NULL, E'Segue a guia ICMS da empresa [EMPRESA].\n\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('outros','email','Guia [TIPO_GUIA] - [EMPRESA] - Competência [COMPETENCIA]', E'Segue em anexo a guia [TIPO_GUIA] da empresa [EMPRESA] (CNPJ: [CNPJ]), competência [COMPETENCIA].\n\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
('outros','whatsapp',NULL, E'Segue a guia [TIPO_GUIA] da empresa [EMPRESA].\n\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]')
ON CONFLICT (tipo_guia, canal) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.guide_test_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  modo_global TEXT NOT NULL DEFAULT 'teste' CHECK (modo_global IN ('teste','producao')),
  email_teste TEXT,
  whatsapp_teste TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.guide_test_config TO authenticated;
GRANT ALL ON public.guide_test_config TO service_role;
ALTER TABLE public.guide_test_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth manage guide test config" ON public.guide_test_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.guide_test_config (id, modo_global) VALUES (1, 'teste') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.guide_batch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  modo TEXT NOT NULL DEFAULT 'producao',
  total INT NOT NULL DEFAULT 0,
  identificadas INT NOT NULL DEFAULT 0,
  enviadas INT NOT NULL DEFAULT 0,
  revisao INT NOT NULL DEFAULT 0,
  erros INT NOT NULL DEFAULT 0,
  duplicadas INT NOT NULL DEFAULT 0,
  nao_identificadas INT NOT NULL DEFAULT 0,
  triggered_by UUID,
  notes TEXT
);
GRANT SELECT ON public.guide_batch_runs TO authenticated;
GRANT ALL ON public.guide_batch_runs TO service_role;
ALTER TABLE public.guide_batch_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read guide batches" ON public.guide_batch_runs FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.guide_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_id UUID REFERENCES public.guias(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.guide_audit TO authenticated;
GRANT ALL ON public.guide_audit TO service_role;
ALTER TABLE public.guide_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read guide audit" ON public.guide_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert guide audit" ON public.guide_audit FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS guide_audit_guia_idx ON public.guide_audit(guia_id, created_at DESC);
