-- Remove the legacy fiscal-certificate lookup/checklist system while preserving
-- guide delivery, companies, documents, sends, alerts, logs, Fator R and Classifica.

BEGIN;

DROP POLICY IF EXISTS "Authenticated users can read certidoes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload certidoes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update certidoes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete certidoes" ON storage.objects;
DELETE FROM storage.objects WHERE bucket_id = 'certidoes';
DELETE FROM storage.buckets WHERE id = 'certidoes';

ALTER TABLE IF EXISTS public.documentos
  ADD COLUMN IF NOT EXISTS categoria text;

UPDATE public.documentos
SET categoria = COALESCE(NULLIF(categoria, ''), 'outro')
WHERE categoria IS NULL OR categoria = '';

ALTER TABLE IF EXISTS public.documentos
  ALTER COLUMN categoria SET DEFAULT 'outro',
  ALTER COLUMN categoria SET NOT NULL,
  DROP COLUMN IF EXISTS cnd_item_id,
  DROP COLUMN IF EXISTS tipo;

ALTER TABLE IF EXISTS public.alertas
  ALTER COLUMN tipo DROP DEFAULT;

ALTER TABLE IF EXISTS public.alertas
  ALTER COLUMN tipo TYPE text
  USING CASE
    WHEN tipo::text IN (
      'vencimento_7d',
      'vencimento_3d',
      'vencimento_1d',
      'vencimento_hoje',
      'vencido',
      'sem_pdf',
      'checklist_incompleto'
    ) THEN 'operacional'
    ELSE COALESCE(tipo::text, 'operacional')
  END;

ALTER TABLE IF EXISTS public.alertas
  ALTER COLUMN tipo SET DEFAULT 'operacional',
  DROP COLUMN IF EXISTS cnd_item_id;

DROP TABLE IF EXISTS public.cnd_lookup_results CASCADE;
DROP TABLE IF EXISTS public.cnd_lookup_requests CASCADE;
DROP TABLE IF EXISTS public.cnd_historico CASCADE;
DROP TABLE IF EXISTS public.cnd_items CASCADE;

DROP TABLE IF EXISTS public.automation_exceptions CASCADE;
DROP TABLE IF EXISTS public.automation_artifacts CASCADE;
DROP TABLE IF EXISTS public.automation_job_logs CASCADE;
DROP TABLE IF EXISTS public.automation_jobs CASCADE;
DROP TABLE IF EXISTS public.company_lookup_results CASCADE;
DROP TABLE IF EXISTS public.company_lookup_requests CASCADE;
DROP TABLE IF EXISTS public.provider_health CASCADE;
DROP TABLE IF EXISTS public.automation_config_kv CASCADE;
DROP TABLE IF EXISTS public.hmac_nonces CASCADE;
DROP TABLE IF EXISTS public.feature_flags CASCADE;

DROP TABLE IF EXISTS public.retry_policies CASCADE;
DROP TABLE IF EXISTS public.scheduling_rules CASCADE;
DROP TABLE IF EXISTS public.automation_config CASCADE;
DROP TABLE IF EXISTS public.health_logs CASCADE;
DROP TABLE IF EXISTS public.automation_batches CASCADE;
DROP TABLE IF EXISTS public.exceptions CASCADE;
DROP TABLE IF EXISTS public.connector_run_steps CASCADE;
DROP TABLE IF EXISTS public.connector_runs CASCADE;
DROP TABLE IF EXISTS public.connectors CASCADE;

DROP TYPE IF EXISTS public.cnd_lookup_status CASCADE;
DROP TYPE IF EXISTS public.cnd_status CASCADE;
DROP TYPE IF EXISTS public.cnd_tipo CASCADE;
DROP TYPE IF EXISTS public.alerta_tipo CASCADE;
DROP TYPE IF EXISTS public.connector_type CASCADE;
DROP TYPE IF EXISTS public.connector_status CASCADE;
DROP TYPE IF EXISTS public.run_status CASCADE;
DROP TYPE IF EXISTS public.exception_status CASCADE;
DROP TYPE IF EXISTS public.confidence_level CASCADE;
DROP TYPE IF EXISTS public.run_step_etapa CASCADE;
DROP TYPE IF EXISTS public.run_step_status CASCADE;
DROP TYPE IF EXISTS public.exception_tipologia CASCADE;
DROP TYPE IF EXISTS public.exception_criticidade CASCADE;
DROP TYPE IF EXISTS public.batch_status CASCADE;
DROP TYPE IF EXISTS public.health_status CASCADE;
DROP TYPE IF EXISTS public.lookup_status CASCADE;
DROP TYPE IF EXISTS public.job_status CASCADE;
DROP TYPE IF EXISTS public.job_type CASCADE;
DROP TYPE IF EXISTS public.artifact_type CASCADE;
DROP TYPE IF EXISTS public.provider_runtime CASCADE;
DROP TYPE IF EXISTS public.provider_health_status CASCADE;

COMMIT;
