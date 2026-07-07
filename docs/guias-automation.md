# Automação de Envio de Guias

## Fluxo

## Pipeline seguro

Regra central: envio automatico somente com certeza alta. Qualquer ambiguidade vai para
`revisao_manual` ou `quarentena`; duplicidade nunca e reenviada automaticamente.

Limites de confianca:

- `confidence_score >= 0.92` e todos os campos criticos validos: pode ficar `pronta_envio`.
- `confidence_score >= 0.85` e `< 0.92`: revisao rapida.
- `confidence_score < 0.85`: revisao manual completa.
- Campo critico ausente, invalido ou duvidoso: sem envio automatico.

Campos criticos registrados em `critical_fields_json`: CNPJ, empresa, tipo da guia,
competencia, vencimento, valor, destinatario e canal. Cada campo guarda valor,
origem, metodo, score, justificativa e status.

Matriz de decisao implementada no Edge Function `run-guide-scan-now`:

- CNPJ ausente ou invalido -> `nao_identificada`.
- Multiplos CNPJs validos -> `revisao_manual`.
- Empresa inexistente ou inativa -> `revisao_manual`.
- Tipo, valor, competencia ou vencimento duvidoso -> `revisao_manual`.
- Inconsistencia entre campos -> `quarentena`.
- Duplicidade exata ou operacional -> `duplicada`.
- Duplicidade provavel -> `revisao_manual`.
- Template, destinatario ou conector necessario invalido -> `quarentena`/`erro`.
- Tudo valido, score alto e automacao habilitada -> `pronta_envio` e dispatch.

Modo teste nunca chama Gmail/WhatsApp e nunca move para `Enviadas`; ele grava preview
do lote em `guide_batch_runs.preview_json`, que pode ser exportado pela tela de Guias.

Google Drive e Gmail continuam usando exclusivamente os gateways Lovable:

- Drive: `https://connector-gateway.lovable.dev/google_drive/drive/v3`
- Gmail: `https://connector-gateway.lovable.dev/google_mail/gmail/v1`
- WhatsApp: API oficial Meta Cloud (`https://graph.facebook.com/{API_VERSION}/{PHONE_NUMBER_ID}/messages`)

1. `scan-guide-folder` lista arquivos da pasta Google Drive `a enviar`.
2. PDFs novos são registrados em `guias`; formatos diferentes geram exceção.
3. `process-guide` tenta identificar CNPJ e metadados no PDF. Quando necessário,
   tenta extrair texto **nativamente** do PDF (sem OCR externo). Se o PDF não tiver
   camada de texto extraível (PDF escaneado/imagem), a guia e marcada como exceção
   com motivo `pdf_without_text_layer`.
4. Somente uma correspondência segura com empresa ativa avança para
   `dispatch-guide`.
5. O canal vem exclusivamente de `empresas.canal_preferido`.
6. Gmail anexa o PDF; WhatsApp Cloud API envia template aprovado (Meta), com header
   document quando aplicável usando link assinado temporário gerado no bucket
   privado `guia-pdf-links`.
7. Depois da aceitação do provedor, o Drive move a guia para `enviados`.
8. `whatsapp-webhook` recebe os eventos `sent | delivered | read | failed` e
   atualiza `guia_envios.provider_status`, `delivered_at` e `failed_at`. Não
   reenvia automaticamente em falhas.

## Pendencias de cliente e contato

A tela operacional de envio fica em `/guias` e `/guias/fila`, acionada pelo item
`Guias` do menu principal. O CTA **Verificar guias no Drive** chama
`run-guide-scan-now` por meio de `GuideProvider`, preservando o fluxo real de
Drive, parser, decisao, excecoes, eventos e envio.

Durante a varredura, `run-guide-scan-now` continua bloqueando qualquer guia sem
empresa ativa ou sem contato obrigatorio antes do dispatch. As pendencias de
cadastro usam `status = revisao_manual`, permanecem auditaveis em
`guia_excecoes`/`guia_eventos`, e recebem `exception_type` especifico:

