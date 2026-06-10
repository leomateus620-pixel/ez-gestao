## Objetivo

Corrigir duas falhas reais do módulo Reforma Tributária:

1. Sem documentos, o sistema joga para "Análise manual necessária" mesmo com questionário completo.
2. PDFs e planilhas anexadas não são lidos de verdade — a Edge Function `process-tax-reform-document` só faz `TextDecoder` em bytes brutos (não funciona para PDF) e marca XLSX/XLS como `nao_processavel`.

Sem mocks. Sem simulação. Erro real quando o arquivo não puder ser lido.

---

## Parte A — Recomendação preliminar sem documentos

### A.1 `src/features/tax-reform/recommendation.ts`
- Remover o fallback `return 'analise_manual_necessaria'` dos dois ramos finais (Simples e Lucro Presumido). Hoje, qualquer cenário "meio termo" (nem baixo complexidade B2C, nem forte pressão B2B) vira manual — isso quebra o caso de questionário completo sem documentos.
- Novo comportamento: nesse meio-termo, devolver a recomendação de permanência no regime atual (`permanecer_simples` / `permanecer_lucro_presumido`) como **preliminar**, baseada apenas no questionário.
- Manter `analise_manual_necessaria` apenas quando: regime inválido OU `riskLevel === 'dados_insuficientes'` (que já cobre perguntas decisivas faltantes e divergência crítica documento×questionário).

### A.2 `src/features/tax-reform/score.ts`
- `getMissingRequiredData`: continuar listando documentos faltantes, mas a flag `requireDocuments` passa a ser **informativa** (não vira "bloqueio"). Já está correto em `rules.ts` (`blockingMissingData` filtra `documento:`), apenas reconfirmar.

### A.3 `src/features/tax-reform/components/TaxReformWorkspace.tsx`
- Em `ScoreAndRecommendation`, ajustar o cálculo de `analysisStatus`:
  - `Bloqueada` → só quando `essentialMissing.length > 0` (perguntas decisivas).
  - `Revisão manual` → só quando `score.recommendation === 'analise_manual_necessaria'` OU houver alerta `document_divergence` crítico.
  - **`Preliminar`** → quando recomendação válida + sem documentos lidos (`uploaded.length === 0` ou nenhum `readingStatus === 'lido'`). Adicionar texto: "Análise baseada apenas no questionário. A conclusão pode mudar após a leitura dos documentos."
  - **`Final com documentos`** → recomendação válida + pelo menos 1 documento lido + confiança média/alta.
  - `Rascunho local` permanece quando `remotePersisted=false`.
- Card "Documentos pendentes" deve sempre listar os tipos faltantes nesse modo preliminar (já existe via `missingDocs`).

### A.4 `src/features/tax-reform/rules.test.ts`
- Atualizar o teste linha 187/200 ("preliminary recommendation … documents are absent"): esperar `permanecer_simples` (ou `permanecer_lucro_presumido` conforme regime) em vez de `analise_manual_necessaria`.
- Manter o teste linha 83 (regime inválido → manual) e o 231 (perguntas decisivas faltando → manual).

---

## Parte B — Leitura real de documentos (Edge Function)

### B.1 Reescrever `supabase/functions/process-tax-reform-document/index.ts`

Adicionar parsers reais via `npm:` specifiers:
- **PDF (texto)**: `npm:unpdf@0.12` (`extractText` — funciona em Deno/edge, sem worker nativo).
- **XLSX/XLS**: `npm:xlsx@0.18` (SheetJS) — `read(bytes, {type:'array'})` + `sheet_to_csv` por planilha. Concatenar CSVs e alimentar os mesmos extratores já existentes.
- **CSV/TXT**: TextDecoder (atual).
- **Imagens / PDF sem texto**: marcar `nao_processavel` com mensagem clara "Documento parece imagem/escaneado. OCR ainda não está disponível."

