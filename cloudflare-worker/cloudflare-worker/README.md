# GestaoEZ — Cloudflare Worker (Browser Rendering)

Worker que executa as consultas reais (CNPJ + CND) usando o binding
`gestaoez` do Cloudflare Browser Rendering. Recebe jobs assinados do
Lovable Cloud, executa Playwright, faz upload de evidências e envia
callbacks assinados de progresso/final.

## Endpoints

- `GET /health` — status + flags de configuração
- `GET /version`
- `POST /execute-job` — entrada autenticada via HMAC-SHA256 (responde 202)

O endpoint `/test-browser` foi substituído por `/execute-job`.

## Configuração

1. **Browser binding** já existe na conta com nome `gestaoez` (referenciado em `wrangler.toml`).
2. Defina a variável `CALLBACK_BASE_URL`:
   ```bash
   wrangler secret put CALLBACK_BASE_URL
   # cole: https://wsgphutkybxhajyicxif.supabase.co/functions/v1
   ```
3. Defina os dois segredos HMAC (devem bater com os do Lovable):
   ```bash
   wrangler secret put LOVABLE_HMAC_SECRET   # = CLOUDFLARE_WORKER_HMAC_SECRET no Lovable
   wrangler secret put CALLBACK_HMAC_SECRET  # = CF_CALLBACK_HMAC_SECRET no Lovable
   ```

## Instalação local e deploy

```bash
cd cloudflare-worker
npm install
npm run deploy
```

## Segurança

- HMAC-SHA256 bidirecional (`timestamp` ±5min + `nonce` para replay-protection)
- Headers: `X-Lovable-Signature/Timestamp/Nonce` (entrada) e `X-CF-Signature/Timestamp/Nonce` (saída)
- Worker nunca recebe service-role key; usa apenas o canal de callbacks assinados

## Fluxo

```
Lovable lookup-dispatcher
  --POST /execute-job (HMAC)--> Worker (202)
                                   |
                                   ├─ ctx.waitUntil:
                                   │    launch(env.gestaoez)
                                   │    abrir portal Receita
                                   │    capturar screenshots
                                   │    POST /artifacts-sign + PUT
                                   │    POST /cf-progress-callback (×N)
                                   │    POST /cf-final-callback
                                   v
                              Supabase Storage + tabelas
```

## Limitações conhecidas

- Os portais públicos da Receita podem exigir captcha; nesse caso o resultado
  é classificado como `captcha_detected` + `manual_required` (comportamento correto).
- Heurística de parsing é conservadora (`parsed_confidence`); refinamentos
  podem ser feitos em iterações futuras conforme amostras reais chegarem.