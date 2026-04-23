

# Destravar dry-run + adicionar CNDT em paralelo (TST scraping)

## Diagnóstico do "bug" do dry-run

O KV `dry_run_zimmermann` está com `in_progress=false, passed=true, phase=cancelled` — o botão **já está liberado**. O que parecia "bugado" é o card mostrando "Último: APROVADO" misturado com sub-cards REPROVADOS (a última execução foi cancelada manualmente, mas o `passed` foi forçado para `true` pela migration anterior). Como você pediu "deixar órfãos como estão", **não vou tocar no banco** — apenas garanto que o botão da UI fica desbloqueado e a próxima execução sobrescreve o estado.

Para destravar visualmente: ao clicar em "Executar dry-run", o `dry-run-zimmermann/index.ts` já faz `upsert` do KV com `in_progress=true, passed=false, phase=cnpj_running`, limpando o histórico confuso. Sem mudança de código necessária aqui.

## Adicionar CNDT (TST) em paralelo via Browser Rendering

Você escolheu o caminho de **paralelo** ciente do trade-off de rate limit. Vou implementar com guarda-chuva: jitter + retry, mas sem promessas de zero-rate-limit.

### Mudanças

**1. Novo `cloudflare-worker/src/providers/tst-cndt-portal.ts`** (adaptado do snippet, corrigido para o runtime real):

- `env.gestaoez.newSession()` (binding real, não `env.BROWSER`)
- Cache **NÃO** vai em `env.DB` (não existe). Cache continua no Postgres via `cache_valid_until` em `cnd_lookup_results`. Removido o bloco `INSERT INTO cnd_lookup_requests` do snippet.
- Substituir `Buffer.from(...).toString("base64")` por loop manual com `btoa(String.fromCharCode(...))` em chunks (padrão Workers, igual ao `cnd-spa-portal.ts`).
- `withBrowser` + `withRateLimitRetry` + `jitterDelay(2_000, 8_000)` + `setDefaultTimeout(20_000)` / `setDefaultNavigationTimeout(30_000)` (mesmo padrão hardening v1).
- Fallback de download: `waitForEvent("download")` com 25s, depois fallback para link visível (`a[href$=".pdf"]`, `button:has-text("Baixar")`).
- Captura screenshots e dispara `sendProgress`/`sendFinal` igual aos outros providers.
- URL: `https://cndt-certidao.tst.jus.br/inicio.faces`. CAPTCHA via `solveCaptcha(env, page)` existente.

**2. `cloudflare-worker/src/index.ts`**:
- Adicionar `job_type: "cndt_lookup"` no roteamento do `/execute-job`.
- Bump `BUILD_ID = "2026-04-23-cndt-parallel-v1"`.

**3. `cloudflare-worker/src/types.ts`**:
- `ExecuteJobPayload.job_type` aceita `"cnpj_lookup" | "cnd_lookup" | "cndt_lookup"`.

**4. Migration SQL** (schema):
- Adicionar valor `'cndt_lookup'` ao enum `job_type` em `automation_jobs`.
- Adicionar valor `'provider_public_portal_cndt_cloudflare'` ao enum `provider_runtime` (se restrito).
- A tabela `cnd_lookup_requests` já comporta CNDT (mesmo schema de CND): vou usá-la com `source_provider='provider_public_portal_cndt_cloudflare'` para distinguir. **Sem nova tabela** — duplicar `cnd_lookup_requests` para CNDT seria desperdício.

**5. `supabase/functions/lookup-dispatcher/index.ts`**:
- Aceitar `type: "cndt"` além de `cnpj`/`cnd`. Usa a tabela `cnd_lookup_requests` com `source_provider` diferente. Cache check filtra por provider.

**6. `supabase/functions/dry-run-zimmermann/index.ts` + `dry-run-zimmermann-status/index.ts`**:
- Disparar **CNPJ + CND + CNDT em paralelo** logo no início (em vez de serializar). Cada um tem seu `*_request_id` no KV.
- Status calcula `passed = cnpj_done && cnd_done && cndt_done` e `allDone = todos os 3 terminais`.
- KV ganha campos `cndt_request_id`, `cndt_status`, `cndt_error_type`, `cndt_error_message`.

**7. `supabase/functions/dry-run-zimmermann-cancel/index.ts`**:
- Cancelar também o request CNDT.

**8. UI `src/pages/consulta/ConsultaSaude.tsx`**:
- Adicionar terceiro `<DryRunSubCard label="CNDT (Justiça do Trabalho)" status={cndtStatus} ... />`.
- Grid passa de `md:grid-cols-2` para `md:grid-cols-3`.

**9. UI `src/features/consulta/hooks/useLookup.ts`** (se necessário):
- Tipos do `useDryRunStatus`/`useDryRunLive` ganham `cndt_*`.

## O que NÃO vou mudar

- ❌ Banco (jobs/requests órfãos) — você disse "deixar como estão".
- ❌ `consulta-cndt` Serpro — continua existindo para uso de produção em `/empresas`. O scraping novo é exclusivo do dry-run e do fluxo público sem credencial Serpro.
- ❌ Nova tabela CNDT — reuso `cnd_lookup_requests`/`cnd_lookup_results` com `source_provider`.
- ❌ KV `D1` no Worker — cache continua em Postgres via callback `cf-final-callback`.
- ❌ `Buffer.from` ou `stream.on('data')` — não existem em Workers.

## Risco assumido

Browser Rendering plano free: ~2 sessões simultâneas, ~10 req/min. Disparar 3 jobs em paralelo do mesmo dry-run **vai estourar** com frequência. Mitigação: jitter 2–8s diferente por job + retry 30s/60s. Se persistir, jobs caem em `rate_limited` (UI já trata) e você refaz o dry-run em alguns minutos. Para uso real recorrente, vamos precisar serializar ou subir o plano. Aviso registrado.

## Deploy necessário (manual após merge)

```bash
cd cloudflare-worker && npx wrangler deploy
curl -s https://gestaoez.leomateus620.workers.dev/health | jq .build_id
# esperado: "2026-04-23-cndt-parallel-v1"
```

Backend (edge functions + migration) é automático via Lovable.

## Resultado esperado

- Botão "Executar dry-run" funcional imediatamente (já está, na verdade — sem mudança).
- Próximo dry-run dispara 3 requests em paralelo: CNPJ, CND, CNDT.
- Card de dry-run mostra 3 sub-cards lado a lado.
- Aprovação só passa se os 3 terminarem em `success` (ou `manual_required` para CNDs).
- Se rate limit: UI mostra "Limite de taxa atingido" no sub-card afetado, dry-run reprova, você retenta.

