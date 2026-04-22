

# Diagnóstico final + correção

## O que descobri

Chamei o Worker direto:

| Endpoint | Resultado | Conclusão |
|---|---|---|
| `GET /health` | `has_lovable_secret: true`, `has_callback_secret: true` | **Os secrets ESTÃO configurados no Worker** ✅ |
| `POST /debug-sign` | `404 not_found` | **Rota não existe no deploy atual** ❌ |
| `callback_base` | `"\u0016"` (caractere de controle) | **`CALLBACK_BASE_URL` foi colado com lixo** ❌ |

A UI mostra "Worker não tem `LOVABLE_HMAC_SECRET` configurado" porque a edge function `consulta-hmac-diagnose` chama `/debug-sign`, que retorna 404 → o JSON parse falha → o frontend interpreta como `has_secret: false`. **É falso negativo.**

A real causa do dry-run reprovado anteriormente provavelmente foi o `CALLBACK_BASE_URL` corrompido (`\u0016`), que faz callbacks falharem.

## Causa raiz (duas coisas)

1. **Você não fez `wrangler deploy` depois que eu adicionei o endpoint `/debug-sign`** ao código do Worker. O endpoint existe no repositório (`cloudflare-worker/src/index.ts` linha 32), mas o Worker em produção é uma versão anterior.
2. **`CALLBACK_BASE_URL` foi setado com um caractere inválido** (`\u0016` = SYN control char). Foi um paste/copy bugado no terminal.

## O que você precisa fazer (manual — 2 comandos)

### 1. Reconfigurar `CALLBACK_BASE_URL` (corrigir o lixo)

```bash
cd cloudflare-worker
wrangler secret put CALLBACK_BASE_URL
# Cole EXATAMENTE: https://wsgphutkybxhajyicxif.supabase.co/functions/v1
```

### 2. Redeploy o Worker para publicar `/debug-sign`

```bash
cd cloudflare-worker
wrangler deploy
```

Isso publica a versão atual do código (com `/debug-sign` incluído).

## Validação após esses 2 comandos

Eu rodo automaticamente em modo default:

1. `curl /health` → confirmar `callback_base` é a URL correta (sem `\u0016`)
2. `curl /debug-sign` → confirmar que retorna 200 e não mais 404
3. Chamar `consulta-hmac-diagnose` via Supabase → confirmar `signatures_match: true` e `fingerprints_match: true`
4. Se tudo verde, mensagem clara: "Pode rodar dry-run".

## Melhorias de robustez que vou aplicar (em modo default, depois da sua aprovação)

Para esse problema **nunca mais acontecer silenciosamente**:

1. **`consulta-hmac-diagnose` detectar `/debug-sign` 404 explicitamente**: mostrar mensagem "O Worker está rodando mas não tem o endpoint de diagnóstico — faça `wrangler deploy` para atualizar."
2. **Adicionar checagem de `callback_base` ao diagnóstico**: validar que é uma URL HTTPS válida; se contiver caracteres de controle ou não for URL, alertar imediatamente.
3. **Expor `version` no `/health` com timestamp do deploy**: trocar `VERSION = "1.0.0"` estático por um valor que muda a cada deploy, para a UI conseguir mostrar "Worker desatualizado — faça redeploy".
4. **Card "Saúde do Worker"** no `/consulta/saude` mostrando o JSON do `/health` formatado, para ver os 4 sinais (binding, secrets, callback URL, version) sem precisar de terminal.

## Arquivos que serão alterados (modo default)

- `cloudflare-worker/src/index.ts` — adicionar validação de `CALLBACK_BASE_URL` em `/health` (detectar caracteres de controle) e versão dinâmica
- `supabase/functions/consulta-hmac-diagnose/index.ts` — tratar 404 do `/debug-sign` como "worker desatualizado, redeploy necessário"
- `src/pages/consulta/ConsultaSaude.tsx` — adicionar card "Status do Worker" mostrando `/health` JSON

## Resumo curto

- ✅ Secrets no Worker estão OK (não precisa rodar `wrangler secret put LOVABLE_HMAC_SECRET` de novo)
- ❌ `CALLBACK_BASE_URL` está corrompido — refaça
- ❌ `/debug-sign` não existe no deploy atual — rode `wrangler deploy`

Aprovando este plano, eu faço as melhorias acima e valido o fluxo ponta a ponta assim que você rodar os 2 comandos.

