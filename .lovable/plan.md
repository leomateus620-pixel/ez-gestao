## Diagnóstico provável

A tela branca acontece antes do login, então o ponto crítico é o boot do app: `main.tsx`, `App.tsx`, `AuthProvider` e `Login`.

Pelo que consegui verificar:
- O preview carregou a tela de login no meu teste, sem erro de console.
- Não há erro de Vite relevante nos logs.
- O fluxo pré-login depende de leitura do `localStorage` e inicialização da sessão no `AuthProvider`.
- Se algum erro acontecer antes do `ErrorBoundary` montar, ou se o elemento `#root` não existir/ficar indisponível, o app pode ficar branco sem fallback amigável.

## Plano de correção

1. **Blindar o boot em `src/main.tsx`**
   - Verificar se o elemento `#root` existe antes de renderizar.
   - Envolver o render inicial em `try/catch`.
   - Renderizar um fallback HTML simples se o React falhar antes de montar.

2. **Fortalecer o `AuthProvider`**
   - Tornar a leitura de sessão cacheada mais defensiva contra dados corrompidos no `localStorage`.
   - Limpar tokens inválidos/corrompidos em vez de deixar o boot quebrar silenciosamente.
   - Garantir que qualquer falha de `getSession()` sempre libere a tela de loading e mostre login/erro, nunca tela branca.

3. **Adicionar fallback pré-login seguro**
   - Se a autenticação travar ou falhar antes de existir sessão, exibir uma tela clara com botão de recarregar/tentar novamente.
   - Manter a tela de login funcionando normalmente quando não houver sessão.

4. **Validar no preview**
   - Abrir o app sem sessão.
   - Confirmar que a tela de login aparece.
   - Confirmar que não existem erros críticos no console.

## Escopo

Não vou alterar o card do Fator R nem regras de envio de e-mail nesta correção; o foco é somente eliminar a tela branca antes do login.