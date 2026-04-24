
# Diagnóstico end-to-end do dry-run

## O que está quebrado hoje

1. O dry-run tem duas fontes de verdade conflitantes:
- `automation_config_kv.dry_run_zimmermann`
- status real das requests/jobs em `company_lookup_requests`, `cnd_lookup_requests` e `automation_jobs`

Hoje o cancelamento grava `in_progress=false`, mas deixa os campos `cnpj_status`, `cnd_status` e `cndt_status` no KV com valores antigos como `running`. A UI então mostra cards “rodando” mesmo quando o run já foi cancelado.

2. O endpoint `dry-run-zimmermann-status` trata status cancelados como se ainda não fossem terminais.
- `TERMINAL = ["success", "failed", "manual_required", "partial"]`
- falta `cancelled`

Resultado: quando uma request está `cancelled`, `allDone` continua `false`, o endpoint devolve `in_progress: true` e o polling pode ficar eterno.

3. A UI perde o polling ao recarregar a página.
- `ConsultaSaude.tsx` começa com `polling = false`
- `useDryRunLive` só roda depois de clicar em “Executar dry-run”

Se o usuário atualiza `/consulta/saude` no meio do processo, a tela para de acompanhar o status ao vivo e passa a mostrar só o snapshot do KV, que hoje pode estar inconsistente.

4. O run mais recente morreu cedo demais no Worker.
Evidência do banco:
- os 3 jobs foram criados
- só existe o primeiro log de cada job (`navigate`)
- não há logs seguintes, nem artifacts, nem rows em `*_lookup_results`

Isso indica que os workers iniciaram, mas não chegaram a enviar callback final. Na prática, o processo “some” antes de fechar o ciclo.

5. A arquitetura atual é fraca para o plano atual de Browser Rendering:
- o dry-run dispara **3 jobs paralelos**
- cada provider tem jitter + retry 30s/60s
- o Browser Rendering desse ambiente tolera pouco paralelismo

Isso aumenta muito a chance de:
- rate limit
- execução longa demais
- `waitUntil` morrer antes do `sendFinal`
- requests ficarem presas em `running/dispatched`

## Pontos fracos encontrados

### Backend / orquestração
- `dry-run-zimmermann` dispara 3 buscas de uma vez.
- `dry-run-zimmermann-status` não atua como reconciliador robusto.
- `dry-run-zimmermann-cancel` não limpa o estado por completo.
- `lookup-status` não tem watchdog para jobs travados.
- Jobs antigos ainda ficaram em `running` em runs anteriores, mostrando que a limpeza do ciclo é incompleta.

### Worker
- `cnpj-public-portal.ts` ainda está menos blindado que CND/CNDT.
- retries de rate limit são silenciosos para a UI.
- falta um timeout global por job para garantir `sendFinal` mesmo quando o worker degrada.
- o sistema depende demais de callback final; se ele não chega, o estado não converge sozinho.

### UI
- `/consulta/saude` não religa o polling automaticamente.
- a UI mistura snapshot do KV com live status sem reconciliação clara.
- timeline e badges não deixam explícito quando o run foi cancelado, travou ou ficou órfão.

## Plano de correção

### 1. Consertar a máquina de estado do dry-run
Arquivos:
- `supabase/functions/dry-run-zimmermann/index.ts`
- `supabase/functions/dry-run-zimmermann-status/index.ts`
- `supabase/functions/dry-run-zimmermann-cancel/index.ts`

Mudanças:
- incluir `cancelled` como status terminal
- no cancelamento, gravar também:
  - `cnpj_status: "cancelled"`
  - `cnd_status: "cancelled"`
  - `cndt_status: "cancelled"`
- fazer o status endpoint respeitar `phase=cancelled` / `in_progress=false` sem reanimar o run
- impedir retorno `in_progress=true` quando todos os itens já estão terminais ou cancelados
- limpar inconsistências entre KV e tabelas reais antes de responder

### 2. Trocar o dry-run de paralelo para orquestração controlada
Arquivos:
- `supabase/functions/dry-run-zimmermann/index.ts`
- `supabase/functions/dry-run-zimmermann-status/index.ts`

