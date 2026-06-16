
## Objetivo
Transformar o módulo Guias num pipeline confiável: operador joga PDFs em **Guias/A Enviar** → sistema identifica empresa/tipo/competência/vencimento/valor → valida → envia individualmente por e-mail e/ou WhatsApp Twilio → move para **Guias/Enviadas/[Empresa]/[AAAA-MM]/** → registra tudo. Casos duvidosos vão para Revisão Manual, duplicatas para Duplicadas, erros para Erros, sem CNPJ para Não Identificadas.

## 1. Banco (uma migration)

### 1.1 Empresas — campos faltantes
- `aliases TEXT[]` (nomes alternativos para fallback de identificação)
- `regra_envio_especial TEXT` (livre)
- canal `'ambos'` adicionado ao enum `canal_preferido`

### 1.2 Guias — campos novos
- `confidence_score NUMERIC(3,2)` (0-1)
- `tipo_guia_confidence NUMERIC(3,2)`
- `tipo_guia` passa a usar enum: `das|fgts|daf|darf|gps_inss|iss|icms|outros`
- `valor_extraido_raw TEXT`, `codigo_barras TEXT`, `identificador_guia TEXT`
- `dedup_hash TEXT` (sha256 de cnpj+tipo+competencia+valor+vencimento) com UNIQUE parcial (status != 'duplicada')
- `pasta_atual` aceita: `a_enviar|enviadas|revisao_manual|nao_identificadas|erros|duplicadas`
- `status` ganha: `pronta_envio`, `nao_identificada`, `duplicada`
- `revisao_correcoes JSONB` (histórico de correções manuais para aprendizado)
- `modo TEXT` ('teste'|'producao')

### 1.3 Tabelas novas
- `guide_templates`: `tipo_guia`, `canal` (email|whatsapp), `assunto`, `corpo`, `twilio_content_sid`, `ativo`, `updated_by` — chave única `(tipo_guia, canal)`.
- `guide_test_config` (single-row): `modo_global` ('teste'|'producao'), `email_teste`, `whatsapp_teste`, `updated_at`.
- `guide_batch_runs`: agrega métricas de cada varredura (id, started_at, finished_at, total, identificadas, enviadas, revisao, erros, duplicadas, modo).

### 1.4 Integrações
- Em `integracoes_guias` adicionar colunas: `review_folder_id`, `not_identified_folder_id`, `errors_folder_id`, `duplicates_folder_id`. Manter `sent_folder_id` como raiz de **Enviadas**.

### 1.5 Auditoria
- Tabela `guide_audit` enxuta: `guia_id`, `actor` (system|user_id), `action`, `before JSONB`, `after JSONB`, `created_at` — usada por revisão manual e correções.

Todas com `GRANT` para `authenticated`/`service_role` + RLS via `has_role(auth.uid(),'admin'|'operator')`.

## 2. Estrutura no Drive

Edge function `bootstrap-guide-folders` (renomear/expandir `bootstrap-test-folder`):
- Garante árvore `Guias/{A Enviar, Enviadas, Revisão Manual, Não Identificadas, Erros, Duplicadas}` na conta do conector Google Drive.
- Persiste IDs em `integracoes_guias`.
- Em **Enviadas**, cria subpasta `[Razão Social — CNPJ]/[AAAA-MM]/` sob demanda no momento do envio.
- A entrada continua sendo **somente** `A Enviar`.

## 3. Pipeline de processamento

### 3.1 Scan (`run-guide-scan-now`)
- Lista somente PDFs em `A Enviar` (via gateway Google Drive).
- Para cada arquivo: insere `guias` com `status='aguardando'`, `sha256` para dedup de arquivo idêntico.
- Enfileira processamento. Limite de concorrência configurável (default 5).

### 3.2 Process (nova `process-guide`)
Camadas:
1. **Extração nativa** (PDF.js/pdf-parse via Deno) — sem OCR. PDF sem camada de texto → `pasta_atual='erros'`, exceção `pdf_without_text_layer`.
2. **Regex agressivo** para CNPJ (formatado/não), razão social, competência (`MM/AAAA`, `mes/aaaa`), vencimento (`dd/mm/aaaa`), valor (R$/numérico), código de barras (44/47 dígitos), identificadores DAS/DARF.
3. **Classificação de tipo** — função `classifyGuideType(text)` por palavras-chave + cabeçalhos:
   - DAS: "Documento de Arrecadação do Simples" / "DAS"
   - FGTS: "FGTS Digital" / "Guia do FGTS"
   - DAF: "DAF" / "Documento de Arrecadação Federal"
   - DARF: "DARF" / "Receita Federal"
   - GPS/INSS: "GPS" / "Previdência Social"
   - Outros: ISS, ICMS por município/UF.
   Retorna `{tipo, confidence}`.
4. **Cruzamento CNPJ** com `empresas` (chave primária) + fallback por razão social/aliases.
5. **Cálculo `confidence_score`** ponderado (CNPJ 0.4, tipo 0.2, competência 0.15, vencimento 0.15, valor 0.1).
6. **Roteamento**:
   - 0 CNPJ → `nao_identificada` + move para **Não Identificadas**.
   - ≥2 CNPJs distintos → `revisao` + **Revisão Manual**.
   - CNPJ ok mas empresa inexistente/inativa → `revisao` + **Revisão Manual**.
   - `confidence_score < 0.75` → `revisao` + **Revisão Manual**.
   - `dedup_hash` colide com outra guia já enviada/pronta → `duplicada` + **Duplicadas**.
   - Tudo ok → `pronta_envio`, segue para dispatch.

### 3.3 Dispatch (`dispatch-guide`, individual)
Pré-checks obrigatórios: empresa, CNPJ validado, tipo, competência, vencimento, valor, destinatário, canal, conector ativo.
- Lê `guide_test_config.modo_global`. Se **teste**, sobrescreve destinatário para `email_teste`/`whatsapp_teste` e prefixa "[TESTE]".
- Renderiza template de `guide_templates` (placeholders `[EMPRESA] [CNPJ] [TIPO_GUIA] [COMPETENCIA] [VENCIMENTO] [VALOR]`).
- E-mail: Gmail connector com PDF anexado.
- WhatsApp: Twilio Content SID + media URL assinada temporária.
- Idempotência via `idempotency_key = sha256(guia_id+canal+modo)`.
- **Um envio por guia.** Nunca agrupa.
- Após sucesso em produção: move PDF para `Enviadas/[Empresa]/[AAAA-MM]/`. Em teste: não move (fica em A Enviar para reprocesso).

### 3.4 Webhook Twilio
Mantém atualização de status delivered/failed em `guia_envios`.

## 4. Frontend

### 4.1 `/guias` (Dashboard refeito)
- Badge grande **MODO: TESTE** (amarelo) vs **PRODUÇÃO** (verde) com toggle (admin).
- Cards: aguardando, em revisão, prontas, enviadas, erros, duplicadas, não identificadas.
- Tempo médio de processamento, taxa por canal, último batch run.
- Status dos 3 conectores (Drive/Gmail/Twilio) com botão "Testar conexão".
- Botão "Varredura agora" e "Reprocessar lote".
- Lista paginada com filtros por status/empresa/tipo/competência.

### 4.2 `/guias/revisao` (nova tela)
Para cada guia em revisão:
- Preview PDF (link Drive + embed).
- Dados extraídos editáveis: empresa (select com busca), tipo, competência, vencimento, valor.
- Confidence score por campo.
- Ações: **Aprovar e enviar**, **Aprovar sem enviar**, **Marcar como erro**, **Reprocessar**.
- Salva correção em `revisao_correcoes` + `guide_audit`.

### 4.3 `/guias/:id` (existente)
- Timeline de eventos.
- Histórico de envios e tentativas.
- Botão reprocessar/reabrir revisão.

### 4.4 `/configuracoes` — aba Templates de Guias
- CRUD por tipo×canal, preview com dados fake, validação de placeholders.

### 4.5 `/integracoes`
- Mostra status real de cada conector.
- Mostra IDs de todas as 6 pastas Drive, com botão "Recriar estrutura" (chama `bootstrap-guide-folders`).
- "Testar envio" (e-mail/WhatsApp para destinatário de teste).

### 4.6 `/empresas` — formulário
- Novos campos `aliases` (chips), `regra_envio_especial`, canal `ambos`.

## 5. Modo Teste — comportamento
- Toggle global em `/guias` (single-row `guide_test_config`).
- Em teste: dispatch envia para `email_teste`/`whatsapp_teste`, **não move** PDFs, marca `guias.modo='teste'`, registra batch.
- Painel mostra "X guias processadas em teste, 0 entregues a clientes".
- Pode rodar lote de 100+ sem risco.

## 6. Não-escopo
- Sem OCR externo (PDF sem texto vai para Erros).
- Sem retoque visual amplo fora das telas listadas.
- Tabelas `fator_r_*` e `tax_reform_*` intocadas.

## 7. Entregáveis técnicos
1. 1 migration consolidada (Seção 1) + GRANTs/RLS.
2. Edge functions: `bootstrap-guide-folders`, `process-guide`, `dispatch-guide`, `test-guide-connection`. Refatorar `run-guide-scan-now` e aposentar lógica antiga em `dispatch-empresa-guias` para guias.
3. Helpers compartilhados em `supabase/functions/_shared/guide-parser.ts`, `_shared/guide-classifier.ts`, `_shared/guide-templates.ts`, `_shared/drive-paths.ts`.
4. Front: novas páginas/telas (Seção 4), atualização do `GuideProvider` para expor `modoGlobal`, ações de revisão e métricas.
5. Testes: vitest para parser/classifier/dedup; deno test para dispatch em modo teste.

## 8. Critérios de aceite (resumo)
- 1 pasta de entrada, identificação por CNPJ, classificação DAS/FGTS/DAF/DARF/GPS, sem envio automático com confiança <0.75, envio individual, mover para `Enviadas/[Empresa]/[AAAA-MM]`, logs completos, revisão manual funcional, duplicidade bloqueando reenvio, modo teste com 100+ PDFs sem afetar clientes, integrações validadas via conector Lovable.
