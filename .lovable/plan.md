

# Implementação Real — Edge Functions + Worker Cloudflare + UI

## Status Atual

✅ Worker publicado em `https://gestaoez.leomateus620.workers.dev`
✅ Browser binding `env.gestaoez` ativo
✅ Secrets configurados: `CLOUDFLARE_WORKER_URL`, `CLOUDFLARE_WORKER_HMAC_SECRET`, `CF_CALLBACK_HMAC_SECRET`
✅ Schema Supabase migrado (tabelas, enums, bucket privado, feature flags)

Falta agora: edge functions reais, código-fonte do Worker (`/cloudflare-worker/`) com `env.gestaoez`, e toda a UI do módulo `/consulta/*`.

## 1. Edge Functions (8) — Lovable Cloud

Todas em `supabase/functions/<name>/index.ts`, com CORS, Zod, logging estruturado, `verify_jwt=false` apenas nos callbacks (já é default Lovable).

| Função | Responsabilidade |
|---|---|
| `lookup-dispatcher` | Valida CNPJ → checa cache (CNPJ 7d / CND até `valid_until`) → cria `*_request` + `automation_jobs` row → assina HMAC → `POST {WORKER_URL}/execute-job` → retorna `{request_id, job_id, from_cache, correlation_id}` |
| `lookup-status` | GET `?request_id=&type=` → consolida request + último job + logs + artifacts (signed URLs 5min) + timeline derivada |
| `cf-progress-callback` | Verifica HMAC (timestamp ±5min + nonce em `hmac_nonces`) → grava `automation_job_logs` → atualiza `automation_jobs.status` + heartbeat em `provider_health` |
| `cf-final-callback` | Verifica HMAC → persiste `*_results` (raw + parsed + cache_valid_until) → fecha job → cria `automation_exceptions` se falha → atualiza `provider_health` (success_rate_24h, latência) |
| `artifacts-sign` | POST `{job_id, artifact_type, filename}` → retorna signed **upload** URL para o Worker (5min) e registra row em `automation_artifacts` |
| `lookup-retry` | POST `{request_id}` → respeita `max_attempts` + backoff exponencial → reenfileira |
| `provider-health-summary` | GET → agrega 24h: jobs em fila, success rate, latência média, último heartbeat, circuit breaker |
| `dry-run-zimmermann` | Dispara CNPJ + CND para `88736335000113`, aguarda conclusão (long-poll interno até 90s), gera relatório JSON+PDF em `automation-artifacts/reports/{id}.pdf`, retorna `report_id` |

Helpers compartilhados inline em cada função: `signHmac()`, `verifyHmac()`, `consumeNonce()`, `mapErrorToType()`, `corsHeaders`.

`supabase/config.toml` recebe blocos `[functions.cf-progress-callback]` e `[functions.cf-final-callback]` com `verify_jwt = false` (callbacks do Worker não têm JWT do usuário).

## 2. Cloudflare Worker (entregue em `/cloudflare-worker/`)

Pasta nova fora do build do Vite (adicionar `cloudflare-worker` em `tsconfig.app.json` exclude se necessário, mas como já está fora de `src/` o Vite ignora).

```
cloudflare-worker/
  src/index.ts              # Hono: POST /execute-job, GET /health, GET /version
  src/lib/security.ts       # HMAC SHA-256 verify (Lovable→Worker) + sign (Worker→callback)
  src/lib/browser.ts        # launch via env.gestaoez (Browser Rendering binding)
  src/lib/progress.ts       # POST cf-progress-callback assinado
  src/lib/upload.ts         # pede signed URL via artifacts-sign + PUT
  src/lib/classification.ts # heurísticas → captcha_detected | layout_changed | timeout | cnpj_not_found | etc.
  src/providers/cnpj-public-portal.ts   # solucoes.receita.fazenda.gov.br/Servicos/cnpjreva
  src/providers/cnd-public-portal.ts    # solucoes.receita.fazenda.gov.br/Servicos/certidaointernet
  src/types.ts
  wrangler.toml             # browser binding nome = "gestaoez", vars: SUPABASE_URL, CALLBACK_BASE
  package.json
  README.md                 # deploy + secrets (wrangler secret put)
```

**Comportamento `/execute-job`**:
1. Verifica HMAC do header `X-Lovable-Signature` + `X-Lovable-Timestamp` + `X-Lovable-Nonce`
2. Lê `{job_id, job_type, cnpj, correlation_id}`
3. Responde **202 imediatamente** e processa em `ctx.waitUntil(...)` (não bloqueia)
4. Worker abre browser via `env.gestaoez`, executa provider, envia 4-6 progress callbacks (`navigate`, `submit`, `parse`, `artifact_uploaded`, `done`)
5. Faz upload de screenshots/HTML/PDF via `artifacts-sign` → PUT signed URL
6. Envia final callback com resultado classificado
7. Em qualquer erro: classifica + final callback com `status=failed` ou `manual_required`

**Substitui `/test-browser`**: removido. Mantém `/health` (retorna `{ok, version, browser_binding: "gestaoez"}`) e `/version`.

## 3. Frontend (módulo `/consulta`)