Mudança principal:
- parar de disparar CNPJ + CND + CNDT ao mesmo tempo
- novo fluxo:
  1. inicia CNPJ
  2. quando CNPJ termina, dispara CND
  3. quando CND termina, dispara CNDT
  4. quando CNDT termina, fecha relatório final

Vantagem:
- elimina o gargalo mais óbvio de concorrência
- reduz drasticamente o risco de rate limit
- mantém a UI simples porque o phase vira uma state machine previsível

### 3. Adicionar watchdog para jobs travados
Arquivos:
- `supabase/functions/dry-run-zimmermann-status/index.ts`
- `supabase/functions/lookup-status/index.ts`

Mudanças:
- se job/request estiver em `queued/dispatched/running` por tempo excessivo sem progresso novo, marcar como `failed`
- gravar `error_type = "timeout"` ou `stalled_execution`
- fechar `finished_at` da request e do job
- isso garante que nenhuma busca fique “infinita” na UI

### 4. Blindar os providers para sempre finalizar
Arquivos:
- `cloudflare-worker/src/providers/cnpj-public-portal.ts`
- `cloudflare-worker/src/providers/cnd-public-portal.ts`
- `cloudflare-worker/src/providers/cnd-spa-portal.ts`
- `cloudflare-worker/src/providers/tst-cndt-portal.ts`
- `cloudflare-worker/src/lib/rate-limit.ts`

Mudanças:
- adicionar timeout global por execução
- reforçar `page.setDefaultTimeout` / `setDefaultNavigationTimeout` onde faltar
- garantir `page.close()` em `finally` em todos os providers
- expor retries/rate limit via `sendProgress` para a UI parar de parecer congelada
- se estourar orçamento de tempo, sempre cair em `sendFinal` com erro classificado

### 5. Corrigir a UI para refletir o estado real
Arquivos:
- `src/pages/consulta/ConsultaSaude.tsx`
- `src/features/consulta/hooks/useLookup.ts`

Mudanças:
- iniciar polling automaticamente quando:
  - `dry_run_zimmermann.in_progress === true`, ou
  - existir run com phase não terminal
- parar polling automaticamente quando o live status for terminal
- priorizar estado reconciliado do endpoint live sobre snapshot antigo do KV
- mostrar “Cancelado” / “Travado” / “Falhou por timeout” de forma explícita nos 3 subcards

### 6. Melhorar observabilidade
Arquivos:
- `src/features/consulta/services/timeline.ts`
- possivelmente `cloudflare-worker/src/lib/progress.ts`

Mudanças:
- mapear steps novos (`navigate_spa`, `solve_captcha_*`, `wait_result_*`, `fallback_to_legacy`, `download_pdf_*`, `retry_rate_limit`)
- deixar a timeline legível para diferenciar:
  - abriu portal
  - caiu em retry
  - ficou sem progresso
  - terminou com callback

## Resultado esperado após a correção

- o dry-run nunca mais ficará eternamente em loading
- cancelar um run deixará a UI imediatamente consistente
- recarregar `/consulta/saude` no meio da execução não fará a tela “perder” o acompanhamento
- CNPJ, CND e CNDT terminarão em um estado terminal claro:
  - `success`
  - `manual_required`
  - `failed`
  - `cancelled`
- se o worker morrer no meio, o watchdog encerrará o ciclo como falha em vez de deixar rodando para sempre

## Validação após implementar

1. executar novo dry-run a partir de estado cancelado
2. verificar transição visual completa dos 3 cards
3. recarregar a página no meio do run e confirmar que o polling continua
4. cancelar um run e confirmar que:
- botão destrava
- cards mudam para `cancelled`
- polling para
5. rodar novamente até obter conclusão real
6. validar no banco:
- requests e jobs com `finished_at`
- sem novos registros presos em `running`
- relatório final gravado quando o run conclui
7. validar a timeline e mensagens de erro para CNPJ, CND e CNDT

## Observação estrutural importante

O maior ponto fraco do sistema hoje é a decisão de executar 3 sessões de Browser Rendering em paralelo. Para esse ambiente, isso é a principal origem de instabilidade. O conserto recomendado é priorizar confiabilidade e convergência de estado, não paralelismo máximo.

