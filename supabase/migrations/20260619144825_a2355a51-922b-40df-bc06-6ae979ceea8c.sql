
ALTER TABLE public.guide_templates
  ADD COLUMN IF NOT EXISTS meta_template_name TEXT,
  ADD COLUMN IF NOT EXISTS meta_template_language TEXT DEFAULT 'pt_BR',
  ADD COLUMN IF NOT EXISTS meta_template_has_document_header BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS meta_template_category TEXT DEFAULT 'utility',
  ADD COLUMN IF NOT EXISTS meta_template_status TEXT DEFAULT 'active';

ALTER TABLE public.guia_envios
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'meta_whatsapp',
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_payload JSONB,
  ADD COLUMN IF NOT EXISTS provider_error TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

INSERT INTO public.guide_templates (tipo_guia, canal, assunto, corpo, ativo,
  meta_template_name, meta_template_language, meta_template_has_document_header, meta_template_category, meta_template_status)
SELECT t::public.tipo_guia, 'whatsapp', NULL,
  'Segue a guia {{tipo_guia}} da empresa {{empresa}}.' || E'\n\n' ||
  'Competência: {{competencia}}' || E'\n' ||
  'Vencimento: {{vencimento}}' || E'\n' ||
  'Valor: {{valor}}',
  false, 'envio_guia_fiscal', 'pt_BR', true, 'utility', 'active'
FROM unnest(ARRAY['das','fgts','daf','darf','gps_inss','iss','icms','outros']) AS t
WHERE NOT EXISTS (
  SELECT 1 FROM public.guide_templates gt
  WHERE gt.tipo_guia::text = t AND gt.canal = 'whatsapp'
);
