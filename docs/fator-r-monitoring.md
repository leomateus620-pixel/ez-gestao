# Monitoramento de Fator R

## Objetivo
Automatizar leitura de documentos PGDAS do Google Drive, calcular/registrar Fator R mensal e notificar zonas de atenção/crítica como apoio à análise contábil.

## Configuração do Google Drive
1. Criar pasta (ex.: `PGDAS - Fator R - Empresas`).
2. Compartilhar com o e-mail da Service Account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`).
3. Configurar `GOOGLE_DRIVE_FOLDER_ID` no Supabase.

## Secrets Supabase
- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `EMAIL_PROVIDER` (`resend` padrão)
- `RESEND_API_KEY` (ou `SENDGRID_API_KEY`)
- `FATOR_R_EMAIL_FROM`
- `FATOR_R_ALERT_DEFAULT_RECIPIENT`

## Processamento automático
- Função `fator-r-drive-sync` deve ser agendada diariamente.
- Processa somente arquivos novos por `drive_file_id`.
- Registra logs em `fator_r_processing_logs`.

## Extração de Fator R
Parser em `src/services/fatorRParser.ts` detecta padrões de Fator R, FS12, RBT12, CNPJ e período, normalizando `%`, `0,32` e `0.32`.

## Alertas e deduplicação
- Alertas para `attention` e `critical`.
- Trava de duplicidade: `(company_id, monthly_result_id, alert_type, recipient_email)`.
- Não substitui validação do contador.

## Reprocessamento e auditoria
- Estruturas suportam reprocessamento, ignorar documento e ajuste manual com trilha em `fator_r_audit_logs`.

## Limitações conhecidas
- OCR/PDF parser avançado depende da biblioteca/serviço de extração escolhido.
- Layouts PGDAS variados podem reduzir confiança de extração.
