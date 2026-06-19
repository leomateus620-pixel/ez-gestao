# Limpar guias órfãs do primeiro teste

As 5 guias visíveis em **Fila**, as 6 em **Enviadas** e as 20 em **Exceções** foram criadas em testes anteriores e não correspondem a arquivos da pasta atual `A enviar` (`1vVBvXTKQcz0Drkp1aIg6j9LoI-Ro2Ccj`) do Drive `esc.zimmermann@gmail.com`. Vou zerar esses registros para começar limpo.

## O que será apagado

Todos os registros das tabelas operacionais do módulo Guias:

- `guias` — todas as linhas (5 fila + 6 enviadas + 20 exceções = ~31 + qualquer outro estado)
- `guia_envios` — histórico de envios (e-mail/WhatsApp) das guias acima
- `guia_eventos` — timeline de eventos
- `guia_excecoes` — registros da aba Exceções
- `guide_audit` — trilha de auditoria por guia
- `guide_batch_runs` — execuções anteriores da varredura

Ordem: apaga filhas primeiro (envios, eventos, exceções, audit), depois `guias`, depois `guide_batch_runs`.

## O que NÃO será tocado

- `empresas` (cadastro mestre)
- `guide_templates` (templates de e-mail/WhatsApp)
- `guide_test_config` (modo produção já configurado)
- `integracoes_guias` (Drive/Gmail conectados)
- Bucket `guia-pdf-links` (sem PDFs ativos relevantes; pode ser limpo manualmente depois se quiser)
- Pastas do Drive (`A enviar`, `Enviadas`) — permanecem como estão

## Validação após a limpeza

1. `/guias` → Fila (0), Enviadas (0), Exceções (0).
2. Subir um PDF real em `A enviar` no Drive.
3. Aguardar varredura (ou clicar **Varredura agora**) e conferir que a guia aparece como entrada nova.

Aprove para eu executar a limpeza.
