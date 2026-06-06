
## Causa raiz do "duplo carregamento"

Ao clicar em um menu, o usuário vê **dois loaders em sequência** dentro da mesma área `<main>`:

1. **Loader nº 1 — Suspense de rota (`LoadingFallback` em `src/App.tsx`)**
   Toda rota é `lazy()`. Enquanto o chunk JS baixa, o `<Suspense fallback={<LoadingFallback />}>` substitui o conteúdo principal por um spinner grande centralizado (`min-h-[60vh]`, com `liquid-stage`). Mesmo quando o chunk já está em cache (preload), há 1 frame de fallback porque `lazy()` resolve assíncrono.

2. **Loader nº 2 — loading interno da página**
   Logo após o Suspense liberar, a página monta com `animate-slide-in` (0.35s) e mostra seu próprio loader (ex.: `Guias.tsx` linha 124 → "Carregando guias", outras páginas usam padrão equivalente) enquanto `useDataStore`/`useGuides` ainda não terminaram a 1ª query. Em navegações posteriores, como `refetchOnMount: false` + `staleTime: 60s`, os dados já estão no cache, mas o flag `isLoading` ainda fica `true` por um frame se a query estiver inativa, e a animação `slide-in` se repete a cada troca de rota — reforçando a sensação de "recarregou tudo".

Componentes que **não** estão remontando (verificado em `App.tsx`): `QueryClientProvider`, `AuthProvider`, `DataProvider`, `GuideProvider`, `AppLayout`, `SmartNavigationShell`. O shell e providers ficam estáveis — o problema é **puramente visual**, dentro do `<main>`.

`AuthProvider` está OK: usa `cachedSession` e só seta `isLoading=true` quando não há cache. `onAuthStateChange` dispara apenas em mudanças reais; sessões idênticas não causam remount do app autenticado em navegação interna.

## O que mudar

### 1. `src/App.tsx` — Suspense fallback sutil e não-bloqueante
- Substituir o `LoadingFallback` cheio (spinner gigante centralizado) por um fallback **mínimo e localizado**: uma barra de progresso fininha no topo do `<main>` ou um placeholder transparente (`<div className="h-px" />`) que ocupe a área sem mostrar spinner durante o carregamento do chunk (que tipicamente leva < 100ms com preload).
- Manter o `LoadingFallback` antigo apenas para o estado `isLoading` do `AuthenticatedApp` (verificação de sessão sem cache).
- Adicionar preload no hover/focus dos itens do sidebar (chamando `loadX()` em `onMouseEnter`/`onFocus`) para que o chunk já esteja pronto antes do clique. Reusa o cache de `route-loaders.ts`.

### 2. Páginas com loader próprio — não mostrar loader se já há dados em cache
Em `src/pages/guias/Guias.tsx`, `Dashboard.tsx`, `Empresas.tsx`, `Envios.tsx`, `Alertas.tsx`, `Logs.tsx`, `FatorR.tsx`, `Classifica.tsx`, `guias/IntegracoesGuias.tsx`, `admin/WhatsApp.tsx`, `Configuracoes.tsx`:
- Só mostrar o loader interno quando `isLoading && dados.length === 0` (primeira carga absoluta).
- Em refetch em segundo plano, manter os dados antigos visíveis (stale-while-revalidate). Opcionalmente, marcador discreto (badge ou shimmer em header).
- Para o caso específico de `Guias.tsx`, expor `hasLoadedOnce` em `GuideProvider` (true depois da 1ª resposta de qualquer status) e usar isso no lugar de `isLoading` para o estado vazio inicial.

### 3. Animação `animate-slide-in` — aplicar só no primeiro mount real
- Remover `animate-slide-in` dos roots das páginas (ou movê-lo para um wrapper controlado por flag `useFirstMount` que só dispara 1x por sessão).
- Alternativa mais simples: reduzir duração da animação para 150ms e aplicar em elementos específicos (header), não no container inteiro — o conteúdo principal aparece estável.

### 4. Providers — separar `initialLoading` de `backgroundFetching` (opcional, baixo risco)
- `DataProvider`: trocar `isLoading` derivado de `loadingEmpresas || ...` por algo como `isInitialLoading` (verdadeiro apenas até a primeira resposta de cada query — usar `query.isPending && !query.data`).
- Atualmente `isLoading` do `useDataStore` não é consumido para bloquear a UI, então o impacto é só nas páginas que olham para isso.

### 5. Pré-carregar dados ao montar providers
- `DataProvider` e `GuideProvider` já disparam queries no mount global (não na rota). Bom. Vamos garantir que o sidebar não dispare nenhum loader visual enquanto isso ocorre.

## Validação

- **Manual no preview**: navegar entre `/empresas → /guias → /dashboard → /fator-r`; observar que não há mais 2 spinners em sequência e que o sidebar/shell ficam estáveis.
- **Testes E2E (`e2e/navigation.spec.ts`)**: adicionar caso que conta quantas vezes `[data-testid="route-fallback"]` aparece por navegação (deve ser ≤ 1) e verifica que `[data-testid="app-shell"]` permanece no DOM com o mesmo ID em todas as transições. Verificar `performance.getEntriesByType('navigation').length === 1` (sem reload real).
- **Build + testes**: `npm run build`, `npm run test`, `npm run test:e2e`.

## Fora de escopo

- Não tocar no `SmartSidebar` nem na lógica de menu expansivo.
- Não remover `lazy()` nem o cache de `route-loaders.ts`.
- Não alterar `AuthProvider` (já está correto com cache de sessão).
- Não criar topbar; não alterar rotas; não silenciar erros.

## Detalhes técnicos

```text
Antes:
  click menu
   └─ <Suspense fallback={LoadingFallback grande/centralizado}>   ← #1
        └─ Página monta (animate-slide-in)
             └─ loader interno "Carregando guias"                  ← #2
                  └─ conteúdo renderiza

Depois:
  click menu (chunk preloadado no hover)
   └─ <Suspense fallback={barra fina topo OR placeholder vazio}>
        └─ Página monta sem animação reset
             └─ se dados em cache → renderiza direto
                se 1ª carga absoluta → skeleton sutil dentro do card
```

Arquivos esperados a editar:
- `src/App.tsx` (novo fallback leve `RouteFallback`, manter `LoadingFallback` para auth)
- `src/navigation/components/SmartSidebar.tsx` (preload em hover/focus)
- `src/pages/guias/Guias.tsx`, `src/pages/Empresas.tsx`, `src/pages/Dashboard.tsx`, `src/pages/FatorR.tsx`, `src/pages/Classifica.tsx`, `src/pages/guias/IntegracoesGuias.tsx`, `src/pages/Envios.tsx`, `src/pages/Alertas.tsx`, `src/pages/Logs.tsx`, `src/pages/Configuracoes.tsx`, `src/pages/admin/WhatsApp.tsx` (condicionar loader a `!hasData`; remover ou neutralizar `animate-slide-in`)
- `src/features/guias/GuideProvider.tsx` (opcional: expor `hasLoadedOnce`)
- `src/data/DataProvider.tsx` (opcional: `isInitialLoading`)
- `e2e/navigation.spec.ts` (cenário anti-duplo-loader)
