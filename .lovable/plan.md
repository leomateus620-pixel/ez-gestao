

# Corrigir falha do dry-run e fazer CNPJ, CND e CNDT concluírem

## Diagnóstico atual

O dry-run não falhou porque CND ou CNDT quebraram. Ele nem chegou nelas.

O fluxo atual é sequencial:

```text
CNPJ -> CND -> CNDT
```

A execução mais recente parou no CNPJ:

- `cnpj_status = failed`
- `cnpj_error_type = stalled_execution`
- mensagem: `Execução sem progresso por mais de 3 minutos`
- `cnd_status = skipped`
- `cndt_status = skipped`

Ou seja: CND e CNDT aparecem como ignorados porque o orquestrador abortou o restante quando o CNPJ não terminou com sucesso.

## Causa principal encontrada

O Worker chegou a executar parte do CNPJ:

- criou job
- abriu o portal
- enviou o CNPJ
- salvou screenshots `step1_portal` e `step2_result`

Depois disso, não houve:

- log `parse`
- callback final
- resultado em `company_lookup_results`

O ponto fraco está no canal Worker -> backend:

```text
Worker scraping
  -> sendProgress / sendFinal / artifact upload
  -> callbacks Lovable Cloud
  -> atualiza job/request no banco
```

Hoje `cloudflare-worker/src/lib/progress.ts` faz `fetch()` sem timeout. Se um callback ou upload fica pendurado, o Worker fica preso. O `withJobTimeout` tenta encerrar depois, mas ele também usa `sendFinal`, que pode travar pelo mesmo motivo. Resultado: nenhum callback final chega, e o watchdog marca o job como `stalled_execution`.

## Mudanças necessárias

### 1. Blindar callbacks do Worker com timeout real

Arquivo:

- `cloudflare-worker/src/lib/progress.ts`

Implementar:

- `postSigned()` com `AbortController`
- timeout curto para progresso: 8s
- timeout maior para finalização: 20s
- timeout para assinatura/upload de artefatos
- logs locais quando callback falhar, sem travar a execução principal
- `sendProgress()` continua best-effort
- `sendFinal()` tenta finalizar, mas nunca pode deixar o Worker preso indefinidamente

Resultado esperado:

```text
se callback demora ou falha:
  Worker não trava
  job segue até sucesso/falha
  watchdog deixa de ser o mecanismo principal de encerramento
```

### 2. Corrigir o timeout global do Worker

Arquivo:

- `cloudflare-worker/src/index.ts`

Ajustar:

- quando `withJobTimeout` estourar, classificar como `timeout`
- chamar `sendFinal` com timeout protegido
- se o callback final falhar, registrar erro no console e encerrar o Worker sem loop infinito
- aumentar `BUILD_ID` para uma nova versão, por exemplo:

```ts
2026-04-24-dryrun-callback-timeout-v1
```

### 3. Fazer o dry-run continuar CND e CNDT mesmo se CNPJ falhar

Arquivos:

- `supabase/functions/dry-run-zimmermann-status/index.ts`
- `supabase/functions/dry-run-zimmermann/index.ts`

Hoje, se CNPJ falha, CND e CNDT viram `skipped`.

Alterar para modo diagnóstico completo:

```text
CNPJ roda
CND roda depois, mesmo se CNPJ falhar
CNDT roda depois, mesmo se CND falhar
```

A aprovação final continua rígida:

```text
passed = CNPJ success
      && CND success/manual_required
      && CNDT success/manual_required
```

Mas a UI passará a mostrar o resultado real das 3 buscas, não apenas `IGNORADO`.

Resultado esperado:

- CNPJ pode falhar sem esconder CND/CNDT
- CND e CNDT serão realmente testadas
- o diagnóstico end-to-end fica completo

### 4. Melhorar o watchdog para não matar job ativo com progresso recente

Arquivo:

- `supabase/functions/dry-run-zimmermann-status/index.ts`
- `supabase/functions/lookup-status/index.ts`

Hoje o watchdog usa principalmente `job.updated_at`, mas alguns passos salvam logs/artefatos sem atualizar suficientemente o job.

