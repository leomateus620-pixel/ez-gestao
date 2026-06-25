## Objetivo
Trocar as 4 credenciais do WhatsApp Cloud API (Meta) e validar a integração com um envio real do template `hello_world` para `5555999699631`.

## Passos

1. **Atualizar `WHATSAPP_API_VERSION`** para `v22.0` via `set_secret` (valor conhecido, não-sensível).

2. **Solicitar nova entrada segura dos 3 secrets sensíveis** via `update_secret` (formulário seguro para o usuário colar os novos valores):
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_BUSINESS_ACCOUNT_ID`
   - `WHATSAPP_PHONE_NUMBER_ID`

3. **Rodar diagnóstico** chamando `test-guide-connection` (canal=whatsapp) para confirmar:
   - Etapa A — presença dos 4 secrets.
   - Etapa B — WABA acessível (lista templates aprovados).
   - Etapa C — Phone Number ID válido (display number, verified name, qualidade).

4. **Enviar mensagem de teste** invocando `send-whatsapp-test` com:
   - `to`: `5555999699631` (normalizado E.164)
   - `template_name`: `hello_world`
   - `language`: `en_US`
   - `parameters`: nenhum (hello_world não tem variáveis)

5. **Verificar resultado**:
   - Confirmar `message_id` retornado pela Meta.
   - Conferir registro em `whatsapp_integration_logs` (test_type=`send_test`, status=`success`).
   - Em caso de erro, traduzir o `error_code` (100 = permissões/WABA; 190 = token; 131030 = destinatário não autorizado) e indicar o ajuste necessário na Meta.

## Notas de segurança
- Nenhum token é escrito em código, log ou resposta.
- `update_secret` exige interação do usuário — apenas o nome do secret trafega; o valor é digitado em formulário seguro.
- O envio de teste é feito server-side via edge function gated por admin/bootstrap.
