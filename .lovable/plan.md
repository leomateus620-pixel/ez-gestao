## Revisão completa da PR #38 — Módulo Guias

Objetivo: transformar o que a PR #38 deixou no repo num fluxo Lovable/Supabase totalmente funcional, com prioridade absoluta em **não enviar guia errada para cliente errado**. Entrega numa única PR grande.

---

### 1. Auditoria inicial (read-only)

Antes de tocar em código, mapear o estado real:

- Ler todas as rotas em `src/App.tsx` + `src/navigation/route-loaders.ts` e confirmar quais existem hoje (`/guias`, `/guias/fila`, `/guias/enviadas`, `/guias/excecoes`, `/guias/revisao`, `/guias/:id`, `/integracoes`, `/configuracoes`).
- Listar `supabase/functions/*` e cruzar com `supabase/config.toml` e com `supabase.functions.invoke(...)` no front.
- `supabase--read_query` em `guias`, `empresas`, `integracoes_guias`, `guide_templates`, `guide_test_config`, `guide_batch_runs`, `guide_audit`, `guia_envios`, `guia_eventos`, `guia_excecoes` para conferir colunas, enums, índices, RLS e grants.
- Rodar `supabase--linter` para pegar warnings de segurança.

Saída: lista concreta do que falta / está quebrado, alimentando os passos seguintes.

---

### 2. Banco — migration corretiva única

Uma migration consolidando o que faltar. Tudo idempotente (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `CREATE OR REPLACE`).

- Enum `guia_status` com: `aguardando_processamento`, `processando`, `pronta_envio`, `revisao_manual`, `quarentena`, `nao_identificada`, `duplicada`, `erro`, `enviada`.
- Enum `canal_envio` com `email`, `whatsapp`, `ambos`.
- `empresas`: `aliases text[]`, `regra_envio_especial text`, `canal_preferido canal_envio`, `comunicacao_ativa bool`, `email_principal text`, `whatsapp_principal text`, `whatsapp_opt_in_at timestamptz`, `guia_learning_patterns jsonb`.
- `guias`: garantir `confidence_score`, `tipo_guia_confidence`, `tipo_guia_normalized`, `critical_fields_json`, `validation_issues_json`, `decision_status`, `decision_reason`, `decision_reasons jsonb`, `manual_review_level`, `quarantined_at`, `duplicate_level`, `duplicate_of`, `authorized_reprocess`, `dispatch_blocked_reason`, `drive_organization_pending`, `operation_batch_id`, `test_preview_json`, `dedup_hash`, `modo`, `pasta_atual`, `revisao_correcoes jsonb`, `cnpj_detectado`, `provider_error`.
- Índices: `guias(status)`, `guias(received_at)`, `guias(operation_batch_id)`, UNIQUE parcial em `guias(dedup_hash) where dedup_hash is not null`, `guide_audit(guia_id, created_at desc)`.
- Tabelas faltantes (se faltar): `guide_templates`, `guide_test_config`, `guide_batch_runs`, `guide_audit` — com GRANTs (`authenticated`, `service_role`) + RLS + políticas.
- Seed de templates padrão (DAS, FGTS Digital, DAF, DARF, GPS/INSS, ISS, ICMS, Outros) se a tabela estiver vazia.

---

### 3. Edge Functions — consolidar e padronizar

Garantir que existem, deployam, e estão no `config.toml` com `verify_jwt` correto:

| Função | verify_jwt | Papel |
|---|---|---|
| `run-guide-scan-now` | true | Orquestrador do pipeline |
| `dispatch-guide` | true | Reprocesso pós-revisão manual |
| `bootstrap-guide-folders` | true | Cria árvore de pastas (alias mantido para `bootstrap-test-folder`) |
| `get-guide-pdf` | true | Stream do PDF via conector Drive |
| `test-guide-connection` | true | Diagnóstico Drive/Gmail/WhatsApp |
| `send-whatsapp-message` | true (chamada interna usa service role) | Envio WhatsApp |
| `whatsapp-status-callback` | false | Webhook Twilio, valida assinatura HMAC |
| `integracoes-status` | false | Já existe; manter |
| `dispatch-empresa-guias` | — | Remover do fluxo de Guias (legado) |

