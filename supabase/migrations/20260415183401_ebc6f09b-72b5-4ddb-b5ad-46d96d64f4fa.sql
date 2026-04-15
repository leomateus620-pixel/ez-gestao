
-- Enums
CREATE TYPE public.empresa_status AS ENUM ('ativa', 'pausada', 'arquivada');
CREATE TYPE public.regime_tributario AS ENUM ('simples_nacional', 'lucro_presumido', 'lucro_real', 'mei');
CREATE TYPE public.cnd_tipo AS ENUM ('receita_federal', 'fgts', 'sefaz', 'municipal', 'trabalhista', 'personalizada');
CREATE TYPE public.cnd_status AS ENUM ('valida', 'vencendo', 'vencida', 'pendente', 'erro', 'nao_aplicavel');
CREATE TYPE public.canal_envio AS ENUM ('email', 'whatsapp');
CREATE TYPE public.envio_status AS ENUM ('enviado', 'entregue', 'lido', 'erro', 'pendente');
CREATE TYPE public.alerta_prioridade AS ENUM ('critica', 'alta', 'media', 'baixa');
CREATE TYPE public.alerta_tipo AS ENUM ('vencimento_7d', 'vencimento_3d', 'vencimento_1d', 'vencimento_hoje', 'vencido', 'sem_pdf', 'checklist_incompleto');
CREATE TYPE public.connector_type AS ENUM ('api_direta', 'browser_headless', 'integracao_assistida', 'upload_manual');
CREATE TYPE public.connector_status AS ENUM ('ativo', 'inativo', 'manutencao', 'erro');
CREATE TYPE public.run_status AS ENUM ('agendado', 'executando', 'sucesso', 'falha', 'revisao', 'timeout', 'cancelado', 'bloqueado');
CREATE TYPE public.exception_status AS ENUM ('pendente', 'em_analise', 'resolvida', 'descartada');
CREATE TYPE public.confidence_level AS ENUM ('alta', 'media', 'baixa');
CREATE TYPE public.run_step_etapa AS ENUM ('autenticacao', 'consulta', 'captura', 'parsing', 'persistencia');
CREATE TYPE public.run_step_status AS ENUM ('sucesso', 'falha', 'pulado', 'executando');
CREATE TYPE public.exception_tipologia AS ENUM (
  'cnpj_inconsistente', 'pdf_ausente', 'validade_ambigua', 'portal_indisponivel',
  'captcha_bloqueante', 'documento_incompativel', 'baixa_confianca', 'erro_parsing',
  'falha_integracao', 'dado_cadastral_insuficiente', 'certidao_positiva', 'retorno_inesperado'
);
CREATE TYPE public.exception_criticidade AS ENUM ('critica', 'alta', 'media', 'baixa');
CREATE TYPE public.batch_status AS ENUM ('agendado', 'executando', 'concluido', 'parcial', 'falha');
CREATE TYPE public.health_status AS ENUM ('ok', 'degradado', 'indisponivel');
CREATE TYPE public.log_acao AS ENUM ('envio', 'abertura', 'visualizacao', 'download');

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. Empresas
CREATE TABLE public.empresas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL UNIQUE,
  regime_tributario public.regime_tributario NOT NULL DEFAULT 'simples_nacional',
  municipio TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT '',
  responsavel_interno TEXT NOT NULL DEFAULT '',
  responsavel_cliente TEXT NOT NULL DEFAULT '',
  email_principal TEXT NOT NULL DEFAULT '',
  whatsapp_principal TEXT NOT NULL DEFAULT '',
  observacoes TEXT NOT NULL DEFAULT '',
  status public.empresa_status NOT NULL DEFAULT 'ativa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read empresas" ON public.empresas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert empresas" ON public.empresas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update empresas" ON public.empresas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete empresas" ON public.empresas FOR DELETE TO authenticated USING (true);
CREATE TRIGGER update_empresas_updated_at BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. CND Items
CREATE TABLE public.cnd_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.cnd_tipo NOT NULL,
  status public.cnd_status NOT NULL DEFAULT 'pendente',
  data_emissao DATE,
  data_vencimento DATE,
  origem TEXT NOT NULL DEFAULT '',
  arquivo_id UUID,
  observacao TEXT NOT NULL DEFAULT '',
  responsavel TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cnd_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage cnd_items" ON public.cnd_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_cnd_items_updated_at BEFORE UPDATE ON public.cnd_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_cnd_items_empresa ON public.cnd_items(empresa_id);