- `company_not_found`: cliente ainda nao cadastrado para o CNPJ/razao social
  identificados.
- `missing_email`: canal de envio exige e-mail, mas o cliente nao possui e-mail
  valido.
- `missing_phone`: canal de envio exige WhatsApp/celular, mas o cliente nao
  possui numero valido.
- `missing_contact_channels`: cliente sem e-mail e sem WhatsApp/celular.
- `missing_channel`: cliente tem contato, mas ainda nao possui forma de envio
  preferida.

Na UI, essas excecoes aparecem em **Pendencias de cadastro** e abrem um modal
focado. O modal mostra empresa/CNPJ/guia identificados, permite cadastrar
e-mail, WhatsApp em formato brasileiro normalizado para E.164, forma de envio
preferida e observacao. Ao salvar, o frontend atualiza ou cria o registro em
`empresas`, resolve as excecoes de contato da guia, registra `guide_audit` e
invoca `dispatch-guide` com `manual_approval`/`force_dispatch`, que delega de
volta para `run-guide-scan-now` para continuar o processamento pelo pipeline
existente.

Em modo teste, a varredura tambem valida os contatos reais da empresa. Os
destinatarios de teste so controlam o envio simulado; eles nao mascaram cliente
sem e-mail ou sem WhatsApp no cadastro.

### Botao "Processar agora" (pipeline completo)

O botao **Processar agora** no Dashboard chama `run-guide-scan-now` com
`{ "run_full_pipeline": true }`. Esse flag faz a Edge Function executar o
pipeline inteiro (scan -> parse -> validate -> route -> dispatch -> Drive)
sem exigir aprovacao manual de lote, mesmo quando o `guide_test_config`
esta em `somente_classificacao`, `require_batch_approval = true` ou
`auto_dispatch_enabled = false`. Continuam bloqueando o envio automatico:

- duplicidade, ambiguidade, empresa inativa, campos criticos invalidos;
- conector inativo (Gmail/WhatsApp/Drive);
- template ou destinatario ausente/invalido;
- valor acima do `high_value_threshold` (exige `manual_approval`).

Em **modo teste** com `run_full_pipeline=true`, o dispatch acontece para os
destinatarios de teste (`email_teste` / `whatsapp_teste`) e a guia recebe
`status = enviada_teste` (o PDF nao e movido para a pasta de Enviadas de
producao). Sem destinatarios de teste configurados, o pipeline cai em
quarentena com `destination_missing`.

Quando o envio fica bloqueado por configuracao, o motivo exato e gravado
em `guias.dispatch_blocked_reason` e em `guias.decision_reason`
(ex.: `auto_dispatch_disabled`, `requires_batch_approval`,
`operation_level_blocks:somente_classificacao`,
`high_value_requires_approval:>=50000`). A fila do dashboard exibe esses
motivos no card da guia.

## Deploy Supabase

Aplicar a migration `20260526120000_guide_delivery_pipeline.sql` e publicar as
Edge Functions novas. A migration cria o agendamento a cada cinco minutos, mas
ele so efetua chamadas depois que dois secrets forem inseridos no Vault:

```sql
select vault.create_secret('https://PROJECT.supabase.co', 'project_url');
select vault.create_secret('CRON_SECRET_ALEATORIO', 'guide_cron_secret');
```

Definir os secrets das Edge Functions:

```text
APP_ORIGIN
GUIDE_CRON_SECRET
GUIDE_INTERNAL_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
GOOGLE_OAUTH_STATE_SECRET
GOOGLE_TOKEN_ENCRYPTION_KEY
# (OCR externo desativado — leitura nativa de PDF)
GOOGLE_CLOUD_ACCESS_TOKEN
GMAIL_SENDER
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_APP_ID
WHATSAPP_APP_SECRET
WHATSAPP_VERIFY_TOKEN
WHATSAPP_API_VERSION
WHATSAPP_TEST_TO
```

`GOOGLE_ACCESS_TOKEN` e aceito somente para testes operacionais temporários.
Em produção, usar `connect-google-oauth`, que persiste somente o refresh token
criptografado em uma tabela sem política de leitura para clientes.