Ajustar para calcular último progresso por:

```text
max(
  automation_jobs.updated_at,
  automation_jobs.dispatched_at,
  automation_job_logs.created_at,
  automation_artifacts.created_at,
  request.started_at
)
```

Assim, se o Worker acabou de salvar screenshot ou log, o watchdog não marca como travado prematuramente.

### 5. Atualizar status do job em todo progresso importante

Arquivo:

- `supabase/functions/cf-progress-callback/index.ts`

Hoje o job só muda status quando `status` vem no payload.

Alterar para sempre atualizar `updated_at` quando qualquer progresso chegar.

Resultado esperado:

- cada `sendProgress` renova o heartbeat
- watchdog fica mais preciso
- menos falsos `stalled_execution`

### 6. Robustecer CNPJ depois do submit

Arquivo:

- `cloudflare-worker/src/providers/cnpj-public-portal.ts`

Adicionar após o envio:

- timeout explícito para leitura da página
- fallback se o portal não navegar
- detecção de mensagens de captcha inválido
- se houver conteúdo suficiente no screenshot/página, seguir para parse
- se não houver marcador, retornar `layout_changed` ou `manual_required`, não ficar preso

Também mover `sendProgress("parse")` para antes de qualquer operação que possa travar após o screenshot.

### 7. Robustecer CND e CNDT com a mesma proteção

Arquivos:

- `cloudflare-worker/src/providers/cnd-spa-portal.ts`
- `cloudflare-worker/src/providers/cnd-public-portal.ts`
- `cloudflare-worker/src/providers/tst-cndt-portal.ts`

Aplicar o mesmo padrão:

- nenhum `waitForLoadState`, `waitForFunction`, download ou callback sem timeout
- `sendProgress` antes e depois de waits críticos
- se PDF não vier, tentar link/fallback
- se ainda não vier, retornar falha classificada, não travar

### 8. Melhorar UI para mostrar “não executado ainda” vs “ignorado”

Arquivo:

- `src/pages/consulta/ConsultaSaude.tsx`

Ajustar labels:

- `pending`: “Aguardando”
- `running`: “Rodando”
- `failed`: “Falhou”
- `manual_required`: “Manual”
- `success`: “Concluído”
- `skipped`: “Não executado”
- `stalled_execution`: mostrar como “Travado / timeout”

Também exibir a fase atual:

```text
Executando CNPJ
Executando CND
Executando CNDT
Finalizado
```

### 9. Resetar estado atual do dry-run antes de testar

Como o estado atual já está finalizado/reprovado, vou limpar apenas o snapshot operacional do dry-run para começar uma rodada limpa:

```text
in_progress=false
passed=false
phase=idle
cnpj_status=pending
cnd_status=pending
cndt_status=pending
request_ids=null
error fields=null
```

Não vou apagar histórico nem remover registros antigos.

### 10. Testar até ter conclusão real

Após implementar:

1. deploy das backend functions alteradas
2. deploy do Worker Cloudflare
3. verificar `/health` do Worker e confirmar novo `build_id`
4. iniciar dry-run
5. acompanhar polling até terminal
6. conferir no banco:
   - `company_lookup_requests`
   - `cnd_lookup_requests`
   - `automation_jobs`
   - `automation_job_logs`
   - `automation_artifacts`
   - `company_lookup_results`
   - `cnd_lookup_results`
7. repetir o dry-run se houver falha transitória de captcha/rate-limit
8. validar que as três buscas chegam a estado terminal claro:
   - CNPJ: `success` ou erro classificado
   - CND: `success` ou `manual_required`
   - CNDT: `success` ou `manual_required`

## Resultado esperado

- O dry-run não ficará mais carregando infinitamente.
- CND e CNDT deixarão de ficar `IGNORADO` por causa de falha anterior no CNPJ.
- O Worker não ficará preso em callback sem timeout.
- A UI mostrará o estado real das três buscas.
- O sistema sempre encerrará cada busca em um estado terminal claro.