CREATE INDEX idx_cnd_items_status ON public.cnd_items(status);

-- 3. CND Historico
CREATE TABLE public.cnd_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cnd_item_id UUID NOT NULL REFERENCES public.cnd_items(id) ON DELETE CASCADE,
  data TIMESTAMPTZ NOT NULL DEFAULT now(),
  acao TEXT NOT NULL,
  usuario TEXT NOT NULL DEFAULT '',
  detalhes TEXT NOT NULL DEFAULT ''
);
ALTER TABLE public.cnd_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage cnd_historico" ON public.cnd_historico FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Documentos
CREATE TABLE public.documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cnd_item_id UUID REFERENCES public.cnd_items(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  tipo public.cnd_tipo NOT NULL,
  data_upload TIMESTAMPTZ NOT NULL DEFAULT now(),
  responsavel TEXT NOT NULL DEFAULT '',
  validade DATE,
  observacao TEXT NOT NULL DEFAULT '',
  versao INT NOT NULL DEFAULT 1,
  tamanho TEXT NOT NULL DEFAULT '',
  storage_path TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage documentos" ON public.documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_documentos_updated_at BEFORE UPDATE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_documentos_empresa ON public.documentos(empresa_id);

-- 5. Envios
CREATE TABLE public.envios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  canal public.canal_envio NOT NULL,
  destinatario TEXT NOT NULL,
  assunto TEXT NOT NULL DEFAULT '',
  mensagem TEXT NOT NULL DEFAULT '',
  documento_ids UUID[] NOT NULL DEFAULT '{}',
  status public.envio_status NOT NULL DEFAULT 'pendente',
  data_envio TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage envios" ON public.envios FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_envios_empresa ON public.envios(empresa_id);

-- 6. Alertas
CREATE TABLE public.alertas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cnd_item_id UUID REFERENCES public.cnd_items(id) ON DELETE SET NULL,
  tipo public.alerta_tipo NOT NULL,
  prioridade public.alerta_prioridade NOT NULL DEFAULT 'media',
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  lido BOOLEAN NOT NULL DEFAULT false,
  resolvido BOOLEAN NOT NULL DEFAULT false,
  snoozed_ate TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage alertas" ON public.alertas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_alertas_empresa ON public.alertas(empresa_id);

-- 7. Logs Acesso
CREATE TABLE public.logs_acesso (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  envio_id UUID REFERENCES public.envios(id) ON DELETE SET NULL,
  documento_id UUID REFERENCES public.documentos(id) ON DELETE SET NULL,
  acao public.log_acao NOT NULL,
  canal public.canal_envio,
  usuario TEXT NOT NULL DEFAULT '',
  destinatario TEXT,
  data_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  detalhes TEXT NOT NULL DEFAULT ''
);
ALTER TABLE public.logs_acesso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage logs_acesso" ON public.logs_acesso FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. Audit Trail
CREATE TABLE public.audit_trail (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}'
);
ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage audit_trail" ON public.audit_trail FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. Connectors
CREATE TABLE public.connectors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo public.connector_type NOT NULL,
  orgao public.cnd_tipo NOT NULL,
  status public.connector_status NOT NULL DEFAULT 'ativo',
  versao TEXT NOT NULL DEFAULT '1.0.0',
  ultimo_teste TIMESTAMPTZ,
  taxa_sucesso NUMERIC(5,2) NOT NULL DEFAULT 100,
  tempo_medio NUMERIC(6,2) NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}',
  descricao TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage connectors" ON public.connectors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_connectors_updated_at BEFORE UPDATE ON public.connectors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Connector Runs
CREATE TABLE public.connector_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connector_id UUID NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cnd_item_id UUID REFERENCES public.cnd_items(id) ON DELETE SET NULL,
  status public.run_status NOT NULL DEFAULT 'agendado',
  inicio_execucao TIMESTAMPTZ NOT NULL DEFAULT now(),
  fim_execucao TIMESTAMPTZ,
  tentativa INT NOT NULL DEFAULT 1,
  duracao NUMERIC(8,2),
  resultado_bruto TEXT NOT NULL DEFAULT '',
  status_normalizado TEXT NOT NULL DEFAULT '',
  confianca public.confidence_level NOT NULL DEFAULT 'alta',
  evidencias TEXT[] NOT NULL DEFAULT '{}',
  erro_detalhes TEXT,
  hash_documento TEXT,
  validacao_erros TEXT[] DEFAULT '{}',
  validacao_avisos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.connector_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage connector_runs" ON public.connector_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_connector_runs_connector ON public.connector_runs(connector_id);
