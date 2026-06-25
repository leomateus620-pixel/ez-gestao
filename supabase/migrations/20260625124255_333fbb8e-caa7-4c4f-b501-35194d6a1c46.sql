
-- Roles infrastructure (only if missing)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','operador','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Returns true if no admin has been configured yet (bootstrap mode) — used by edge
-- functions to allow first-time access until a workspace admin is registered.
CREATE OR REPLACE FUNCTION public.no_admin_configured()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
$$;

-- WhatsApp integration audit log
CREATE TABLE IF NOT EXISTS public.whatsapp_integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  triggered_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  test_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('success','failed','pending')),
  endpoint text NULL,
  phone_number_id text NULL,
  waba_id text NULL,
  to_phone text NULL,
  template_name text NULL,
  message_id text NULL,
  error_code integer NULL,
  error_message text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wa_logs_created_at ON public.whatsapp_integration_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_logs_test_type ON public.whatsapp_integration_logs(test_type);

GRANT SELECT ON public.whatsapp_integration_logs TO authenticated;
GRANT ALL ON public.whatsapp_integration_logs TO service_role;

ALTER TABLE public.whatsapp_integration_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read whatsapp logs" ON public.whatsapp_integration_logs;
CREATE POLICY "admins read whatsapp logs" ON public.whatsapp_integration_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.no_admin_configured());
