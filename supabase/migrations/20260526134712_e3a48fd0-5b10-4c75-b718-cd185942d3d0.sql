
-- Enums
DO $$ BEGIN
  CREATE TYPE public.guia_status AS ENUM ('aguardando','lendo','ocr','identificada','enviando','enviada','revisao','erro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.guia_match_source AS ENUM ('cnpj_pdf','filename','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.guia_canal AS ENUM ('email','whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.guia_envio_status AS ENUM ('aceito','simulado','entregue','falhou');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.guia_excecao_status AS ENUM ('open','investigating','resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.guia_integracao_status AS ENUM ('inativo','ativo','erro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela guias
CREATE TABLE public.guias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  sha256 text,
  status public.guia_status NOT NULL DEFAULT 'aguardando',
  match_source public.guia_match_source,
  cnpj_detectado text,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  tipo_guia text,
  competencia text,
  vencimento date,
  valor numeric(14,2),
  texto_extraido_preview text,
  pagina_count integer,
  extraction_method text,
  has_text_layer boolean,
  pasta_atual text NOT NULL DEFAULT 'a_enviar',
  source_folder_id text,
  sent_folder_id text,
  provider_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drive_file_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guias TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guias TO anon;
GRANT ALL ON public.guias TO service_role;
ALTER TABLE public.guias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage guias" ON public.guias FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_guias_updated_at BEFORE UPDATE ON public.guias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela guia_envios
CREATE TABLE public.guia_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_id uuid NOT NULL REFERENCES public.guias(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  canal public.guia_canal NOT NULL,
  destinatario text NOT NULL,
  assunto text,
  mensagem_preview text,
  template_sid text,
  provider_message_id text,
  idempotency_key text NOT NULL UNIQUE,
  status public.guia_envio_status NOT NULL DEFAULT 'aceito',
  sanitized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guia_envios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guia_envios TO anon;
GRANT ALL ON public.guia_envios TO service_role;
ALTER TABLE public.guia_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage guia_envios" ON public.guia_envios FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Tabela guia_excecoes
CREATE TABLE public.guia_excecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_id uuid REFERENCES public.guias(id) ON DELETE CASCADE,
  exception_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  status public.guia_excecao_status NOT NULL DEFAULT 'open',
  reason text NOT NULL,
  action_recommended text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guia_excecoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guia_excecoes TO anon;
GRANT ALL ON public.guia_excecoes TO service_role;
ALTER TABLE public.guia_excecoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage guia_excecoes" ON public.guia_excecoes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Tabela guia_eventos
CREATE TABLE public.guia_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_id uuid REFERENCES public.guias(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL DEFAULT '',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guia_eventos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guia_eventos TO anon;
GRANT ALL ON public.guia_eventos TO service_role;
ALTER TABLE public.guia_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage guia_eventos" ON public.guia_eventos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Tabela integracoes_guias
CREATE TABLE public.integracoes_guias (
  provider text PRIMARY KEY,
  display_name text NOT NULL,
  status public.guia_integracao_status NOT NULL DEFAULT 'inativo',
  source_folder_id text,
  sent_folder_id text,
  sender_identity text,
  schedule_minutes integer NOT NULL DEFAULT 5,
  last_check_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integracoes_guias TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integracoes_guias TO anon;
GRANT ALL ON public.integracoes_guias TO service_role;
ALTER TABLE public.integracoes_guias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage integracoes_guias" ON public.integracoes_guias FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_integracoes_guias_updated_at BEFORE UPDATE ON public.integracoes_guias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.integracoes_guias (provider, display_name, status) VALUES
  ('google_drive','Google Drive','inativo'),
  ('gmail','Gmail','inativo')
ON CONFLICT (provider) DO NOTHING;

CREATE INDEX idx_guias_status ON public.guias(status);
CREATE INDEX idx_guias_empresa ON public.guias(empresa_id);
CREATE INDEX idx_guia_envios_guia ON public.guia_envios(guia_id);
CREATE INDEX idx_guia_excecoes_status ON public.guia_excecoes(status);
CREATE INDEX idx_guia_eventos_guia ON public.guia_eventos(guia_id);
