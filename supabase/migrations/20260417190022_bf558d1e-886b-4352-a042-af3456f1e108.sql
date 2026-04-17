
-- =========================================
-- ENUMS (isolados, prefixados por "lookup_" e "job_" para não colidir)
-- =========================================
CREATE TYPE public.lookup_status AS ENUM (
  'queued', 'running', 'success', 'partial', 'failed', 'manual_required', 'cancelled'
);

CREATE TYPE public.cnd_lookup_status AS ENUM (
  'negativa', 'positiva_com_efeitos', 'positiva', 'nao_emitida',
  'indisponivel', 'captcha', 'erro_layout', 'manual_required', 'erro_transitorio'
);

CREATE TYPE public.job_status AS ENUM (
  'queued', 'dispatched', 'running', 'waiting_callback',
  'success', 'partial', 'failed', 'manual_required', 'retry_scheduled', 'cancelled'
);

CREATE TYPE public.job_type AS ENUM ('cnpj_lookup', 'cnd_lookup', 'dry_run');

CREATE TYPE public.artifact_type AS ENUM ('screenshot', 'html', 'pdf', 'trace', 'text');

CREATE TYPE public.provider_runtime AS ENUM ('cloudflare_worker_browser_run');

CREATE TYPE public.provider_health_status AS ENUM ('online', 'degraded', 'offline', 'paused');

CREATE TYPE public.exception_severity AS ENUM ('info', 'warning', 'error', 'critical');

CREATE TYPE public.exception_lifecycle AS ENUM ('open', 'investigating', 'resolved', 'ignored');

CREATE TYPE public.log_level AS ENUM ('info', 'warning', 'error');

-- =========================================
-- TABLES
-- =========================================

-- Feature flags (gate do módulo)
CREATE TABLE public.feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Config KV do módulo (cache windows, timeouts, etc.)
CREATE TABLE public.automation_config_kv (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Saúde dos providers
CREATE TABLE public.provider_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL UNIQUE,
  provider_runtime public.provider_runtime NOT NULL,
  status public.provider_health_status NOT NULL DEFAULT 'paused',
  success_rate_24h NUMERIC NOT NULL DEFAULT 0,
  avg_latency_ms_24h NUMERIC NOT NULL DEFAULT 0,
  last_heartbeat_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,
  open_circuit BOOLEAN NOT NULL DEFAULT false,
  current_concurrency INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company lookup requests
CREATE TABLE public.company_lookup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj_input TEXT NOT NULL,
  cnpj_normalized TEXT NOT NULL,
  requested_by TEXT NOT NULL DEFAULT '',
  status public.lookup_status NOT NULL DEFAULT 'queued',
  source_provider TEXT NOT NULL DEFAULT 'provider_public_portal_cnpj_cloudflare',
  from_cache BOOLEAN NOT NULL DEFAULT false,
  force_refresh BOOLEAN NOT NULL DEFAULT false,
  latest_job_id UUID,
  correlation_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_company_lookup_requests_cnpj ON public.company_lookup_requests(cnpj_normalized);
CREATE INDEX idx_company_lookup_requests_status ON public.company_lookup_requests(status);
CREATE INDEX idx_company_lookup_requests_created ON public.company_lookup_requests(created_at DESC);

-- Company lookup results
CREATE TABLE public.company_lookup_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.company_lookup_requests(id) ON DELETE CASCADE,
  official_name TEXT,
  trade_name TEXT,
  registration_status TEXT,
  opening_date DATE,
  legal_nature TEXT,
  main_cnae TEXT,
  secondary_cnaes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  qsa_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_url TEXT,
  raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  parsed_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  parsed_confidence NUMERIC NOT NULL DEFAULT 0,
  consulted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cache_valid_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);
CREATE INDEX idx_company_lookup_results_request ON public.company_lookup_results(request_id);
CREATE INDEX idx_company_lookup_results_cache ON public.company_lookup_results(cache_valid_until DESC);

-- CND lookup requests
CREATE TABLE public.cnd_lookup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj_normalized TEXT NOT NULL,
  linked_company_request_id UUID REFERENCES public.company_lookup_requests(id) ON DELETE SET NULL,
  requested_by TEXT NOT NULL DEFAULT '',
  status public.lookup_status NOT NULL DEFAULT 'queued',
  source_provider TEXT NOT NULL DEFAULT 'provider_public_portal_cnd_cloudflare',
  from_cache BOOLEAN NOT NULL DEFAULT false,
  force_refresh BOOLEAN NOT NULL DEFAULT false,
  latest_job_id UUID,
  correlation_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_cnd_lookup_requests_cnpj ON public.cnd_lookup_requests(cnpj_normalized);
CREATE INDEX idx_cnd_lookup_requests_status ON public.cnd_lookup_requests(status);
CREATE INDEX idx_cnd_lookup_requests_created ON public.cnd_lookup_requests(created_at DESC);

-- CND lookup results
CREATE TABLE public.cnd_lookup_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.cnd_lookup_requests(id) ON DELETE CASCADE,
  cnd_status public.cnd_lookup_status NOT NULL,
  certificate_number TEXT,
  issued_at TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  source_url TEXT,
  raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  parsed_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_path TEXT,
  pdf_sha256 TEXT,
  consulted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cache_valid_until TIMESTAMPTZ
);
CREATE INDEX idx_cnd_lookup_results_request ON public.cnd_lookup_results(request_id);
CREATE INDEX idx_cnd_lookup_results_cache ON public.cnd_lookup_results(cache_valid_until DESC);

