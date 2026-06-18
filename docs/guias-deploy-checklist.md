# Checklist de implantação — Módulo Guias

Use esta lista após cada migração, deploy ou troca de conector.

## Banco

- [ ] Migrations aplicadas (status, índices, `dedup_hash` único, novas colunas de decisão).
- [ ] Enums atualizados: `guia_status` contém `quarentena`, `processando`, `aguardando_processamento`, `revisao_manual`; `canal_envio` aceita `ambos`.
- [ ] Tabelas presentes: `guias`, `empresas`, `guide_templates`, `guide_test_config`, `guide_batch_runs`, `guide_audit`, `guia_envios`, `guia_eventos`, `guia_excecoes`, `integracoes_guias`.
- [ ] RLS em `integracoes_guias` restrita a `authenticated` (sem `anon`).
- [ ] Bucket privado `guia-pdf-links` criado.

## Edge Functions deployadas

- [ ] `run-guide-scan-now` (jwt)
- [ ] `dispatch-guide` (jwt)
- [ ] `bootstrap-guide-folders` (jwt) — alias canônico de `bootstrap-test-folder`
- [ ] `bootstrap-test-folder` (jwt) — mantido por compatibilidade
- [ ] `get-guide-pdf` (jwt)
- [ ] `test-guide-connection` (jwt)
- [ ] `send-whatsapp-message` (jwt)
- [ ] `whatsapp-status-callback` (sem jwt, valida assinatura)
- [ ] `integracoes-status` (sem jwt)

## Conectores Lovable

- [ ] Google Drive conectado (`GOOGLE_DRIVE_API_KEY` provisionado).
- [ ] Gmail conectado (`GOOGLE_MAIL_API_KEY` provisionado).
- [ ] Twilio/WhatsApp configurado (`WHATSAPP_SERVICE_URL` + `WHATSAPP_SERVICE_SECRET`).
- [ ] `LOVABLE_API_KEY` presente.

## Estrutura de pastas no Drive

`Guias/A Enviar`, `Guias/Enviadas`, `Guias/Revisão Manual`,
`Guias/Não Identificadas`, `Guias/Erros`, `Guias/Duplicadas`.

- [ ] Clicar **Recriar estrutura** em `/integracoes` e validar os 6 IDs em `integracoes_guias`.

## Templates

- [ ] Cada `tipo_guia` tem template ativo para os canais usados (`email`, `whatsapp`).
- [ ] Templates de WhatsApp incluem `[LINK_GUIA]` e `twilio_content_sid` válido.
- [ ] Templates de e-mail têm assunto e corpo com `[EMPRESA]`, `[CNPJ]`, `[TIPO_GUIA]`, `[COMPETENCIA]`, `[VENCIMENTO]`, `[VALOR]`.

## Smoke test

1. `/guias` → modo **TESTE** ligado, badge vermelha visível.
2. Drop de PDF de teste em `Guias/A Enviar`.
3. Clicar **Varredura agora**.
4. Validar contadores em `guide_batch_runs` e ausência de envio real.
5. Em `/guias/revisao`, corrigir e marcar **Aprovar sem enviar**.
6. `/integracoes` → **Testar Drive/Gmail/WhatsApp** com destinatário de teste.
7. Só então ligar **PRODUÇÃO** com nível `envio_automatico_seguro`.

## Regras invioláveis

- Nada é enviado sem: empresa ativa, CNPJ válido único, score ≥ 0.92, template ativo, conector ativo, destinatário válido, sem duplicidade.
- WhatsApp exige opt-in registrado (`whatsapp_opt_in_at`), número E.164 e link assinado válido.
- Modo teste **nunca** envia para destinatário real nem move arquivos para `Enviadas`.