

# Corrigir runtime do Worker, serializar browser, retry com backoff

## Causas-raiz reais

1. **`browser.newContext()` quebra no runtime atual do Workers**. O caminho de `newContext` em `@cloudflare/playwright@1.46.0` tenta usar `connectOverCDP` + `fs.mkdtemp` (estado por contexto), e o `unenv` não implementa `fs.mkdtemp` → erro `[unenv] fs.mkdtemp is not implemented yet`. O exemplo oficial da Cloudflare usa **`browser.newPage()` direto**, sem `newContext`.
2. **`compatibility_date = "2024-09-25"`** está velho — o runtime estável com Browser Rendering + Playwright fork pede `compatibility_date` recente.
3. **Sem retry/backoff em 429** — Browser Rendering free tier corta cedo e qualquer disparo subsequente falha sem retry.
4. **Mensagens `fs.mkdtemp` e `connectOverCDP` não estão classificadas** → caem em `unknown` na UI.
5. **Dispatcher CNPJ→CND no dry-run dispara com 1.5s de gap, mas o segundo job já entra no Worker enquanto o primeiro browser ainda existe** — risco de paralelismo. Precisa esperar o **fim** do primeiro (status terminal do request) antes de disparar o segundo.

## Correções (ordem de aplicação)

### A. Worker — providers (CNPJ e CND)

Remover `browser.newContext({...})` e ir direto:

```ts
await withBrowser(env, async (browser) => {
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ "User-Agent": "Mozilla/5.0 (compatible; GestaoEZ/1.0)" });
  await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  // ... resto igual
});
```

Aplicar em `cnpj-public-portal.ts` e `cnd-public-portal.ts`.

### B. Worker — `lib/browser.ts` com retry/backoff para 429

```ts
export async function withBrowser<T>(env, fn, opts = { maxRetries: 3 }): Promise<T> {
  let lastErr;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const browser = await launch(env.gestaoez);
      try { return await fn(browser); }
      finally { try { await browser.close(); } catch {} }
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err).toLowerCase();
      const is429 = /429|rate.?limit|too many requests/.test(msg);
      const isFs = /fs\.mkdtemp|unenv/.test(msg);
      if (isFs) throw err; // não adianta retry, é incompatibilidade
      if (!is429 || attempt === opts.maxRetries) throw err;
      const wait = 2000 * Math.pow(2, attempt) + Math.floor(Math.random() * 500); // 2s, 4s, 8s + jitter
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
```

### C. Worker — `lib/classification.ts` cobrir os 2 erros novos

Adicionar **antes** da regra genérica de "browser_unavailable":

```ts
if (/fs\.mkdtemp|\[unenv\]|is not implemented/i.test(lower)) {
  return { error_type: "runtime_incompatibility",
    message: "Runtime do Worker não suporta esta API. Atualizar @cloudflare/playwright e remover newContext()." };
}
if (/connectovercdp|cdp.*error|protocol error.*target/i.test(lower)) {
  return { error_type: "browser_unavailable",
    message: "Falha ao conectar ao Browser Rendering (CDP). Verificar binding e versão do Playwright." };
}
```

### D. Worker — `types.ts`

Adicionar `"runtime_incompatibility"` em `ErrorType`.

### E. Worker — `wrangler.toml`

```toml
compatibility_date = "2026-04-22"
```

E bump do build:

```ts
const BUILD_ID = "2026-04-23-runtime-fix-v1";
```

### F. Worker — `package.json`

Atualizar `@cloudflare/playwright` para `latest` (a 1.46.0 é antiga e arrasta o caminho do `fs.mkdtemp`):

```json
"@cloudflare/playwright": "latest"
```

Você precisará rodar `npm install` antes do deploy.

### G. Edge function — serializar de verdade no dry-run

`supabase/functions/dry-run-zimmermann/index.ts`: trocar o `setTimeout(1500)` por **dispatch só do CNPJ**, persistir o estado pendente, e disparar o CND **apenas quando o request CNPJ atingir status terminal**. Para isso:

