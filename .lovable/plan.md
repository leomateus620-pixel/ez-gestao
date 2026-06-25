## Objetivo
Consolidar a integração WhatsApp Cloud API em modo produção lendo segredos somente no backend, com diagnóstico seguro, envio com templates, auditoria e controle de acesso admin — sem alterar a identidade visual.

## Arquivos a alterar / criar

### Edge Functions
1. **`supabase/functions/test-guide-connection/index.ts`** (ajustar)
   - Reescrever o ramo `whatsapp` para o fluxo de diagnóstico em 3 etapas (A, B, C):
     - **A. Secrets:** retornar `{ access_token, waba_id, phone_number_id, api_version }` apenas como `"present" | "missing"`. Nunca o valor.
     - **B. WABA / templates:** `GET /{API_VERSION}/{WABA_ID}/message_templates`.
       - sucesso com array → `templates_count`, `templates_active` (nomes APPROVED), `token_scope: "waba_ok"`.
       - array vazio → `token_scope: "waba_ok_no_templates"`.
       - erro `code 100` → mensagem amigável "Token sem permissão, WABA não atribuída ao usuário do sistema, escopos incorretos ou ID da WABA incorreto."
       - erro `code 190` → "Token inválido, expirado ou revogado."
       - outros erros → mensagem genérica + `error_code` (sem token, sem URL com token).
     - **C. Phone Number:** `GET /{API_VERSION}/{PHONE_NUMBER_ID}` → expor apenas `display_phone_number`, `verified_name`, `quality_rating`, `code_verification_status`.
   - Remover o envio automático de `hello_world` desta função (movido para D).
   - Exigir `admin` via `has_role(auth.uid(), 'admin')` (ver Segurança).

2. **`supabase/functions/send-whatsapp-test/index.ts`** (criar — passo D)
   - Input: `{ to: string (E.164), template_name: string, language?: "pt_BR", parameters?: string[], document?: { link, filename } }`.
   - Valida admin. Normaliza `to` para dígitos E.164.
   - Monta payload `template` com `components` (header documento opcional + body com `parameters` posicionais).
   - `POST /{API_VERSION}/{PHONE_NUMBER_ID}/messages`.
   - Grava log de auditoria (tabela nova abaixo).
   - Retorna `{ ok, message_id, error_friendly, error_code }` — nunca o token nem o payload de Authorization.

3. **`supabase/functions/send-whatsapp-message/index.ts`** (ajustar — passo F)
   - Manter assinatura usada por `dispatch-guide` / `run-guide-scan-now`.
   - Antes de chamar Graph API: validar secrets, sanitizar telefone.
   - Após resposta: persistir em `whatsapp_messages` (já existe) o `message_id`, `provider_response_sanitized` (sem Authorization), `status` (`queued` → `sent` | `failed`).
   - Mapear erros 100/190 para mensagens amigáveis e expor apenas isso no retorno HTTP.
   - Manter fluxo de reenvio manual existente em `WhatsApp.tsx` (já chama esta function).

4. **`supabase/functions/integracoes-status/index.ts`** (ajustar)
   - Continuar retornando apenas booleans `present/absent`. Adicionar `whatsapp_business_account_id: boolean`. Garantir nenhum valor de secret no payload.

### Frontend (sem mudança visual de tema)
5. **`src/pages/guias/IntegracoesGuias.tsx`** (ajustar — painel admin de diagnóstico)
   - Botão **"Diagnosticar WhatsApp"** → chama `test-guide-connection` com `canal: 'whatsapp'` e mostra:
     - presença dos 4 secrets, status do token (válido / sem permissão / inválido), contagem de templates, lista de templates APPROVED, dados do número (display, verificação).
   - Botão **"Testar envio WhatsApp"** → modal com:
     - input `Número (E.164)` com máscara/validação,
     - select de template (alimentado pela lista retornada no diagnóstico),
     - campos dinâmicos de parâmetros (n inputs conforme template escolhido — usuário informa quantas variáveis e os valores; v1 simples com textarea linha-por-linha),
     - botão "Enviar" → chama `send-whatsapp-test`.
   - Toda a tela protegida por `getCurrentRole() === 'admin'`.

