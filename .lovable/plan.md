
## Contexto do teste pedido

Você quer um teste real de ponta a ponta:
1. Criar pasta `teste guias` no Google Drive (via conector).
2. Você sobe um PDF nela.
3. Sistema baixa, extrai texto, identifica **Leonardo LTDA** (CNPJ 12.345.678/0001-95, e-mail `leomateus620@gmail.com`, canal e-mail, comunicação ativa — já está pronto no cadastro).
4. Envia pelo Gmail conectado.
5. Move o PDF para `enviados`.

## Bloqueadores que descobri ao inspecionar o backend

Antes de rodar qualquer teste, preciso te avisar que o pipeline **nunca foi efetivamente instalado** no backend atual. As edge functions existem no código, mas:

1. **Tabelas inexistentes no banco.** Não há `guias`, `guia_envios`, `guia_excecoes`, `guia_eventos`, `integracoes_guias` nem `integracao_segredos`. A migration `20260526120000_guide_delivery_pipeline.sql` referenciada na doc nunca foi aplicada. Qualquer chamada hoje quebraria com "relation does not exist".
2. **Bug de campo na empresa.** `dispatch-guide` lê `company.email` e `company.whatsapp`, mas as colunas reais são `email_principal` e `whatsapp_principal`. Mesmo com tabelas criadas, o envio falharia.
3. **Autenticação Google divergente.** O pipeline foi escrito para usar refresh token OAuth próprio (`GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, tabela `integracao_segredos`). Mas a conta Gmail/Drive que você conectou usa o **conector Lovable** (gateway, secrets `GOOGLE_DRIVE_API_KEY` e `GOOGLE_MAIL_API_KEY`). São fluxos incompatíveis — hoje nenhum dos dois chega ao Google.
4. **Storage bucket faltando** (`guias-delivery`) — só afeta WhatsApp, então não bloqueia este teste por e-mail.

Sem corrigir 1–3 não dá para "só rodar". Abaixo o plano mínimo para tornar o teste possível **e** executá-lo.

## Plano

### Etapa 1 — Backend mínimo para o pipeline rodar

1.1. Criar migration única `*_guide_delivery_pipeline_min.sql` com apenas o necessário para o fluxo Drive→Gmail:
   - `guias` (id, drive_file_id, file_name, mime_type, sha256, status, match_source, cnpj_detectado, empresa_id FK empresas, tipo_guia, competencia, vencimento, valor, texto_extraido_preview, pagina_count, extraction_method, has_text_layer, pasta_atual, source_folder_id, sent_folder_id, provider_error, received_at, processed_at, sent_at, timestamps).
   - `guia_envios` (com `idempotency_key` UNIQUE, `sanitized_payload jsonb`).
   - `guia_excecoes`, `guia_eventos`.
   - `integracoes_guias` (provider PK, display_name, status, source_folder_id, sent_folder_id, sender_identity, schedule_minutes, last_check_at, last_error).
   - GRANTs para `authenticated` e `service_role`, RLS habilitado, políticas mínimas (leitura por usuários autenticados; escrita só via service role).
   - Seed: linhas `gmail` e `google_drive` em `integracoes_guias` com `status='inativo'` (preenchidas na Etapa 2).

1.2. Não criar tabela `integracao_segredos` — o fluxo vai usar o gateway dos conectores.

### Etapa 2 — Migrar `dispatch-guide` e funções Drive para o conector Lovable

2.1. **Drive (download + criar/mover pasta)** via gateway:
   - `GET https://connector-gateway.lovable.dev/google_drive/drive/v3/files/{id}?alt=media`
   - `POST .../drive/v3/files` (criar pasta) com `mimeType: application/vnd.google-apps.folder`.
   - `PATCH .../drive/v3/files/{id}?addParents=...&removeParents=...` para mover para `enviados`.
   - Headers: `Authorization: Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${GOOGLE_DRIVE_API_KEY}`.
2.2. **Gmail send** via gateway:
   - `POST https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send` com `{ raw: <base64url RFC2822> }`.
   - Headers idem com `GOOGLE_MAIL_API_KEY`.
   - Remetente = e-mail da própria conta conectada (Gmail Zimmermann), descobrido via `users/me/profile` no startup ou hardcoded no campo `sender_identity` da integração.
2.3. Remover todo o caminho `googleAccessToken()` / `integracao_segredos` / `GOOGLE_ACCESS_TOKEN`.
2.4. Corrigir bug: trocar `company.email` → `company.email_principal` e `company.whatsapp` → `company.whatsapp_principal` em `dispatch-guide` e em qualquer outro lugar (`process-guide`, `scan-guide-folder`).
2.5. Atualizar `integracoes-status` para verificar disponibilidade dos secrets `GOOGLE_DRIVE_API_KEY` / `GOOGLE_MAIL_API_KEY` no lugar das envs antigas.

### Etapa 3 — Modo de teste seguro

Adicionar flag `mode: 'simulate' | 'live'` no body de `run-guide-scan-now` (default `simulate`). Em modo simulate:
- Faz download e extração reais.
- Identifica empresa e validações.
- **Não chama Gmail send nem move o arquivo no Drive**; em vez disso grava `guia_envios.status='simulado'` e `guia_eventos` com payload sanitizado para você inspecionar.

Isso te permite rodar 1x em simulação e depois disparar o real.

### Etapa 4 — Criar a pasta `teste guias` no Drive

Edge function pontual `bootstrap-test-folder` (one-shot):
- Cria pasta `teste guias` na raiz do Drive da conta conectada → retorna `folderId`.
- Cria subpasta `enviados` dentro dela → retorna `sentFolderId`.
- Faz `UPDATE integracoes_guias SET source_folder_id, sent_folder_id, status='ativo'` para `google_drive` e marca `gmail` como `ativo` também.
- Retorno mostrado para você com os IDs e os links `https://drive.google.com/drive/folders/{id}`.

### Etapa 5 — Execução do teste (com você no loop)

1. Eu rodo Etapa 4 e te entrego o link da pasta `teste guias`.
2. **Você sobe o PDF real** dentro dela e me avisa.
3. Eu disparo `run-guide-scan-now` em modo `simulate`. Mostro o resultado: extração, CNPJ detectado, match com Leonardo LTDA, prévia do e-mail que seria enviado.
4. Se OK, eu disparo em modo `live`. O Gmail Zimmermann envia o PDF para `leomateus620@gmail.com`, o arquivo é movido para `teste guias/enviados`, e te mostro o `provider_message_id` retornado pelo Gmail + linha de `guia_envios` registrada.
5. Se algo cair em exceção, te explico o motivo e o caminho de correção.

## Detalhes técnicos

- **Extração nativa de PDF**: mantida como já está em `process-guide` (sem Google Vision). PDFs escaneados continuam virando exceção `pdf_without_text_layer`.
- **Idempotência**: `guia_envios.idempotency_key = '${guia.id}:${canal}'` impede envio duplo se você re-rodar.
- **Sem alterações no frontend** nesta rodada — só backend + execução. As telas existentes (`/guias`, `/guias/integracoes`) já leem dessas tabelas e vão "ganhar vida" automaticamente.
- **Sem Twilio / WhatsApp** neste teste (empresa está com canal `email`).

## O que NÃO está incluído

- Webhook Twilio, agendamento cron a cada 5min, criptografia de refresh token próprio: tudo descartado em favor do conector Lovable.
- Limpeza de código morto referente a `integracao_segredos` / OAuth próprio será feita junto à Etapa 2.
