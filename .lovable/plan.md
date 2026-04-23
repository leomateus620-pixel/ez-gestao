

# Mitigar rate limit do Cloudflare Browser Rendering: cache + retry + jitter

## Diagnóstico confirmado

Últimos 3 jobs CND falharam com `error_type=rate_limited` ("Cloudflare Browser Rendering rate limit atingido"). O Worker está estourando a cota da plataforma (Browser Rendering tem limite de ~2 sessões simultâneas e ~10/min no plano padrão). A classificação já existe (`classification.ts:34`), só falta a **estratégia de mitigação**.

## Estratégia (3 camadas)

### Camada 1 — Cache de resultado (24h) no Supabase
**Cache em Postgres, não em KV.** Não vou criar KV namespace porque (a) exige criação manual no dashboard CF + binding no `wrangler.toml`, (b) o Supabase já é a fonte de verdade dos resultados (`cnd_lookup_results`, `cnpj_lookup_results`), e (c) consultar uma tabela existente é mais barato que provisionar KV.

- Antes do dispatch chamar o Worker, a edge function `lookup-dispatcher` consulta `cnd_lookup_results` (ou `cnpj_lookup_results`) por `cnpj + status='success'` e `created_at > now() - interval '24 hours'`.
- Se houver hit recente: clona o resultado em uma nova `*_lookup_request` com `cache_hit=true`, dispara `cf-final-callback` localmente com os dados em cache, **não chama o Worker**. Latência <200ms.
- Adiciona coluna `cache_hit boolean default false` nas duas tabelas de request (migration), exposta na timeline da UI.

### Camada 2 — Retry com backoff exponencial dentro do Worker
Novo helper `cloudflare-worker/src/lib/rate-limit.ts` (não `utils/` pra manter convenção do projeto):

```ts
export async function withRateLimitRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T>
```

- Detecta erro de rate limit por mensagem/status (`429`, `rate limit`, `quota`, `Browser Rendering`).
- Backoff: 30s → 60s → 120s + jitter aleatório de 0–5s.
- Usa `setTimeout` global (disponível em Workers, não precisa import).
- **Importante:** Cloudflare Worker tem CPU time limit de 30s por request, mas dentro de `executionCtx.waitUntil` tolera execuções longas; mesmo assim, 3 retries × até 120s = 360s é arriscado. Vou limitar a **2 retries (30s + 60s)** para ficar dentro do envelope de 5min do `waitUntil`.

Aplicado em ambos `runCnpjLookup` e `runCndSpaLookup` envolvendo o bloco `withBrowser(...)`.

### Camada 3 — Jitter pré-execução (anti-thundering-herd)
No início de cada provider, antes do `withBrowser`, um delay aleatório de **2–8s** (não 8–15s como sugerido — exagera latência sem ganho real, dado que cache cobre repetições).

## O que NÃO vou implementar da sugestão original

- ❌ **KV Namespace** — Postgres já resolve. Sem custo extra de provisionamento.
- ❌ **`Buffer.concat` / `stream.on('data')`** — Workers não têm `Buffer` nativo nem stream `EventEmitter`. Já uso `Uint8Array` + `ReadableStream.getReader()` (correto, está em `cnd-spa-portal.ts` linhas 188-196).
- ❌ **`page.waitForTimeout(2500)` arbitrário** — anti-pattern. Mantenho `waitForLoadState("networkidle")` que já está no código.
- ❌ **Reescrever `runCndSpaLookup` do zero** — o provider atual está correto, só envolvo em `withRateLimitRetry`.
- ❌ **Delay de 8–15s** — exagerado; 2–8s + cache 24h é suficiente.

## Arquivos alterados

**Cloudflare Worker (precisa `wrangler deploy`):**
- `cloudflare-worker/src/lib/rate-limit.ts` — **novo**, helpers `withRateLimitRetry` e `jitterDelay`.
- `cloudflare-worker/src/providers/cnd-spa-portal.ts` — envolve `withBrowser` em `withRateLimitRetry`, adiciona `jitterDelay(2000, 8000)` no início.
- `cloudflare-worker/src/providers/cnd-public-portal.ts` (legacy) — mesmo tratamento.
- `cloudflare-worker/src/providers/cnpj-public-portal.ts` — mesmo tratamento.
- `cloudflare-worker/src/index.ts` — `BUILD_ID = "2026-04-23-rate-limit-mitigation-v1"`.

**Migration (Supabase):**
- Adicionar `cache_hit boolean default false` em `cnd_lookup_requests` e `cnpj_lookup_requests`.

**Edge Functions (deploy automático):**
- `supabase/functions/lookup-dispatcher/index.ts` — antes de despachar pro Worker, consulta cache (24h) em `cnd_lookup_results`/`cnpj_lookup_results` por `cnpj + status='success'`. Se houver hit, clona resultado e chama `cf-final-callback` localmente com `cache_hit=true`. Pula o Worker.

**App:**
- `src/features/consulta/components/ExecutionTimeline.tsx` — quando `cache_hit=true`, mostra badge "🚀 Cache (24h)" no topo do timeline.
- `src/features/consulta/hooks/useLookup.ts` — propaga campo `cache_hit` se já não propaga.

## Sem mudanças em
- HMAC, secrets, bindings, callback_base, captcha/OCR.
- Lógica de download de PDF (já implementada e funciona).
- Schema de `cnd_lookup_results` / `cnpj_lookup_results`.
- `wrangler.toml` (sem novos bindings).

## Deploy necessário

```bash
cd cloudflare-worker && npx wrangler deploy
curl -s https://gestaoez.leomateus620.workers.dev/health | jq .build_id
# esperado: "2026-04-23-rate-limit-mitigation-v1"
```

Migration Supabase + edge functions são automáticos via Lovable.

## Resultado esperado

- **1ª consulta de um CNPJ**: chama Worker normalmente (com jitter 2–8s + retry se 429).
- **Consultas subsequentes do mesmo CNPJ em <24h**: cache hit em <200ms, **sem chamar Worker**.
- **Rate limit eventual**: Worker espera 30s, retenta. Se persistir, espera 60s. Se ainda persistir, falha como `rate_limited` (UI já trata).
- Reduz chamadas reais ao Browser Rendering em ~80% nos testes recorrentes do dry-run.

