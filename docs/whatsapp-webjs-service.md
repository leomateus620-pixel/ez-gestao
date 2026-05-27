# Serviço externo Node.js para WhatsApp (whatsapp-web.js)

Este projeto **não executa whatsapp-web.js em Edge Functions**. O provider roda em serviço Node.js externo via HTTP.

## Endpoints obrigatórios
- `GET /health` → `{ "ok": true, "connected": true, "provider": "whatsapp-webjs" }`
- `GET /qr` → retorna QR Code da sessão quando não autenticada (não expor publicamente)
- `POST /send-message` → valida HMAC, envia via whatsapp-web.js e retorna `{ "ok": true, "external_message_id": "...", "status": "sent" }`
- `POST /logout` → encerra sessão do WhatsApp

## Contrato de envio
Entrada:
```json
{ "message_id":"uuid", "phone":"5511999999999", "message":"...", "recipient_name":"...", "metadata":{} }
```

Headers recebidos da Edge Function:
- `X-App-Source: lovable-supabase`
- `X-Timestamp: <ISO timestamp>`
- `X-Signature: <HMAC SHA-256 de timestamp.body>`

## Callback para Supabase
O serviço externo deve notificar `LOVABLE_CALLBACK_URL` com:
```json
{
  "message_id":"...",
  "external_message_id":"...",
  "status":"delivered|read|failed",
  "error":"...",
  "payload":{}
}
```

## Variáveis necessárias no serviço externo
- `PORT`
- `WHATSAPP_SESSION_PATH`
- `LOVABLE_CALLBACK_URL` (aponta para Edge Function `whatsapp-status-callback`)
- `SHARED_SECRET` (mesmo valor de `WHATSAPP_SERVICE_SECRET` no Supabase)

## Segurança
- Nunca expor `SHARED_SECRET` no frontend.
- Rejeitar requests sem assinatura válida.
- Não persistir QR code em bucket público.
- Registrar erros sem vazar credenciais.
- Não habilitar disparo automático em massa sem feature flag explícita.
