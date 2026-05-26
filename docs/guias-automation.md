# Automacao de Envio de Guias

## Fluxo

1. `scan-guide-folder` lista arquivos da pasta Google Drive `a enviar`.
2. PDFs novos sao registrados em `guias`; formatos diferentes geram excecao.
3. `process-guide` tenta identificar CNPJ e metadados no PDF. Quando necessario,
   envia o PDF para OCR assincrono no Google Cloud Vision usando bucket privado.
4. Somente uma correspondencia segura com empresa ativa avanca para
   `dispatch-guide`.
5. O canal vem exclusivamente de `empresas.canal_preferido`.
6. Gmail anexa o PDF; Twilio envia template aprovado com URL assinada temporaria.
7. Depois da aceitacao do provedor, o Drive move a guia para `enviados`.
8. `twilio-status-webhook` registra entrega ou falha posterior sem reenvio automatico.

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
GCS_OCR_BUCKET
GOOGLE_CLOUD_ACCESS_TOKEN
GMAIL_SENDER
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_SENDER
TWILIO_GUIDE_CONTENT_SID
TWILIO_STATUS_CALLBACK_URL
```

`GOOGLE_ACCESS_TOKEN` e aceito somente para testes operacionais temporarios.
Em producao, usar `connect-google-oauth`, que persiste somente o refresh token
criptografado em uma tabela sem politica de leitura para clientes.

## Google e Twilio

- Autorizar Google Drive para ler e mover arquivos e Gmail somente com
  `gmail.send`; documentar a verificacao OAuth antes do uso em producao.
- Configurar as pastas em `integracoes_guias` e mudar Drive/Gmail para `ativo`
  apenas apos teste de conexao.
- Configurar no bucket GCS privado uma regra de lifecycle para remover entradas
  `pending/` e `results/` automaticamente, conforme a retencao aprovada.
- Criar template utilitario Twilio aprovado para documento e descricao previa;
  registrar opt-in e telefone E.164 no cadastro da empresa.
- Apontar callback Twilio para `twilio-status-webhook`; a funcao rejeita
  requisicoes sem assinatura valida.

## Garantias

- Nenhum envio automatico ocorre sem CNPJ unico valido, empresa ativa, canal
  escolhido, contato valido, consentimento WhatsApp quando aplicavel e conector ativo.
- Identificacao obtida apenas por OCR requer confianca minima `0.90`.
- `guia_envios.idempotency_key` evita envio duplicado.
- Segredos nao sao expostos ao frontend; logs guardam somente payload sanitizado.
- As telas e funcoes CND permanecem separadas no grupo `Consulta CND (legado)`.
