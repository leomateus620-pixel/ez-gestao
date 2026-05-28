## Objetivo

Adicionar uma camada de **armazenamento organizado no Google Drive** para os PDFs do Fator R, sem tocar em parser, alertas, e-mail, cálculo ou design. Os PDFs anexados manualmente passam a ser enviados ao Drive na estrutura `PGDAS - Monitoramento Fator R / Ano / MM - Mês / Empresa`, com deduplicação e referências salvas no banco. Os PDFs vindos do Drive Sync apenas registram corretamente a origem (sem reupload).

## Mudanças no banco (migração)

Adicionar colunas a `fator_r_documents` (não mexer no resto):

- `drive_web_url text` (já gravado parcialmente — garantir existência)
- `drive_folder_id text` — pasta da empresa/mês onde o arquivo está
- `drive_parent_path text` — ex.: `PGDAS - Monitoramento Fator R/2026/04 - Abril/CRISTINE SCHWINGEL LTDA`
- `file_hash text` — sha256 do conteúdo do PDF
- `cloud_storage_path text` — caminho lógico
- `storage_status text default 'pending'` — `pending | uploaded | skipped_duplicate | failed | drive_native`
- `uploaded_at timestamptz`
- Índice único parcial: `(company_id, file_year, file_month, drive_file_name)` quando `storage_status='uploaded'` e índice em `file_hash`

Nova tabela `fator_r_drive_folders` (cache de pastas para evitar buscas repetidas):

- `id uuid pk`
- `path text unique` (ex.: `root`, `2026`, `2026/04`, `2026/04/CRISTINE...`)
- `drive_folder_id text not null`
- `parent_folder_id text`
- `kind text` — `root | year | month | company`
- `created_at timestamptz default now()`

Com GRANTs e RLS conforme padrão do projeto.

## Edge Functions

### Novo módulo compartilhado `supabase/functions/_shared/fator-r-drive-storage.ts`

Funções:

- `getOrCreateFolder(name, parentId, kind, path, supabase, driveKey)` — consulta `fator_r_drive_folders` por `path`; se não existir, lista no Drive (`q="<name>" in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`); se ainda não existir, cria via `POST /files`; grava na tabela. Loga `folder_created` / `folder_reused`.
- `resolveCompanyFolder({ companyName, cnpj, year, month })` — encadeia raiz → ano → `MM - Nome` → empresa (`<RAZÃO> - <CNPJ>`).
- `uploadPdf({ bytes, name, parentId, hash })` — multipart upload, retorna `{ id, webViewLink, name }`.
- `findExistingByHashOrName(parentId, name, hash)` — verifica deduplicação antes do upload.
- `computeSha256(bytes)`.

Nome da pasta raiz: configurável via secret `FATOR_R_DRIVE_ROOT_NAME` (default `PGDAS - Monitoramento Fator R`). Parent opcional `FATOR_R_DRIVE_ROOT_PARENT_ID` (se ausente, criada na raiz da conta do conector).

### Ajuste em `fator-r-process-upload/index.ts` (upload manual)

Após `extractPdf` e `parsePgdasFatorR`, antes do `insert` em `fator_r_documents`:

1. Calcular `file_hash` do `bytes`.
2. Se houver `cnpj`, `companyName`, `referenceMonth` e `referenceYear`, chamar `resolveCompanyFolder`.
3. Verificar duplicidade: `fator_r_documents` por `file_hash` OU `(company_id, file_year, file_month, drive_file_name)`.
   - Se duplicado: setar `storage_status='skipped_duplicate'`, reaproveitar `drive_file_id`/`drive_web_url` existentes; logar `drive_duplicate_skipped`.
   - Senão: `uploadPdf` para o Drive, setar `drive_file_id`, `drive_web_url`, `drive_folder_id`, `cloud_storage_path`, `storage_status='uploaded'`, `uploaded_at`; logar `drive_upload_success`.
4. Em caso de erro no Drive: manter o processamento (não bloquear interpretação/e-mail), gravar `storage_status='failed'`, logar `drive_upload_failed` com mensagem.
5. Incluir `drive_web_url` e `storage_status` no `resultPayload` retornado.

### Ajuste em `fator-r-drive-sync/index.ts`

Como o PDF já está no Drive, **não reenvia**. Apenas:

- Setar `storage_status='drive_native'`, `drive_folder_id = file.sourceFolderId`, `cloud_storage_path = caminho lógico baseado em parents`, `uploaded_at = file.createdTime`.
- Logar `drive_source_linked`.

### Eventos de log padronizados (`fator_r_processing_logs.event_type`)

`drive_root_ready`, `drive_year_folder_ready`, `drive_month_folder_ready`, `drive_company_folder_ready`, `drive_upload_success`, `drive_duplicate_skipped`, `drive_upload_failed`, `drive_source_linked`.

## Frontend (`src/pages/FatorR.tsx`)

Mudanças mínimas, mantendo design:

1. No tipo `ManualPdfResult` adicionar `driveWebUrl?`, `storageStatus?`, `cloudStoragePath?`.
2. Em cada card de resultado manual, ao lado do badge de status, exibir botão `Abrir PDF no Drive` (ícone `ExternalLink`) quando `driveWebUrl` presente.
3. Adicionar nas linhas de metadados do card: `Armazenamento` (Enviado / Duplicado / Falhou / No Drive) e `Pasta` (`cloudStoragePath`).
4. No card "Status da integração", adicionar 3 badges:
   - `Pasta Drive: <nome raiz>` (verde se `fator_r_drive_folders` tem `root`)
   - `Último armazenamento: <data>` (max `uploaded_at` em `fator_r_documents`)
   - `Arquivos salvos: <count storage_status='uploaded'>`
5. Carregar essas métricas no `load()` via 2 queries adicionais.

## Fora de escopo (explicitamente)

- Não tocar em: parser PGDAS, regras de status, e-mails/alertas, design geral, lógica de cálculo, autenticação Drive.
- Sem nova autenticação: usa `GOOGLE_DRIVE_API_KEY` + `LOVABLE_API_KEY` já presentes.

## Resultado

PDFs anexados manualmente são enviados ao Google Drive em `PGDAS - Monitoramento Fator R/Ano/MM - Mês/Empresa`, deduplicados por hash/nome, com link visível no card e métricas no card de integração. PDFs do Drive Sync apenas referenciam a origem.
