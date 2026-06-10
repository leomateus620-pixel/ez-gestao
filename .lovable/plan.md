## Diagnóstico

A folha aparece com "Erro na leitura — Edge Function returned a non-2xx status code", mas a consulta direta na tabela `tax_reform_documents` mostra **apenas 2 linhas** (PGDAS e DRE). A folha **não está persistida** no banco. Causa:

- O upload do arquivo grava o PDF no Storage e atualiza o estado local imediatamente.
- A persistência da linha em `tax_reform_documents` acontece apenas no `saveTaxReformStore`, **debounced em 700 ms** dentro do `useEffect` de `TaxReformWorkspace`.
- Quando o usuário clica "Analisar documentos" logo após o upload, o debounce ainda não rodou → a linha não existe no banco → a Edge Function faz `select(...).single()` → o `.single()` lança erro de "no rows" → o `catch` devolve **500 genérico "Erro inesperado na leitura."** sem log.

Por isso o PGDAS e o DRE (que foram enviados em sessão anterior, já sincronizados) leem normalmente, e a folha (novo upload) falha sempre na primeira tentativa.

Secundariamente, o `catch` da Edge Function não tem `console.error`, então o painel de logs não mostra nada — diagnóstico cego.

## Correções

### 1. Persistir o documento no banco imediatamente após o upload
Em `TaxReformWorkspace.tsx`, no handler de upload (logo após `uploadTaxReformDocumentFile` retornar `ok`), chamar `upsertTaxReformDocument(novoDoc)` antes de inserir no estado, com `await`. Falhas marcam o doc como `erro_upload` com mensagem clara. Assim a linha existe no banco antes do botão "Analisar" estar disponível.

### 2. Garantir sincronização antes de analisar
Em `analyzeDocuments`, antes do loop de `processTaxReformDocument`, para cada documento elegível rodar `await upsertTaxReformDocument(doc)` (idempotente). Isso protege contra qualquer documento que ainda esteja só em memória.

### 3. Diagnóstico e mensagens reais na Edge Function
Em `supabase/functions/process-tax-reform-document/index.ts`:
- Adicionar `console.error('[process-tax-reform-document]', { documentId, message, stack })` no `catch` final.
- Trocar `.single()` por `.maybeSingle()` e, se vier `null`, devolver **404** com mensagem específica "Documento `<id>` não encontrado no banco. Aguarde a sincronização e tente novamente." (em vez de cair no catch genérico 500).
- Logar também falhas de `storage.download`, `decodeText`, e o resultado de `extract` (tipo, confiança, warnings) para futura auditoria.

### 4. UX da falha
No `catch` do `analyzeDocuments` em `TaxReformWorkspace.tsx`, se a mensagem incluir "não encontrado", aguardar 1s, rodar `upsertTaxReformDocument` e tentar de novo (1 retry). Caso contrário, manter o comportamento atual de marcar como `erro_leitura`.

## Detalhes técnicos

Arquivos alterados:
- `src/features/tax-reform/components/TaxReformWorkspace.tsx` (upload handler + analyzeDocuments)
- `supabase/functions/process-tax-reform-document/index.ts` (maybeSingle, console.error, mensagens específicas)

Sem mudança de layout, sem mexer em parsers ou regras de score. O parser da folha (`parsePayrollTotals`) já está coberto pelos testes e produz os valores corretos para a fixture Zimmermann; portanto só precisamos garantir que ele **seja efetivamente chamado** com o documento certo no banco.

## Verificação
- Após implementar, re-executar a análise no preview. Esperado:
  - Folha lê em uma única tentativa.
  - Caso real de erro retorna mensagem específica no toast e nos logs da função (não mais "Erro inesperado").
- Rodar `bunx vitest run` para garantir que os testes existentes continuam passando.
