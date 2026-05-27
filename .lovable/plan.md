## Objetivo

Espelhar o fluxo atual de envio de guias por Gmail, adicionando WhatsApp via Twilio: mesma extração de PDF, mesma descrição (tipo, competência, vencimento, valor) e mesmo card de disparo, agora com escolha de canal (E-mail / WhatsApp / Ambos). Validar enviando as guias do Escritório Contábil Zimmermann para o número informado.

## O que será feito

1. **Conectar Twilio** (connector com gateway). Sem isso, o WhatsApp não envia.
2. **Pedir 2 dados de configuração** (segredos):
   - `TWILIO_WHATSAPP_FROM` — número WhatsApp habilitado no Twilio no formato `whatsapp:+E164` (ex.: `whatsapp:+14155238886` no sandbox, ou seu número aprovado em produção).
   - `TWILIO_WHATSAPP_CONTENT_SID` — *opcional*. SID de um Content Template aprovado para envio fora da janela de 24h. Sem ele, só funciona se o destinatário tiver respondido nas últimas 24h (ou estiver no sandbox).
3. **Nova edge function `dispatch-empresa-guias-whatsapp`** — espelha a do Gmail:
   - Baixa cada PDF da pasta da empresa no Drive.
   - Extrai metadados nativamente (tipo, competência, vencimento, valor) — mesma lógica do `dispatch-empresa-guias`.
   - Faz upload temporário de cada PDF para o bucket `automation-artifacts` e gera URL assinada de curta duração (24h) para `MediaUrl`.
   - Envia 1 mensagem WhatsApp por guia com o resumo no `Body` e o PDF como `MediaUrl`. Se `TWILIO_WHATSAPP_CONTENT_SID` estiver setado, usa `ContentSid` + `ContentVariables` (necessário para iniciar conversa fora da janela de 24h).
   - Aceita `mode: 'simulate' | 'live'` (mesma semântica do e-mail).
   - Grava em `guia_envios` (`canal='whatsapp'`, `provider_message_id`, `idempotency_key`) e em `guia_eventos`, e marca `guias.status='enviada'` no modo live — exatamente como o fluxo Gmail.
4. **UI — `EmpresaAutomacaoCards`** (card "Disparar guias"):
   - Adicionar seletor de canal: **E-mail** / **WhatsApp** / **Ambos**.
   - Quando WhatsApp, o input vira "WhatsApp (E.164)" e usa `whatsapp_principal` da empresa como default.
   - "Simular" e "Enviar" passam a invocar a edge function correta conforme o canal. Em "Ambos", dispara as duas.
5. **Página de Integrações** (`/integracoes`): card do Twilio passa a refletir o status real (já existe `integracoes-status` — só ajustar para considerar `TWILIO_API_KEY` do connector).
6. **Teste com Escritório Contábil Zimmermann**:
   - Normalizo o número informado `55 55 8148-8385` para E.164 e disparo "Simular" (mostra preview) e "Enviar" (real).
   - Mostro o `provider_message_id` retornado pelo Twilio para conferência.

## Perguntas antes de implementar

Preciso confirmar dois pontos rapidamente:

**A) Número do destinatário em E.164.** O texto "55 55 8148-8385" tem 8 dígitos após o DDD 55. Celulares brasileiros têm 9 dígitos começando com 9. Provavelmente o número correto é `+55 55 98148-8385` → `+5555981488385`. Posso seguir com esse?

**B) Conta Twilio.** Você já tem:
   - Um número WhatsApp Business aprovado e ativo no Twilio (produção), **ou**
   - Vai usar o sandbox `whatsapp:+14155238886` (precisa que o destinatário envie a frase de opt-in para o sandbox antes do primeiro envio)?
   - E você tem um **Content Template** aprovado para enviar guias fiscais (ContentSid)? Sem template aprovado, só dá pra enviar se o destinatário tiver mandado mensagem nas últimas 24h.

Posso seguir assumindo: número = `+5555981488385`, sandbox Twilio sem ContentSid (você manda o opt-in do sandbox antes). Se preferir outra combinação, me diga ao aprovar.

## Arquivos previstos

- `supabase/functions/dispatch-empresa-guias-whatsapp/index.ts` (novo)
- `supabase/config.toml` (registrar a função com `verify_jwt = false`)
- `supabase/functions/integracoes-status/index.ts` (ajustar nome do secret do Twilio)
- `src/components/EmpresaAutomacaoCards.tsx` (seletor de canal + chamada da nova função)
- `src/pages/guias/IntegracoesGuias.tsx` (já existe, sem mudança de UI relevante)
