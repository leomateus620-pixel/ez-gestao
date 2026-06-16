
ALTER TYPE public.canal_envio ADD VALUE IF NOT EXISTS 'ambos';
ALTER TYPE public.guia_status ADD VALUE IF NOT EXISTS 'pronta_envio';
ALTER TYPE public.guia_status ADD VALUE IF NOT EXISTS 'nao_identificada';
ALTER TYPE public.guia_status ADD VALUE IF NOT EXISTS 'duplicada';

DO $$ BEGIN
  CREATE TYPE public.tipo_guia AS ENUM ('das','fgts','daf','darf','gps_inss','iss','icms','outros');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
