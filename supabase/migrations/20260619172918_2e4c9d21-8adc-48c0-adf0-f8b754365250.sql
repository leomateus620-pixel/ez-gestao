ALTER TABLE public.guias
  ADD COLUMN IF NOT EXISTS subtipo TEXT,
  ADD COLUMN IF NOT EXISTS empregador_documento_raw TEXT,
  ADD COLUMN IF NOT EXISTS empregador_documento_tipo TEXT,
  ADD COLUMN IF NOT EXISTS empregador_nome_razao_social TEXT,
  ADD COLUMN IF NOT EXISTS match_method TEXT;

CREATE INDEX IF NOT EXISTS guias_subtipo_idx ON public.guias (subtipo);
CREATE INDEX IF NOT EXISTS guias_match_method_idx ON public.guias (match_method);