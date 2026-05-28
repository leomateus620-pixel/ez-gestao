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
Parser em `src/services/fatorRParser.ts` trabalha por linhas/seções do PGDAS e diferencia leitura real de PDF de fallback inválido:

- Empresa por `Nome Empresarial:` mesmo quando aparece na linha do `CNPJ Básico`.
- CNPJ completo por `CNPJ Estabelecimento:`; quando só existe `CNPJ Básico`, marca como parcial.
- Período por `Período de Apuração (PA): MM/AAAA`.
- RBT12 pela linha `Receita bruta acumulada nos doze meses anteriores ao PA (RBT12)`, sem capturar o `12` do rótulo.
- FS12 preferencialmente pela seção `2.3.1) Total de Folhas de Salários Anteriores (R$)`, sem capturar meses/valores mensais da tabela.
- `Fator r = Não se aplica` vira status `not_applicable`, com alta confiança e sem alerta.
- Quando há FS12 e RBT12, calcula `computedFatorRValue = FS12 / RBT12` e mantém o valor declarado pelo PGDAS quando disponível.

## Alertas e deduplicação
- Status possíveis: `safe`, `attention`, `critical`, `not_applicable` e `unknown`.
- Alertas somente para `attention` e `critical` quando `confidence >= 0.75`.
- `not_applicable` e `unknown` não disparam alerta automático.
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

## Teste manual sem Google Drive

Além da rotina agendada via Drive, a tela **Monitoramento de Fator R** possui a ação **Anexar PDFs para teste**. Esse fluxo foi criado para validação pontual com PDFs PGDAS de clientes, sem depender da pasta do Drive:

1. O usuário seleciona um ou mais PDFs no navegador.
2. A tela envia cada arquivo para a Edge Function `fator-r-process-upload`; o frontend não usa `file.text()` para interpretar PDF.
3. A função extrai o texto nativo do PDF com `unpdf`; se a extração falhar, retorna erro técnico claro em vez de resultado falso com baixa confiança.
4. Quando o Fator R fica em faixa crítica (`<= 0,28`) ou de atenção (`<= 0,32`), a função tenta disparar e-mail de `leomateus620@gmail.com` para `ricardo@escritoriozimmermann.com.br` pela função `fator-r-send-alert`.
5. Quando `persist` está ativo, o processamento também registra documento, resultado mensal, alerta e log nas tabelas `fator_r_*`.

> Observação: o envio real depende das credenciais do provedor configurado na Supabase (`RESEND_API_KEY` ou `SENDGRID_API_KEY`). Sem essas credenciais, o sistema registra a tentativa e exibe o erro de configuração no resultado individual do PDF.
