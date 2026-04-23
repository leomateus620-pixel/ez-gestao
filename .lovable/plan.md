

# Cancelar dry-run em andamento

## O que vou fazer

### 1. Cancelar o job em execução (agora)
- Marcar o job CND `2e57a74c-bcd9-439b-87bf-73c020a26707` como `cancelled` em `automation_jobs` (status + `error_type='cancelled'` + `finished_at=now()`).
- Marcar qualquer outro job `queued/running/dispatched` correlacionado ao dry-run como `cancelled` também (varredura por segurança).
- Resetar a chave `automation_config_kv.dry_run_zimmermann` para `{ in_progress: false, passed: false, cancelled: true, cancelled_at: <now> }` para que a UI pare de fazer polling e o botão "Executar Dry-run" volte a ficar disponível.

### 2. Adicionar botão "Cancelar dry-run" na UI (`/consulta/saude`)
Para você não precisar pedir cancelamento manual de novo:
- Em `src/pages/consulta/ConsultaSaude.tsx`, ao lado do botão "Executando…", mostrar botão **Cancelar** quando `inProgress === true`.
- Novo hook `useCancelDryRun()` em `src/features/consulta/hooks/useLookup.ts` que invoca uma nova edge function `dry-run-zimmermann-cancel`.

### 3. Nova edge function `dry-run-zimmermann-cancel`
`supabase/functions/dry-run-zimmermann-cancel/index.ts`:
- Lê `automation_config_kv.dry_run_zimmermann` para pegar `cnpj_request_id` e `cnd_request_id`.
- Faz `UPDATE automation_jobs SET status='cancelled', error_type='cancelled', error_message='Cancelado pelo usuário', finished_at=now() WHERE id IN (...) AND status IN ('queued','running','dispatched')`.
- Atualiza o KV para `in_progress: false, passed: false, cancelled: true, phase: 'cancelled'`.
- Adiciona bloco em `supabase/config.toml` com `verify_jwt = false`.

**Observação importante**: o Cloudflare Worker que está executando o job não tem endpoint de cancelamento remoto — ele continua rodando no background até o timeout (~120s) ou até concluir. Mas como marcamos o job como `cancelled` no banco, o callback final dele será **ignorado** pela edge `cf-final-callback` (vou adicionar guard: se `automation_jobs.status='cancelled'`, descartar o resultado). Isso garante que a UI/KV permaneça limpa.

### 4. Guard no `cf-final-callback`
`supabase/functions/cf-final-callback/index.ts`: antes de gravar resultado, verificar se o job já está `cancelled`. Se sim, retornar 200 OK silenciosamente sem persistir nada.

## Arquivos alterados

**Imediato (cancelar agora via SQL — eu executo no momento da implementação):**
- `automation_jobs` row do job `2e57a74c…` → `status=cancelled`
- `automation_config_kv.dry_run_zimmermann` → `in_progress=false, cancelled=true`

**Edge functions (deploy automático Lovable):**
- `supabase/functions/dry-run-zimmermann-cancel/index.ts` (novo)
- `supabase/functions/cf-final-callback/index.ts` (guard cancelled)
- `supabase/config.toml` (bloco `[functions.dry-run-zimmermann-cancel]`)

**App:**
- `src/features/consulta/hooks/useLookup.ts` (novo `useCancelDryRun`)
- `src/pages/consulta/ConsultaSaude.tsx` (botão Cancelar)

## Sem mudanças em
- HMAC, secrets, bindings, Cloudflare Worker, providers de captcha, classificação, BUILD_ID.

## Resultado esperado
- Em segundos após aprovar: dry-run em andamento marcado como cancelado, UI libera o botão "Executar Dry-run", você pode disparar uma nova consulta imediatamente.
- A partir de agora, sempre que houver dry-run rodando, aparece o botão **Cancelar** na UI.