## Google e WhatsApp Cloud API

- Autorizar Google Drive para ler/mover arquivos e Gmail somente com
  `gmail.send`. Documentar a verificação OAuth antes do uso em produção.
- Configurar as pastas em `integracoes_guias` e mudar Drive/Gmail para `ativo`
  apenas após teste de conexão.
- Criar templates Meta aprovados (categoria `utility`) com placeholders
  `{{1}}..{{5}}` na ordem **tipo_guia, empresa, competencia, vencimento, valor**.
  Marcar `meta_template_has_document_header = true` para templates que recebem
  o PDF no header.
- Registrar opt-in WhatsApp (`empresas.whatsapp_opt_in_at`) e telefone em E.164.
- Configurar webhook na Meta apontando para
  `/functions/v1/whatsapp-webhook` com o mesmo `WHATSAPP_VERIFY_TOKEN`. A
  função valida `X-Hub-Signature-256` usando `WHATSAPP_APP_SECRET`.
- Em modo teste, todo envio WhatsApp é redirecionado para `WHATSAPP_TEST_TO`.

## Garantias

- Nenhum envio automático ocorre sem CNPJ único válido, empresa ativa, canal
  escolhido, contato válido, consentimento WhatsApp quando aplicável e conector ativo.
- Identificação por nome do arquivo exige sinais fiscais (valor, vencimento, tipo)
  no texto extraído; do contrário a guia vai para Exceções com motivo
  `insufficient_pdf_signals`.
- `guia_envios.idempotency_key` evita envio duplicado.
- Segredos não são expostos ao frontend; logs guardam somente payload sanitizado.
- `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_APP_SECRET` ficam apenas em `Deno.env`;
  jamais no banco, frontend ou logs.
- O legado de consultas fiscais foi removido; este documento cobre apenas o fluxo de guias.

## FGTS Digital / GFD: identificação por razão social

DAS, DARF e demais guias federais costumam trazer o CNPJ completo do
contribuinte e seguem o fluxo padrão de identificação por CNPJ. **FGTS
Digital (GFD)** pode exibir apenas um documento parcial/raiz no campo
`CPF/CNPJ do Empregador` (por exemplo `21.205.304`). Para essas guias o
pipeline aplica um fallback seguro:

1. Se houver CNPJ completo válido, segue por ele (`match_method = cnpj_exact`).
2. Se o documento for de 8 dígitos (raiz) e existir **exatamente uma**
   empresa ativa com aquela raiz, usa essa empresa (`cnpj_raiz_unique`).
   Múltiplas filiais → revisão manual.
3. Razão social normalizada exata (`exact_normalized_legal_name`).
4. Alias normalizado exato (`alias_exact`).
5. Razão social normalizada sem termos societários (LTDA, EIRELI, ME,
   EPP, S/A, MEI, ...) → `exact_normalized_no_legal_terms`.
6. Similaridade ≥ 0.94 → apenas revisão rápida; **nunca** envio automático.
7. Caso contrário → revisão manual / não identificada.

Regras de segurança:

- Múltiplas empresas compatíveis em qualquer etapa → revisão manual.
- Empresa inativa → revisão manual.
- Similaridade nunca dispara envio automático.
- O sistema **não** completa CNPJs parcialmente exibidos.
- A evidência (`critical_fields_json`) registra `match_method`, razão
  social extraída, documento parcial e o motivo da decisão.
- `decision_reason` deixa explícito que a identificação foi feita pela
  razão social do empregador.

Deduplicação para FGTS sem CNPJ completo usa
`sha256(empresa_id | tipo | competencia | vencimento | valor | identificador_guia)`.
Quando o `Identificador` da GFD está disponível, ele entra na chave —
evita reprocessar a mesma guia mesmo sem CNPJ no PDF.

Cadastro de empresas: usar o campo `aliases` para registrar variações
do nome que aparecem nas guias do FGTS (sem acento, sem LTDA, nome
fantasia etc.). A revisão manual, quando o operador escolhe a empresa,
sugere salvar a razão social extraída como novo alias.
