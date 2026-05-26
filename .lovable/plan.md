## Plano: flexibilizar validação e rodar o teste

### Ajuste mínimo no pipeline
Em `supabase/functions/run-guide-scan-now/index.ts`:
- Adicionar flag `relax_cnpj: boolean` no body (default `false`). Quando `true`:
  - `cnpjCandidates()` aceita CNPJs com 14 dígitos mesmo que falhem no dígito verificador (mantém dedupe e filtro de repetidos como `00000000000000`).
  - `fiscalSignals` mínimo cai de 1 para 0 (basta achar o CNPJ).
- Sem mudança no modo `live` real: a flag só relaxa a identificação, o envio continua exigindo empresa ativa, e-mail validado e canal e-mail.

### Execução do teste
1. Rodar `run-guide-scan-now` com `{ mode: "simulate", relax_cnpj: true }`.
2. Mostrar o resultado: arquivo lido, CNPJ detectado, empresa casada (Leonardo LTDA), assunto/corpo que seriam enviados, sem disparar nada.
3. Se OK, rodar de novo com `{ mode: "live", relax_cnpj: true }`:
   - Gmail envia para `leomateus620@gmail.com` com o PDF anexado.
   - Drive move o arquivo de `teste guias` para `teste guias/enviados`.
   - Confirma `provider_message_id`, status `enviada` e evento `dispatch_accepted`.

### Pré-checagem rápida antes de disparar
- Empresa Leonardo LTDA com `comunicacao_ativa=true`, `canal_preferido='email'`, `email_validado=true`, `email_principal='leomateus620@gmail.com'`.
- Se algo faltar, ajusto o registro da empresa em uma migration curta antes do live.

### Fora de escopo
- Twilio/WhatsApp, cron automático, e remoção definitiva da validação estrita (continua sendo o padrão fora do teste).