Correções:
- Padronizar import CORS (`npm:@supabase/supabase-js@2/cors`) em todas.
- Renomear `bootstrap-test-folder` → `bootstrap-guide-folders` mantendo a função antiga como wrapper que reencaminha (compat temporária); atualizar chamadas no front.
- Marcar `dispatch-empresa-guias` como legado: removê-la do `config.toml` da seção Guias e dos componentes (`EmpresaAutomacaoCards` pode ficar se outro módulo usar; apenas tirar do fluxo Guias).

---

### 4. Pipeline `run-guide-scan-now` — endurecimento

Reorganizar a função em estágios bem nomeados (escreve `guia_eventos` em cada um):

```text
scan_started → file_found → file_registered → pdf_text_extracted
→ cnpj_extracted → guide_type_classified → company_matched
→ fields_validated → confidence_calculated → routed_*
→ (ready_to_dispatch → dispatch_started → email_sent / whatsapp_sent
   → drive_move_started → drive_move_finished) | dispatch_failed
```

Regras duras:
- PDF sem camada de texto → `erro` + motivo `pdf_no_text_layer` (move para Erros).
- Múltiplos CNPJs distintos → `revisao_manual` (level `multi_cnpj`).
- CNPJ inválido → `nao_identificada` + move para Não Identificadas.
- Score < 0.92 OU qualquer `critical_fields_json` faltando → `revisao_manual`.
- Empresa inativa / não cadastrada → `nao_identificada`.
- Deduplicação em 3 níveis (exata por `dedup_hash`, operacional por `(cnpj, tipo, competencia, vencimento, valor)`, provável por `(cnpj, tipo, competencia)` com tolerância) → `duplicada` ou `revisao_manual`.
- Template inativo / placeholder cru → bloqueia dispatch.
- Modo teste: nunca envia real, nunca move para `Enviadas`; gera `test_preview_json` e CSV.
- Nível operacional respeitado (matriz abaixo).

Matriz de níveis operacionais:

| Nível | Lê | Classifica | Prepara | Envia auto |
|---|---|---|---|---|
| `automacao_desligada` | não | não | não | não |
| `somente_classificacao` | sim | sim | não | não |
| `leitura_revisao` | sim | sim | sim | não |
| `envio_automatico_seguro` | sim | sim | sim | só score ≥ 0.92 sem pendência |
| `producao_total` | sim | sim | sim | com todas as validações fortes |

---

### 5. WhatsApp com link assinado (Supabase Storage)

Decisão: **link temporário assinado em Storage**, não MediaUrl do Twilio.

- Criar bucket privado `guia-pdf-links` (via `supabase--storage_create_bucket`).
- Em `dispatch-guide` (canal WhatsApp): baixar PDF do Drive → fazer upload para `guia-pdf-links/<operation_batch_id>/<guia_id>.pdf` → gerar `createSignedUrl(7 dias)` → injetar no template Twilio via placeholder `[LINK_GUIA]`.
- Registrar geração do link em `guia_eventos` com `link_expira_em`.
- RLS no bucket: apenas service_role escreve; leitura só pela URL assinada.
- E-mail continua enviando o PDF como anexo (não muda).
- Canal `ambos`: monta dois planos; falha em um marca falha parcial; nunca marca `enviada` se canal obrigatório falhou.

---

### 6. Frontend — rotas, telas e hooks

