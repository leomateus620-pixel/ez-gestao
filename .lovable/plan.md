## Problema identificado

O domínio publicado `ez-gestao.lovable.app` está retornando um HTML com apenas:

```html
<div id="root"></div>
```

sem o script JavaScript do React. Por isso o app nunca monta, o login não aparece e as proteções adicionadas em `main.tsx`/`AuthProvider` não chegam a executar. O problema está antes da autenticação: é carregamento/publicação do bundle.

## Plano de correção

1. **Adicionar fallback estático no `index.html`**
   - Inserir uma tela inicial mínima dentro de `#root`, antes do React carregar.
   - Se o script do app não for injetado/carregado, o usuário verá uma mensagem clara com botão de recarregar, em vez de tela branca.

2. **Adicionar detector de bundle não carregado**
   - Incluir um pequeno script inline no `index.html` que, após alguns segundos, verifica se o React substituiu o conteúdo inicial.
   - Se não substituiu, exibe: “Não foi possível carregar os arquivos do aplicativo”.
   - Isso cobre exatamente o caso atual: HTML publicado sem assets JS.

3. **Marcar montagem bem-sucedida no `main.tsx`**
   - Quando o React iniciar, gravar um atributo simples no `#root` indicando que o app montou.
   - Assim o fallback do `index.html` não aparece quando o app carregar corretamente.

4. **Ajustar fallback de erro fatal**
   - Manter o fallback já criado, mas fazê-lo também marcar o estado como erro carregado, evitando conflito com o detector do `index.html`.

5. **Validar no preview/publicado**
   - Verificar que, se o bundle carregar, aparece login/app normalmente.
   - Se o bundle não carregar, aparece uma tela de erro acionável em vez de branco.

## Observação importante

Essa correção elimina a tela branca e torna o erro visível. Como o HTML publicado atualmente parece estar sem scripts, depois da implementação pode ser necessário **publicar novamente** para o domínio `ez-gestao.lovable.app` receber o novo `index.html` e os assets corretos.