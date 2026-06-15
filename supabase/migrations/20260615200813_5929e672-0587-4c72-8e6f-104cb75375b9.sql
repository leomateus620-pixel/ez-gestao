-- Remove duplicates that would violate the new uniqueness rule, keeping the most recent row.
DELETE FROM public.fator_r_alerts a
USING public.fator_r_alerts b
WHERE a.company_id IS NOT DISTINCT FROM b.company_id
  AND a.monthly_result_id IS NOT DISTINCT FROM b.monthly_result_id
  AND a.alert_type IS NOT DISTINCT FROM b.alert_type
  AND a.recipient_email IS NOT DISTINCT FROM b.recipient_email
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS fator_r_alerts_dedupe_key
  ON public.fator_r_alerts (company_id, monthly_result_id, alert_type, recipient_email);