## Objetivo

Na página de detalhe de cada empresa (`/empresas/:id`), adicionar três cards lado a lado que reproduzem o fluxo que rodou manualmente para a Zimmermann:

1. **Card "Pasta no Drive"** — cria (ou mostra) a pasta dedicada da empresa.
2. **Card "Documentos da Pasta"** — upload de PDFs que vão para Storage + Drive.
3. **Card "Disparar Guias"** — extrai metadados, registra em `guias` e envia e-mail para o destinatário cadastrado da empresa.

## UI (`src/pages/EmpresaDetalhe.tsx`)

Nova seção `Automação de Guias` no topo do detalhe, com 3 `GlassCard` em grid (responsivo, 1 coluna no mobile, 3 no desktop):

```text
┌─ Pasta Drive ──────┐ ┌─ Documentos ────────┐ ┌─ Disparar Guias ───┐
│ Status: criada     │ │ 3 PDFs              │ │ Destino: ricardo@…│
│ ID: 1YWStZ…        │ │ [Upload PDF]        │ │ [Simular] [Enviar]│
│ [Abrir no Drive]   │ │ • DAS.pdf  R$ 6.6k  │ │ Último envio: …   │
│ [Criar pasta]      │ │ • FGTS.pdf …        │ │                   │
└────────────────────┘ └─────────────────────┘ └────────────────────┘
```

- Card 1: se `empresa.drive_folder_id` vazio → botão "Criar pasta"; senão mostra ID, link `https://drive.google.com/drive/folders/{id}` e botão "Recriar".
- Card 2: lista PDFs (`guias` da empresa com `pasta_atual='empresa'` ou um campo `documentos` novo). Input de upload aceita múltiplos. Cada item mostra nome, tamanho, tipo detectado (se já processado), botão remover.
- Card 3: mostra `email_principal` (editável inline opcional), seletor `Simular | Enviar`, botão dispara a edge function. Mostra resumo do último `guia_envios` (provider_message_id, hora, status).

Estados, toasts e refresh via React Query (invalidar `guias` e `guia_envios` após cada ação).

## Backend

### Migração

- Adicionar coluna `empresas.drive_folder_id text` (nullable) — guarda a pasta criada para cada empresa.
- Criar bucket `empresa-documentos` (privado) com policies para `authenticated` (path `empresa/{empresa_id}/...`).

### Edge functions (3 novas, todas reusando o padrão `connector-gateway`)

1. **`create-empresa-folder`**
   - Input: `{ empresa_id }`.
   - Se `drive_folder_id` já existe, faz HEAD no Drive; se ok retorna. Senão cria via `POST /google_drive/drive/v3/files` com `mimeType: application/vnd.google-apps.folder`, `parents: [PARENT_ID]` (mesma pasta-raiz usada hoje), `name: "{razao_social} – {cnpj}"`.
   - Salva `empresas.drive_folder_id`, registra `logs_acesso`.

2. **`upload-empresa-doc`**
   - Input: multipart com `empresa_id` + arquivo (ou chamado já com Storage path).
   - Pega bytes do bucket `empresa-documentos`, faz upload multipart em `https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart` para a pasta da empresa.
   - Cria registro em `guias` com `drive_file_id`, `file_name`, `sha256`, `pasta_atual='empresa'`, `status='aguardando'`, `empresa_id`.
   - Frontend faz upload direto ao Storage antes (com `crypto.randomUUID()`), depois chama a função passando o path.

3. **`dispatch-empresa-guias`**
   - Input: `{ empresa_id, guia_ids?: string[], mode: 'simulate'|'live', destinatario_override? }`.
   - Para cada guia: baixa do Drive (`alt=media`), extrai com `unpdf` → `tipo_guia`, `valor`, `vencimento`, `competencia`; atualiza `guias`.
   - `simulate`: só retorna o preview do e-mail e os metadados.
   - `live`: monta um e-mail único com todos os PDFs anexos via Gmail (`google_mail`), envia para `empresa.email_principal` (ou override), grava `guia_envios` (canal email, `idempotency_key = empresa_id+date+hash`, `provider_message_id`, `sanitized_payload`), atualiza `guias.status='enviada'` + `sent_at`, registra `logs_acesso`.
   - Em erro: cria `guia_excecoes`, status `falha`.

Todas as funções: CORS, validação Zod, leitura dos secrets `LOVABLE_API_KEY`, `GOOGLE_DRIVE_API_KEY`, `GOOGLE_MAIL_API_KEY` já presentes.

### Reaproveitamento

Extrair helpers para `supabase/functions/_shared/`:
- `drive.ts` — `createFolder`, `uploadFile`, `downloadFile`.
- `gmail.ts` — `sendEmailWithAttachments` (MIME multipart base64url).
- `pdf-extract.ts` — `extractGuiaMetadata` (regex tipo_guia/valor/vencimento/competência, baseado no que já existe em `run-guide-scan-now`).

Assim `run-guide-scan-now` e a nova `dispatch-empresa-guias` compartilham a mesma lógica de extração e envio.

## Pontos fora de escopo

- Twilio/WhatsApp, cron automático, `canal_preferido`, validação CNPJ no PDF (a guia agora é vinculada à empresa via UI, não por detecção).
- Refatorar `run-guide-scan-now` (continua funcionando para a pasta única "central").
- Permissões/roles (mantém policy `anon/authenticated` atual).

## Perguntas

1. **Pasta-pai no Drive**: uso o mesmo `parents=1rlstvviGxs-qy12J2DPXwtZjJfQkqYfZ` (root usado na Zimmermann) para todas as empresas, ou prefere uma pasta-raiz nova só para "Empresas/"?
2. **Destinatário do disparo**: sempre `empresa.email_principal`, com campo de override visível no card? Ou sempre pedir confirmação antes de "Enviar"?
3. **Um e-mail por disparo com todos os PDFs anexos** (como na Zimmermann) ou **um e-mail por PDF**?