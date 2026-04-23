
-- Index used by cf-final-callback fallback (job_id -> target_request_id)
CREATE INDEX IF NOT EXISTS idx_automation_jobs_target_request_id
  ON public.automation_jobs(target_request_id);

-- Seed initial dry_run_zimmermann row so the UI always has something to read
INSERT INTO public.automation_config_kv (key, value_json, description)
VALUES (
  'dry_run_zimmermann',
  '{"passed": false, "in_progress": false}'::jsonb,
  'Resultado do dry-run obrigatório (Zimmermann)'
)
ON CONFLICT (key) DO NOTHING;
