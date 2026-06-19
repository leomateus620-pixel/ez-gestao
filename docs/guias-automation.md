# Automação de Envio de Guias

## Fluxo

## Pipeline seguro

Regra central: envio automatico somente com certeza alta. Qualquer ambiguidade vai para
`revisao_manual` ou `quarentena`; duplicidade nunca e reenviada automaticamente.

Limites de confianca:

- `confidence_score >= 0.92` e todos os campos criticos validos: pode ficar `pronta_envio`.
- `confidence_score >= 0.85` e `< 0.92`: revisao rapida.
- `confidence_score < 0.85`: revisao manual completa.
- Campo critico ausente, invalido ou duvidoso: sem envio automatico.

Campos criticos registrados em `critical_fields_json`: CNPJ, empresa, tipo da guia,
competencia, vencimento, valor, destinatario e canal. Cada campo guarda valor,
origem, metodo, score, justificativa e status.

Matriz de decisao implementada no Edge Function `run-guide-scan-now`:

- CNPJ ausente ou invalido -> `nao_identificada`.
- Multiplos CNPJs validos -> `revisao_manual`.
- Empresa inexistente ou inativa -> `revisao_manual`.
- Tipo, valor, competencia ou vencimento duvidoso -> `revisao_manual`.
- Inconsistencia entre campos -> `quarentena`.
- Duplicidade exata ou operacional -> `duplicada`.
- Duplicidade provavel -> `revisao_manual`.
- Template, destinatario ou conector necessario invalido -> `quarentena`/`erro`.
- Tudo valido, score alto e automacao habilitada -> `pronta_envio` e dispatch.

Modo teste nunca chama Gmail/WhatsApp e nunca move para `Enviadas`; ele grava preview
do lote em `guide_batch_runs.preview_json`, que pode ser exportado pela tela de Guias.

Google Drive e Gmail continuam usando exclusivamente os gateways Lovable:

- Drive: `https://connector-gateway.lovable.dev/google_drive/drive/v3`
- Gmail: `https://connector-gateway.lovable.dev/google_mail/gmail/v1`
- WhatsApp: API oficial Meta Cloud (`https://graph.facebook.com/{API_VERSION}/{PHONE_NUMBER_ID}/messages`)

1. `scan-guide-folder` lista arquivos da pasta Google Drive `a enviar`.
2. PDFs novos são registrados em `guias`; formatos diferentes geram exceção.
3. `process-guide` tenta identificar CNPJ e metadados no PDF. Quando necessário,
   tenta extrair texto **nativamente** do PDF (sem OCR externo). Se o PDF não tiver
   camada de texto extraível (PDF escaneado/imagem), a guia e marcada como exceção
   com motivo `pdf_without_text_layer`.
4. Somente uma correspondência segura com empresa ativa avança para
   `dispatch-guide`.
5. O canal vem exclusivamente de `empresas.canal_preferido`.
6. Gmail anexa o PDF; WhatsApp Cloud API envia template aprovado (Meta), com header
   document quando aplicável usando link assinado temporário gerado no bucket
   privado `guia-pdf-links`.
7. Depois da aceitação do provedor, o Drive move a guia para `enviados`.
8. `whatsapp-webhook` recebe os eventos `sent | delivered | read | failed` e
   atualiza `guia_envios.provider_status`, `delivered_at` e `failed_at`. Não
   reenvia automaticamente em falhas.

## Deploy Supabase

Aplicar a migration `20260526120000_guide_delivery_pipeline.sql` e publicar as
Edge Functions novas. A migration cria o agendamento a cada cinco minutos, mas
ele so efetua chamadas depois que dois secrets forem inseridos no Vault:

```sql
select vault.create_secret('https://PROJECT.supabase.co', 'project_url');
select vault.create_secret('CRON_SECRET_ALEATORIO', 'guide_cron_secret');
```

Definir os secrets das Edge Functions:

```text
APP_ORIGIN
GUIDE_CRON_SECRET
GUIDE_INTERNAL_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
GOOGLE_OAUTH_STATE_SECRET
GOOGLE_TOKEN_ENCRYPTION_KEY
# (OCR externo desativado — leitura nativa de PDF)
GOOGLE_CLOUD_ACCESS_TOKEN
GMAIL_SENDER
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_APP_ID
WHATSAPP_APP_SECRET
WHATSAPP_VERIFY_TOKEN
WHATSAPP_API_VERSION
WHATSAPP_TEST_TO
```

`GOOGLE_ACCESS_TOKEN` e aceito somente para testes operacionais temporários.
Em produção, usar `connect-google-oauth`, que persiste somente o refresh token
criptografado em uma tabela sem política de leitura para clientes.

## Google e WhatsApp Cloud API

- Autorizar Google Drive para ler/mover arquivos e Gmail somente com
  `gmail.send`. Documentar a verificação OAuth antes do uso em produção.
- Configurar as pastas em `integracoes_guias` e mudar Drive/Gmail para `ativo`
  apenas após teste de conexão.
- Criar templates Meta aprovados (categoria `utility`) com placeholders
  `{{1}}..{{5}}` na ordem **tipo_guia, empresa, competencia, vencimento, valor**.
  Marcar `meta_template_has_document_header = true` para templates que recebem
  o PDF no header.
- Registrar opt-in WhatsApp (`empresas.whatsapp_opt_in_at`) e telefone em E.164.
- Configurar webhook na Meta apontando para
  `/functions/v1/whatsapp-webhook` com o mesmo `WHATSAPP_VERIFY_TOKEN`. A
  função valida `X-Hub-Signature-256` usando `WHATSAPP_APP_SECRET`.
- Em modo teste, todo envio WhatsApp é redirecionado para `WHATSAPP_TEST_TO`.

## Garantias

- Nenhum envio automático ocorre sem CNPJ único válido, empresa ativa, canal
  escolhido, contato válido, consentimento WhatsApp quando aplicável e conector ativo.
- Identificação por nome do arquivo exige sinais fiscais (valor, vencimento, tipo)
  no texto extraído; do contrário a guia vai para Exceções com motivo
  `insufficient_pdf_signals`.
- `guia_envios.idempotency_key` evita envio duplicado.
- Segredos não são expostos ao frontend; logs guardam somente payload sanitizado.
- `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_APP_SECRET` ficam apenas em `Deno.env`;
  jamais no banco, frontend ou logs.
- O legado de consultas fiscais foi removido; este documento cobre apenas o fluxo de guias.
