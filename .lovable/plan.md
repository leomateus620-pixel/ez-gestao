## Diagnóstico

A tela branca acontece quando o app monta, mas algo entre o `AuthProvider` e o conteúdo da página renderiza nada visível. Hoje a árvore é assim:

```text
QueryClientProvider
  TooltipProvider
    BrowserRouter
      AuthProvider        ← sem try/catch em getSession()
        AuthenticatedApp  ← se session, monta:
          DataProvider     ┐
          AutomationProvider│  ← TODOS fora do ErrorBoundary
          GuideProvider    ┘
            AppLayout
              ErrorBoundary   ← só protege as <Routes/>
                Suspense (lazy pages)
```

Três pontos podem deixar a tela em branco sem mostrar nada ao usuário:

1. **`AuthProvider.useEffect`**: `supabase.auth.getSession()` está sem `.catch`. Se a chamada rejeita (rede instável, token corrompido, Cloud em `COMING_UP`), `isLoading` nunca vira `false` e fica só o texto cinza "Verificando sessao..." — visualmente parece tela branca.
2. **Providers fora do ErrorBoundary**: `DataProvider`, `AutomationProvider` e `GuideProvider` executam várias `useQuery` no mount. Se qualquer `queryFn` lança de forma síncrona (ex.: import quebrado, mapper batendo em `null`), o erro sobe até o root sem fallback — tela 100% branca.
3. **`React.lazy` sem retry**: se um chunk falha (deploy novo, rede caiu no meio), `Suspense` exibe o fallback e o erro de import quebra a árvore até o ErrorBoundary, sem oferecer recarregamento.

A consequência conhecida: o `ErrorBoundary` atual fica abaixo dos providers, então qualquer falha de um provider ou de auth gera exatamente o sintoma reportado (branco).

## Mudanças

### 1. `AuthProvider` resiliente (`src/auth/AuthProvider.tsx`)
- Envolver `getSession()` em `try/catch`; em qualquer erro, setar `session = null` e `isLoading = false` para cair na tela de login.
- Adicionar timeout de segurança (ex.: 6 s): se `getSession()` não responde, libera o loading e mostra Login. Evita "verificando sessao" infinito.
- Logar o erro no console para diagnóstico.

### 2. ErrorBoundary global (`src/App.tsx`)
- Mover `ErrorBoundary` para englobar `AuthProvider` + providers (envolver `AuthenticatedApp`).
- Aceitar `fallback` opcional com botão "Recarregar" e "Voltar ao início" (estilo Liquid Glass) — usa apenas Tailwind, sem dependências adicionais.
- Manter o `ErrorBoundary` interno (dentro do `AppLayout`) para isolar falhas de rota sem derrubar o shell.

### 3. ErrorBoundary específico para providers
- Criar `ProvidersErrorBoundary` reaproveitando o componente atual, encapsulando `DataProvider / AutomationProvider / GuideProvider`. Em caso de erro, mostra um card explicando "Não foi possível carregar seus dados" + botão "Tentar novamente" (chama `queryClient.resetQueries()` e força re-render).

### 4. Lazy import com retry (`src/lib/lazy-retry.ts` novo)
- Helper `lazyRetry(factory, retries=2, delay=500)` que tenta reimportar o chunk se o primeiro falhar (cobre o caso clássico de deploy novo). Trocar todos os `lazy(() => import(...))` em `App.tsx` por `lazyRetry(() => import(...))`.
- Fallback do `Suspense` ganha estado "carregando há muito tempo" com botão de recarregar após ~8 s.

### 5. Fallback visual em vez de tela branca
- Atualizar o `ErrorBoundary` para sempre ter UI mínima visível (logo + mensagem + botões) — nunca renderizar `null`.
- Atualizar o estado "Verificando sessao" do `AuthenticatedApp` para o mesmo layout glass, evitando aparência de página vazia.

### 6. Logs e observabilidade leve
- `console.error` estruturado em todos os catches (`[auth]`, `[providers]`, `[lazy]`) para facilitar debug futuro pelos logs do navegador.
- Sem mudanças em backend / edge functions / banco.

## Escopo / Não-escopo
- Mudanças apenas no frontend (`src/auth`, `src/App.tsx`, `src/components/ErrorBoundary.tsx`, novo `src/lib/lazy-retry.ts`).
- Nenhuma alteração nas edge functions, migrations ou no fluxo de automação de guias já implementado.
- Não altera estilos globais; reaproveita tokens `liquid-stage` / `glass-card` existentes.

## Validação
- Abrir `/` deslogado → tela de Login renderiza normalmente.
- Forçar erro em `DataProvider` (mock temporário) → aparece card "Tentar novamente" em vez de branco.
- Simular falha de `getSession` → cai para Login em ≤6 s, sem branco.
- Conferir console: nenhum erro novo, mensagens `[auth] ...` quando aplicável.
