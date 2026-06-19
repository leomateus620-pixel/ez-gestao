## Objetivo

Remover a confiança (score) como bloqueio para envio automático. A identificação da empresa (por CNPJ **ou** razão social cadastrada em Empresas) passa a ser suficiente. O canal de envio continua vindo de `empresas.canal_preferido` (e‑mail ou WhatsApp). Validar end‑to‑end disparando a guia atual (`GuiaPagamento_21205304000165_…`, DARF 05/2026) para o WhatsApp **+55 55 99969‑9631** via Meta Cloud API.

## O que está bloqueando hoje

`supabase/functions/_shared/guide-parser.ts` marca o campo `tipo_guia` como **dubious** sempre que `classification.confidence < 0.92` (linha 804‑806). Em seguida, `supabase/functions/run-guide-scan-now/index.ts` (linhas 470‑487) joga a guia para `revisao_manual` por duas razões independentes:

1. Qualquer campo crítico `dubious` → `revisao_manual` com motivo `*_dubious` (foi exatamente isso na auditoria: "Tipo de guia sem confiança suficiente para envio automático").
2. `confidence_score < MIN_CONFIDENCE_AUTO_DISPATCH` → `revisao_manual` (`low_confidence_*`).

Por isso a guia caiu em revisão manual mesmo com CNPJ válido, empresa ativa e tipo classificado.

## Mudanças

### 1. Identificação manda, score não bloqueia

`supabase/functions/_shared/guide-parser.ts`
- `tipo_guia` deixa de ser `dubious` por baixa confiança: sempre `validField` quando há classificação (incluindo `outros`), com `justification` informando o score. Mantém `dubious` apenas se a classificação não conseguiu identificar nenhum sinal (`matchedKeywords` vazio E `tipo = outros`).
- Remover o issue `guide_type_low_confidence` da validação (era só ruído, virava bloqueio na função de scan).

`supabase/functions/run-guide-scan-now/index.ts`
- Remover o branch que coloca em `revisao_manual` quando `classification.confidence < MIN_CONFIDENCE_AUTO_DISPATCH || confidence < MIN_CONFIDENCE_AUTO_DISPATCH` (linhas 478‑487). A confiança continua sendo gravada em `confidence_score` para auditoria, mas **não bloqueia**.
- Manter os bloqueios reais de segurança: empresa não identificada / inativa / ambígua, duplicidade, canal/conector inválido, template/destinatário ausente, valor acima do `high_value_threshold`. Esses continuam exatamente como estão.

Resultado: se a empresa foi identificada (`matched.empresa` ativa) e o canal preferido tem conector ativo e destinatário válido, a guia segue direto para `pronta_envio` + dispatch — independente do score.

### 2. Teste end‑to‑end no número +55 55 99969‑9631

- Atualizar o secret `WHATSAPP_TEST_TO` para `+5555999699631` (substitui o valor atual de testes).
- Rodar `run-guide-scan-now` com `{ run_full_pipeline: true, force_dispatch: true }` para a guia DARF 05/2026 (id `21.205.304/0001-65`), em modo teste. Isso usa a configuração atual de modo teste e dispara via `send-whatsapp-message` → Meta Cloud API para o `WHATSAPP_TEST_TO`.
- Conferir resposta da Meta (`message_id`), `guia_envios.provider_status` e `guia_eventos` para confirmar `enviada_teste`.

## Fora de escopo

- Mudar lógica de identificação por razão social (FGTS) — já existe e continua valendo.
- Webhook do WhatsApp, Drive/Gmail, Fator R, Reforma Tributária, Classifica.
- Alterações de schema.

## Confirmação rápida

O teste será **em modo teste** (não move o PDF para a pasta de Enviadas de produção e marca a guia como `enviada_teste`). Confirma que pode trocar o `WHATSAPP_TEST_TO` para `+5555999699631`?