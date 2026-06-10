DELETE FROM public.tax_reform_alerts a
USING public.tax_reform_alerts b
WHERE a.analysis_id = b.analysis_id
  AND a.alert_type  = b.alert_type
  AND a.created_at < b.created_at;

ALTER TABLE public.tax_reform_alerts
  ADD CONSTRAINT tax_reform_alerts_analysis_type_key
  UNIQUE (analysis_id, alert_type);