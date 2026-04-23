

# Validação ponta a ponta — diagnóstico real e correções

## 1) Resultado da validação atual

| Verificação | Resultado |
|---|---|
| HMAC handshake (Lovable ↔ Worker) | ✅ **PASSOU** — fingerprint `aab510f64312`, signatures iguais, callback_base válido |
| Worker `/health` | ✅ build `2026-04-22-debug-sign-v2`, secrets presentes |
| Dispatch CNPJ (Zimmermann) | ✅ aceito pelo Worker, jobs criados |
| Dispatch CND (Zimmermann) | ✅ aceito pelo Worker |
| **Execução CNPJ no Worker** | ❌ falhou: `Cannot read properties of null (reading 'accept')` |
| **Execução CND no Worker** | ❌ falhou: `429 Rate limit exceeded` (Browser Rendering) |
| **`lookup_requests`** | ❌ ficaram em `running` para sempre — callback final nunca atualizou o request |
| **Classificação do erro** | ❌ caiu em `unknown` em ambos |
| **`dry-run-zimmermann`** | ❌ timeout do client HTTP (função demora 90s, client corta em 60s) |

**Diagnóstico final: a infra do Worker está OK. As falhas são de fluxo de aplicação, callbacks e classificação.**

## 2) Causas-raiz reais

1. **`sendFinal` envia `request_id: undefined`** no provider CNPJ → `cf-final-callback` faz `update().eq('id', undefined)`, que silenciosamente não faz nada → request eternamente "running".
2. **Provider CND nem inclui `request_id`** no `sendFinal`.
3. **`sendFinal` é chamado de dentro do `withBrowser`**: quando o browser falha (ex: 429), o `sendFinal` propaga uma resposta inválida e o catch externo manda outro `sendFinal` "unknown" — sobrescreve o erro real.
4. **`classifyError` não conhece** `rate limit`, `429`, `null reading`, `Browser Rendering`. Tudo cai em `unknown`.
5. **Dispatcher não serializa** jobs CNPJ + CND para o mesmo CNPJ → estoura o rate limit do plano free do Browser Rendering.
6. **`dry-run-zimmermann` é síncrono** com loop de 90s → cliente HTTP do Supabase cancela em ~60s.
7. **UI `/consulta/saude`** não tem painel persistente do "último dry-run" lendo de `automation_config_kv.dry_run_zimmermann`.

## 3) Correções (em ordem de execução)

### A. Worker (precisa redeploy)

- **`providers/cnpj-public-portal.ts`**: incluir `request_id: payload.request_id` no `sendFinal` (success e catch). Mover `sendFinal` de sucesso para **fora** do `withBrowser` (capturar resultado em variável e enviar depois do `await withBrowser`).
- **`providers/cnd-public-portal.ts`**: idem.
- **`types.ts`**: adicionar `request_id: string` em `ExecuteJobPayload` e novos `ErrorType`: `rate_limited`, `browser_unavailable`, `callback_error`, `manual_required`.
- **`lib/classification.ts`**: adicionar regras para `429`, `rate limit exceeded`, `unable to create new browser`, `accept`, `null` (browser binding error).
- **`lib/progress.ts`**: log do response status do callback; se !ok, lança erro classificado como `callback_error` em vez de engolir.

### B. Edge functions

- **`lookup-dispatcher`**: incluir `request_id: requestRow.id` no payload enviado ao Worker.
- **`cf-final-callback`**: validar `request_id` não-vazio antes do update; se faltar, fazer fallback `select id from automation_jobs where id=job_id → target_request_id`. Adicionar log explícito quando update afeta 0 rows.
- **`dry-run-zimmermann`**: tornar **assíncrono** — dispara os 2 jobs, persiste `pending` em `automation_config_kv` com `dry_run_id`, retorna 202 imediatamente. Adicionar nova função `dry-run-zimmermann-status` para polling.

### C. UI

- **`/consulta/saude`**: 
  - card "Último Dry-Run Zimmermann" lendo `automation_config_kv.dry_run_zimmermann` (status, data, link signed do relatório, status CNPJ, status CND, link para timeline dos 2 jobs).
  - botão "Rodar Dry-Run" agora chama dispatch assíncrono e faz polling a cada 3s na nova função de status.
- **`/consulta/historico`**: garantir que linhas com `status=failed` mostram `error_type` + `error_message` claramente (não vazio).
- **`AppSidebar`**: gate de menu — só libera entrada "Consulta CNPJ" se `automation_config_kv.dry_run_zimmermann.passed === true`.

### D. Migration

- Adicionar índice em `automation_jobs(target_request_id)` para o fallback do callback.
- Garantir registro inicial em `automation_config_kv` para `dry_run_zimmermann` com `passed: false`.

## 4) Fluxo de validação após correções

1. Usuário aprova → eu aplico A+B+C+D.
2. Eu rodo `dry-run-zimmermann` (assíncrono agora).
3. Worker processa CNPJ; aguarda; depois CND (serializado).
4. `cf-final-callback` atualiza request, job E `automation_config_kv`.
5. `/consulta/saude` mostra:
   - Status real (success / failed / partial / manual_required)
   - Erro classificado se houver
   - Timeline (logs de `automation_job_logs`)
   - Artifacts (screenshots em `automation_artifacts` com signed URLs)
   - Duração e provider

## 5) O que vou te devolver no fim

1. ✅/❌ HMAC passou
2. ✅/❌ Dry-run passou ou falhou
3. Se falhou: erro classificado real (`captcha_detected`, `rate_limited`, `layout_changed`, etc) com etapa e screenshot
4. Lista de correções aplicadas
5. Se módulo pode ser liberado no menu

## 6) Importante

- **Você precisará rodar `wrangler deploy` em `cloudflare-worker/`** após a correção dos providers e classification (etapa A). Não é mudança de secret, só código.
- Eu te aviso quando precisar disso — todas as outras mudanças (B, C, D) são edge functions e UI, deployam automático.

