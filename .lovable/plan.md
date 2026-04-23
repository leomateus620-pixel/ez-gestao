

# Provider CND/CNPJ: SPA nova + fallback portal antigo + corrigir falso-positivo de captcha

## Diagnóstico real

Lendo `cnd-public-portal.ts` linha 56-58 confirmei: o erro `layout_changed` **não veio do formulário** — veio porque a landing institucional contém a palavra "captcha" no HTML (link, FAQ ou texto explicativo), e o regex `detectCaptcha(html)` dispara antes de tentar qualquer OCR. Mesmo padrão no CNPJ (linha 45-47).

Sua sugestão de migrar para a SPA nova faz sentido, mas mantemos o portal antigo como fallback (mais estável, sem hidratação Angular).

## O que será feito

### 1. Corrigir falso-positivo de captcha (root cause)

`cloudflare-worker/src/providers/cnd-public-portal.ts` e `cnpj-public-portal.ts`:

- **Remover** o bloco `if (detectCaptcha(html)) throw` da landing page. Captcha textual no HTML institucional não é captcha real.
- **Manter** a detecção de `<img>` real via `findCaptchaImage(page)` (já existe).
- **Manter** a detecção em página de **resultado** (faz sentido lá).

### 2. Implementar estratégia "SPA nova → fallback portal antigo"

Novo arquivo `cloudflare-worker/src/providers/cnd-spa-portal.ts`:

- URL: `https://servicos.receitafederal.gov.br/servico/certidoes/`
- Aguarda hidratação: `waitForLoadState("networkidle")` + `waitForSelector('text=/Pessoa Jur[íi]dica/i', timeout: 20s)`
- Clica "Pessoa Jurídica" via `page.getByText(/Pessoa Jur[íi]dica/i).first().click()`
- Preenche CNPJ via `page.getByPlaceholder(/CNPJ|00\.000/i).first().fill(digits)`
- OCR via helper existente `solveCaptcha(env, page)` (já genérico)
- Preenche código via `page.locator('input[placeholder*="código" i], input[id*="captcha" i]').first()`
- Clica "Emitir/Consultar/Gerar" via `page.getByRole('button').filter({ hasText: /Emitir|Gerar|Consultar/i }).first().click()`
- Aguarda download OU resultado em DOM
- Se em qualquer ponto faltar seletor → throw `layout_changed: spa_<step>` → trigger fallback

Refatorar `cnd-public-portal.ts` para virar **dispatcher**:

```ts
export async function runCndLookup(env, payload) {
  try {
    return await runCndSpaLookup(env, payload);  // tenta SPA nova
  } catch (errSpa) {
    if (isLayoutOrTimeout(errSpa)) {
      // log fallback decision
      await sendProgress(env, {step: "fallback", message: "SPA falhou, tentando portal legado"});
      return await runCndLegacyLookup(env, payload);  // portal antigo (lógica atual)
    }
    throw errSpa;  // captcha_unsolvable etc. não tenta fallback
  }
}
```

A lógica atual do portal antigo vira `runCndLegacyLookup` (mesmo arquivo ou novo `cnd-legacy-portal.ts`).

### 3. Mesmo padrão para CNPJ

Novo `cloudflare-worker/src/providers/cnpj-spa-portal.ts` apontando para a mesma SPA nova (que cobre PJ — emite CND e dados cadastrais no mesmo fluxo). Se SPA não cobrir consulta cadastral pura, usar API REST que a SPA chama internamente (descoberta via DevTools — fora do escopo deste plano sem exploração real). **Decisão simplificada**: para CNPJ, manter portal antigo + apenas remover o falso-positivo. Migrar para SPA só CND, que é o caso crítico.

### 4. Telemetria do fallback

`sendProgress` com `step: "fallback_to_legacy"` para o timeline da UI mostrar quando a SPA falhou. Isso aparece em `ConsultaSaude.tsx` automaticamente (já renderiza eventos do timeline).

### 5. Bump BUILD_ID

`cloudflare-worker/src/index.ts` → `"2026-04-23-spa-fallback-v1"`

### 6. UI: nova classificação

`src/features/consulta/services/classification.ts`:
- `spa_layout_changed`: "Portal novo da Receita mudou — fluxo legado em uso. Reporte para revisão."
- Mantém demais.

## Arquivos alterados

**Cloudflare Worker (precisa `wrangler deploy`):**
- `cloudflare-worker/src/providers/cnd-spa-portal.ts` (novo)
- `cloudflare-worker/src/providers/cnd-public-portal.ts` (vira dispatcher SPA→legado; remove falso-positivo)
- `cloudflare-worker/src/providers/cnpj-public-portal.ts` (apenas remove falso-positivo; sem SPA)
- `cloudflare-worker/src/index.ts` (BUILD_ID)

**App:**
- `src/features/consulta/services/classification.ts` (nova entrada `spa_layout_changed`)

## Por que NÃO seguir o script Node literal

- `sharp` é binário nativo — não roda em Worker nem em edge function Deno (já resolvido com Canvas API + Tesseract WASM)
- Seletores genéricos `canvas, img` pegam qualquer imagem da página (logo, ícone) — usar seletores específicos do helper `findCaptchaImage` que já filtra por `src/alt/id` contendo `captcha`
- `headless: false` não é opção no Worker (sempre headless)

## Deploy necessário

**SIM:**

```bash
cd cloudflare-worker
npm install
npx wrangler deploy
curl -s https://gestaoez.leomateus620.workers.dev/health | jq .build_id
# esperado: "2026-04-23-spa-fallback-v1"
```

Edge function `solve-captcha` já está deployada (sem mudança).

## Resultado esperado pós-deploy

- **CND**: SPA nova tenta primeiro. Se OCR resolver → `success`. Se SPA falhar com seletor → fallback automático para portal antigo. Se ambos falharem → `manual_required` com motivo claro.
- **CNPJ**: portal antigo, sem mais falso-positivo de captcha. OCR é tentado quando há `<img>` real.
- Timeline da UI mostra `fallback_to_legacy` quando SPA falha — visibilidade total.

## Restrições mantidas

- Sem mexer em HMAC, secrets, bindings, callback_base
- Sem APIs pagas
- Edge function `solve-captcha` permanece igual

