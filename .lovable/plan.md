## Etapa 2 — Card "Envio automático de alertas" no `/fator-r`

Objetivo: cadastrar destinatários reais por empresa, remover o destinatário de teste, e manter o fluxo Drive → parse → alerta → mover para `Analisados` → card com percentual do Fator R.

---

### 1. UI — novo `GlassCard` em `src/pages/FatorR.tsx`

Título: **Envio automático de alertas**. Posicionado acima do card existente que lista os PDFs.

Conteúdo:
- Toggle global **"Envio real ativo"** (lê/grava `fator_r_sync_config.email_alerts_enabled`).
- Tabela/lista de empresas (de `fator_r_companies`), uma linha por empresa:
  - Nome + CNPJ (somente leitura).
  - Input **E-mail principal** (`responsible_email`).
  - Chips editáveis **E-mails adicionais** (`secondary_emails text[]`) — adicionar/remover com Enter/×.
  - Botão **Salvar** por linha (update na tabela via `supabase.from('fator_r_companies').update`).
  - Badge mostrando quantos e-mails configurados; alerta visual se a empresa não tiver nenhum e-mail.
- Botão **"Adicionar empresa"** abrindo um pequeno form (nome, CNPJ, e-mail principal) — insert em `fator_r_companies`.
- Indicador do status do último envio por empresa (consulta `fator_r_alerts` mais recente para mostrar `sent` / `failed` / `pending`).

Sem mudanças no card existente de listagem de PDFs (já mostra percentual + dados).

---

### 2. Backend — remover dependência do `TEST_RECIPIENT`

Em `supabase/functions/fator-r-drive-sync/index.ts`, substituir o bloco que escolhe destinatários por:

```ts
const recipients = [...new Set([
  company?.responsible_email,
  ...(company?.secondary_emails ?? []),
].filter(Boolean))];

if (recipients.length === 0) {
  // log "no_recipients_configured" e pula envio (mas mantém parse + persistência + move pra Analisados)
}
```

- O secret `FATOR_R_ALERT_TEST_RECIPIENT` deixa de ser lido; será removido via `delete_secret` depois que o usuário confirmar a Etapa 2 funcionando.
- Mantém respeito ao toggle `fator_r_sync_config.email_alerts_enabled` (se `false`, não envia, só registra).
- Mantém regra de faixa: `critical` (≤ 0,28) e `attention` (≤ 0,32) disparam e-mail; `safe` e `not_applicable` não.
- Mantém movimentação do PDF para subpasta `Analisados` após processamento bem-sucedido.
- Mantém dedupe `(company_id, monthly_result_id, alert_type, recipient_email)`.

---

### 3. Identificação da empresa pelo arquivo

O parser já extrai CNPJ do PDF (`detected_cnpj`). O sync faz match com `fator_r_companies.normalized_cnpj`. Se não encontrar empresa, **cria automaticamente** uma linha em `fator_r_companies` (com `name = detected_company_name`, `responsible_email = null`) e marca o documento — assim aparece na UI da Etapa 2 para o usuário cadastrar o e-mail. Esse comportamento já existe parcialmente; vou garantir o auto-cadastro.

---

### 4. Sem migração nova

Os campos `responsible_email`, `secondary_emails`, `email_alerts_enabled` já existem. Nenhuma alteração de schema.

---

### 5. Validação

1. Cadastrar 1–2 empresas no novo card com e-mails reais.
2. Rodar `fator-r-drive-sync` manualmente.
3. Conferir:
   - PDFs lidos da pasta do Drive.
   - Empresas casadas por CNPJ; empresa nova é auto-cadastrada se faltar.
   - Alerta enviado para os e-mails da empresa (não mais para o TEST_RECIPIENT).
   - PDF movido para `Analisados`.
   - Card de PDFs mostra percentual e status.
4. Após OK do usuário: `delete_secret FATOR_R_ALERT_TEST_RECIPIENT`.

---

### Fora de escopo
- Parser, layout do e-mail, agendamento cron, demais telas.
- Permissões/roles (mantém RLS pública atual da Fase 1).
