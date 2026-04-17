

# Módulo Consulta CNPJ + CND — Cloudflare Worker + Lovable Cloud

## Escopo e Premissas

Feature 100% isolada: rotas novas `/consulta/*`, tabelas novas (prefixo lógico `lookup_*` / `automation_*` novas, sem reutilizar as existentes), hooks novos, toda visibilidade protegida por feature flag. Nenhum arquivo atual de negócio é modificado, exceto `AppSidebar.tsx` (adicionar 1 item) e `App.tsx` (registrar rotas).

**Segredos necessários** (vou pedir via add_secret na implementação):
- `CLOUDFLARE_WORKER_URL` — endpoint do Worker
- `CLOUDFLARE_WORKER_HMAC_SECRET` — HMAC Lovable→Worker
- `CF_CALLBACK_HMAC_SECRET` — HMAC Worker→Callback

O código do Cloudflare Worker (Playwright/Browser Rendering) **não roda dentro do Lovable** — vou entregar o código-fonte do Worker em `/cloudflare-worker/` (pasta dentro do repo, fora do build do Vite) com `wrangler.toml`, providers, HMAC e instruções de deploy. Você faz o `wrangler deploy`.

## Entregáveis

### 1. Schema (migration única)

Tabelas novas:
- `company_lookup_requests`, `company_lookup_results`
- `cnd_lookup_requests`, `cnd_lookup_results`
- `automation_jobs`, `automation_job_logs`, `automation_artifacts`
- `automation_exceptions`, `provider_health`
- `feature_flags` (key/value/enabled), `automation_config_kv` (key/value_json)

Enums novos (isolados, sem colidir com os atuais): `lookup_status`, `cnd_lookup_status`, `job_status`, `job_type`, `artifact_type`, `provider_runtime`, `exception_severity`, `exception_lifecycle`.

RLS: `anon + authenticated` com `USING true` (mantém padrão atual do projeto). Realtime habilitado em `automation_jobs`, `automation_job_logs`, `company_lookup_requests`, `cnd_lookup_requests`.

Storage: bucket **privado** `automation-artifacts`.

Seed: linhas iniciais em `feature_flags` (todas `false`, exceto `consulta_publica_dry_run_required=true`) e `provider_health` (`cloudflare_worker_browser_run`, status `paused`).

### 2. Edge Functions (8)

`lookup-dispatcher` · `lookup-status` · `cf-progress-callback` · `cf-final-callback` · `artifacts-sign` · `lookup-retry` · `provider-health-summary` · `dry-run-zimmermann`

Todas com: Zod validation, CORS, HMAC verify nos callbacks (timestamp ±5min + nonce anti-replay em tabela `hmac_nonces`), `correlation_id`, logging estruturado.

### 3. Cloudflare Worker (código-fonte entregue, deploy do seu lado)

Pasta `/cloudflare-worker/` com:
```
src/index.ts              # Hono router: /execute-job /health /version
src/lib/security.ts       # HMAC verify + sign
src/lib/browser.ts        # @cloudflare/playwright launch wrapper
src/lib/progress.ts       # POST para cf-progress-callback
src/lib/upload.ts         # signed URL upload
src/lib/classification.ts # captcha/layout/timeout → failure type
src/providers/cnpj-public-portal.ts   # solucoes.receita.fazenda.gov.br
src/providers/cnd-public-portal.ts    # solucoes.receita.fazenda.gov.br/Servicos/certidaointernet
wrangler.toml             # com browser binding
README.md                 # deploy + env vars
```

### 4. Frontend

**Providers/Registry** (`src/features/consulta/providers/registry.ts`): `provider_public_portal_cnpj_cloudflare`, `provider_public_portal_cnd_cloudflare`, `provider_serpro_*_placeholder`. Factory plugável.

**Services** (`src/features/consulta/services/`): `cnpj-utils.ts` (normalize/validate/mask com DV), `cache.ts`, `dispatcher.ts`, `classification.ts`, `timeline.ts`, `dry-run-report.ts`, `parsers/`.

**Hooks** (`src/features/consulta/hooks/`): `useCnpjLookup`, `useCndLookup`, `useLookupStatus` (polling adaptativo + realtime), `useLookupHistory`, `useLookupArtifacts`, `useExecutionTimeline`, `useProviderHealth`, `useExceptionsCenter`, `useDryRunReport`.

