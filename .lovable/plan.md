## Objetivo
Habilitar o webhook público da WhatsApp Cloud API no projeto e entregar a URL exata para colar no Meta Developers.

## Situação atual
- A Edge Function `whatsapp-webhook` **já existe** em `supabase/functions/whatsapp-webhook/index.ts` e já está configurada como pública (`verify_jwt = false` em `supabase/config.toml`).
- Ela já implementa exatamente o comportamento pedido:
  - **GET**: lê `hub.mode`, `hub.verify_token`, `hub.challenge`; compara o token contra `Deno.env.get("WHATSAPP_VERIFY_TOKEN")`; devolve `hub.challenge` como `text/plain` 200 quando bate, ou 403.
  - **POST**: valida assinatura `X-Hub-Signature-256` (HMAC SHA-256 com `WHATSAPP_APP_SECRET`, quando presente), parseia o payload, atualiza `guia_envios` por `provider_message_id` e registra um evento sanitizado em `guia_eventos` (sem tokens, sem secrets), respondendo 200 rapidamente para a Meta.
- O secret `WHATSAPP_VERIFY_TOKEN` **já está cadastrado** no projeto (aparece em `<secrets>`).

Ou seja: não há código novo a escrever nem migration a rodar.

## Passos
1. **Confirmar/atualizar o valor do secret** `WHATSAPP_VERIFY_TOKEN` para exatamente `ezguias_webhook_2026_seguro`.
   - Como o secret já existe, usar `update_secret` (formulário seguro — o valor não trafega em texto na conversa do agente). Você cola o valor `ezguias_webhook_2026_seguro` no formulário.
   - Alternativa: se preferir que eu grave o valor diretamente (já que você o publicou no chat), uso `set_secret` após apagar o atual. Avise qual prefere.
2. **Entregar a URL pública** do webhook para colar no Meta Developers → Webhooks → Callback URL:
   ```text
   https://wsgphutkybxhajyicxif.supabase.co/functions/v1/whatsapp-webhook
   ```
   E o **Verify Token** a colar no mesmo formulário da Meta: `ezguias_webhook_2026_seguro`.
3. **Validar handshake** (opcional, após você salvar na Meta): rodar um GET de teste contra a URL com `hub.mode=subscribe&hub.verify_token=...&hub.challenge=ping` e confirmar resposta `ping` 200. Se a Meta aceitar a verificação na tela dela, esse passo é redundante.
4. **Assinar os campos de evento** no painel da Meta (fora do Lovable): em "Webhook fields", inscrever pelo menos `messages` (entrega status: sent/delivered/read/failed). Sem isso a Meta não envia POSTs.

## Notas de segurança
- Nenhum secret é exibido em logs, responses ou frontend — o handler já sanitiza `errors`/`status` antes de gravar em `guia_eventos`.
- Recomendado também cadastrar `WHATSAPP_APP_SECRET` (já presente nos secrets) para que a validação HMAC do POST fique ativa; sem ele, o handler aceita POSTs sem assinatura.
- `WHATSAPP_VERIFY_TOKEN` é usado **somente** na comparação do GET de handshake; nunca é retornado nem logado.

## O que você precisa decidir antes de eu implementar
- Confirmar que quer que eu use `update_secret` (você redigita o valor no formulário seguro) **ou** `set_secret` (eu gravo o valor que você já mandou no chat).