

# Refazer 2 secrets do Worker (input via stdin)

## Problema confirmado

O redeploy funcionou (build novo ativo, `/debug-sign` respondendo). Mas **2 secrets do Worker estão com 1 caractere só**:

- `LOVABLE_HMAC_SECRET`: 1 char no Worker vs 64 chars no Lovable → fingerprints diferentes (`7cb7c454` vs `aab510f6`)
- `CALLBACK_BASE_URL`: ainda é `"\u0016"` (caractere de controle)

Seu terminal está engolindo o input do `wrangler secret put` (provavelmente um Ctrl+algo durante o paste).

## Comandos a rodar (use stdin via pipe — evita o problema do paste)

### 1. Pegar o valor correto do `LOVABLE_HMAC_SECRET`

No painel Lovable Cloud, copie o valor de `CLOUDFLARE_WORKER_HMAC_SECRET` (64 caracteres, fingerprint `aab510f64312`).

### 2. Setar `LOVABLE_HMAC_SECRET` no Worker via pipe

```bash
cd cloudflare-worker

# Substitua COLE_AQUI pelo valor real (64 chars) do CLOUDFLARE_WORKER_HMAC_SECRET
echo -n "COLE_AQUI" | wrangler secret put LOVABLE_HMAC_SECRET
```

`echo -n` evita newline; o pipe evita o paste interativo bugado.

### 3. Setar `CALLBACK_BASE_URL` no Worker via pipe

```bash
echo -n "https://wsgphutkybxhajyicxif.supabase.co/functions/v1" | wrangler secret put CALLBACK_BASE_URL
```

### 4. Confirmar `CALLBACK_HMAC_SECRET` (provavelmente já está OK, mas vale validar)

Se `secret_length` dele também estiver pequeno, repita o mesmo padrão:

```bash
echo -n "VALOR_DO_CF_CALLBACK_HMAC_SECRET" | wrangler secret put CALLBACK_HMAC_SECRET
```

### 5. Não precisa redeployar

Secrets aplicam imediatamente — sem `wrangler deploy`.

## Validação automática (modo default)

Após você rodar os 3 comandos acima, eu chamo `consulta-hmac-diagnose` e confirmo:

- `worker.secret_length: 64` (não mais 1)
- `fingerprints_match: true`
- `signatures_match: true`
- `callback_base_ok: true`
- Mensagem: "Tudo OK — pode rodar dry-run"

## Por que `echo -n | wrangler secret put` resolve

O modo interativo do `wrangler secret put` lê via TTY, e algum middleware no seu terminal (iTerm, Warp, plugin, clipboard manager) está cortando o input após o primeiro byte de controle. Passar via pipe contorna o TTY completamente — o wrangler lê do stdin direto, byte por byte, sem interpretação.

## Resumo

- Worker está atualizado ✅
- Secrets do Worker estão truncados ❌
- Refaça com `echo -n "valor" | wrangler secret put NOME`
- Avise quando terminar e eu valido

