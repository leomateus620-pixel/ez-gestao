-- Safe Guides pipeline: strict routing, batch preview and auditable decisions.

ALTER TYPE public.guia_status ADD VALUE IF NOT EXISTS 'aguardando_processamento';
ALTER TYPE public.guia_status ADD VALUE IF NOT EXISTS 'processando';
ALTER TYPE public.guia_status ADD VALUE IF NOT EXISTS 'validando';
ALTER TYPE public.guia_status ADD VALUE IF NOT EXISTS 'quarentena';
ALTER TYPE public.guia_status ADD VALUE IF NOT EXISTS 'revisao_manual';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.guias'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%pasta_atual%'
  LOOP
    EXECUTE format('ALTER TABLE public.guias DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.guias
  ADD CONSTRAINT guias_pasta_atual_safe_check
  CHECK (pasta_atual IN (
    'a_enviar',
    'enviados',
    'enviadas',
    'revisao_manual',
    'nao_identificadas',
    'erros',
    'duplicadas'
  ));

ALTER TABLE public.guias
  ADD COLUMN IF NOT EXISTS critical_fields_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_issues_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS decision_status text,
  ADD COLUMN IF NOT EXISTS decision_reason text,
  ADD COLUMN IF NOT EXISTS decision_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_review_level text CHECK (manual_review_level IS NULL OR manual_review_level IN ('quick','full','none')),
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz,
  ADD COLUMN IF NOT EXISTS duplicate_level text CHECK (duplicate_level IS NULL OR duplicate_level IN ('exact','operational','probable')),
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.guias(id),
  ADD COLUMN IF NOT EXISTS authorized_reprocess boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispatch_blocked_reason text,
  ADD COLUMN IF NOT EXISTS drive_organization_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS operation_batch_id uuid REFERENCES public.guide_batch_runs(id),
  ADD COLUMN IF NOT EXISTS test_preview_json jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP INDEX IF EXISTS public.guias_dedup_hash_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS guias_dedup_hash_active_uidx
  ON public.guias(dedup_hash)
  WHERE dedup_hash IS NOT NULL
    AND status <> 'duplicada'::public.guia_status
    AND status <> 'erro'::public.guia_status;

CREATE INDEX IF NOT EXISTS guias_sha256_idx
  ON public.guias(sha256)
  WHERE sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS guias_operational_lookup_idx
  ON public.guias(cnpj_detectado, tipo_guia_normalized, competencia, vencimento, valor)
  WHERE cnpj_detectado IS NOT NULL;

ALTER TABLE public.guide_batch_runs
  ADD COLUMN IF NOT EXISTS prontas_envio int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quarentena int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preview_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS operation_level text NOT NULL DEFAULT 'somente_classificacao';

ALTER TABLE public.guide_test_config
  ADD COLUMN IF NOT EXISTS operation_level text NOT NULL DEFAULT 'somente_classificacao'
    CHECK (operation_level IN (
      'automacao_desligada',
      'somente_classificacao',
      'leitura_revisao',
      'envio_automatico_seguro',
      'producao_total'
    )),
  ADD COLUMN IF NOT EXISTS auto_dispatch_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_batch_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_first_month_batch_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_new_client_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS high_value_threshold numeric(14,2);

ALTER TABLE public.guide_templates
  ADD COLUMN IF NOT EXISTS required_placeholders text[] NOT NULL
    DEFAULT ARRAY['EMPRESA','CNPJ','TIPO_GUIA','COMPETENCIA','VENCIMENTO','VALOR']::text[];

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS guia_learning_patterns jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS guia_eventos_event_type_idx
  ON public.guia_eventos(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS guia_excecoes_type_idx
  ON public.guia_excecoes(exception_type, created_at DESC);