Fluxo:
1. Validar `Authorization` (header obrigatório, JWT do usuário — usar client com `SUPABASE_ANON_KEY` + Authorization para checar `auth.getUser()`; usar `SUPABASE_SERVICE_ROLE_KEY` apenas para escrita).
2. Buscar documento, `update reading_status='lendo'`.
3. Download do bucket.
4. Detectar tipo (extensão + MIME) e despachar para o parser.
5. Se PDF: tentar `unpdf.extractText`. Se texto resultante for vazio/curto (< 40 chars úteis) → `nao_processavel` com motivo "PDF sem camada de texto (provável escaneado)".
6. Se XLSX/XLS: extrair texto de todas as planilhas via SheetJS.
7. Chamar `extract(documentType, text)` (já existe e cobre DRE/PGDAS/Balancete/Faturamento por cliente/Fornecedores/Folha — não precisa reescrever, só está ganhando texto real).
8. Salvar `reading_status` (`lido` / `erro_leitura` / `nao_processavel`), `extracted_values`, `extracted_summary`, `extracted_findings`, `extraction_confidence`, `extraction_error`.
9. CORS: trocar `corsHeaders` local pelo import `npm:@supabase/supabase-js@2/cors`.

### B.2 Migration de schema (verificar/garantir colunas JSONB)
Já existem em `tax_reform_documents` (visto em `mapDocument`): `extracted_values`, `extracted_findings`, `extracted_summary`, `extraction_confidence`, `extraction_error`, `storage_path`, `storage_bucket`, `upload_status`, `uploaded_by`. **Confirmar** via `supabase--read_query` antes de criar migration; só criar se faltar coluna.

### B.3 Cliente
- `persistence.ts` `processTaxReformDocument` já chama `functions.invoke('process-tax-reform-document', { body: { document_id } })`. Confirmar que o `body` envia `document_id` (snake_case) que a função espera.
- `TaxReformWorkspace.tsx` `analyzeDocuments` já existe — manter. Adicionar mensagem distinta para `nao_processavel` (toast.info, não error).

### B.4 Cruzamento documentos × questionário
Já implementado em `document-analysis/reconcile.ts` + `documentScore.ts` + `alerts` (`document_divergence`). Após Parte B funcionar com dados reais, esse pipeline passa a operar automaticamente — sem código novo.

---

## Parte C — Validação real no preview

1. `bunx vitest run` (esperar testes ajustados em A.4 passarem; suite atual 40 testes).
2. No preview `/reforma-tributaria`:
   - **Teste 1**: cadastrar empresa Simples, responder questionário completo, **sem documentos** → resultado deve mostrar status `Preliminar`, recomendação `Permanecer no Simples` (ou similar), confiança baixa, documentos pendentes listados.
   - **Teste 2**: anexar DRE em XLSX real → clicar "Analisar documentos" → status `lido`, valores (receita, custos, margem) preenchidos.
   - **Teste 3**: anexar PGDAS PDF com texto → RBT12/alíquota extraídos.
   - **Teste 4**: anexar PDF escaneado → `nao_processavel` com mensagem OCR indisponível.
3. Recarregar a página: dados persistem (`tax_reform_documents.extracted_values` salvos via service_role).
4. Smoke test rápido nos outros menus (Dashboard, Guias, Classifica, Fator R, WhatsApp) para garantir que nada quebrou.

---

## Fora de escopo

- OCR (mensagem clara "indisponível" basta).
- Redesign de telas.
- Mexer em Classifica, Fator R, Guias, WhatsApp.
- Editar `supabase/integrations/supabase/client.ts` ou `types.ts`.
- Recriar componentes existentes (`reconcile.ts`, `documentScore.ts`, `alerts.ts` ficam intactos).

---

## Detalhes técnicos

**Arquivos modificados:**
- `src/features/tax-reform/recommendation.ts` (remover fallback manual)
- `src/features/tax-reform/components/TaxReformWorkspace.tsx` (status Preliminar)
- `src/features/tax-reform/rules.test.ts` (atualizar 1 expectativa)
- `supabase/functions/process-tax-reform-document/index.ts` (reescrita com unpdf + xlsx)

**Possível migration (só se colunas faltarem):** add `extracted_findings jsonb`, `extraction_confidence numeric`, etc. — checar antes.

**Dependências Edge Function:** `npm:unpdf@0.12`, `npm:xlsx@0.18` — ambos compatíveis com Deno via `npm:` specifier, sem `deno.json`.
