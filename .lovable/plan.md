## Objetivo

Fazer com que "Processar agora" execute o pipeline completo e dispare o envio automaticamente quando a guia estiver segura, inclusive para FGTS Digital identificado por razão social/alias. Hoje a guia chega em `pronta_envio` mas fica parada porque a configuração padrão (`auto_dispatch_enabled=false`, `operation_level=somente_classificacao`, `require_batch_approval=true`) bloqueia o dispatch, e o frontend não mostra o motivo real.

## Diagnóstico rápido

Em `supabase/functions/run-guide-scan-now/index.ts`:

- `routeGuide` (linhas ~495-516) marca `readyButAwaitingApproval=true` sempre que `operation_level` é `somente_classificacao`/`leitura_revisao`, `require_batch_approval=true` ou `auto_dispatch_enabled=false`. O padrão atual de `guide_test_config` cai em todos esses casos, então toda guia vai para `pronta_envio` "aguardando aprovação".
- `processOneGuide` (linhas ~1032-1051) também retorna sem dispatch quando `mode === "teste"`, sem distinguir teste com destinatário configurado vs. teste sem destinatário.
- Quando o usuário clica "Processar agora" no card, não há um sinal explícito de "rodar pipeline completo" — só o `force_dispatch` opcional, que existe mas não é usado pelo botão.
- O frontend (`Guias.tsx`, `GuiaDetalhe.tsx`) mostra `pronta_envio` como item de fila sem expor `dispatch_blocked_reason`.

## Mudanças (escopo focado, sem mexer no parser FGTS já aprovado)

### 1. Edge Function `run-guide-scan-now`

- Aceitar nova flag `run_full_pipeline: true` no body. Quando o botão "Processar agora" enviar essa flag:
  - Tratar como `forceDispatch = true` para fins de bypass de `auto_dispatch_enabled`, `operation_level` e `require_batch_approval` — desde que as validações de segurança (campos críticos, empresa ativa, sem duplicidade, template/destinatário/conector OK) passem.
  - Não bypass de: `mode=teste` (continua redirecionando para destinatário de teste), duplicidade, ambiguidade, valor acima do `high_value_threshold`, conector inativo.
- Em `routeGuide`, separar `awaiting_approval` em motivos discretos e gravar em `dispatch_blocked_reason` o motivo exato (`auto_dispatch_disabled`, `operation_level_blocks`, `requires_batch_approval`, `high_value_requires_approval`, `mode_test_preview_only`).
- Em modo `teste`, se `email_teste`/`whatsapp_teste` estiverem configurados e `run_full_pipeline=true`, executar dispatch real para o destinatário de teste e marcar `guia_envios.status = 'aceito'` com `modo='teste'` e `guias.status = 'enviada_teste'` (sem mover para Enviadas/produção). Senão, manter preview.
- Garantir que o caminho FGTS sem CNPJ completo já existente (com `matched` + `fgtsNameBased`) passa pela mesma porta de dispatch (já passa, é só não bloquear pelo flag).

### 2. Confiança FGTS

- Em `_shared/guide-parser.ts` (`calculateConfidence`), adicionar branch específico para `tipo='fgts'` quando `cnpj.status !== 'valid'` mas `match_method` está em {`exact_normalized_legal_name`, `alias_exact`, `exact_normalized_no_legal_terms`, `cnpj_raiz_unique`}: usar pesos solicitados (empresa 0.40, tipo 0.20, competência 0.15, vencimento 0.15, valor 0.10) — não penalizar pelo CNPJ ausente. Para `similarity` continua < 0.92.

### 3. Frontend

- `src/pages/guias/Guias.tsx` e `src/features/guias/useGuideOps.ts`: enviar `run_full_pipeline: true` quando o usuário clicar em "Processar agora" no card/dashboard. O botão "Scan rápido" existente continua sem a flag.
- `src/pages/guias/GuiaDetalhe.tsx` e o card da fila: mostrar `dispatch_blocked_reason` com mensagem legível, ex.:
  - `auto_dispatch_disabled` → "Identificada, envio automático desativado em Configurações"
  - `requires_batch_approval` → "Identificada, aguardando aprovação de lote"
  - `template_missing` / `destination_missing` → "Identificada, template/canal incompleto"
  - `mode_test_preview_only` → "Modo teste, preview gerado sem envio real"
- Em `Guias.tsx`, separar visualmente a fila operacional: `aguardando_processamento|processando|enviando` ficam em "Em processamento"; `pronta_envio` com `dispatch_blocked_reason` vai para "Identificadas aguardando configuração" com chamada para a página de Configurações; `revisao_manual|quarentena|erro|nao_identificada|duplicada` continuam em "Precisam de ação".

### 4. Auditoria

- Adicionar eventos `auto_dispatch_approved` e `auto_dispatch_blocked` em `guia_eventos` no momento da decisão (com o motivo exato). Os eventos já existentes (`dispatch_started`, `email_sent`, `whatsapp_sent`, `drive_move_finished`) permanecem.

### 5. Documentação

- Atualizar `docs/guias-automation.md` explicando o novo flag `run_full_pipeline`, os motivos discretos de bloqueio e o comportamento de modo teste com destinatário configurado.

## Fora de escopo

- Mudanças no parser FGTS (já entregues no turno anterior).
- WhatsApp Cloud API / templates Meta.
- Mudanças no schema do banco — usamos colunas já existentes (`dispatch_blocked_reason`, `decision_status`, `decision_reason`).
- Drive/Gmail/Reforma Tributária/Fator R/Classifica.

## Critérios de aceite

- Clicar em "Processar agora" no dashboard envia guias seguras em produção sem aprovação manual.
- FGTS Digital com razão social exata + demais campos válidos é enviado automaticamente.
- Modo teste com destinatário configurado envia para o destinatário de teste e marca `enviada_teste`.
- Guias bloqueadas mostram o motivo exato no card/detalhe.
- Match aproximado, ambiguidade, duplicidade, conector inativo e campos faltantes continuam bloqueando.
- Build/tests passam.
