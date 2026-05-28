
## Diagnóstico — por que a tela fica branca antes dos menus aparecerem

Investiguei a cadeia de inicialização (`src/App.tsx` → `AuthProvider` → `DataProvider` + `AutomationProvider` + `GuideProvider` → `AppLayout`/`SmartSidebar` → rota lazy). Encontrei **4 causas combinadas**:

### 1. `AuthProvider` bloqueia a UI inteira até `getSession()` responder
`src/auth/AuthProvider.tsx` inicia com `isLoading=true` e enquanto isso o app mostra apenas "Verificando sessão..." (sem sidebar, sem nada). O timeout máximo é 6s, mas mesmo em condições normais a chamada de rede leva 300–1500ms — todo esse tempo é tela branca/spinner, **mesmo quando já existe uma sessão válida em cache no localStorage**.

### 2. 17 queries Supabase disparadas em paralelo antes do primeiro paint
Quando o app finalmente passa do auth, os três providers montam ao mesmo tempo e disparam simultaneamente:
- `DataProvider`: empresas, cnds, documentos, envios, alertas, logs (500), auditTrail (500) — 7 queries
- `AutomationProvider`: connectors, runs (500), exceptions, batches, healthLogs (200) — 5 queries
- `GuideProvider`: guias, guia_envios, guia_excecoes, guia_eventos, integracoes_guias — 5 queries

Essa rajada satura o pipeline HTTP/2 e bloqueia o thread principal com 17 deserializações + mapeamentos enquanto o React tenta pintar. A `SmartSidebar` consegue renderizar com counters zerados, mas o jank atrasa o paint.

### 3. Dashboard é lazy — chunk separado precisa baixar antes de mostrar conteúdo
`Dashboard` (rota `/`) é importado com `lazyRetry`, então no primeiro carregamento o usuário vê o sidebar com a área principal em fallback de loading enquanto o chunk de Dashboard chega.

### 4. Queries pesadas e raramente vistas rodam toda visita
`logs(500)`, `auditTrail(500)`, `connector_runs(500)`, `health_logs(200)`, `guia_eventos`, `batches` — nada disso é necessário para mostrar os menus, mas competem com as queries críticas.

---

## Plano de correção

### Passo 1 — Bootstrap de autenticação otimista (`src/auth/AuthProvider.tsx`)
- Inicializar `session` lendo sincronamente do localStorage (chave `sb-<ref>-auth-token` que o supabase-js já persiste).
- Se houver sessão em cache: `isLoading=false` imediatamente; o `getSession()` continua em background para validar/atualizar, e `onAuthStateChange` ajusta se preciso.
- Reduzir o timeout de 6s para 3s.
- Resultado: usuários autenticados pulam a tela "Verificando sessão..." em 100% dos casos (paint imediato).

### Passo 2 — Adiar queries não-críticas para o menu
Marcar como `enabled: false` (carregam só quando o usuário entra na rota correspondente) ou aumentar `staleTime` para nunca refetchar no mount:

| Provider | Query | Ação |
|---|---|---|
| DataProvider | `logs`, `auditTrail` | `enabled: false` (carregar dentro de `/logs`) |
| AutomationProvider | `connector_runs`, `health_logs`, `batches` | `enabled: false` (carregar em `/execucoes`, `/automacao`) |
| GuideProvider | `guia_eventos` | `enabled: false` (carregar em `/guias/:id`) |

Para isso, expor um helper `useEnableHeavyQuery(key)` que cada página chama no mount; ou simplesmente fazer cada página rodar seu próprio `useQuery` paralelo (sem mexer no shape do contexto, passando dados via context só quando carregados). Implementação mais simples: usar `enabled` controlado por um flag global em context, ativado pelo `useEffect` da página.

Resultado: rajada inicial cai de **17 → 9 queries**, e as 9 restantes são pequenas (counts/listas curtas).

### Passo 3 — Dashboard sem lazy
`src/App.tsx`: importar `Dashboard` diretamente (não via `lazyRetry`). É a rota raiz, todo mundo abre nela primeiro — não faz sentido pagar o custo do chunk separado. Demais rotas continuam lazy.

### Passo 4 — Pré-carregar chunks das rotas mais usadas
Após auth resolver, disparar `import('./pages/Guias')` e `import('./pages/Empresas')` em background (sem await). Isso aquece o cache para o próximo clique no menu sem afetar o paint inicial.

### Passo 5 — `staleTime` agressivo em counters
Aumentar `staleTime` das 9 queries críticas restantes para 60s (atualmente 30s no QueryClient global) e setar `refetchOnMount: false`. Counters do menu não precisam ser segundo-a-segundo.

---

## Resultado esperado
- Tempo até menus aparecerem: ~1.5–3s → **< 200ms** (sessão em cache).
- Sem rajada de 17 requests no DevTools Network no boot.
- Dashboard aparece junto com o sidebar (sem fallback de loading).
- Páginas de logs/execuções carregam seus dados pesados só quando visitadas.

## Fora de escopo
- Não mexer no design dos menus / shell.
- Não alterar lógica de Fator R, parser, e-mail, Drive.
- Não trocar React Query nem Supabase client.
