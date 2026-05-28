# Monitoramento de Fator R

## Objetivo
Automatizar leitura de documentos PGDAS do Google Drive, calcular/registrar Fator R mensal e notificar zonas de atenção/crítica como apoio à análise contábil.

## Configuração do Google Drive
1. Criar pasta global (ex.: `PGDAS - Fator R - Empresas`).
2. Compartilhar com o e-mail da Service Account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) **ou** configurar conexão no gateway (`GOOGLE_DRIVE_API_KEY`).
3. Configurar `GOOGLE_DRIVE_FOLDER_ID` no Supabase para leitura global.
4. Opcional: definir `drive_folder_id` por empresa em `fator_r_companies` para leitura dedicada.

## Secrets Supabase
- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_DRIVE_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `EMAIL_PROVIDER` (`resend` ou `sendgrid`)
- `RESEND_API_KEY` (quando provider = resend)
- `SENDGRID_API_KEY` (quando provider = sendgrid)
- `FATOR_R_EMAIL_FROM`
- `FATOR_R_ALERT_DEFAULT_RECIPIENT`
- `LOVABLE_API_KEY`

## Processamento automático
- Função `fator-r-drive-sync` deve ser agendada diariamente.
- Processa somente arquivos novos por `drive_file_id`.
- Lê pasta global e também pastas específicas por empresa (`drive_folder_id`).
- Registra logs em `fator_r_processing_logs`.

## Extração de Fator R
Parser em `src/services/fatorRParser.ts` detecta padrões de Fator R, FS12, RBT12, CNPJ e período, normalizando `%`, `0,32` e `0.32`.

## Alertas e deduplicação
- Alertas para `attention` e `critical` quando `confidence >= 0.75`.
- Trava de duplicidade: `(company_id, monthly_result_id, alert_type, recipient_email)`.
- Não substitui validação do contador.

## Reprocessamento, ajuste manual e auditoria
- A tela Fator R permite ajuste manual de resultado mensal.
- Cada ajuste grava trilha de auditoria em `fator_r_audit_logs` (valor anterior, novo valor, usuário e motivo).

## Acesso direto à pasta no módulo
- Configure `VITE_FATOR_R_DRIVE_FOLDER_ID` no frontend para habilitar o botão **Abrir pasta no Drive** na tela Fator R.

## Limitações conhecidas
- OCR/PDF parser avançado depende da qualidade do PDF e de evoluções do parser.
- Layouts PGDAS variados podem reduzir confiança de extração.
