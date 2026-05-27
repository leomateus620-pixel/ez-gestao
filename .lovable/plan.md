## Diagnóstico

No preview que consegui abrir agora, a aplicação não está totalmente branca: ela cai na tela de login. Porém, os sinais indicam um problema real de disponibilidade no fluxo de entrada: não há requisições `fetch/xhr` de autenticação visíveis e, se a sessão não for restaurada ou expirar, o app libera o usuário para o login em vez de manter/recuperar a sessão. Além disso, a proteção atual ainda pode ser fortalecida porque erros assíncronos de carregamento de dados não necessariamente acionam o `ErrorBoundary`.

## Plano de correção

1. **Adicionar estado de bootstrap robusto de autenticação**
   - Trocar o timeout simples por uma estratégia com `Promise.race`, estado explícito de erro/timeout e mensagem visual clara.
   - Não deixar o sistema parecer “branco” quando a sessão estiver demorando: mostrar uma tela de carregamento com ação de tentar novamente/recarregar.
   - Registrar logs estruturados para falhas de sessão.

2. **Evitar queda silenciosa nos providers de dados**
   - Configurar `QueryClient` com `retry`, `staleTime` e tratamento global de erros para evitar que falhas transitórias derrubem a experiência.
   - Nos providers principais, expor estado de erro/indisponibilidade em vez de apenas arrays vazios quando uma consulta falhar.

3. **Criar um fallback de disponibilidade para o app autenticado**
   - Se dados críticos falharem, mostrar card Liquid Glass com “Tentar novamente” e “Recarregar app”, mantendo a navegação protegida quando possível.
   - Evitar que Dashboard/menus dependam de dados ainda indefinidos para renderizar.

4. **Aprimorar `ErrorBoundary` para erros de import/chunk e providers**
   - Melhorar a tela de erro para incluir botão de voltar ao login/início quando aplicável.
   - Manter `lazyRetry`, mas limpar caches/forçar reload em caso de falha persistente de chunk.

5. **Validar no preview**
   - Abrir `/` deslogado e confirmar que a tela de login aparece.
   - Simular carregamento lento/falha de sessão e confirmar que aparece fallback visível.
   - Conferir console/rede depois da alteração para garantir que não há erro de runtime causando tela branca.

## Arquivos previstos

- `src/App.tsx`
- `src/auth/AuthProvider.tsx`
- `src/components/ErrorBoundary.tsx`
- Possível ajuste pequeno em `src/data/DataProvider.tsx`, `src/data/AutomationProvider.tsx` e/ou `src/features/guias/GuideProvider.tsx` para expor erros sem derrubar a renderização.