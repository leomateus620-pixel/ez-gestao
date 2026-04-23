

# Robustecer detecção de captcha e seletores na SPA da Receita

## Diagnóstico (confirmado pelos logs)

Job `2e57a74c` mostra: `navigate_spa → select_pj → fill_cnpj_spa → submit_spa → wait_result_spa` — **não passou por `solve_captcha_spa`**. Isso significa que `findCaptchaImage(page)` retornou `null` na SPA Angular da Receita, então o submit foi enviado **sem captcha**, o portal travou, e o job vai cair em `layout_changed: spa_result` (timeout de 30s).

Causa raiz: os seletores de captcha em `cloudflare-worker/src/lib/captcha.ts` só procuram `img` cujo `src/alt/id/name` contenha literalmente "captcha". A SPA da Receita usa atributos em português ("imagem", "verificação", "código de segurança") e provavelmente um `data:image/png;base64,...` no `src` que não casa com `*="captcha"`.

## Correções

### 1. Ampliar seletores de captcha (`cloudflare-worker/src/lib/captcha.ts`)

Adicionar à `CAPTCHA_IMG_SELECTORS`:
- `'img[src^="data:image"]'` — pega base64 inline (padrão Angular/SPAs)
- `'img[alt*="imagem" i]'`, `'img[alt*="verifica" i]'`, `'img[alt*="seguran" i]'`, `'img[alt*="c\u00f3digo" i]'`
- `'img[title*="captcha" i]'`, `'img[title*="imagem" i]'`
- `'canvas'` como último recurso (algumas SPAs renderizam captcha em canvas)

Adicionar à `CAPTCHA_INPUT_SELECTORS`:
- `'input[placeholder*="verifica" i]'`
- `'input[placeholder*="seguran" i]'`
- `'input[aria-label*="c\u00f3digo" i]'`
- `'input[aria-label*="captcha" i]'`

Nova função `findCaptchaImageSmart(page)`: se nenhum seletor casar, varrer **todas** as `<img>` da página, filtrar por:
- dimensão (entre 60-300px largura, 20-100px altura — captchas têm aspect ratio típico)
- presença de `src` começando com `data:image` OU `src` contendo `/captcha`, `/image`, `/imagem`, `.aspx`
- excluir logos conhecidos (alt contém "logo", "Receita Federal", "Ministério")

Retorna o primeiro match. Loga (via `console.log` do worker) qual seletor/heurística casou para diagnóstico futuro.

### 2. Robustecer `cnd-spa-portal.ts`

- **Detecção de captcha**: usar `findCaptchaImageSmart` (não a versão estrita). Se ainda assim retornar `null`, **abortar para fallback** com `throw new Error("layout_changed: spa_no_captcha — captcha esperado mas não encontrado")` em vez de prosseguir sem captcha.
- **Seletor "Pessoa Jurídica"**: priorizar elementos clicáveis (`button`, `[role="button"]`, `a`, `mat-card`, `.card`) com texto exato. Evitar `getByText` que pega qualquer span institucional.
- **Input CNPJ**: remover `'input[type="text"]'` genérico (pega qualquer text input). Manter só seletores específicos. Se nenhum casar → `layout_changed: spa_fill_cnpj`.
- **Botão submit**: priorizar `button[type="submit"]` antes de buscar por texto, e validar que o botão está **enabled** antes de clicar.

### 3. Diagnóstico (sem mexer em HMAC/secrets)

Adicionar `details_json` aos `sendProgress` críticos:
- `solve_captcha_spa`: incluir `selector_used`, `image_dims`, `src_prefix` (primeiros 50 chars).
- Quando `findCaptchaImageSmart` falhar: log com lista de **todas** as `<img>` da página (src/alt/dims), para debug pós-mortem visível em `automation_job_logs.details_json`.

### 4. Bump BUILD_ID

`cloudflare-worker/src/index.ts` → `"2026-04-23-spa-captcha-smart-v1"`

## Arquivos alterados

**Cloudflare Worker (precisa `wrangler deploy`):**
- `cloudflare-worker/src/lib/captcha.ts` — seletores ampliados + `findCaptchaImageSmart`
- `cloudflare-worker/src/providers/cnd-spa-portal.ts` — usa smart finder, exige captcha, seletores mais estritos para PJ/CNPJ/submit, logs de diagnóstico
- `cloudflare-worker/src/index.ts` — BUILD_ID

**Sem mudanças em:**
- App / UI / classificação (já cobre `layout_changed` e `captcha_unsolvable`)
- Edge function `solve-captcha` (continua igual)
- HMAC, secrets, bindings, callback_base
- Provider CNPJ (que está aprovado pelo usuário)

## Deploy necessário

**SIM:**

```bash
cd cloudflare-worker
npm install
npx wrangler deploy
curl -s https://gestaoez.leomateus620.workers.dev/health | jq .build_id
# esperado: "2026-04-23-spa-captcha-smart-v1"
```

## Resultado esperado pós-deploy

- **CND**: SPA detecta o `<img>` real do captcha (mesmo sem o termo "captcha" no atributo), passa para OCR, preenche código, submete. Se OCR errar → `manual_required`. Se SPA realmente quebrou → fallback automático para portal legado (já funciona).
- Logs de `automation_job_logs` agora terão `details_json` rico para diagnóstico visual no `/consulta/saude`.
- CNPJ mantém comportamento atual (já aprovado).

## Por que não outras alternativas

- **Não migrar para nova URL**: já estamos na URL nova (`servicos.receitafederal.gov.br`) — o problema é seletor.
- **Não trocar OCR por API paga**: OCR já está integrado e gratuito. Quando captcha for encontrado, a chain funciona.
- **Não remover SPA e voltar só pro legado**: legado também tem captcha; a melhoria de seletores ajuda os dois.

