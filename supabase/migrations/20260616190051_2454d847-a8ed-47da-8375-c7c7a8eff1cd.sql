
-- Indexes para performance e dedup
CREATE UNIQUE INDEX IF NOT EXISTS guias_dedup_hash_uniq ON public.guias(dedup_hash) WHERE dedup_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS guias_status_idx ON public.guias(status);
CREATE INDEX IF NOT EXISTS guias_received_at_idx ON public.guias(received_at DESC);
CREATE INDEX IF NOT EXISTS guide_audit_guia_id_idx ON public.guide_audit(guia_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guide_batch_runs_started_idx ON public.guide_batch_runs(started_at DESC);

-- Garante linha única em guide_test_config
INSERT INTO public.guide_test_config(id, modo_global)
VALUES (1, 'teste')
ON CONFLICT (id) DO NOTHING;
