

# Blindar SPA da Receita contra travamento (timeouts rígidos + fallback de download)

## Diagnóstico

O dry-run trava em RUNNING porque a SPA da Receita nem sempre dispara o evento `download` do Playwright — às vezes mostra um botão "Baixar Certidão" ou abre o PDF em nova aba. O `waitForEvent("download")` atual já tem timeout de 30s, mas as outras etapas (`waitForLoadState("networkidle")`, `waitForFunction`) podem somar e estourar o envelope sem nunca finalizar.

Não vou aceitar literalmente o snippet do usuário porque ele usa APIs que **não existem no Cloudflare Workers** (`Buffer`, `stream.on('data')`, `env.CACHE_KV`) e duplica lógica que já implementamos (cache em Postgres, retry, jitter). Vou pegar **só as ideias corretas** e adaptar ao runtime real.

## Mudanças (todas em `cloudflare-worker/src/providers/cnd-spa-portal.ts`)

### 1. Timeout default por página
Logo após `browser.newPage()`:
```ts
page.setDefaultTimeout(20_000);
page.setDefaultNavigationTimeout(30_000);
```
Garante que qualquer `waitForSelector`/`click` sem timeout explícito morre em 20s em vez de pendurar.

### 2. Fallback de download (link visível na página)
Hoje, se `waitForEvent("download")` retorna `null`, simplesmente seguimos para parsear DOM. Vou adicionar entre o `await downloadPromise` e o parse de resultado:

```ts
if (!download) {
  // Fallback: a SPA pode ter renderizado um link/botão de download em vez de disparar o evento
  await page.waitForTimeout(2_000);
  const downloadLink = await trySelectors(page, [
    'a[href$=".pdf"]',
    'a[href*=".pdf?"]',
    'a:has-text("Baixar")',
    'a:has-text("Download")',
    'button:has-text("Baixar")',
  ]);
  if (downloadLink) {
    const retryDownload = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
    await (downloadLink as { click: () => Promise<void> }).click();
    const dl = await retryDownload;
    if (dl) {
      // mesma lógica de createReadStream + Uint8Array + upload já existente
    }
  }
}
```

Mantém `Uint8Array` + `getReader()` (já correto). **Não** uso `Buffer.concat` nem `stream.on('data')` — esses não existem em Workers.

### 3. `wait_result_spa` com timeout reduzido
Hoje: `waitForLoadState("networkidle", { timeout: 30_000 })` + `waitForFunction(..., { timeout: 30_000 })` = até 60s só esperando resultado. Vou reduzir para 15s + 15s = 30s máx.

### 4. `try/finally` para fechar a página
O `withBrowser` já fecha o browser, mas a `page` em si não tem `finally` explícito. Adiciono:
```ts
const page = await browser.newPage();
try {
  // ... todo o fluxo ...
} finally {
  await page.close().catch(() => {});
}
```
Evita vazar páginas abertas se o fluxo abortar no meio.

### 5. Bump do BUILD_ID
`cloudflare-worker/src/index.ts`: `BUILD_ID = "2026-04-23-spa-hardening-v1"`

## O que NÃO vai mudar

- ❌ KV namespace — cache continua em Postgres (já funciona).
- ❌ `Buffer` / `stream.on('data')` — não existem em Workers; mantenho `Uint8Array` + `getReader()`.
- ❌ Reescrever do zero — só patches cirúrgicos no provider existente.
- ❌ `cnpj-public-portal.ts` (não há `cnpj-spa-portal.ts` — o portal CNPJ legado já tem timeouts adequados).
- ❌ `cnd-public-portal.ts` legacy — já tem timeouts e segue como fallback.
- ❌ Lógica de jitter/retry/cache — já implementada na rodada anterior.

## Deploy

Após o merge:
```bash
cd cloudflare-worker && npx wrangler deploy
curl -s https://gestaoez.leomateus620.workers.dev/health | jq .build_id
# esperado: "2026-04-23-spa-hardening-v1"
```

## Resultado esperado

- Dry-run nunca mais trava em RUNNING > 90s — qualquer wait estoura e cai no `catch` que envia `sendFinal` com erro classificado.
- Quando a SPA renderiza link de download em vez de disparar evento, capturamos o PDF mesmo assim.
- Sem regressão: cache, retry, jitter e fallback para portal legado continuam intactos.

