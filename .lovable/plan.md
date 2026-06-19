## Contexto

Drive e Gmail agora estão vinculados a `esc.zimmermann@gmail.com` (conexão "Escritório Zimmermann"). Acesso ao Drive validado:

- `Guias` → `1juBalbvA10ncwlUarxUum7OcgzYWXPZq`
- `A enviar` → `1vVBvXTKQcz0Drkp1aIg6j9LoI-Ro2Ccj` (vazia)
- `Enviadas` → `1vGYiWckLnFaUUL1IbRzDPZNAP9tuou4s`

Decisões confirmadas:
- Manter **apenas** `A enviar` e `Enviadas` no Drive. PDFs com problema ficam só registrados no app (Revisão/Exceções), sem mover de pasta.
- **Modo produção** desde o 1º PDF (envio Gmail automático com `confidence_score >= 0.92`).
- Remetente único: `esc.zimmermann@gmail.com`.

## Mudanças

### 1. Banco — apontar `integracoes_guias` para os IDs reais

Migration para `UPDATE` da linha `provider='google_drive'`:
- `root_folder_id = 1juBalbvA10ncwlUarxUum7OcgzYWXPZq`
- `source_folder_id = 1vVBvXTKQcz0Drkp1aIg6j9LoI-Ro2Ccj`
- `sent_folder_id   = 1vGYiWckLnFaUUL1IbRzDPZNAP9tuou4s`
- `review_folder_id`, `not_identified_folder_id`, `errors_folder_id`, `duplicates_folder_id` → `NULL` (sinaliza "não mover")
- `status = 'ativo'`, `last_check_at = now()`, `last_error = NULL`

E para `provider='gmail'`: `sender_identity = 'esc.zimmermann@gmail.com'`, `status='ativo'`.

Também desligar modo teste em `guide_test_config` (`enabled=false`) para garantir produção.

### 2. Edge Functions — respeitar "sem pastas auxiliares"

Ajustes em `supabase/functions/_shared/guide-drive.ts` e `run-guide-scan-now/index.ts`:
- `ensureGuideStructure` passa a aceitar `{ createAuxFolders: false }` (default novo) e retorna apenas `rootId`, `aEnviarId`, `enviadasId`; demais campos como `null`.
- `bootstrap-guide-folders` deixa de criar `Revisão Manual / Não Identificadas / Erros / Duplicadas` quando `createAuxFolders=false` (modo atual).
- Em `run-guide-scan-now`, qualquer ramo `moveFile(..., revisaoId|naoIdentificadasId|errosId|duplicadasId, ...)` vira no-op quando o ID é `null`. O PDF permanece em `A enviar`, mas o registro em `guias` sai com `status` correto (`revisao_manual`, `nao_identificada`, `erro`, `duplicada`) e a entrada de auditoria/exceção é criada normalmente.
- Sucesso (`pronta_envio` → dispatch OK): continua movendo de `A enviar` → `Enviadas` (único movimento físico no Drive).

### 3. Secret `GMAIL_SENDER`

Solicitar/atualizar o secret `GMAIL_SENDER = esc.zimmermann@gmail.com` (usado no header `From` do `dispatch-guide`/`run-guide-scan-now`).

### 4. UI — Integrações

`src/pages/guias/IntegracoesGuias.tsx`: ocultar as linhas de pastas auxiliares no card do Drive quando `review_folder_id` etc. forem `null`, e remover o botão "Recriar estrutura" quando o modo é "só A enviar/Enviadas" (substituir por "Revalidar pastas" que só checa root/source/sent).

### 5. Validação fim-a-fim

Depois das mudanças, sem precisar de PDF real:
- `supabase--curl_edge_functions` em `test-guide-connection` (canal `email`, destino `esc.zimmermann@gmail.com`) para confirmar envio Gmail real.
- `supabase--curl_edge_functions` em `run-guide-scan-now` (modo dry: sem arquivos em A enviar) só para confirmar que o scan executa sem erro e grava `guide_batch_runs` com `files_seen=0`.
- Pedir que você arraste 1 PDF de teste para `A enviar` e rodar o scan manual via botão da tela `/guias`.

## Fora deste escopo

- WhatsApp (Twilio): mantido desligado; ficará para quando você ativar.
- Renomear arquivos no Drive, anexar metadados, ou criar pastas por empresa.
- Mudanças no parser / regras de confidence (já validados na PR #38).

## Ordem de execução

1. Migration (`integracoes_guias` + `guide_test_config`).
2. `add_secret GMAIL_SENDER`.
3. Edits em `_shared/guide-drive.ts`, `run-guide-scan-now`, `bootstrap-guide-folders`, `IntegracoesGuias.tsx`.
4. Smoke test via `curl_edge_functions` (`test-guide-connection` + `run-guide-scan-now` vazio).
5. Reportar resultado e pedir um PDF de teste em `A enviar`.
