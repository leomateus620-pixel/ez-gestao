-- Guide delivery pipeline: secure ingestion, routing, dispatch and audit trail.

DO $$ BEGIN
  CREATE TYPE public.guia_status AS ENUM (
    'aguardando', 'lendo', 'ocr', 'identificada', 'enviando',
    'enviada', 'erro', 'revisao'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.guia_match_source AS ENUM (
    'filename', 'pdf_text', 'ocr', 'multiple', 'none'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.guia_dispatch_status AS ENUM (
    'pendente', 'aceito', 'entregue', 'falhou'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.integration_health AS ENUM (
    'desconectado', 'configurado', 'ativo', 'erro'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS canal_preferido public.canal_envio,
  ADD COLUMN IF NOT EXISTS email_validado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS comunicacao_ativa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS saudacao_guia text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.guias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  sha256 text,
  status public.guia_status NOT NULL DEFAULT 'aguardando',
  match_source public.guia_match_source NOT NULL DEFAULT 'none',
  cnpj_detectado text,
  empresa_id uuid REFERENCES public.empresas(id),
  tipo_guia text,
  competencia text,
  vencimento date,
  valor numeric(14, 2),
  texto_extraido_preview text,
  ocr_confidence numeric(4, 3) CHECK (ocr_confidence >= 0 AND ocr_confidence <= 1),
  ocr_operation_name text,
  ocr_output_uri text,
  pasta_atual text NOT NULL DEFAULT 'a_enviar'
    CHECK (pasta_atual IN ('a_enviar', 'enviados')),
  source_folder_id text,
  sent_folder_id text,
  provider_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  sent_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guias_status_idx ON public.guias(status, received_at DESC);
CREATE INDEX IF NOT EXISTS guias_empresa_idx ON public.guias(empresa_id, received_at DESC);
CREATE INDEX IF NOT EXISTS guias_cnpj_idx ON public.guias(cnpj_detectado);

CREATE TABLE IF NOT EXISTS public.guia_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_id uuid NOT NULL REFERENCES public.guias(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  canal public.canal_envio NOT NULL,
  destinatario text NOT NULL,
  assunto text,
  mensagem_preview text NOT NULL DEFAULT '',
  template_sid text,
  provider_message_id text,
  idempotency_key text NOT NULL UNIQUE,
  status public.guia_dispatch_status NOT NULL DEFAULT 'pendente',
  sanitized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  provider_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS guia_envios_provider_message_id_idx
  ON public.guia_envios(provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS guia_envios_guia_idx
  ON public.guia_envios(guia_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.guia_excecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_id uuid REFERENCES public.guias(id) ON DELETE CASCADE,
  exception_type text NOT NULL,
  severity public.exception_severity NOT NULL DEFAULT 'warning',
  status public.exception_lifecycle NOT NULL DEFAULT 'open',
  reason text NOT NULL,
  detected_data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_recommended text NOT NULL DEFAULT '',
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guia_excecoes_status_idx
  ON public.guia_excecoes(status, severity, created_at DESC);

CREATE TABLE IF NOT EXISTS public.guia_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_id uuid NOT NULL REFERENCES public.guias(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  level public.log_level NOT NULL DEFAULT 'info',
  message text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guia_eventos_guia_idx
  ON public.guia_eventos(guia_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.integracoes_guias (
  provider text PRIMARY KEY
    CHECK (provider IN ('google_drive', 'gmail', 'twilio_whatsapp', 'google_vision')),
  display_name text NOT NULL,
  status public.integration_health NOT NULL DEFAULT 'desconectado',
  source_folder_id text,
  sent_folder_id text,
  sender_identity text,
  schedule_minutes integer NOT NULL DEFAULT 5 CHECK (schedule_minutes >= 5),
  secret_reference text,
  last_check_at timestamptz,
  last_error text,
  configured_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tokens encrypted by an Edge Function are service-role only; there is no client policy.
CREATE TABLE IF NOT EXISTS public.integracao_segredos (
  provider text PRIMARY KEY,
  encrypted_refresh_token text NOT NULL,
  encryption_iv text NOT NULL,
  key_version text NOT NULL DEFAULT 'v1',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guide_rate_limits (
  limiter_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1
);

INSERT INTO public.integracoes_guias(provider, display_name)
VALUES
  ('google_drive', 'Google Drive'),
  ('gmail', 'Gmail'),
  ('twilio_whatsapp', 'Twilio WhatsApp'),
  ('google_vision', 'Google Cloud Vision')
ON CONFLICT (provider) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_guide_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guias_touch_updated_at ON public.guias;
CREATE TRIGGER guias_touch_updated_at
BEFORE UPDATE ON public.guias
FOR EACH ROW EXECUTE FUNCTION public.touch_guide_updated_at();

DROP TRIGGER IF EXISTS guia_envios_touch_updated_at ON public.guia_envios;
CREATE TRIGGER guia_envios_touch_updated_at
BEFORE UPDATE ON public.guia_envios
FOR EACH ROW EXECUTE FUNCTION public.touch_guide_updated_at();

DROP TRIGGER IF EXISTS guia_excecoes_touch_updated_at ON public.guia_excecoes;
CREATE TRIGGER guia_excecoes_touch_updated_at
BEFORE UPDATE ON public.guia_excecoes
FOR EACH ROW EXECUTE FUNCTION public.touch_guide_updated_at();

DROP TRIGGER IF EXISTS integracoes_guias_touch_updated_at ON public.integracoes_guias;
CREATE TRIGGER integracoes_guias_touch_updated_at
BEFORE UPDATE ON public.integracoes_guias
FOR EACH ROW EXECUTE FUNCTION public.touch_guide_updated_at();

ALTER TABLE public.guias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guia_envios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guia_excecoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guia_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracoes_guias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracao_segredos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Administrator can manage guias"
  ON public.guias FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can manage guia_envios"
  ON public.guia_envios FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can manage guia_excecoes"
  ON public.guia_excecoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can read guia_eventos"
  ON public.guia_eventos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Administrator can manage integracoes_guias"
  ON public.integracoes_guias FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.consume_guide_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_count integer;
BEGIN
  INSERT INTO public.guide_rate_limits(limiter_key, window_started_at, request_count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (limiter_key) DO UPDATE SET
    window_started_at = CASE
      WHEN public.guide_rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds)
        THEN now()
      ELSE public.guide_rate_limits.window_started_at
    END,
    request_count = CASE
      WHEN public.guide_rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE public.guide_rate_limits.request_count + 1
    END
  RETURNING request_count INTO current_count;
  RETURN current_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_guide_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_guide_rate_limit(text, integer, integer) TO service_role;

-- Remove legacy anonymous management introduced during prototyping.
DROP POLICY IF EXISTS "Public can manage empresas" ON public.empresas;
DROP POLICY IF EXISTS "Public can manage cnd_items" ON public.cnd_items;
DROP POLICY IF EXISTS "Public can manage documentos" ON public.documentos;
DROP POLICY IF EXISTS "Public can manage envios" ON public.envios;
DROP POLICY IF EXISTS "Public can manage alertas" ON public.alertas;
DROP POLICY IF EXISTS "Public can manage logs_acesso" ON public.logs_acesso;
DROP POLICY IF EXISTS "Public can manage audit_trail" ON public.audit_trail;
DROP POLICY IF EXISTS "Public can manage cnd_historico" ON public.cnd_historico;
DROP POLICY IF EXISTS "Public can manage connectors" ON public.connectors;
DROP POLICY IF EXISTS "Public can manage connector_runs" ON public.connector_runs;
DROP POLICY IF EXISTS "Public can manage connector_run_steps" ON public.connector_run_steps;
DROP POLICY IF EXISTS "Public can manage exceptions" ON public.exceptions;
DROP POLICY IF EXISTS "Public can manage automation_batches" ON public.automation_batches;
DROP POLICY IF EXISTS "Public can manage automation_config" ON public.automation_config;
DROP POLICY IF EXISTS "Public can manage health_logs" ON public.health_logs;
DROP POLICY IF EXISTS "Public can manage retry_policies" ON public.retry_policies;
DROP POLICY IF EXISTS "Public can manage scheduling_rules" ON public.scheduling_rules;
DROP POLICY IF EXISTS "Public can manage feature_flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Public can manage automation_config_kv" ON public.automation_config_kv;
DROP POLICY IF EXISTS "Public can manage provider_health" ON public.provider_health;
DROP POLICY IF EXISTS "Public can manage company_lookup_requests" ON public.company_lookup_requests;
DROP POLICY IF EXISTS "Public can manage company_lookup_results" ON public.company_lookup_results;
DROP POLICY IF EXISTS "Public can manage cnd_lookup_requests" ON public.cnd_lookup_requests;
DROP POLICY IF EXISTS "Public can manage cnd_lookup_results" ON public.cnd_lookup_results;
DROP POLICY IF EXISTS "Public can manage automation_jobs" ON public.automation_jobs;
DROP POLICY IF EXISTS "Public can manage automation_job_logs" ON public.automation_job_logs;
DROP POLICY IF EXISTS "Public can manage automation_artifacts" ON public.automation_artifacts;
DROP POLICY IF EXISTS "Public can manage automation_exceptions" ON public.automation_exceptions;

CREATE POLICY "Administrator can manage feature_flags"
  ON public.feature_flags FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can manage automation_config_kv"
  ON public.automation_config_kv FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can manage provider_health"
  ON public.provider_health FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can manage company_lookup_requests"
  ON public.company_lookup_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can manage company_lookup_results"
  ON public.company_lookup_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can manage cnd_lookup_requests"
  ON public.cnd_lookup_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can manage cnd_lookup_results"
  ON public.cnd_lookup_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can manage automation_jobs"
  ON public.automation_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can manage automation_job_logs"
  ON public.automation_job_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can manage automation_artifacts"
  ON public.automation_artifacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Administrator can manage automation_exceptions"
  ON public.automation_exceptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('guias-delivery', 'guias-delivery', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY "Administrator can read private guide deliveries"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'guias-delivery');

-- Cron invokes the scanner only when deployment secrets have been stored in Vault.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE OR REPLACE FUNCTION public.run_scheduled_guide_scan()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  project_url text;
  cron_secret text;
BEGIN
  SELECT decrypted_secret INTO project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret
    FROM vault.decrypted_secrets WHERE name = 'guide_cron_secret' LIMIT 1;

  IF project_url IS NULL OR cron_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := project_url || '/functions/v1/scan-guide-folder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Guide-Cron-Secret', cron_secret
    ),
    body := '{"trigger":"cron"}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_scheduled_guide_scan() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_scheduled_guide_scan() TO service_role;

DO $$
DECLARE scheduled_job bigint;
BEGIN
  SELECT jobid INTO scheduled_job
  FROM cron.job
  WHERE jobname = 'scan-guide-folder-every-5-minutes';
  IF scheduled_job IS NOT NULL THEN
    PERFORM cron.unschedule(scheduled_job);
  END IF;
END $$;

SELECT cron.schedule(
  'scan-guide-folder-every-5-minutes',
  '*/5 * * * *',
  'SELECT public.run_scheduled_guide_scan();'
);
