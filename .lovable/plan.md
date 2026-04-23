

# Resolver CAPTCHA com OCR grátis (Tesseract.js em Edge Function Deno)

## Estratégia (adaptada ao seu stack)

Seu script original usa **Node + Sharp + Playwright local**. Isso não roda em Cloudflare Worker (sem `node:fs`, sem binários nativos como Sharp). Mantemos o stack atual e dividimos responsabilidades:

```text
Worker CF (Playwright)  →  detecta <img> do captcha  →  envia base64
       ↓                                                    ↓
 fluxo CND/CNPJ                          Edge Function Deno (solve-captcha)
       ↓                                                    ↓
 preenche resposta             Tesseract.js WASM + pré-proc Canvas API
       ↓                                                    ↓
   submete                                  retorna texto OCR (5-7 chars)
```

Sharp é substituído por **Canvas API nativa do Deno** (greyscale + threshold + resize) — mesmo resultado, sem binário nativo.

## Mudanças

### 1. Nova Edge Function `solve-captcha` (Deno)

`supabase/functions/solve-captcha/index.ts`

- **Input**: `{ image_base64: string, min_length?: 5, max_retries?: 2 }`
- **Auth**: HMAC compartilhado com o Worker (reutiliza `CF_CALLBACK_HMAC_SECRET` — mesma chave do callback). Headers `X-CF-Signature/Timestamp/Nonce`. Sem JWT.
- **Pré-processamento** (Canvas API — substitui Sharp):
  - decode PNG via `ImageData`
  - greyscale (média RGB)
  - normalize (stretch 0-255)
  - threshold binário (default 128)
  - resize para largura 300px
- **OCR**: `tesseract.js` via npm specifier (`npm:tesseract.js@5`). Worker LSTM, PSM single-line, whitelist `0-9A-Za-z`.
- **Retry**: até 2x com thresholds diferentes (128, 100, 140) se texto < `min_length`.
- **Resposta**: `{ ok: true, text: "ABC12", attempts: 1, latency_ms: 1234 }` ou `{ ok: false, reason: "low_confidence" }`.
- **Config**: `supabase/config.toml` adiciona bloco `[functions.solve-captcha]` com `verify_jwt = false`.

### 2. Worker — helper `solveCaptcha`

`cloudflare-worker/src/lib/captcha.ts` (novo)

- `findCaptchaImage(page)`: tenta seletores em cascata — `img[src*="captcha"]`, `img[alt*="captcha"]`, `img[id*="captcha"]`, `img[src*="image.aspx"]`.
- `solveCaptcha(env, page)`:
  1. localiza `<img>` do captcha
  2. screenshot do elemento → base64
  3. POST assinado para `${CALLBACK_BASE_URL}/solve-captcha`
  4. retorna texto ou `null` se falhou
- Bounded: 25s timeout, 1 chamada por job (evitar loop).

### 3. Provider CND — integrar OCR

`cloudflare-worker/src/providers/cnd-public-portal.ts`

Fluxo atualizado entre **fill_cnpj** e **submit**:

1. preencher CNPJ (já existe)
2. **NOVO** `detect_captcha_image`: procurar `<img>` do captcha na página
3. **NOVO** `solve_captcha`: se encontrou, chamar `solveCaptcha(env, page)`
4. **NOVO** `fill_captcha`: preencher input do código (`input[name*="captcha"]`, `input[id*="captcha"]`, `input[placeholder*="código"]`)
5. **NOVO** se OCR retornou `null` → `throw "captcha_unsolvable"` → vira `manual_required`
6. submit (já existe)
7. parse — se aparecer mensagem `"código incorreto"`, classificar como `captcha_failed` (novo error_type) → `manual_required` com sugestão "OCR errou, tente novamente"

Screenshots adicionais: `cnd_step2b_captcha`, `cnd_step2c_captcha_filled`.

### 4. Provider CNPJ — mesma integração

`cloudflare-worker/src/providers/cnpj-public-portal.ts`

Mesma lógica: detectar `<img>` captcha após preencher CNPJ, resolver via OCR, preencher input, submeter. Hoje sai como `captcha_detected` antes de chegar no submit.

### 5. Classificação

`cloudflare-worker/src/lib/classification.ts`

Adicionar:
- `captcha_unsolvable` → "OCR não conseguiu ler o captcha após retries"
- `captcha_failed` → "Captcha foi enviado mas portal rejeitou (OCR errou)"

Ambos viram `manual_required` na UI.

`cloudflare-worker/src/types.ts` — adicionar os 2 novos `ErrorType`.

### 6. UI — sugestões no `services/classification.ts`

`src/features/consulta/services/classification.ts`

- `captcha_unsolvable`: "OCR automático falhou. Tente novamente em 1 min ou faça consulta manual."
- `captcha_failed`: "OCR resolveu mas o portal rejeitou o código. Tente novamente."

### 7. Bump BUILD_ID

`cloudflare-worker/src/index.ts` → `"2026-04-23-ocr-captcha-v1"`

## Arquivos alterados

**Edge Function (deploy automático Lovable):**
- `supabase/functions/solve-captcha/index.ts` (novo)
- `supabase/config.toml` (bloco `[functions.solve-captcha]`)

**Cloudflare Worker (precisa `wrangler deploy`):**
- `cloudflare-worker/src/lib/captcha.ts` (novo)
- `cloudflare-worker/src/providers/cnd-public-portal.ts`
- `cloudflare-worker/src/providers/cnpj-public-portal.ts`
- `cloudflare-worker/src/lib/classification.ts`
- `cloudflare-worker/src/types.ts`
- `cloudflare-worker/src/index.ts` (BUILD_ID)

**App:**
- `src/features/consulta/services/classification.ts`

## Detalhes técnicos importantes

- **Sem custo**: Tesseract.js é grátis, roda no Deno (limite de CPU mais generoso que Worker).
- **Sem Sharp**: substituído por Canvas API nativa do Deno (mesmo pré-processamento).
- **Tempo OCR**: ~2-4s por captcha. Adiciona latência mas mantém manual_required como fallback.
- **Taxa de acerto esperada**: 60-80% (alinhado com o que seu script estima). Quando errar → `captcha_failed` → manual_required.
- **HMAC**: `solve-captcha` usa o mesmo `CF_CALLBACK_HMAC_SECRET` que `cf-progress-callback` — não precisa criar novo segredo.
- **Sem Vision API, sem CapSolver, sem chaves novas**: 100% grátis e local ao seu stack.

## Deploy necessário

**SIM** — após eu aplicar as mudanças, você precisa rodar:

```bash
cd cloudflare-worker
npm install
npx wrangler deploy
curl -s https://gestaoez.leomateus620.workers.dev/health | jq .build_id
# esperado: "2026-04-23-ocr-captcha-v1"
```

A edge function `solve-captcha` é deployada automaticamente pelo Lovable.

## Resultado esperado no dry-run pós-deploy

- **CNPJ**: tenta OCR. Se acertar → `success` com dados parseados. Se errar 2x → `manual_required` com `captcha_unsolvable` ou `captcha_failed`.
- **CND**: idem.
- Sem mais `captcha_detected` puro — sempre passa pelo OCR antes.

## Restrições mantidas

- Não mexer em HMAC, secrets existentes, bindings, callback_base
- Não mexer no portal CND (continua o antigo)
- Não usar APIs pagas (Sharp, CapSolver, Vision, OpenAI)

