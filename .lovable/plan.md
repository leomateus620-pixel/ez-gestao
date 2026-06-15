## Objetivo
Revalidar no Lovable Cloud o endurecimento do módulo Fator R sem alterar UI, rotas, tabelas ou nomes de Edge Functions. Apenas reimplantar as funções, rodar testes reais e produzir relatório.

## Etapas

### 1. Reimplantação
- Reimplantar `fator-r-process-upload` e `fator-r-drive-sync` via `supabase--deploy_edge_functions`.
- Conferir via `code--view` que ambas importam de `supabase/functions/_shared/fatorRParser.ts` (parser compartilhado).

### 2. Inspeção do parser e regras
- Ler `_shared/fatorRParser.ts` para confirmar:
  - faixas: `>=0,32` OK, `>=0,28 && <0,32` atenção, `<0,28` crítico;
  - `Não se aplica` retorna `not_applicable` sem alerta;
  - ausência de campo Fator R → `parse_error`/inconclusivo, sem inventar percentual e sem consolidar `fator_r_monthly_results`;
  - confiança mínima e timeout de 20s aplicados em `fator-r-process-upload`.

### 3. Testes funcionais reais
Para cada PDF abaixo, chamar `fator-r-process-upload` (com `persist=true` quando indicado) e verificar resposta + tabelas:

| Caso | PDF (fixture/real) | Esperado |
|---|---|---|
| A | Fator R > 32% | status `safe`, sem alerta |
| B | 28% ≤ Fator R < 32% | status `attention`, alerta atenção |
| C | Fator R < 28% | status `critical`, alerta urgente |
| D | "Fator r = Não se aplica" | status `not_applicable`, sem alerta |
| E | PDF sem campo Fator R | status `parse_error`, sem `monthly_results`, sem alerta |

Usar `supabase--curl_edge_functions` com PDFs de teste presentes em `src/services/fatorRParser.test.ts`/fixtures. Quando faltar fixture real, gerar payload mínimo com o texto correspondente.

### 4. Drive Sync
- Disparar `fator-r-drive-sync` via curl.
- Verificar com `supabase--read_query` em `fator_r_processing_logs`:
  - CNPJ do documento confere com `fator_r_companies` vinculada;
  - CNPJ divergente bloqueia gravação em `fator_r_monthly_results` e registra log de erro;
  - falha em mover para `Analisados` não cria/atualiza resultado mensal.

### 5. Validação no Supabase
Consultas com `supabase--read_query`:
- `fator_r_documents`: status por caso de teste.
- `fator_r_monthly_results`: apenas leituras válidas (sem casos D/E).
- `fator_r_alerts`: ausência de duplicatas (chave empresa+monthly_result+tipo+destinatário).
- Histórico: leituras de meses diferentes não se sobrescrevem.
- `fator_r_processing_logs`: presença dos eventos esperados.
- `information_schema`/`pg_indexes`: confirmar constraints únicas:
  - `fator_r_monthly_results (company_id, month, year)`
  - `fator_r_alerts (company_id, monthly_result_id, alert_type, recipient_email)`

### 6. Envio de alerta
- Forçar `dryRun=true` (manter `FATOR_R_EMAIL_DRY_RUN`).
- Confirmar via logs que somente `attention` e `critical` chamam `fator-r-send-alert`; `not_applicable` e `parse_error` não disparam.

### 7. Sanidade UI
- Abrir `/fator-r` via `browser--view_preview`; verificar console sem erros novos.

### 8. Entrega
Relatório final em chat com:
- Funções reimplantadas e hashes/horário do deploy.
- Tabela dos 5 PDFs testados × status esperado/obtido.
- Resultado do Drive Sync (CNPJ ok, divergente bloqueado, move-fail isolado).
- Consultas SQL executadas e contagens (documents, monthly_results, alerts, logs).
- Confirmação explícita: (a) Fator R ausente não é inventado; (b) "Não se aplica" não gera alerta crítico; (c) constraints únicas presentes; (d) `/fator-r` sem erros de console.

## Não-escopo
- Sem mudanças de código, schema, UI, rotas ou rename de funções.
- Sem novas migrations exceto se uma constraint obrigatória estiver faltando — neste caso, listar a lacuna no relatório e pedir aprovação antes de criar migration.
