# Módulo Consulta CNPJ/CND

## Componentes
- **Edge Functions** (`supabase/functions/`): `lookup-dispatcher`, `lookup-status`, `cf-progress-callback`, `cf-final-callback`, `artifacts-sign`, `lookup-retry`, `provider-health-summary`, `dry-run-zimmermann`.
- **Cloudflare Worker** (`cloudflare-worker/`): Hono + Playwright via binding `env.gestaoez`. Endpoints: `GET /health`, `GET /version`, `POST /execute-job`.
- **Frontend** (`src/features/consulta/` + `src/pages/consulta/`): UI isolada com hooks + Realtime + polling adaptativo.

## Segurança
HMAC-SHA256 bidirecional com timestamp (±5min) e nonce (`hmac_nonces`).
- Lovable → Worker: secret `CLOUDFLARE_WORKER_HMAC_SECRET` (no Worker = `LOVABLE_HMAC_SECRET`).
- Worker → Lovable: secret `CF_CALLBACK_HMAC_SECRET` (no Worker = `CALLBACK_HMAC_SECRET`).

## Cache
- CNPJ: 7 dias (`company_lookup_results.cache_valid_until`).
- CND: até a `valid_until` da certidão.

## Ativação
1. Deploy do Worker: `cd cloudflare-worker && npm install && npm run deploy`.
2. `wrangler secret put LOVABLE_HMAC_SECRET / CALLBACK_HMAC_SECRET / CALLBACK_BASE_URL`.
3. Acesse `/consulta/saude`, rode o **dry-run Zimmermann**.
4. Após aprovado, ative o switch **"Visibilidade do menu"** → item aparece no sidebar para todos.

## Rotas
- `/consulta` — consulta interativa
- `/consulta/historico` — últimas requisições
- `/consulta/excecoes` — central de exceções
- `/consulta/saude` — saúde + dry-run + flag
- `/consulta/relatorios/:path` — visualização de relatório dry-run

## Provider Registry
`src/features/consulta/providers/registry.ts` — provedores Cloudflare ativos; placeholders Serpro prontos para evolução futura.

## Limitações
- Portais Receita podem exigir captcha → classificação `captcha_detected` + `manual_required` (esperado).
- Worker offline → `worker_unreachable` + exceção registrada automaticamente.