
# Integração WhatsApp Cloud API (Meta) — Módulo Guias

Substituir o stack Twilio/WhatsApp-Web pelo envio direto via Graph API da Meta, mantendo o pipeline seguro (validações, modo teste, logs, fallback e-mail).

## 1. Secrets (você configura antes do deploy)

Será necessário cadastrar no painel de Secrets (Supabase/Lovable):

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_APP_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_API_VERSION` (ex.: `v25.0`)
- `WHATSAPP_TEST_TO` (E.164 sem `+`)

Nenhum desses valores entrará no código, banco ou frontend.

## 2. Migração de banco (corretiva)

Aplicar **uma única migration** que:

- `guide_templates`: adiciona `meta_template_name TEXT`, `meta_template_language TEXT DEFAULT 'pt_BR'`, `meta_template_has_document_header BOOLEAN DEFAULT false`, `meta_template_category TEXT DEFAULT 'utility'`, `meta_template_status TEXT DEFAULT 'active'`. Mantém `twilio_content_sid` apenas como legado (nullable, sem uso).
- `guia_envios`: adiciona `provider TEXT DEFAULT 'meta_whatsapp'`, `provider_status TEXT`, `provider_payload JSONB`, `provider_error TEXT`, `sent_at TIMESTAMPTZ`. Já existem `delivered_at`, `failed_at`, `provider_message_id`.
- `empresas`: confirma `whatsapp_principal`, `whatsapp_opt_in_at`, `canal_preferido`, `comunicacao_ativa` (já existem — sem alteração).
- Seeds dos templates Meta padrão (DAS, FGTS, DAF, DARF, GPS/INSS, ISS, ICMS, Outros) com `meta_template_name='envio_guia_fiscal'`, `pt_BR`, `utility`, `meta_template_has_document_header=true`. `ativo=false` por padrão (ativa-se após aprovação na Meta).
- Sem alterar `whatsapp_messages` / `whatsapp_message_events` (legado, mantidos só para histórico).

## 3. Edge Functions

### `send-whatsapp-message` (reescrita completa)

Substitui a integração com `WHATSAPP_SERVICE_URL` (WhatsApp-Web HMAC). Nova função:

- Auth: JWT obrigatório ou `SUPABASE_SERVICE_ROLE_KEY`.
- Input: `{ guide_id, to, template_name, language, parameters{}, document?{link,filename}, modo }`.
- Lê template em `guide_templates`; valida `ativo=true`, `meta_template_status='active'`, placeholders preenchidos.
- Monta payload conforme `meta_template_has_document_header`:
  - **Com header document**: `components[header(type=document, link, filename), body(parameters[])]`.
  - **Texto puro**: apenas `components[body(parameters[])]`.
- POST `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages` com `Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}`.
- Grava em `guia_envios`: `provider='meta_whatsapp'`, `provider_message_id`, `provider_status='sent'`, `provider_payload` sanitizado (sem token), `sent_at`.
- Em erro: `provider_status='failed'`, `provider_error`, `failed_at`; registra exceção em `guia_excecoes`.

### `whatsapp-webhook` (novo)

- `GET`: valida `hub.verify_token === WHATSAPP_VERIFY_TOKEN` → devolve `hub.challenge`; senão 403.
- `POST`: valida assinatura `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET` (HMAC-SHA256 do raw body); rejeita inválido.
- Parseia `entry[].changes[].value.statuses[]` e atualiza `guia_envios` por `provider_message_id`:
  - `sent|delivered|read|failed` → `provider_status`, `delivered_at`, `failed_at`, `provider_error`.
  - Insere `guia_eventos` com payload sanitizado.
- `verify_jwt = false` no `config.toml`.

### `test-guide-connection` (extensão)

Adiciona ramo `canal='whatsapp'`:
- Verifica todos os secrets presentes.
- `GET https://graph.facebook.com/${ver}/${PHONE_NUMBER_ID}` para validar token + ID.
- `GET .../${BUSINESS_ACCOUNT_ID}/message_templates` para validar WABA e listar templates ativos.
- Envia mensagem template (`hello_world` ou `envio_guia_fiscal`) para `WHATSAPP_TEST_TO`.
- Retorna diagnóstico sem expor secrets.

### `dispatch-guide` / `run-guide-scan-now` (ajuste)