- `/guias` (dashboard): cards por status, toggle TESTE/PRODUÇÃO, badge vermelha em teste, métricas do último `guide_batch_runs`, botões Varredura agora / Recriar pastas / Ir para revisão. Verificar que números batem com o banco via `useGuides()`.
- `/guias/revisao`: corrigir chamadas para `get-guide-pdf` (tratamento de erro com mensagem clara), salvar overrides em `revisao_correcoes`, ações Corrigir+Enviar / Corrigir+Salvar / Marcar duplicada / Marcar erro / Reprocessar — cada uma cria linha em `guide_audit`.
- `/guias/:id` (`GuiaDetalhe`): exibir arquivo, status, pasta atual, empresa, CNPJ, razão social, tipo, competência, vencimento, valor, score, motivo, evidências, validações, histórico de `guia_eventos`/`guia_envios`/`guia_excecoes`, ações.
- `/guias/fila`, `/guias/enviadas`, `/guias/excecoes`: verificar render e dados; criar se faltarem com filtros pelo status correspondente.
- `/integracoes`: status real Drive/Gmail/Twilio/leitor nativo, IDs e links das 6 pastas, botões testar Drive/Gmail/WhatsApp (usando `test-guide-connection`), aviso “Drive/Gmail dependem dos conectores Lovable”.
- `/configuracoes` → aba Templates: CRUD + validação de placeholders (`[EMPRESA]`, `[CNPJ]`, `[TIPO_GUIA]`, `[COMPETENCIA]`, `[VENCIMENTO]`, `[VALOR]`, `[LINK_GUIA]`) e bloqueio de save com placeholder ausente conforme canal.
- `src/pages/Empresas.tsx`: adicionar campos `aliases`, `regra_envio_especial`, `canal_preferido` (com `ambos`), `email_principal`, `whatsapp_principal`, `whatsapp_opt_in_at`, `comunicacao_ativa`.

---

### 7. Documentação e checklist

- Reescrever `docs/guias-automation.md` refletindo arquitetura atual, conectores Lovable, edge functions reais, tabelas reais, fluxos teste/produção, matriz de decisão, pastas Drive, secrets, checklist de implantação.
- Remover menções a `scan-guide-folder`, `process-guide`, OAuth fora do conector, GCS/OCR externo.
- Adicionar `docs/guias-deploy-checklist.md` com os 19 passos de implantação.

---

### 8. Testes

- Manter/atualizar `src/features/guias/guide-rules.test.ts`, `guide-parser-safety.test.ts`.
- Reexecutar `test-fixtures/guias/golden-set.json` cobrindo: DAS, FGTS Digital, DAF, DARF, GPS/INSS, PDF sem texto, PDF não fiscal, múltiplos CNPJs, CNPJ inválido, empresa não cadastrada, empresa inativa, duplicada exata/operacional/provável, template inválido, destinatário inválido, Drive/Gmail/WhatsApp inativos.
- Validação manual via `supabase--curl_edge_functions` em `run-guide-scan-now` (modo teste), `dispatch-guide`, `bootstrap-guide-folders`, `get-guide-pdf`, `test-guide-connection`.

---

### 9. Critérios de aceite

Tudo do bloco 23 do pedido, com destaque:
- Todas as rotas renderizam.
- Toda função invocada pelo front existe, está em `config.toml`, deployada.
- Drive/Gmail só via conector Lovable.
- Modo teste nunca dispara cliente real.
- WhatsApp nunca envia sem opt-in, número E.164, template ativo, link assinado válido.
- E-mail nunca envia sem destinatário, assunto, corpo e anexo.
- CNPJ inválido/ausente/múltiplo nunca envia automático.
- Empresa inativa/inexistente nunca envia automático.
- Duplicada nunca reenvia automático.
- Toda guia tem logs em `guia_eventos`; todo lote em `guide_batch_runs`.

---

### Out of scope desta PR

- OCR para PDFs escaneados (continua indo para Erros).
- Substituir conectores Lovable por OAuth próprio.
- Novos provedores além de Drive/Gmail/Twilio.
- Mexer em `fator_r_*` e `tax_reform_*`.

---

### Ordem de execução

1. Auditoria (read-only)
2. Migration corretiva única
3. Edge functions (criar/renomear/ajustar + config.toml + bucket Storage)
4. Pipeline endurecido + WhatsApp com link assinado
5. Frontend (dashboard, revisão, detalhe, integrações, templates, empresas)
6. Docs + checklist
7. Testes (golden set + curl) + build

Pronto para implementar quando aprovado.