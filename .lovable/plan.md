## Diagnóstico encontrado

1. **O envio não chegou ao WhatsApp porque o pipeline bloqueia antes de chamar o provedor.**
   - A guia FGTS Digital foi identificada com empresa, valor, vencimento e destinatário corretos.
   - Porém o validador ainda exige campos legados de WhatsApp/Twilio (`twilio_content_sid`) e placeholders obrigatórios como `[CNPJ]` e `[TIPO_GUIA]`.
   - Os templates atuais de WhatsApp não têm esses campos, então a guia é enviada para `duplicada`/revisão antes de qualquer chamada real ao WhatsApp.
   - Resultado: não existe registro em `guia_envios` para essas guias e a função de WhatsApp nem aparece nos logs.

2. **A duplicidade continua bloqueando o reprocessamento forçado.**
   - Existem duas guias com o mesmo PDF/hash (`0126060842429268-9.pdf`).
   - Mesmo com `force_dispatch`, o código ainda roda a detecção de duplicidade dentro do pipeline e transforma a guia em `duplicada` antes do envio.
   - Uma delas ficou em estado inconsistente: `status = processando`, mas `decision_reason = duplicidade`.

3. **A exclusão no “Fluxo recente” provavelmente não abre a confirmação.**
   - O card inteiro é um link absoluto.
   - O botão de lixeira chama `preventDefault()` dentro do próprio `AlertDialogTrigger`, o que pode impedir o Radix de abrir o modal de confirmação.
   - Como não houve log da função `delete-guia`, o clique não chegou ao backend.

4. **Há um problema adicional de schema/log.**
   - O código tenta gravar `detected_data_json` em `guia_excecoes`, mas essa coluna não existe na tabela atual.
   - Isso pode quebrar o fluxo em trechos onde uma exceção é registrada.

## Plano de correção

### 1. Corrigir o envio WhatsApp Meta Cloud API
- Atualizar `validateTemplateRender` para WhatsApp não exigir mais `twilio_content_sid`.
- Ajustar a validação de placeholders para aceitar templates Meta atuais e não bloquear FGTS Digital sem CNPJ completo quando a empresa foi identificada por razão social/alias seguro.
- Usar `meta_template_name` quando configurado e manter fallback controlado (`envio_guia_fiscal`) apenas se não houver nome definido.
- Registrar claramente no evento da guia se o envio foi chamado, aceito ou recusado pelo provedor.

### 2. Fazer `Processar agora` realmente reprocessar e enviar
- Quando `force_dispatch = true`, ignorar bloqueio de duplicidade para a guia selecionada/reprocessada.
- Se houver várias cópias do mesmo PDF, escolher uma guia “canônica” para envio e marcar as outras como excluídas/duplicadas sem bloquear a guia válida.
- Reaplicar as correções manuais já salvas (`revisao_correcoes`) antes da rota final.
- Garantir que FGTS Digital identificado por razão social exata/alias exato vá para envio quando os demais campos estiverem válidos.

### 3. Corrigir exclusão das guias no Dashboard e na fila
- Remover a sobreposição de link que compete com o botão de lixeira no `Fluxo recente`.
- Fazer o botão de excluir abrir o modal de confirmação corretamente.
- Após confirmar, chamar `delete-guia`, invalidar caches e remover visualmente a guia sem depender de reload manual.
- Manter os botões de excluir também em `/guias/fila` e no detalhe.

### 4. Corrigir a função `delete-guia`
- Garantir que ela apague em ordem segura:
  - envios
  - eventos
  - exceções
  - auditoria relacionada quando necessário ou auditoria final compatível
  - guia
- Ajustar qualquer escrita de auditoria para usar somente colunas reais.
- Retornar mensagens de erro mais claras para a UI caso algo bloqueie a exclusão.

### 5. Corrigir gravação de exceções
- Remover o campo inexistente `detected_data_json` das inserções em `guia_excecoes`, ou criar campo via migração se ele for necessário para auditoria.
- Para menor risco, vou manter os metadados detalhados em `guia_eventos.metadata_json`, que já existe.

### 6. Limpeza dos dois registros atuais
- Após aplicar a correção, remover os dois registros travados/duplicados mostrados no print ou deixar apenas um registro canônico para reprocessamento.
- Reprocessar a guia válida ponta a ponta.
- Confirmar no banco:
  - `guias.status = enviada` ou erro real do provedor registrado
  - `guia_envios` com canal `whatsapp`
  - destinatário `+5555999699631`
  - evento `whatsapp_sent` ou motivo exato da falha

### 7. Validação end to end
- Testar o clique de excluir no Dashboard e na fila.
- Testar `Processar agora` em guia travada.
- Conferir logs das funções `run-guide-scan-now`, `dispatch-guide`, `delete-guia` e `send-whatsapp-message`.
- Só considerar concluído quando houver envio registrado ou erro real do provedor WhatsApp visível na auditoria.