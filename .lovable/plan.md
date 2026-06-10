## Diagnóstico

As respostas do questionário **estão sendo salvas no Cloud** (confirmei 19 respostas da análise da Zimmermann com `updated_at` atual). O problema está no ciclo de carga/salvamento no frontend, em `src/features/tax-reform/components/TaxReformWorkspace.tsx`:

1. **Seed antigo do `localStorage` sobrescreve o Cloud**
   - `useState(loadLocalStore)` inicializa com a `seedStore` (empresa demo + respostas fictícias) ou com o snapshot antigo do `localStorage`.
   - O `useEffect` de persistência grava no `localStorage` em **toda** mudança de `store`, inclusive antes do fetch remoto chegar.
   - Se o usuário começa a interagir antes do `fetchTaxReformStore()` resolver, edits ficam em cima do seed e depois o `setStore(remoteStore)` apaga o que ele digitou. O inverso também: a montagem grava o seed no `localStorage`, "envenenando" recargas futuras.

2. **Debounce de 700ms perdido em reload/navegação**
   - O save remoto é feito com `setTimeout(..., 700)`. Se o usuário fecha a aba, recarrega ou troca de etapa antes desse intervalo, o `clearTimeout` cancela o save — as últimas respostas digitadas só ficam no `localStorage` (que depois é sobrescrito pelo remoto na próxima abertura).

3. **`saveTaxReformStore` nunca apaga respostas removidas**
   - Faz upsert por chave, mas se o usuário limpa um campo, a linha antiga continua no banco e "volta" no próximo load.

4. **`withDerivedScores` reaplica seed implicitamente**
   - `loadLocalStore` envolve qualquer payload em `withDerivedScores`, e o efeito derivado pode re-disparar `setStore`, criando saves redundantes que pisam no remoto recém-carregado.

## Correções

### `src/features/tax-reform/components/TaxReformWorkspace.tsx`

- **Iniciar com store vazio quando o backend está habilitado.**
  - Trocar o `useState(loadLocalStore)` por um estado inicial `emptyStore` (sem seed) e marcar `persistenceReady=false` até o fetch terminar.
  - Só cair no `localStorage`/`seedStore` se `isSupabaseConfigured === false` (modo offline).
  - Mostrar um loading discreto enquanto `persistenceReady` é falso para evitar edição em cima de dados que serão sobrescritos.

- **Bloquear o efeito de persistência até o fetch terminar.**
  - Manter a guarda `if (!persistenceReady) return;` também para o `localStorage.setItem` — hoje ele grava antes do remoto chegar.
  - Adicionar um ref `lastSavedStoreRef` e comparar via hash leve para evitar saves redundantes disparados por `withDerivedScores`.

- **Persistência granular e imediata no `setAnswer`.**
  - Em vez de depender só do debounce global, criar `persistAnswer(analysisId, key, value)` que:
    1. atualiza o store local;
    2. chama `upsertTaxReformAnswer` imediatamente (com `await` em background + toast em erro);
    3. cancela/encurta o debounce global para o restante do store.
  - Garante que cada alteração de campo já fica no Cloud antes do reload.

- **Flush em eventos críticos.**
  - Adicionar `useEffect` com listeners `beforeunload` e `visibilitychange === 'hidden'` que dispara `saveTaxReformStore` síncrono pendente (cancela debounce e executa).
  - Disparar flush também ao trocar de `step` no wizard e ao chamar `setSelectedAnalysisId(null)`.

- **Apagar respostas removidas.**
  - Em `saveTaxReformStore`/fluxo de save, comparar as chaves atuais com as do snapshot remoto e chamar `upsertTaxReformAnswer(..., '')` para as que sumiram, garantindo `DELETE` no banco.

### `src/features/tax-reform/persistence.ts`

- Em `fetchTaxReformWorkspace`, retornar também um `loadedAt` no resultado para o componente saber a versão (evita aplicar saves antigos depois de um fetch novo).
- Em `saveTaxReformStore`, aceitar opcional `{ previous: TaxReformStore }` e calcular o diff de respostas para emitir `DELETE` nas chaves removidas.

### Telemetria de depuração

- `console.info('[reforma-tributaria] fetch carregado', { analyses, answersTotal })` após o fetch.
- `console.info('[reforma-tributaria] save concluído', { analysisId, keys })` após cada upsert de resposta.
- Toast amigável quando o save falhar (já existe parcialmente, padronizar).

## Critérios de aceite

- Recarregar a página em `/reforma-tributaria` mantém **todas** as respostas digitadas no questionário (incluindo a última alteração feita imediatamente antes do reload).
- Limpar um campo no questionário e recarregar mantém o campo vazio (não "volta" a resposta antiga).
- Nenhuma resposta é sobrescrita pelo `seedStore` quando o backend está conectado.
- Saves não dependem mais do debounce de 700ms para alterações críticas; cada blur/change persiste no Cloud em < 1s.
- Nenhuma alteração de layout, do Dashboard, Documentos, Resultado ou Parecer manual.

## Arquivos a alterar

- `src/features/tax-reform/components/TaxReformWorkspace.tsx`
- `src/features/tax-reform/persistence.ts`

Sem migrations, sem alterar Edge Function, sem mexer no parser de documentos.
