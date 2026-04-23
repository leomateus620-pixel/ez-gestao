
## Situação confirmada no código atual

O repositório já contém as correções pedidas no Worker. Hoje, os arquivos lidos mostram que:

- `cloudflare-worker/src/providers/cnpj-public-portal.ts` usa `browser.newPage()` direto
- `cloudflare-worker/src/providers/cnd-public-portal.ts` usa `browser.newPage()` direto
- `cloudflare-worker/src/lib/browser.ts` já tem retry com backoff para `429`
- `cloudflare-worker/src/lib/classification.ts` já classifica:
  - `fs.mkdtemp` / `[unenv]` -> `runtime_incompatibility`
  - `connectOverCDP` / `browserType.connect` -> `browser_unavailable`
  - `429` / `rate limit` -> `rate_limited`
- `cloudflare-worker/wrangler.toml` já está com `compatibility_date = "2026-04-22"`
- `cloudflare-worker/package.json` já está com `@cloudflare/playwright: "latest"`
- o dry-run assíncrono já está serializado entre CNPJ e CND em:
  - `supabase/functions/dry-run-zimmermann/index.ts`
  - `supabase/functions/dry-run-zimmermann-status/index.ts`

Isso indica que o problema não é mais de diagnóstico: o Worker em produção ainda está rodando código antigo, ou seu repositório local ainda não recebeu exatamente esses arquivos.

## O que será feito

### 1. Consolidar a correção real do Worker
Reaplicar no `cloudflare-worker` exatamente o estado que já aparece neste projeto, garantindo estes comportamentos finais:

- CNPJ:
  - sem `newContext()`
  - sem qualquer fluxo que dependa de `fs.mkdtemp`
  - somente `browser.newPage()`
  - erro `fs.mkdtemp` nunca cai em `unknown`
- CND:
  - abertura de browser via `withBrowser`
  - retry com backoff exponencial para `429`
  - se esgotar retry, persistir `rate_limited`
  - não sobrescrever erro real com `unknown`

### 2. Garantir a serialização estrita do dry-run
Manter o fluxo já modelado no backend:

- `dry-run-zimmermann` dispara apenas CNPJ
- `dry-run-zimmermann-status` só dispara CND quando CNPJ estiver em estado terminal
- isso elimina paralelismo de browser no mesmo dry-run

### 3. Garantir classificação correta na UI
Manter/validar o mapeamento já existente em `src/features/consulta/services/classification.ts` e seu uso em `/consulta/saude`:

- `runtime_incompatibility`
- `browser_unavailable`
- `rate_limited`

A UI deve mostrar:
- tipo classificado
- mensagem técnica
- sugestão

Sem “Falha desconhecida” para esses casos.

## Arquivos do `cloudflare-worker` que precisam estar no estado final correto

- `cloudflare-worker/src/providers/cnpj-public-portal.ts`
- `cloudflare-worker/src/providers/cnd-public-portal.ts`
- `cloudflare-worker/src/lib/browser.ts`
- `cloudflare-worker/src/lib/classification.ts`
- `cloudflare-worker/src/types.ts`
- `cloudflare-worker/src/index.ts`
- `cloudflare-worker/wrangler.toml`
- `cloudflare-worker/package.json`

Arquivos relacionados fora do Worker:
- `supabase/functions/dry-run-zimmermann/index.ts`
- `supabase/functions/dry-run-zimmermann-status/index.ts`
- `src/features/consulta/services/classification.ts`

## Conteúdo final esperado nesses pontos críticos

### `cloudflare-worker/src/providers/cnpj-public-portal.ts`
- `await withBrowser(env, async (browser) => { const page = await browser.newPage(); ... })`
- nenhum `newContext()`
- `sendFinal` com `request_id`
- classificação via `classifyError(err, html)`

### `cloudflare-worker/src/providers/cnd-public-portal.ts`
- `await withBrowser(env, async (browser) => { const page = await browser.newPage(); ... })`
- nenhum `newContext()`
- `sendFinal` com `request_id`
- erros `429` indo para `rate_limited`

### `cloudflare-worker/src/lib/browser.ts`
- `launch(env.gestaoez)`
- retry para `429`
- backoff 2s / 4s / 8s + jitter
- `fs.mkdtemp` / `[unenv]` sem retry

### `cloudflare-worker/src/lib/classification.ts`
Mapeamentos explícitos:
- `fs.mkdtemp`, `[unenv]`, `is not implemented` -> `runtime_incompatibility`
- `connectOverCDP`, `browserType.connect` -> `browser_unavailable`
- `429`, `rate limit exceeded` -> `rate_limited`

## Entrega final após execução
Depois da implementação em modo normal, a devolutiva será objetiva com:

1. arquivos do Worker realmente alterados
2. diff/conteúdo final dos trechos críticos
3. confirmação explícita de que você precisa rodar novamente:

```bash
cd cloudflare-worker
npm install
wrangler deploy
```

4. validação esperada pós-deploy:
- `/health` com build novo
- novo dry-run sem os mesmos erros antigos
- UI mostrando `runtime_incompatibility`, `browser_unavailable` ou `rate_limited` apenas se ainda houver falha real

## Restrições mantidas
- não mexer em HMAC
- não mexer em secrets
- não mexer em bindings
- foco exclusivo em provider/runtime/rate limit/deploy do Worker
