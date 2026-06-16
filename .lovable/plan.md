## Rodada Final — Guias: Revisão Manual + Dashboard + Resto

Consolida o módulo de Guias com tudo que faltou da PR única aprovada anteriormente. Sem mexer em Fator R nem em Reforma Tributária.

### 1. Dashboard `/guias` (toggle + métricas)

- Header com toggle **MODO TESTE / PRODUÇÃO** persistido em `guide_test_config` (RPC update; badge vermelho quando TESTE).
- Campos de teste (e-mail/whatsapp destinatário) editáveis inline quando TESTE ligado.
- Cards por status lendo `guias`: A Enviar, Pronta p/ Envio, Enviadas, Revisão Manual, Não Identificadas, Duplicadas, Erros.
- Cards de métrica do último batch (`guide_batch_runs`): total lidos, identificados, enviados, falhas, tempo médio, duração.
- Botões: "Varredura agora" (invoca `run-guide-scan-now`), "Reprocessar erros", "Recriar estrutura de pastas" (invoca `bootstrap-test-folder`).
- Lista das últimas 20 execuções em tabela colapsável.

### 2. Tela `/guias/revisao` (Revisão Manual)

- Rota nova protegida por auth; lista guias em `revisao_manual` + `nao_identificada` + `duplicada` + `erro`.
- Layout 2 colunas: esquerda preview do PDF (iframe via signed URL do Drive ou download proxy via edge function `get-guide-pdf`), direita formulário editável com:
  - empresa (autocomplete em `empresas` por CNPJ/razão/aliases),
  - tipo_guia (select do enum),
  - competência (mês/ano), vencimento (date), valor (decimal),
  - código de barras / identificador,
  - canal (email/whatsapp/ambos), destinatários override.
- Mostrar `confidence_score`, `valor_extraido_raw`, motivos do roteamento, hash, candidatos de CNPJ detectados.
- Ações: **Aprovar e enviar**, **Aprovar sem enviar** (move p/ Enviadas), **Marcar como erro**, **Reprocessar** (re-roda parser), **Excluir/ignorar** (move p/ pasta de erro). Toda ação grava `guide_audit` com before/after.

### 3. Tela `/configuracoes` — Templates

- Aba "Templates de Guias": CRUD em `guide_templates` (lista por tipo×canal, editor com variáveis disponíveis `{{empresa}} {{competencia}} {{vencimento}} {{valor}} {{codigo_barras}} {{linha_digitavel}}`).
- Preview renderizado com dados fake.
- Versão ativa marcada; histórico simples (mantém última inativa).

### 4. Tela `/integracoes` — Conectores Guias

- Card "Google Drive — Guias" mostrando IDs das 6 pastas (`a_enviar_folder_id`, `enviadas_folder_id`, `revisao_folder_id`, `nao_identificadas_folder_id`, `duplicadas_folder_id`, `erros_folder_id`), botão "Recriar estrutura", "Testar leitura".
- Card "Gmail" — botão "Enviar e-mail teste" (invoca `test-guide-connection` com canal=email).
- Card "Twilio WhatsApp" — campos `from_number`, `content_sid` por tipo (lê de `integracoes_guias`), botão "Enviar WhatsApp teste".
- Status: última varredura, próxima execução do cron.

### 5. Tela `/empresas` — campos novos

- Form de empresa: campos `aliases` (chips), `regra_envio_especial` (textarea), `canal_preferido` (inclui `ambos`), destinatários e-mail/whatsapp (já existentes).

### 6. Edge Functions novas / atualizadas

- `process-guide` (nova): worker individual idempotente — extrai, classifica, calcula confidence, roteia, grava `guias` + `guide_audit`. Chamada pelo scan em paralelo controlado (limit 5).
- `dispatch-guide` (nova): envia 1 guia (canal único), renderiza template de `guide_templates`, usa Gmail/Twilio Content SID, idempotência `sha256(guia_id|canal|modo)`, move PDF p/ `Enviadas/[Empresa]/[YYYY-MM]/`.
- `test-guide-connection` (nova): webhook de teste por canal.
- `get-guide-pdf` (nova): proxy autenticado p/ servir o PDF na tela de revisão.
- `run-guide-scan-now` (refator): só orquestra — lista `A Enviar`, dedup por `dedup_hash`, enfileira `process-guide`, agrega métricas em `guide_batch_runs`. Remove envio inline (delegado a `dispatch-guide`).
- Helpers `_shared/guide-parser.ts` e `_shared/guide-drive.ts`: já criados; adicionar `renderTemplate()`, `moveToEnviadas()`, `quarantine()`.

### 7. Provider/hooks

- `GuideProvider` (ou hook equivalente) reescrito: queries por status, mutations p/ aprovar/reprocessar/excluir, subscription realtime opcional em `guias` e `guide_batch_runs`.
- `useGuideTestConfig()` hook compartilhado pelo dashboard.

### 8. Migração SQL adicional

- `guide_test_config`: garantir linha única (`id = 'global'`) com seed.
- `guias`: índice em `(status)`, único parcial em `dedup_hash WHERE dedup_hash IS NOT NULL`.
- `guide_audit`: índice em `(guia_id, created_at desc)`.
- GRANTs em qualquer tabela nova.

### 9. Fora de escopo

- Sem OCR, sem retoque visual global, sem mexer em `fator_r_*` / `tax_reform_*`, sem novos conectores além de Drive/Gmail/Twilio já linkados.

### 10. Validação final

- Build limpo, migração aprovada, 4 edge functions deployadas, varredura de ponta a ponta em modo TESTE com PDF mock, revisão manual aprovando 1 guia, dispatch real em modo PRODUÇÃO desabilitado por padrão.
