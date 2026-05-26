DO $$ BEGIN
  CREATE TYPE canal_envio AS ENUM ('email', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS canal_preferido canal_envio,
  ADD COLUMN IF NOT EXISTS email_validado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS comunicacao_ativa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS saudacao_guia text NOT NULL DEFAULT '';