CREATE INDEX idx_connector_runs_empresa ON public.connector_runs(empresa_id);
CREATE INDEX idx_connector_runs_status ON public.connector_runs(status);

-- 11. Connector Run Steps
CREATE TABLE public.connector_run_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.connector_runs(id) ON DELETE CASCADE,
  etapa public.run_step_etapa NOT NULL,
  status public.run_step_status NOT NULL DEFAULT 'executando',
  inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  fim TIMESTAMPTZ,
  detalhes TEXT NOT NULL DEFAULT ''
);
ALTER TABLE public.connector_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage connector_run_steps" ON public.connector_run_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_run_steps_run ON public.connector_run_steps(run_id);

-- 12. Exceptions
CREATE TABLE public.exceptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.connector_runs(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cnd_item_id UUID REFERENCES public.cnd_items(id) ON DELETE SET NULL,
  motivo TEXT NOT NULL,
  criticidade public.exception_criticidade NOT NULL DEFAULT 'media',
  status_excecao public.exception_status NOT NULL DEFAULT 'pendente',
  acao_sugerida TEXT NOT NULL DEFAULT '',
  resolvido_em TIMESTAMPTZ,
  resolvido_por TEXT,
  tipologia public.exception_tipologia NOT NULL,
  tentativas INT NOT NULL DEFAULT 1,
  sla_horas INT NOT NULL DEFAULT 24,
  responsavel TEXT,
  cnpj TEXT NOT NULL DEFAULT '',
  cnd_tipo TEXT NOT NULL DEFAULT '',
  connector_nome TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage exceptions" ON public.exceptions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_exceptions_status ON public.exceptions(status_excecao);
CREATE INDEX idx_exceptions_empresa ON public.exceptions(empresa_id);

-- 13. Automation Batches
CREATE TABLE public.automation_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agendado_para TIMESTAMPTZ NOT NULL,
  empresa_ids UUID[] NOT NULL DEFAULT '{}',
  status public.batch_status NOT NULL DEFAULT 'agendado',
  progresso_atual INT NOT NULL DEFAULT 0,
  total_items INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage automation_batches" ON public.automation_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 14. Health Logs
CREATE TABLE public.health_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connector_id UUID NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  status public.health_status NOT NULL DEFAULT 'ok',
  latencia NUMERIC(8,2) NOT NULL DEFAULT 0,
  detalhes TEXT NOT NULL DEFAULT ''
);
ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage health_logs" ON public.health_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_health_logs_connector ON public.health_logs(connector_id);

-- 15. Scheduling Rules
CREATE TABLE public.scheduling_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connector_id UUID NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE,
  cnd_tipo public.cnd_tipo NOT NULL,
  intervalo_horas INT NOT NULL DEFAULT 24,
  dias_antes_vencimento INT NOT NULL DEFAULT 7,
  prioridade INT NOT NULL DEFAULT 1
);
ALTER TABLE public.scheduling_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage scheduling_rules" ON public.scheduling_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 16. Retry Policies
CREATE TABLE public.retry_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connector_id UUID NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE UNIQUE,
  max_tentativas INT NOT NULL DEFAULT 3,
  intervalo_base INT NOT NULL DEFAULT 5000,
  backoff_multiplier NUMERIC(3,1) NOT NULL DEFAULT 2.0,
  timeout_segundos INT NOT NULL DEFAULT 30
);
ALTER TABLE public.retry_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage retry_policies" ON public.retry_policies FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 17. Automation Config (singleton)
CREATE TABLE public.automation_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  confianca_minima public.confidence_level NOT NULL DEFAULT 'media',
  max_concorrencia_por_conector INT NOT NULL DEFAULT 3,
  timeout_global_lote INT NOT NULL DEFAULT 300000,
  circuit_breaker_limiar INT NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage automation_config" ON public.automation_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_automation_config_updated_at BEFORE UPDATE ON public.automation_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default config
INSERT INTO public.automation_config (confianca_minima, max_concorrencia_por_conector, timeout_global_lote, circuit_breaker_limiar)
VALUES ('media', 3, 300000, 5);

-- Storage bucket for certidões PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('certidoes', 'certidoes', false);
CREATE POLICY "Authenticated users can read certidoes" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'certidoes');
CREATE POLICY "Authenticated users can upload certidoes" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'certidoes');
CREATE POLICY "Authenticated users can update certidoes" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'certidoes');
CREATE POLICY "Authenticated users can delete certidoes" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'certidoes');
