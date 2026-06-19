## Diagnóstico

### 1) "Processar agora" não envia nada
O botão chama `run-guide-scan-now` **sem `guide_ids`**, então ele só varre a pasta do Drive em busca de arquivos novos. As duas guias que aparecem como `duplicada` e `nao_identificada` (TARIFA ZERO) já estão em subpastas (`duplicadas/`, `nao_identificadas/`) e têm `dedup_hash` salvo — a varredura as ignora. Resultado: clicar em "Processar agora" não reprocessa as guias paradas. Só novos PDFs disparariam o envio.

Além disso, a guia "nao_identificada" da TARIFA ZERO já tem `revisao_correcoes` aplicada (empresa correta, valor, vencimento, competência), mas ficou bloqueada por `dispatch_blocked_reason = "CNPJ invalido no PDF."` — o early-return de CNPJ inválido em `routeGuide` impediu o fallback FGTS por razão social na primeira passada. Hoje não há nada na UI que force o reprocesso individual dessas guias travadas.

### 2) Não consegue excluir guias com erro
- O botão "Excluir" só existe no card **Fluxo recente do Dashboard** (`GuideFlowRow`). Não existe na lista `/guias`, nem em `/guias/:id`, nem em Revisão Manual. Se o usuário está em `/guias` ou no detalhe, simplesmente não há botão.
- O Dashboard registrou no console (build anterior) `ReferenceError: GuideFlowRow is not defined`. Pode ser HMR antigo, mas vou validar com Playwright para garantir que o botão renderiza hoje.
- A função `delete-guia` tenta gravar em `guide_audit` colunas que não existem (`actor_user_id`, `payload`). A tabela tem `actor`, `action`, `before`, `after`. A insert falha mas está em try/catch, então a exclusão ainda funciona — porém o log de auditoria nunca é registrado.

## Plano de correção

### A. Reprocessar guias paradas a partir da UI
1. Em `GuideProvider.scan`: quando houver guias em status terminal mas reprocessáveis (`nao_identificada`, `duplicada`, `erro`, `revisao_manual` com `revisao_correcoes`), enviar `guide_ids` dessas guias junto com `run_full_pipeline: true` e `force_dispatch: true` para o `run-guide-scan-now`. Assim "Processar agora" passa a também reprocessar o que está travado.
2. Em `run-guide-scan-now`: quando `guide_ids` for fornecido com `force_dispatch`, ignorar `dedup_hash` e o bloqueio "duplicada por hash exato" para esses IDs (releitura autorizada), e reaplicar `revisao_correcoes` antes de rotear.
3. Confirmar que o fallback FGTS por razão social roda mesmo com `cnpj.status === 'invalid'` (já está no código, mas a guia em questão ficou com `decision_reason = "CNPJ invalido no PDF."` — validar com curl no edge function após o ajuste e ler logs).
4. Botão individual "Processar agora" no detalhe da guia (`GuiaDetalhe.tsx`) e na lista `/guias` — invoca `dispatch-guide` com `{ guide_id, force_dispatch: true, manual_approval: true }` para reprocessar apenas aquela guia.

### B. Excluir guias em todos os lugares
1. Adicionar botão "Excluir" (ícone lixeira + `AlertDialog`) em:
   - `src/pages/guias/Guias.tsx` — em cada linha/card da lista.
   - `src/pages/guias/GuiaDetalhe.tsx` — no header de ações, redirecionando para `/guias` após sucesso.
2. Garantir que o `GuideFlowRow` do Dashboard renderize sem erro (validar com Playwright e screenshot).
3. Corrigir `supabase/functions/delete-guia/index.ts` para gravar auditoria com as colunas reais (`actor`, `action`, `after` com `{motivo, file_name, status, tipo_guia}`), removendo `actor_user_id`/`payload`. Manter try/catch defensivo, mas dessa vez a inserção vai funcionar.

### C. Validação
- `bunx vitest run src/features/guias` para não regredir os testes do parser FGTS.
- Playwright: navegar `/`, `/guias`, `/guias/:id`, capturar screenshots dos botões de excluir/processar; clicar "Processar agora" e confirmar via `supabase--read_query` que a guia TARIFA ZERO mudou de `nao_identificada` → `pronta_envio` ou `enviada` e que `guia_envios` recebeu uma linha WhatsApp.
- `supabase--edge_function_logs run-guide-scan-now` para confirmar caminho do envio.

## Critérios de aceitação
- Em `/`, `/guias` e `/guias/:id` é possível excluir uma guia, com confirmação e auditoria gravada.
- Clicar em "Processar agora" reprocessa as guias paradas (`nao_identificada`, `duplicada`, `erro`) — a guia TARIFA ZERO atual deve sair de `nao_identificada` e gerar um envio WhatsApp para `+5555999699631`.
- Botão individual "Processar agora" funciona no detalhe e na lista.
- Build e testes existentes passam.

## Fora de escopo
- Mudanças no parser do PDF (CNJ parcial já é tratado pelo fallback de razão social).
- Mudanças no serviço WhatsApp em si.