- Quando `canal_preferido in ('whatsapp','ambos')`:
  - Pré-validações: token presente, número E.164, `whatsapp_opt_in_at` not null, template ativo, placeholders ok, `confidence_score >= 0.92`, `status='pronta_envio'`.
  - Se template exige header document: chamar `get-guide-pdf` para gerar **link temporário assinado** (vide §4); sem link → bloquear e enviar a `guia_excecoes` com motivo `whatsapp_temp_link_unavailable`.
  - Em `modo=teste`: sobrescreve `to` para `WHATSAPP_TEST_TO`; não move PDF para `Enviadas`; marca `modo='teste'` no log.
  - Canal `ambos`: dispara e-mail e WhatsApp como **dois registros separados** em `guia_envios`; falha parcial não marca como entregue; permite fallback e-mail se WhatsApp falhar.

## 4. Link temporário seguro para PDF

A Meta exige URL pública acessível para `header document`. Solução:

- Reusar `get-guide-pdf` (já existe) gerando uma URL **assinada com TTL curto** (ex.: 15 min) via Supabase Storage `createSignedUrl` sobre o bucket `guia-pdf-links`. Se o PDF estiver só no Drive, baixar via conector e fazer upload temporário ao bucket antes de assinar.
- O link assinado é único por envio; registrado em `guia_envios.provider_payload.document_link_ref` (apenas o path, não a URL completa).
- Sem link assinado válido → bloquear envio WhatsApp.

## 5. Frontend

### `/integracoes` (`IntegracoesGuias.tsx`)

- Remover card Twilio; adicionar card **WhatsApp Cloud API (Meta)**:
  - status (active/inactive), provedor `meta_cloud_api`, `phone_number_id` (mascarado), `waba_id` (mascarado), `api_version`, status token, status webhook, último teste, último erro.
  - Botão **Testar WhatsApp** → `test-guide-connection({canal:'whatsapp'})`.
  - Avisos quando faltar opt-in/template/`WHATSAPP_TEST_TO`.

### `/configuracoes/templates-guias` (`TemplatesGuias.tsx`)

- Para `canal='whatsapp'`: substituir campo `twilio_content_sid` por:
  - Nome do template Meta, Idioma, Header document?, Categoria, Status, Ativo, Corpo de referência.
- Validação client-side: WhatsApp obriga `meta_template_name` + `meta_template_language`.

### Limpeza

- Atualizar `integracoes-status` para reportar `whatsapp` em vez de `twilio_whatsapp`.
- `src/services/whatsapp.ts` e `useGuideOps` ajustados ao novo payload.
- Manter `whatsapp-status-callback` (legado) sem alterações para não quebrar histórico, mas remover do roteamento de novos envios.

## 6. Documentação

`docs/guias-automation.md` reescrito: remove Twilio, descreve Meta Cloud API, secrets, webhook, templates, modo teste, fluxo de status e debug.

## 7. Segurança (regras invioláveis)

- Tokens só em `Deno.env`; nunca no banco, frontend ou logs.
- Webhook: verify token no GET + assinatura HMAC-SHA256 no POST.
- `provider_payload` sanitizado (sem Authorization, sem link assinado completo).
- Frontend nunca chama `graph.facebook.com` diretamente.
- WhatsApp só envia com: empresa ativa, `comunicacao_ativa`, opt-in, número E.164, template ativo, placeholders completos, PDF/link quando exigido, modo respeitado.

## 8. Critérios de aceite (resumo)

- Build limpo; nenhuma referência operacional a Twilio no fluxo Guias.
- `send-whatsapp-message` envia via Graph API; webhook valida e atualiza status.
- Modo teste sempre redireciona para `WHATSAPP_TEST_TO`.
- Canal `ambos` gera dois `guia_envios` independentes.
- Tela `/integracoes` mostra status real da Meta sem expor secrets.

## Fora de escopo

- Não tocar em Drive/Gmail nem em outros módulos (Fator R, Classifica, Tax Reform).
- Não remover tabelas legadas `whatsapp_messages` / `whatsapp_message_events` (histórico).
- Não alterar `supabase/config.toml` além de adicionar `[functions.whatsapp-webhook] verify_jwt = false`.

---

**Próximo passo:** ao aprovar, cadastre os 8 secrets `WHATSAPP_*` e em seguida eu (1) aplico a migration, (2) reescrevo `send-whatsapp-message`, (3) crio `whatsapp-webhook`, (4) atualizo `test-guide-connection` / `dispatch-guide` / `run-guide-scan-now`, (5) atualizo as telas e a doc.
