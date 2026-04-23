-- Adicionar suporte a CNDT (TST) ao pipeline de automação
ALTER TYPE public.job_type ADD VALUE IF NOT EXISTS 'cndt_lookup';