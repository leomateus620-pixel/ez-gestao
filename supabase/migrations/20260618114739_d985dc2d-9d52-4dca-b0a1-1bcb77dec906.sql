
-- 1. Enum hardening: add quarentena and processando aliases used by new pipeline
ALTER TYPE public.guia_status ADD VALUE IF NOT EXISTS 'quarentena';
ALTER TYPE public.guia_status ADD VALUE IF NOT EXISTS 'processando';
ALTER TYPE public.guia_status ADD VALUE IF NOT EXISTS 'aguardando_processamento';
ALTER TYPE public.guia_status ADD VALUE IF NOT EXISTS 'revisao_manual';

-- 2. guias: add missing decision/audit columns
ALTER TABLE public.guias
  ADD COLUMN IF NOT EXISTS critical_fields_json jsonb,
  ADD COLUMN IF NOT EXISTS validation_issues_json jsonb,
  ADD COLUMN IF NOT EXISTS decision_status text,
  ADD COLUMN IF NOT EXISTS decision_reason text,
  ADD COLUMN IF NOT EXISTS decision_reasons jsonb,
  ADD COLUMN IF NOT EXISTS manual_review_level text,
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz,
  ADD COLUMN IF NOT EXISTS duplicate_level text,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.guias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS authorized_reprocess boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispatch_blocked_reason text,
  ADD COLUMN IF NOT EXISTS drive_organization_pending boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS operation_batch_id uuid,
  ADD COLUMN IF NOT EXISTS test_preview_json jsonb,
  ADD COLUMN IF NOT EXISTS pdf_link_signed_url text,
  ADD COLUMN IF NOT EXISTS pdf_link_expires_at timestamptz;

-- 3. empresas: learning patterns
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS guia_learning_patterns jsonb DEFAULT '{}'::jsonb;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS guias_operation_batch_idx ON public.guias(operation_batch_id);
CREATE INDEX IF NOT EXISTS guias_status_idx ON public.guias(status);
CREATE INDEX IF NOT EXISTS guias_received_at_idx ON public.guias(received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS guias_dedup_hash_uniq ON public.guias(dedup_hash) WHERE dedup_hash IS NOT NULL;

-- 5. Tighten RLS on integracoes_guias (was open to anon)
DROP POLICY IF EXISTS "Public can manage integracoes_guias" ON public.integracoes_guias;
CREATE POLICY "Authenticated read integracoes_guias"
  ON public.integracoes_guias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages integracoes_guias"
  ON public.integracoes_guias FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.integracoes_guias FROM anon;
GRANT SELECT ON public.integracoes_guias TO authenticated;
GRANT ALL ON public.integracoes_guias TO service_role;

-- 6. Storage RLS for new private bucket guia-pdf-links
-- (Bucket itself is created via the storage tool; policies live on storage.objects)
DROP POLICY IF EXISTS "guia-pdf-links service write" ON storage.objects;
CREATE POLICY "guia-pdf-links service write"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'guia-pdf-links')
  WITH CHECK (bucket_id = 'guia-pdf-links');

