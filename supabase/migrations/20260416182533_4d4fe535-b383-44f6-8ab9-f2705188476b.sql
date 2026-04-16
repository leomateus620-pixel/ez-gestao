-- Helper: drop all existing policies and create one open policy per table

-- empresas
DROP POLICY IF EXISTS "Authenticated users can insert empresas" ON public.empresas;
DROP POLICY IF EXISTS "Authenticated users can read empresas" ON public.empresas;
DROP POLICY IF EXISTS "Authenticated users can update empresas" ON public.empresas;
DROP POLICY IF EXISTS "Authenticated users can delete empresas" ON public.empresas;
DROP POLICY IF EXISTS "Public can manage empresas" ON public.empresas;
CREATE POLICY "Public can manage empresas" ON public.empresas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- cnd_items
DROP POLICY IF EXISTS "Authenticated users can manage cnd_items" ON public.cnd_items;
DROP POLICY IF EXISTS "Public can manage cnd_items" ON public.cnd_items;
CREATE POLICY "Public can manage cnd_items" ON public.cnd_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- documentos
DROP POLICY IF EXISTS "Authenticated users can manage documentos" ON public.documentos;
DROP POLICY IF EXISTS "Public can manage documentos" ON public.documentos;
CREATE POLICY "Public can manage documentos" ON public.documentos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- envios
DROP POLICY IF EXISTS "Authenticated users can manage envios" ON public.envios;
DROP POLICY IF EXISTS "Public can manage envios" ON public.envios;
CREATE POLICY "Public can manage envios" ON public.envios FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- alertas
DROP POLICY IF EXISTS "Authenticated users can manage alertas" ON public.alertas;
DROP POLICY IF EXISTS "Public can manage alertas" ON public.alertas;
CREATE POLICY "Public can manage alertas" ON public.alertas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- logs_acesso
DROP POLICY IF EXISTS "Authenticated users can manage logs_acesso" ON public.logs_acesso;
DROP POLICY IF EXISTS "Public can manage logs_acesso" ON public.logs_acesso;
CREATE POLICY "Public can manage logs_acesso" ON public.logs_acesso FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- audit_trail
DROP POLICY IF EXISTS "Authenticated users can manage audit_trail" ON public.audit_trail;
DROP POLICY IF EXISTS "Public can manage audit_trail" ON public.audit_trail;
CREATE POLICY "Public can manage audit_trail" ON public.audit_trail FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- cnd_historico
DROP POLICY IF EXISTS "Authenticated users can manage cnd_historico" ON public.cnd_historico;
DROP POLICY IF EXISTS "Public can manage cnd_historico" ON public.cnd_historico;
CREATE POLICY "Public can manage cnd_historico" ON public.cnd_historico FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- connectors
DROP POLICY IF EXISTS "Authenticated users can manage connectors" ON public.connectors;
DROP POLICY IF EXISTS "Public can manage connectors" ON public.connectors;
CREATE POLICY "Public can manage connectors" ON public.connectors FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- connector_runs
DROP POLICY IF EXISTS "Authenticated users can manage connector_runs" ON public.connector_runs;
DROP POLICY IF EXISTS "Public can manage connector_runs" ON public.connector_runs;
CREATE POLICY "Public can manage connector_runs" ON public.connector_runs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- connector_run_steps
DROP POLICY IF EXISTS "Authenticated users can manage connector_run_steps" ON public.connector_run_steps;
DROP POLICY IF EXISTS "Public can manage connector_run_steps" ON public.connector_run_steps;
CREATE POLICY "Public can manage connector_run_steps" ON public.connector_run_steps FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- exceptions
DROP POLICY IF EXISTS "Authenticated users can manage exceptions" ON public.exceptions;
DROP POLICY IF EXISTS "Public can manage exceptions" ON public.exceptions;
CREATE POLICY "Public can manage exceptions" ON public.exceptions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- automation_batches
DROP POLICY IF EXISTS "Authenticated users can manage automation_batches" ON public.automation_batches;
DROP POLICY IF EXISTS "Public can manage automation_batches" ON public.automation_batches;
CREATE POLICY "Public can manage automation_batches" ON public.automation_batches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- automation_config
DROP POLICY IF EXISTS "Authenticated users can manage automation_config" ON public.automation_config;
DROP POLICY IF EXISTS "Public can manage automation_config" ON public.automation_config;
CREATE POLICY "Public can manage automation_config" ON public.automation_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- health_logs
DROP POLICY IF EXISTS "Authenticated users can manage health_logs" ON public.health_logs;
DROP POLICY IF EXISTS "Public can manage health_logs" ON public.health_logs;
CREATE POLICY "Public can manage health_logs" ON public.health_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- retry_policies
DROP POLICY IF EXISTS "Authenticated users can manage retry_policies" ON public.retry_policies;
DROP POLICY IF EXISTS "Public can manage retry_policies" ON public.retry_policies;
CREATE POLICY "Public can manage retry_policies" ON public.retry_policies FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- scheduling_rules
DROP POLICY IF EXISTS "Authenticated users can manage scheduling_rules" ON public.scheduling_rules;
DROP POLICY IF EXISTS "Public can manage scheduling_rules" ON public.scheduling_rules;
CREATE POLICY "Public can manage scheduling_rules" ON public.scheduling_rules FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);