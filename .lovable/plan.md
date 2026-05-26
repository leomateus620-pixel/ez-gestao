## Objetivo

Eliminar a dependência do Google Vision do pipeline de envio automático de guias. Toda extração passará a ser feita pelo próprio sistema, lendo o texto interno do PDF. PDFs escaneados/imagem (sem camada de texto) caem em Exceções com mensagem clara, sem chamar OCR externo.

## Mudanças no backend

### `supabase/functions/process-guide/index.ts`
- Remover `queueVisionOcr`, `readVisionResult` e qualquer referência a `vision.googleapis.com`, `GOOGLE_CLOUD_ACCESS_TOKEN`, `GCS_OCR_BUCKET`, `ocr_operation_name`, `ocr_output_uri`, status `"ocr"`.
- Substituir `pdfText` por uma função `extractPdfText(bytes)` mais robusta que:
  - decodifica streams de texto (`BT…ET`, operadores `Tj`/`TJ`), tenta descomprimir streams FlateDecode quando possível via `DecompressionStream("deflate")`;
  - normaliza espaços/quebras/caracteres;
  - conta páginas pelo número de objetos `/Type /Page`;
  - retorna `{ text, pageCount, hasTextLayer, extractionMethod: "native_pdf_text", confidence }`.
- Nova regra de confiança (sem OCR):
  - `text` vazio ou muito curto e sem CNPJ ⇒ exceção `pdf_without_text_layer` (mensagem amigável).
  - `text` com CNPJ válido + sinais (valor, vencimento, tipo): confiança alta.
  - `text` extraído mas sem sinais suficientes: exceção `insufficient_pdf_signals`.
  - Falha de parsing: exceção `pdf_text_extraction_failed`.
- Manter download do Drive via `googleAccessToken` (Drive continua obrigatório).
- Persistir `texto_extraido_preview`, `pagina_count`, `extraction_method` em `guias`; remover gravações em `ocr_confidence`/colunas vision.
- Registrar evento em `guia_eventos` com `event_type: "pdf_text_extracted"` contendo `pageCount`, `hasTextLayer`, tamanho do texto.
- Encadear `dispatch-guide` quando identificação for bem-sucedida (sem alterar `dispatch-guide/index.ts`).

### `supabase/functions/scan-guide-folder/index.ts`
- Manter intacto o fluxo de varredura do Drive. Apenas remover o branch que marcava itens não-PDF como exceção `unsupported_file`? — manter, mas garantir que não há nenhuma menção a Vision.

### Migration (nova, não editar a existente)
`supabase/migrations/<timestamp>_remove_vision_pipeline.sql`:
- `UPDATE integracoes_guias SET status='deprecated' WHERE provider='google_vision';` e inserir/upsert linha `provider='pdf_native_reader'` com `status='ativo'`.
- Adicionar colunas em `guias`: `pagina_count int`, `extraction_method text`, `has_text_layer boolean` (se ainda não existirem). Não dropar colunas vision para não quebrar histórico — apenas deixar de gravar.

### Secrets
- Não excluir `GOOGLE_VISION_API_KEY` (gerenciado por connector), apenas deixar de ler. Garantir que ausência não quebre nada (`Deno.env.get` opcional).

## Mudanças no frontend

### `src/pages/guias/IntegracoesGuias.tsx`
- Trocar provider `google_vision` por `pdf_native_reader` na lista de `providers`.
- Atualizar `icons`, `logos`, `providerLabels`: rótulo "Leitura PDF nativa", descrição "Extração direta de texto em PDFs digitais, sem OCR externo. PDFs escaneados são enviados para Exceções."
- Status sempre `ativo` (não depende de chave).
- Remover asset `google-vision.svg` (substituir por ícone `FileText` ou logo neutra interna).

### `src/pages/Integracoes.tsx`
- Se houver connector "google_vision" no registry, renomear/ocultar e adicionar "Leitura PDF nativa" como conector interno ativo.

### `src/data/types.ts`
- Adicionar `'pdf_native_reader'` ao union `IntegrationProvider`; manter `'google_vision'` marcado como deprecated para histórico (ou remover se não referenciado).

### `supabase/functions/integracoes-status/index.ts`
- Remover chave `google_vision`, adicionar `pdf_native_reader: true` (sempre).

## Regras de negócio (`src/features/guias/guide-rules.ts`)
- Remover `OCR_AUTO_DISPATCH_THRESHOLD` e parâmetros `wasOcr`/`confidence` da `evaluateIdentity`.
- Novo enum de razões: `pdf_without_text_layer`, `pdf_text_extraction_failed`, `company_not_found`, `company_inactive`, `missing_email`, `invalid_channel`, `filename_content_conflict` (renomear `source_conflict`), `insufficient_pdf_signals`.
- `MatchSource` perde `'ocr'`, ganha `'pdf_native'`.
- Atualizar `canDispatchToPreferredChannel` para devolver `missing_email`/`invalid_channel` conforme nova nomenclatura.

## Testes (`src/features/guias/guide-rules.test.ts`)
Reescrever cobrindo:
- PDF textual com CNPJ válido ⇒ `automatic: true`.
- Empresa ativa correspondente.
- PDF sem texto ⇒ razão `pdf_without_text_layer`.
- Conflito filename × conteúdo ⇒ `filename_content_conflict`.
- Canal e-mail válido OK.
- WhatsApp sem opt-in continua bloqueando.
- Garantir que ausência de qualquer chave Vision não influencia o resultado.

## UI de exceções / dashboard
- Onde for exibido `provider_error`/`exception_type`, mapear novos códigos para mensagens amigáveis. Ex.: `pdf_without_text_layer` → "O PDF parece ser escaneado ou imagem. Envie uma versão digital/textual ou revise manualmente."
- Remover qualquer string "Vision"/"OCR" da UI.

## Documentação
- `docs/guias-automation.md`: substituir seção OCR/Vision por "Leitura nativa de PDF", documentar limites (PDFs escaneados → exceção), variáveis de ambiente removidas.

## Validação
- `npm run test` (vitest) cobrindo guide-rules.
- `npm run build` limpo.
- Preview manual: card "Leitura PDF nativa" aparece como Ativo; "Processar agora" executa o fluxo; PDF textual flui até envio; PDF escaneado cai em Exceções com mensagem nova.
- Confirmar que nenhuma referência a `VISION_API_KEY`/`google_vision`/`ocr_operation_name` permanece em código ativo (`rg`).

## Fora de escopo
- Não enviar e-mail real durante implementação; usar o fluxo existente de dispatch (já desacoplado).
- Não excluir colunas legadas vision do banco para preservar histórico.