6. **`src/services/whatsapp.ts`** (ajustar)
   - Adicionar `sendWhatsAppTest({ to, templateName, language, parameters })` que invoca `send-whatsapp-test`.
   - Não enviar token; apenas usa `supabase.functions.invoke`.

7. **`src/pages/admin/WhatsApp.tsx`** (ajustar)
   - Garantir gate de admin (já tem). Adicionar atalho para diagnóstico/teste reaproveitando o modal acima ou link para `IntegracoesGuias`.

### Banco / Migração
8. **Nova tabela `public.whatsapp_integration_logs`** (passo E)
   - Colunas: `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, `triggered_by uuid null` (auth.uid), `test_type text` (`diagnostic_secrets` | `diagnostic_waba` | `diagnostic_phone` | `send_test` | `dispatch_guia`), `status text` (`success`|`failed`|`pending`), `endpoint text` (sem querystring sensível), `phone_number_id text`, `waba_id text`, `to_phone text null`, `template_name text null`, `message_id text null`, `error_code int null`, `error_message text null` (sanitizado), `meta jsonb default '{}'::jsonb`.
   - GRANTs: `SELECT, INSERT` a `authenticated`; `ALL` a `service_role`. Sem `anon`.
   - RLS: somente admins (`has_role(auth.uid(),'admin')`) podem `SELECT`; `INSERT` apenas via `service_role` (edge functions).
   - Se a função `public.has_role` e o tipo `app_role` ainda não existirem, criar conforme padrão de roles (tabela `user_roles` + função `security definer`).

### Segurança transversal (passo G)
- Toda Edge Function de diagnóstico/teste valida JWT e checa `has_role(uid,'admin')` via cliente service_role antes de prosseguir; usuário comum recebe `403 forbidden`.
- Auditar todos os arquivos para remover: tokens hardcoded, fallbacks `WHATSAPP_TOKEN ?? '...'`, prints de `Authorization`, ecos de `accessToken` em `console.log`/`return`. Lista de arquivos a varrer: `supabase/functions/**/*.ts`, `src/**` (somente para garantir ausência de `WHATSAPP_ACCESS_TOKEN` em `VITE_*`).
- Nenhum valor de secret em `provider_response`, `last_error`, `whatsapp_messages.metadata` ou `whatsapp_integration_logs`.

## Plano de testes (passo H) — executado após implementação
1. `secrets--fetch_secrets` — confirmar nomes presentes (não valores).
2. `curl test-guide-connection` como admin → validar A+B+C; capturar `templates_count` e dados do número.
3. `curl send-whatsapp-test` com template aprovado para `+5555999699631` → esperar `message_id`.
4. `curl send-whatsapp-test` com número inválido `+5500000000000` → esperar erro amigável.
5. Reenviar via `WhatsApp.tsx` → confirma `status=sent` e novo `message_id`.
6. `supabase--read_query` em `whatsapp_integration_logs` e `whatsapp_messages` → confirmar persistência.
7. `curl test-guide-connection` sem token / como não-admin → esperar `401`/`403`.
8. `rg` no repo para garantir que `WHATSAPP_ACCESS_TOKEN` aparece apenas em `Deno.env.get(...)`.

## Entregáveis no resumo final
- Lista de arquivos alterados/criados.
- Functions criadas/ajustadas: `test-guide-connection`, `send-whatsapp-test` (novo), `send-whatsapp-message`, `integracoes-status`.
- Tabela criada: `whatsapp_integration_logs` (+ infra de roles se ausente).
- Resultados de cada teste (1–8), incluindo se templates listaram, se o número validou, se o envio real funcionou e quais erros ainda dependem de configuração na Meta (ex.: número de destino não cadastrado em sandbox, template não APPROVED em pt_BR, escopo `whatsapp_business_management` ausente).
