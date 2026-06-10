Limpar avisos de infraestrutura visíveis na UI e adicionar remoção de documentos no módulo Reforma Tributária.

1. Remover banners e badges de “Modo local / Supabase / cache / sincronizar”
- Em `TaxReformWorkspace.tsx`, remover os dois cards amarelos "Modo local: alterações não estão salvas na nuvem" (dashboard e wizard) e o botão "Tentar sincronizar".
- Remover o badge `Supabase | Local | Salvando…` do header do wizard e o badge com `syncMessage` no header do dashboard.
- Remover o card "Persistência e auditoria" que expõe mensagem de sincronização.
- Remover o estado `Rascunho local` do painel de Resultado — passa a tratar persistência como sempre na nuvem.
- Trocar toasts internos que citam Supabase/cache/rascunho por mensagens neutras (ex.: "Não foi possível salvar agora, tente novamente").
- Estado `syncStatus`/`syncMessage` continua existindo internamente apenas para controle, sem exposição na UI.

2. Adicionar opção de remover documento anexado
- Em `persistence.ts`, criar `deleteTaxReformDocument(document)` que apaga o arquivo do bucket `tax-reform-documents` (quando houver `storagePath`) e remove o registro de `tax_reform_documents`.
- Em `TaxReformWorkspace.tsx`, na lista de documentos do `DocumentUpload` e do painel de Resultado, adicionar botão ícone (lixeira) com confirmação simples. Ao confirmar:
  - chamar `deleteTaxReformDocument`;
  - remover o documento do `store.documents` no estado;
  - mostrar toast neutro "Documento removido".
- Cobrir também documentos com erro de upload (apenas remoção do estado, sem chamada de Storage).

3. Toasts e mensagens permanecem em linguagem de negócio
- Substituir referências a "Supabase", "nuvem", "cache", "rascunho local", "sincronizar" por mensagens funcionais ("Análise salva", "Não foi possível salvar agora", "Documento removido").
- Logs `console.*` internos podem permanecer (não aparecem na UI).

4. Validação
- Rodar `bunx vitest run` para garantir que nada quebrou.
- Conferir no preview `/reforma-tributaria` que:
  - não existem mais avisos amarelos nem badges de Supabase/Local;
  - documentos anexados podem ser removidos da lista;
  - o restante do módulo continua funcionando (upload, análise, resultado, parecer).

Arquivos afetados:
- `src/features/tax-reform/components/TaxReformWorkspace.tsx`
- `src/features/tax-reform/persistence.ts`