**Páginas** (`src/pages/consulta/`):
- `ConsultaIndex.tsx` — hero, input CNPJ com máscara, botões Consultar CNPJ / Consultar CND / Forçar refresh, cards de resultado, timeline, badges.
- `ConsultaHistorico.tsx` — lista paginada, filtros (CNPJ, tipo, status, período), drill-down.
- `ConsultaExcecoes.tsx` — filtros por tipologia, comparar última vs anterior, reprocessar, marcar resolvido, anexar nota.
- `ConsultaSaude.tsx` — provider status, taxa sucesso 24h, latência, circuit breaker, jobs em fila, heartbeat.
- `ConsultaRelatorio.tsx` (`/consulta/relatorios/:id`) — relatório de dry-run com evidências.

**Componentes** (`src/features/consulta/components/`): `CnpjInput`, `CacheBadge`, `StatusBadge`, `CompanyResultCard`, `CndResultCard`, `ExecutionTimeline` (novo, não reusa o atual para ficar isolado), `ArtifactViewer`, `ExceptionDetail`, `ProviderHealthCard`.

**Design**: glassmorphism existente (`GlassCard`), Tailwind tokens do projeto, responsivo mobile-first. Sem alterar `index.css` nem `tailwind.config.ts` além de eventuais utilitários novos.

### 5. Integração Sidebar + Router

- `AppSidebar.tsx`: adicionar grupo "Consulta" com item único "Consulta CNPJ/CND" (ícone `Search`), **renderizado condicionalmente** via `feature_flags.consulta_publica_enabled`.
- `App.tsx`: registrar 5 rotas novas dentro de `<Routes>`.

### 6. Fluxo End-to-End

```text
UI → lookup-dispatcher (cache check → cria request+job → HMAC sign → POST Worker)
                                                                      ↓
                                                       Cloudflare Worker + Playwright
                                                                      ↓
                                         cf-progress-callback (logs, heartbeat, artifacts)
                                                                      ↓
                                         cf-final-callback (result, classify, cache, exception?)
                                                                      ↓
                                         UI polling lookup-status + Realtime → atualiza timeline
```

### 7. Dry-Run Zimmermann

Edge function `dry-run-zimmermann` dispara CNPJ+CND para `88736335000113`, aguarda conclusão, consolida evidências, gera relatório (JSON + PDF em `automation-artifacts/reports/`), e só então admin pode setar `consulta_publica_enabled=true` via UI de Saúde.

### 8. Segurança

- HMAC-SHA256 bidirecional com `timestamp + nonce` (tabela `hmac_nonces` TTL 10min)
- Bucket privado + signed URLs (5min)
- Service role **somente em edge functions**
- Sanitização de payloads em logs visíveis ao usuário
- Feature flags como gate único

## Ordem de Implementação

1. Migration (tabelas + enums + bucket + seed)
2. Pedir 3 secrets (CF URL + 2 HMAC)
3. Edge functions (8) + `supabase/config.toml` com `verify_jwt=false` nos callbacks
4. Código-fonte do Cloudflare Worker em `/cloudflare-worker/`
5. Frontend: providers, services, hooks
6. Páginas + componentes
7. Sidebar + rotas (atrás da flag)
8. README operacional em `/cloudflare-worker/README.md` e `docs/consulta-module.md`

## Garantia de Não-Regressão

- Zero alteração em: `DataProvider`, `AutomationProvider`, todas as páginas atuais, tabelas atuais, enums atuais, `index.css`, `tailwind.config.ts`.
- Único arquivo atual tocado: `AppSidebar.tsx` (append condicional) e `App.tsx` (append de rotas).
- Flag global desligada por padrão — feature invisível até dry-run aprovado.

## Limitações Transparentes

- Enquanto você não fizer `wrangler deploy` do Worker e cadastrar os 3 secrets, toda consulta real cai em `manual_required` com mensagem clara ("Worker Cloudflare não configurado"). UI, fila, cache, histórico, exceções e saúde funcionam normalmente.
- Portais Receita/PGFN podem introduzir captcha a qualquer momento; classificação `captcha_detected` + `manual_required` é o comportamento correto, não um bug.

