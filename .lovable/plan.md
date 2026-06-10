## Finalizar pendências 1-3 do módulo Reforma Tributária

Objetivo: completar os 3 itens pendentes identificados na sessão anterior, sem mexer em layout, providers ou outros menus.

### 1. `src/features/tax-reform/persistence.ts` — Upload real no Storage

- Refatorar `uploadTaxReformDocumentFile`:
  - Se Supabase não estiver configurado ou `storage.upload` falhar → retornar `{ ok: false, error }`. **Remover** o fallback `local://arquivo`.
  - Em sucesso → retornar `{ ok: true, storagePath, storageBucket: 'tax-reform-documents', uploadedBy }`.
  - Persistir `upload_status = 'enviado'` apenas quando o upload real concluir; `'erro_upload'` em falha.
- Adicionar `getTaxReformDocumentSignedUrl(storagePath, expiresInSeconds = 3600)` usando `supabase.storage.from('tax-reform-documents').createSignedUrl(...)`.
- Atualizar `saveTaxReformDocument` para gravar `storage_path`, `storage_bucket`, `upload_status`, `uploaded_by`, `extraction_confidence`, `document_confidence_weight`.

### 2. `src/features/tax-reform/confidence.ts` — Nível de confiança

Novo módulo puro (testável):

- `computeConfidenceLevel(documents): 'baixa' | 'media' | 'alta'`
  - Considera apenas documentos com `uploadStatus === 'enviado'`.
  - 0 documentos principais → `baixa`
  - 1-2 → `media`
  - 3+ → `alta`
  - Combo **DRE + PGDAS + faturamento_cliente** força `alta` mesmo com contagem menor.
- `computeConfidenceReasons(documents)` retornando lista de strings para exibição.
- Persistir o nível em `tax_reform_analyses.confidence_level` ao salvar a análise.
- Adicionar testes em `confidence.test.ts`.

### 3. `src/pages/ReformaTributaria.tsx` — Painel Resultado

Editar **apenas** o painel de Resultado (sem redesenhar a tela):

- Badge de status da análise: **Preliminar** | **Confiável** | **Bloqueada** | **Revisão manual** (derivado de score + decisivas faltantes + confiança).
- Mostrar:
  - Score numérico (já existe, manter)
  - Lista de perguntas decisivas faltantes (bloqueia "Confiável")
  - Lista de documentos enviados com link via `getTaxReformDocumentSignedUrl` (abrir em nova aba)
  - Nível de confiança + razões (`baixa`/`media`/`alta`)
  - Recomendação + fatores (já existe)
  - Alertas (já existe)
  - Campo de parecer manual (textarea curto, salvo em `tax_reform_analyses.manual_review_notes`)
  - Decisão final consolidada

### Fora de escopo

- Layout/redesign da tela
- Providers, navegação, outros menus
- Pipeline real de extração de PDF (continua mock; apenas `extraction_confidence` é persistido)
- Mudanças de RLS (continua `authenticated`)

### Validação

- `bunx vitest run` (incluindo novos testes de `confidence.ts`)
- Smoke manual: preencher questionário → upload de DRE → ver URL assinada abrindo → confirmar badge muda de Preliminar para Confiável quando decisivas + 3 docs enviados.
- `supabase--read_query` em `tax_reform_documents` para confirmar `storage_path` e `upload_status='enviado'` gravados.