-- 7. Seed default templates if missing
INSERT INTO public.guide_templates (tipo_guia, canal, assunto, corpo, ativo)
SELECT v.tipo_guia::tipo_guia, v.canal, v.assunto, v.corpo, true
FROM (VALUES
  ('das','email','[EMPRESA] - DAS [COMPETENCIA] - vence [VENCIMENTO]',
   E'Olá,\n\nSegue em anexo a guia DAS de [EMPRESA] ([CNPJ]).\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]\n\n[TIPO_GUIA]'),
  ('das','whatsapp',NULL,
   E'Olá! Sua guia DAS de [EMPRESA] ([CNPJ]) — competência [COMPETENCIA], vencimento [VENCIMENTO], valor [VALOR]. PDF: [LINK_GUIA] ([TIPO_GUIA])'),
  ('fgts','email','[EMPRESA] - FGTS [COMPETENCIA] - vence [VENCIMENTO]',
   E'Olá,\n\nSegue a guia FGTS Digital de [EMPRESA] ([CNPJ]).\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]\n\n[TIPO_GUIA]'),
  ('fgts','whatsapp',NULL,
   E'Guia FGTS de [EMPRESA] ([CNPJ]) — [COMPETENCIA], vence [VENCIMENTO], valor [VALOR]. PDF: [LINK_GUIA] ([TIPO_GUIA])'),
  ('daf','email','[EMPRESA] - DAF [COMPETENCIA] - vence [VENCIMENTO]',
   E'Olá,\n\nSegue a guia DAF de [EMPRESA] ([CNPJ]).\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]\n\n[TIPO_GUIA]'),
  ('daf','whatsapp',NULL,
   E'Guia DAF de [EMPRESA] ([CNPJ]) — [COMPETENCIA], vence [VENCIMENTO], valor [VALOR]. PDF: [LINK_GUIA] ([TIPO_GUIA])'),
  ('darf','email','[EMPRESA] - DARF [COMPETENCIA] - vence [VENCIMENTO]',
   E'Olá,\n\nSegue a guia DARF de [EMPRESA] ([CNPJ]).\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]\n\n[TIPO_GUIA]'),
  ('darf','whatsapp',NULL,
   E'Guia DARF de [EMPRESA] ([CNPJ]) — [COMPETENCIA], vence [VENCIMENTO], valor [VALOR]. PDF: [LINK_GUIA] ([TIPO_GUIA])'),
  ('gps_inss','email','[EMPRESA] - GPS/INSS [COMPETENCIA] - vence [VENCIMENTO]',
   E'Olá,\n\nSegue a guia GPS/INSS de [EMPRESA] ([CNPJ]).\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]\n\n[TIPO_GUIA]'),
  ('gps_inss','whatsapp',NULL,
   E'Guia GPS/INSS de [EMPRESA] ([CNPJ]) — [COMPETENCIA], vence [VENCIMENTO], valor [VALOR]. PDF: [LINK_GUIA] ([TIPO_GUIA])'),
  ('iss','email','[EMPRESA] - ISS [COMPETENCIA] - vence [VENCIMENTO]',
   E'Olá,\n\nSegue a guia ISS de [EMPRESA] ([CNPJ]).\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]\n\n[TIPO_GUIA]'),
  ('iss','whatsapp',NULL,
   E'Guia ISS de [EMPRESA] ([CNPJ]) — [COMPETENCIA], vence [VENCIMENTO], valor [VALOR]. PDF: [LINK_GUIA] ([TIPO_GUIA])'),
  ('icms','email','[EMPRESA] - ICMS [COMPETENCIA] - vence [VENCIMENTO]',
   E'Olá,\n\nSegue a guia ICMS de [EMPRESA] ([CNPJ]).\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]\n\n[TIPO_GUIA]'),
  ('icms','whatsapp',NULL,
   E'Guia ICMS de [EMPRESA] ([CNPJ]) — [COMPETENCIA], vence [VENCIMENTO], valor [VALOR]. PDF: [LINK_GUIA] ([TIPO_GUIA])'),
  ('outros','email','[EMPRESA] - [TIPO_GUIA] [COMPETENCIA] - vence [VENCIMENTO]',
   E'Olá,\n\nSegue a guia [TIPO_GUIA] de [EMPRESA] ([CNPJ]).\nCompetência: [COMPETENCIA]\nVencimento: [VENCIMENTO]\nValor: [VALOR]'),
  ('outros','whatsapp',NULL,
   E'Guia [TIPO_GUIA] de [EMPRESA] ([CNPJ]) — [COMPETENCIA], vence [VENCIMENTO], valor [VALOR]. PDF: [LINK_GUIA]')
) AS v(tipo_guia, canal, assunto, corpo)
ON CONFLICT (tipo_guia, canal) DO NOTHING;