-- Automation jobs (fila)
CREATE TABLE public.automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type public.job_type NOT NULL,
  target_request_id UUID,
  provider TEXT NOT NULL,
  status public.job_status NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 5,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  locked_by TEXT,
  correlation_id TEXT NOT NULL,
  timeout_ms INTEGER NOT NULL DEFAULT 120000,
  error_type TEXT,
  error_message TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_automation_jobs_status ON public.automation_jobs(status);
CREATE INDEX idx_automation_jobs_correlation ON public.automation_jobs(correlation_id);
CREATE INDEX idx_automation_jobs_target ON public.automation_jobs(target_request_id);
CREATE INDEX idx_automation_jobs_created ON public.automation_jobs(created_at DESC);

-- Automation job logs
CREATE TABLE public.automation_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.automation_jobs(id) ON DELETE CASCADE,
  level public.log_level NOT NULL DEFAULT 'info',
  step TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_automation_job_logs_job ON public.automation_job_logs(job_id, created_at);

-- Automation artifacts
CREATE TABLE public.automation_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.automation_jobs(id) ON DELETE CASCADE,
  artifact_type public.artifact_type NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size BIGINT NOT NULL DEFAULT 0,
  sha256 TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_automation_artifacts_job ON public.automation_artifacts(job_id);

-- Automation exceptions (central)
CREATE TABLE public.automation_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.automation_jobs(id) ON DELETE SET NULL,
  exception_type TEXT NOT NULL,
  severity public.exception_severity NOT NULL DEFAULT 'warning',
  status public.exception_lifecycle NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  technical_details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_automation_exceptions_status ON public.automation_exceptions(status);
CREATE INDEX idx_automation_exceptions_type ON public.automation_exceptions(exception_type);
CREATE INDEX idx_automation_exceptions_job ON public.automation_exceptions(job_id);

-- HMAC nonces (anti-replay)
CREATE TABLE public.hmac_nonces (
  nonce TEXT PRIMARY KEY,
  direction TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_hmac_nonces_expires ON public.hmac_nonces(expires_at);

-- =========================================
-- TRIGGERS (updated_at)
-- =========================================
CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_automation_config_kv_updated_at
  BEFORE UPDATE ON public.automation_config_kv
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_provider_health_updated_at
  BEFORE UPDATE ON public.provider_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_automation_jobs_updated_at
  BEFORE UPDATE ON public.automation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- RLS (padrão do projeto: anon + authenticated abertos)
-- =========================================
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_config_kv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_lookup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_lookup_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cnd_lookup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cnd_lookup_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hmac_nonces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can manage feature_flags" ON public.feature_flags FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can manage automation_config_kv" ON public.automation_config_kv FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can manage provider_health" ON public.provider_health FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can manage company_lookup_requests" ON public.company_lookup_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can manage company_lookup_results" ON public.company_lookup_results FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can manage cnd_lookup_requests" ON public.cnd_lookup_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can manage cnd_lookup_results" ON public.cnd_lookup_results FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can manage automation_jobs" ON public.automation_jobs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can manage automation_job_logs" ON public.automation_job_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can manage automation_artifacts" ON public.automation_artifacts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can manage automation_exceptions" ON public.automation_exceptions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- hmac_nonces: só service role (edge functions) deve escrever; sem política pública.

-- =========================================
-- REALTIME
-- =========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_job_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.company_lookup_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cnd_lookup_requests;

ALTER TABLE public.automation_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.automation_job_logs REPLICA IDENTITY FULL;
ALTER TABLE public.company_lookup_requests REPLICA IDENTITY FULL;
ALTER TABLE public.cnd_lookup_requests REPLICA IDENTITY FULL;

-- =========================================
-- STORAGE BUCKET (privado)
-- =========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('automation-artifacts', 'automation-artifacts', false)
ON CONFLICT (id) DO NOTHING;

-- Política: bucket totalmente privado. Apenas service role (edge functions) lê/escreve.
-- Usuários acessam via signed URL gerada por edge function.

-- =========================================
-- SEED
-- =========================================
INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('consulta_publica_enabled', false, 'Habilita módulo de Consulta CNPJ/CND na UI'),
  ('consulta_publica_cnpj_enabled', false, 'Habilita consulta de CNPJ via portal público'),
  ('consulta_publica_cnd_enabled', false, 'Habilita consulta de CND via portal público'),
  ('consulta_publica_debug_enabled', false, 'Exibe artefatos técnicos (HTML, screenshots) na UI'),
  ('consulta_publica_dry_run_required', true, 'Exige dry-run aprovado antes de ativar feature global')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.automation_config_kv (key, value_json, description) VALUES
  ('cache_cnpj_days', '7'::jsonb, 'Dias de validade do cache de CNPJ'),
  ('cnd_cache_strategy', '"until_valid_until"'::jsonb, 'Estratégia de cache da CND'),
  ('max_concurrent_jobs', '3'::jsonb, 'Concorrência máxima de jobs por provider'),
  ('hmac_tolerance_seconds', '300'::jsonb, 'Tolerância de timestamp do HMAC em segundos'),
  ('signed_url_ttl_seconds', '300'::jsonb, 'Duração das URLs assinadas de artifacts')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.provider_health (provider_name, provider_runtime, status, metadata_json) VALUES
  ('provider_public_portal_cnpj_cloudflare', 'cloudflare_worker_browser_run', 'paused', '{"portal":"solucoes.receita.fazenda.gov.br"}'::jsonb),
  ('provider_public_portal_cnd_cloudflare', 'cloudflare_worker_browser_run', 'paused', '{"portal":"solucoes.receita.fazenda.gov.br/Servicos/certidaointernet"}'::jsonb)
ON CONFLICT (provider_name) DO NOTHING;