- Dry-run dispara **só CNPJ**, marca `cnd_request_id: null`, `phase: "cnpj_running"`.
- A função `dry-run-zimmermann-status` (polling, já existe) detecta CNPJ terminal e, se `phase === "cnpj_running"` e `cnd_request_id == null`, dispara o CND via `lookup-dispatcher`, atualiza `phase: "cnd_running"` e segue polling normal.
- Quando CND também ficar terminal → gera relatório como hoje.

Isso garante zero paralelismo no Browser Rendering.

### H. UI — `src/features/consulta/services/classification.ts`

Adicionar:

```ts
runtime_incompatibility: {
  label: "Incompatibilidade de runtime",
  suggestion: "Atualizar @cloudflare/playwright no Worker e remover browser.newContext(). Após corrigir, rodar wrangler deploy.",
},
rate_limited: {
  label: "Limite de taxa atingido",
  suggestion: "Browser Rendering atingiu o limite. Aguarde alguns minutos e reprocesse, ou reduza concorrência.",
},
browser_unavailable: {
  label: "Browser Rendering indisponível",
  suggestion: "Verifique o binding 'gestaoez' no Worker e a versão do Playwright. Rode wrangler deploy se mudou código.",
},
callback_error: {
  label: "Erro no callback",
  suggestion: "Worker conseguiu processar mas falhou ao retornar resultado. Verifique CALLBACK_BASE_URL e CALLBACK_HMAC_SECRET.",
},
manual_required: {
  label: "Requer ação manual",
  suggestion: "Portal exige interação humana (captcha). Faça consulta manual ou tente mais tarde.",
},
```

### I. UI — `/consulta/saude` cartão de erro do dry-run

No card "Último Dry-Run Zimmermann", se `cnpj_error_type` ou `cnd_error_type` estiver presente, mostrar 3 linhas (já tem suporte, só garantir que usa `describeError`):
- **Tipo classificado** (label colorido)
- **Mensagem técnica** (do worker)
- **Sugestão** (do mapping)

## Fluxo após as correções

1. Você roda `cd cloudflare-worker && npm install && wrangler deploy`.
2. Eu valido `/health` (build novo).
3. Eu disparo `dry-run-zimmermann`.
4. Worker processa **só CNPJ** com `newPage()` direto → sem `fs.mkdtemp`, sem `connectOverCDP` quebrado.
5. CNPJ terminal → status function dispara CND → Worker processa CND → retry 3× se 429.
6. Relatório completo persistido com causa real classificada.

## Arquivos que vou alterar

- `cloudflare-worker/src/providers/cnpj-public-portal.ts` — sem `newContext`
- `cloudflare-worker/src/providers/cnd-public-portal.ts` — sem `newContext`
- `cloudflare-worker/src/lib/browser.ts` — retry/backoff
- `cloudflare-worker/src/lib/classification.ts` — fs.mkdtemp / connectOverCDP
- `cloudflare-worker/src/types.ts` — `runtime_incompatibility`
- `cloudflare-worker/src/index.ts` — bump BUILD_ID
- `cloudflare-worker/wrangler.toml` — compatibility_date 2026-04-22
- `cloudflare-worker/package.json` — playwright `latest`
- `supabase/functions/dry-run-zimmermann/index.ts` — disparar só CNPJ
- `supabase/functions/dry-run-zimmermann-status/index.ts` — auto-disparo do CND quando CNPJ termina
- `src/features/consulta/services/classification.ts` — labels novos

## Ações que VOCÊ precisa fazer após eu aplicar

```bash
cd cloudflare-worker
npm install              # pega @cloudflare/playwright atualizado
wrangler deploy          # publica código novo
```

Eu te aviso explicitamente quando puder rodar — depois disso, eu valido `/health` e disparo o dry-run automaticamente.

## O que vou te devolver no final

1. ✅/❌ Build novo do Worker ativo
2. ✅/❌ Dry-run CNPJ
3. ✅/❌ Dry-run CND  
4. Erro classificado real (se houver) com etapa, screenshot, sugestão
5. Se módulo pode ser liberado no menu

