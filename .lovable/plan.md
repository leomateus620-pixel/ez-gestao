## Objetivo
1. **Etapa 1 — Teste real**: rodar `fator-r-drive-sync` para os PDFs da pasta do Drive, com envio Gmail real de `leomateus620@gmail.com` para `leonardostroschein@hotmail.com` e `leonardomateuspjjc56@gmail.com`.
2. **Etapa 2 — Após validação**: adicionar na tela `/fator-r` um card dedicado "Envio automático de alertas" onde cada arquivo/empresa tem seus destinatários pré-cadastrados, e os e-mails passam a ser enviados para esses contatos (não mais para destinatário de teste).

---

## Etapa 1 — Teste real (executar primeiro)

### Diagnóstico atual
- `fator-r-send-alert` já chama Gmail via conector, mas envia em **dry-run** por padrão (`FATOR_R_EMAIL_DRY_RUN != "false"`).
- `fator-r-drive-sync` aceita `FATOR_R_ALERT_TEST_RECIPIENT`, mas como **string única** — não suporta múltiplos destinatários hoje.
- `FATOR_R_EMAIL_FROM` já default para `leomateus620@gmail.com` (precisa bater com a conta Gmail conectada).

### Mudança de código (mínima, só para o teste)
Em `supabase/functions/fator-r-drive-sync/index.ts`, trocar:
```ts
const recipients = testRecipient ? [testRecipient] : [...]
```
por:
```ts
const testRecipients = testRecipient
  ? testRecipient.split(",").map(s => s.trim()).filter(Boolean)
  : [];
const recipients = testRecipients.length
  ? testRecipients
  : [...new Set([company.responsible_email, ...(company.secondary_emails ?? []), defaultRecipient].filter(Boolean))];
```

### Secrets a configurar (via `add_secret`)
- `FATOR_R_EMAIL_DRY_RUN` = `false`
- `FATOR_R_ALERT_TEST_RECIPIENT` = `leonardostroschein@hotmail.com,leonardomateuspjjc56@gmail.com`
- `FATOR_R_EMAIL_FROM` = `leomateus620@gmail.com`

### Execução e validação
1. `deploy_edge_functions(["fator-r-drive-sync","fator-r-send-alert"])`
2. `curl_edge_functions POST /fator-r-drive-sync`
3. Conferir logs (`gmail_send_success` + `messageId`) e tabelas `fator_r_alerts.status='sent'` e `fator_r_documents.email_status='sent'`.
4. Usuário confirma chegada nas duas caixas → libera Etapa 2.

### Pré-requisito
A conexão Gmail ativa precisa ser de `leomateus620@gmail.com`. Se for outra conta, peço reconexão antes de disparar (senão Gmail rejeita o `From`).

---

## Etapa 2 — Card dedicado "Envio automático de alertas" (depois do OK no teste)

### Modelo de dados
A tabela `fator_r_companies` já tem `responsible_email` (principal) e `secondary_emails text[]` (cópias). Vou usar esses campos como **lista de destinatários por empresa** (cada PDF é associado a uma empresa via CNPJ).

Migração necessária: nenhuma — campos já existem. Só configurar via UI.

### UI — novo card em `src/pages/FatorR.tsx`
Bloco `GlassCard` com:
- Lista de empresas cadastradas (uma linha por empresa).
- Por linha: nome, CNPJ, **e-mail principal** (input) e **e-mails adicionais** (chips editáveis).
- Botão "Salvar destinatários" por empresa → atualiza `responsible_email` e `secondary_emails`.
- Toggle "Envio real ativo" lendo/escrevendo `fator_r_sync_config.email_alerts_enabled`.
- Badge mostrando "Dry-run / Envio real" lido do status do último alerta.

### Backend — remover dependência do `TEST_RECIPIENT`
Depois do teste validado, **remover** o secret `FATOR_R_ALERT_TEST_RECIPIENT` (via `delete_secret`) para que o sync volte a usar a lista real por empresa:
```ts
const recipients = [...new Set([
  company.responsible_email,
  ...(company.secondary_emails ?? []),
].filter(Boolean))];
```
(O `defaultRecipient` global fica como fallback só se a empresa não tiver nenhum e-mail.)

### Fluxo final
1. Usuário cadastra/edita destinatários por empresa no novo card.
2. Sync diário lê PDFs → identifica empresa por CNPJ → envia alerta para os e-mails daquela empresa.
3. Dedupe por `(company_id, monthly_result_id, alert_type, recipient_email)` continua igual.

---

## Fora de escopo
- Não mexer no parser, layout do e-mail, lógica de movimentação no Drive, nem na UI principal do Fator R.
- Etapa 2 só começa depois que Etapa 1 for validada pelo usuário ("recebi os e-mails").
