ALTER TABLE public.tax_reform_documents
  ADD COLUMN IF NOT EXISTS extracted_values jsonb,
  ADD COLUMN IF NOT EXISTS extracted_findings jsonb;