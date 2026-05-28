## Diagnóstico

- O parser PGDAS está pegando `541,99` no PDF da CRISTINE SCHWINGEL como FS12. Esse valor é ISS (página 2 – "Valor do Débito por Tributo"). Causa provável: `unpdf` com `mergePages: true` junta o texto e o regex atual de FS12 captura o primeiro `R$ x,xx` de qualquer linha que contenha "Total de Folhas de Salários Anteriores", ou cai na linha seguinte que já é tabela de tributos.
- A função `fator-r-send-alert` depende de `RESEND_API_KEY` / `SENDGRID_API_KEY` não configurados → retorna 4xx. Já existe o connector Gmail linkado (`GOOGLE_MAIL_API_KEY` está nos secrets), então o caminho correto é usar o connector gateway.
- O parser já trata "Fator r = Não se aplica" e "Nenhuma" corretamente — os testes existentes cobrem os 3 PDFs do enunciado. Só falta blindar contra o caso da Cristine e ajustar a UI/e-mail.

## Mudanças

### 1. `supabase/functions/_shared/fatorRParser.ts` e `src/services/fatorRParser.ts` (manter espelhados)
Reescrever `extractFs12` para ser estrito à seção 2.3.1:

- Localizar a linha com `2\.3\.1\)?\s*Total\s+de\s+Folhas?\s+de\s+Sal[aá]rios\s+Anteriores`.
- Capturar o **primeiro** `R$ x,xx` que apareça **após** o marcador `(R$)` na mesma linha; se não houver, olhar SOMENTE a próxima linha não-vazia E somente se essa linha não contiver `ISS|INSS|CPP|DAS|Tributo|D[eé]bito|Total\s+Geral`.
- Plausibilidade: descartar valores onde `payroll12m / revenue12m > 1` ou `< 0.0001` (FS12 não pode ser > RBT12).
- Detectar "Nenhuma" só na seção `2.3)`/`2.3.1)` (não no documento inteiro), evitando falsos positivos.

Ajustar warning de divergência declarado vs calculado: só emitir se `|declared - computed| > 0.02` (≈ 2 pontos percentuais) — atualmente é `0.005` e marca 31,00% vs 31,40% como erro.

Manter `fatorRValue = declared ?? computed` (já prioriza declarado).

### 2. `supabase/functions/fator-r-send-alert/index.ts`
Substituir Resend/SendGrid pelo connector Gmail via gateway:

- URL: `https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send`.
- Headers: `Authorization: Bearer ${LOVABLE_API_KEY}`, `X-Connection-Api-Key: ${GOOGLE_MAIL_API_KEY}`.
- Construir RFC 2822 (`To:`, `From: leomateus620@gmail.com`, `Subject:`, `Content-Type: text/html`) e enviar em `{ raw: base64url(...) }`.
- Se `GOOGLE_MAIL_API_KEY` ausente → 200 com `{ ok: false, reason: "gmail_not_connected", message: "Gmail não conectado. Conecte o Gmail no Lovable para ativar os alertas." }` (não 4xx, para não quebrar o processamento).
- Logar resposta completa do Gmail no console; retornar `{ ok, provider: "gmail_connector", messageId }`.

### 3. `supabase/functions/fator-r-process-upload/index.ts`
- Antes de invocar `fator-r-send-alert`, verificar dedup em `fator_r_alerts` por `(company_id, monthly_result_id, alert_type, recipient_email)`; se já existir com `status='sent'`, pular envio e registrar log `alert_duplicate_skipped` com mensagem `Alerta já existente; envio duplicado ignorado.`
- Logar eventos novos: `email_send_started`, `gmail_connector_missing`, `gmail_send_success`, `gmail_send_failed`, `alert_status_updated`.
- Tratar resposta da função: se `reason === "gmail_not_connected"`, marcar alerta como `failed` com mensagem amigável, mas **não** lançar erro — o PDF continua processado normalmente.
- Garantir `provider: "gmail_connector"` no payload retornado.

### 4. `src/pages/FatorR.tsx`
Por PDF processado, exibir na ordem solicitada: Nome do arquivo, Empresa, CNPJ, Período, **Fator R declarado**, **Fator R calculado**, RBT12, FS12 (mostrar "Nenhuma" quando `folhaAusente`), Status, Confiança, Alerta de e-mail, botão "Abrir PDF no Drive". A maior parte já existe — apenas garantir as duas linhas separadas declarado/calculado e o label "Nenhuma" quando aplicável.

### 5. Testes
- Atualizar `src/services/fatorRParser.test.ts` (e espelhar do lado da edge function se houver) com um caso simulando o layout problemático: linha do 2.3.1 sem valor, seguida de linha com `R$ 541,99 ISS` — deve retornar `payroll12m: null` (descartado) ou o valor correto quando estiver em sequência limpa.
- Manter os 3 testes existentes verdes.

## Fora de escopo

- Cálculo do Fator R (mantido `FS12 / RBT12`).
- Regras de status (`<=0.28 critical`, `<=0.32 attention`).
- Estrutura Drive, design geral, autenticação.

## Verificação final

`bunx vitest run src/services/fatorRParser.test.ts` e reprocessar os 3 PDFs reais no preview, conferindo cards e log do envio Gmail.