### Estrutura
```
src/features/consulta/
  providers/registry.ts          # factory: cnpj_cloudflare | cnd_cloudflare | serpro_*_placeholder
  services/
    cnpj-utils.ts                # normalize, validate (DV), mask
    dispatcher.ts                # invoke('lookup-dispatcher')
    cache.ts                     # leitura de cache_valid_until
    classification.ts            # error_type → label PT-BR + sugestão
    timeline.ts                  # logs → steps visuais
    parsers/                     # parseCnpjResult, parseCndResult
  hooks/
    useCnpjLookup.ts             # mutation
    useCndLookup.ts              # mutation
    useLookupStatus.ts           # query + Realtime + polling adaptativo (1s→3s→10s)
    useLookupHistory.ts
    useLookupArtifacts.ts        # signed URLs on-demand
    useExecutionTimeline.ts
    useProviderHealth.ts
    useExceptionsCenter.ts
    useDryRunReport.ts
  components/
    CnpjInput.tsx                # máscara 00.000.000/0000-00
    CacheBadge.tsx               # "Consultado agora" | "Cache" | "Expirada"
    StatusBadge.tsx
    CompanyResultCard.tsx
    CndResultCard.tsx
    ExecutionTimeline.tsx        # próprio, isolado do existente
    ArtifactViewer.tsx           # screenshot lightbox + html/pdf download
    ExceptionDetail.tsx
    ProviderHealthCard.tsx
```

### Páginas (`src/pages/consulta/`)
- `ConsultaIndex.tsx` — `/consulta`: hero, CnpjInput, 3 botões (CNPJ, CND, Forçar refresh), resultado em cards, timeline ao vivo
- `ConsultaHistorico.tsx` — `/consulta/historico`: tabela paginada + filtros
- `ConsultaExcecoes.tsx` — `/consulta/excecoes`: central com tipologia, reprocessar, comparar última vs anterior, anotação
- `ConsultaSaude.tsx` — `/consulta/saude`: provider health + botão "Rodar Dry-Run Zimmermann" + toggle `consulta_publica_enabled` (só habilitável após dry-run aprovado)
- `ConsultaRelatorio.tsx` — `/consulta/relatorios/:id`: relatório dry-run com download PDF

### Integração mínima
- `App.tsx`: 5 rotas novas dentro de `<Routes>`
- `AppSidebar.tsx`: 1 item "Consulta CNPJ/CND" (ícone `Search`), **renderizado condicionalmente** lendo `feature_flags.consulta_publica_enabled` via React Query (cache 30s)

## 4. Segurança

- HMAC-SHA256 bidirecional com `timestamp` (±5min) e `nonce` (tabela `hmac_nonces`, TTL 10min, cleanup via job na própria função)
- Service role **apenas** dentro de edge functions
- Bucket `automation-artifacts` privado, acesso só por signed URL (5min)
- Worker valida assinatura antes de qualquer trabalho; callbacks validam assinatura antes de gravar
- Logs do usuário sanitizados (sem segredos, sem HTML cru); detalhes técnicos só em `details_json`

## 5. Fluxo Real End-to-End

```text
UI ConsultaIndex
  → useCnpjLookup → invoke('lookup-dispatcher', {cnpj, type:'cnpj', force_refresh})
       ↓
  cache hit? → retorna result + from_cache=true
       ↓ (miss)
  cria company_lookup_requests + automation_jobs
  HMAC sign + POST https://gestaoez.leomateus620.workers.dev/execute-job
       ↓ 202 Accepted
  UI inicia useLookupStatus (Realtime + polling)
       ↓
  Worker (ctx.waitUntil):
    env.gestaoez.launch() → providers/cnpj-public-portal.ts
    POST cf-progress-callback (×N) → logs + heartbeat
    POST artifacts-sign → PUT screenshots/html
    POST cf-final-callback → result + cache_valid_until
       ↓
  UI atualiza timeline + cards via Realtime
```

CND: idêntico, com `cnd-public-portal.ts` e parsing de status (`negativa | positiva_com_efeitos | positiva | nao_emitida | indisponivel | captcha | manual_required`).

## 6. Dry-Run Obrigatório

`ConsultaSaude.tsx` tem botão "Executar Dry-Run Zimmermann" que chama `dry-run-zimmermann`. Função dispara CNPJ+CND, aguarda, gera PDF de evidências, marca `automation_config_kv.dry_run_passed = true|false`. Toggle `consulta_publica_enabled` só habilita se `dry_run_passed=true`.

## 7. Não-Regressão

- Único arquivo atual editado: `App.tsx` (append rotas) e `AppSidebar.tsx` (1 item condicional)
- Zero alteração em `DataProvider`, `AutomationProvider`, páginas atuais, tabelas/enums atuais, `index.css`, `tailwind.config.ts`
- Flag global desligada por default — sidebar só mostra item após dry-run

## 8. Limitações Transparentes

- Portais Receita/PGFN podem exigir captcha a qualquer momento → classificação correta = `captcha_detected` + `manual_required`, **não é bug**
- Worker responde 202 e processa async; UI nunca bloqueia
- Se Worker estiver offline, dispatcher marca job como `failed` com `error_type=worker_unreachable` e cria exceção

## Ordem de Execução (após aprovação)

1. Criar 8 edge functions + atualizar `supabase/config.toml` (callbacks sem JWT)
2. Criar `/cloudflare-worker/` com código completo + `wrangler.toml` usando `env.gestaoez` + README
3. Criar `src/features/consulta/` (providers, services, hooks, components)
4. Criar 5 páginas em `src/pages/consulta/`
5. Editar `App.tsx` (rotas) + `AppSidebar.tsx` (item condicional)
6. Documentação em `docs/consulta-module.md` e `cloudflare-worker/README.md` com passos de `wrangler secret put` para `LOVABLE_HMAC_SECRET`, `CALLBACK_HMAC_SECRET`, `CALLBACK_BASE_URL`

