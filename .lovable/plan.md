## Diagnóstico

Verifiquei o estado real do Lovable Cloud e do código já mergeado:

- **Migrations não aplicadas.** Os arquivos `20260609120000_tax_reform_analysis.sql` e `20260610120000_tax_reform_v2_hardening.sql` existem no repo, mas no banco real **nenhuma** tabela `tax_reform_*` foi criada e o bucket `tax-reform-documents` **não existe**. Buckets atuais: `certidoes`, `automation-artifacts`, `empresa-documentos`.
- **Upload com fallback permissivo.** `uploadTaxReformDocumentFile` devolve `local://arquivo` quando o Storage falha e o resto do app trata isso como documento válido.
- **Schema atual está incompleto** para o que você pediu (sem `storage_path`, `storage_bucket`, `upload_status`, `uploaded_by`, `extraction_confidence`, `document_confidence_weight`, e sem status de upload `enviado`/`erro_upload`).
- **GRANTs ausentes** nas migrations existentes (RLS sozinho não basta — PostgREST exige GRANT no schema `public`).
- **Score, perguntas decisivas e confiança** vivem em `score.ts` / `rules.ts` / `recommendation.ts` e cobrem só uma fração do que foi pedido (granularidade B2B 40-70%, faixas de insumos 21-40% / 41-60% / >60%, folha de pagamento, confiança baixa/média/alta etc.).

Layout, providers, navegação e demais módulos não serão tocados.

## Plano

### 1. Consolidar schema no Supabase real (uma migration única)

Criar `supabase/migrations/<novo_timestamp>_tax_reform_v2_consolidate.sql` que é idempotente e:

1. Cria todas as tabelas `tax_reform_companies | analyses | answers | documents | alerts` com o schema final (inclui colunas novas).
2. Emite **GRANTs** corretos em cada tabela: `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;` (sem `anon`).
3. Habilita RLS e cria as policies para `authenticated` (mesmo padrão atual).
4. Cria índices, FKs compostas, triggers `updated_at` e a função `tax_reform_touch_updated_at()`.
5. Cria bucket privado `tax-reform-documents` com `file_size_limit = 50MB` e MIME types permitidos, e as 4 policies em `storage.objects` para `authenticated`.

Colunas novas em `tax_reform_documents`:

- `storage_bucket text` (default `'tax-reform-documents'`)
- `storage_path text` (caminho real no bucket; usado para signed URL)
- `upload_status text check in ('enviado','erro_upload') not null default 'enviado'`
- `upload_error text`
- `uploaded_by uuid` (= `auth.uid()` no momento do upload)
- `extraction_confidence numeric(5,2)` (0–100, nullable)
- `document_confidence_weight numeric(5,2) default 1.0`
- Expandir CHECK de `reading_status` mantendo os 4 estados atuais.

Coluna nova em `tax_reform_analyses`:

- `confidence_level text check in ('baixa','media','alta') default 'baixa'`
- `confidence_reason text`

### 2. Upload real no Storage (sem fallback “válido”)

Refatorar `src/features/tax-reform/persistence.ts` → `uploadTaxReformDocumentFile`:

- Se Supabase não configurado **ou** `storage.upload` falhar → retornar `{ ok: false, error }`. **Nunca** retornar `local://...` como caminho válido.
- Sucesso: devolver `{ ok: true, storagePath, storageBucket, uploadedBy }`.
- Chamadores devem inserir o documento **apenas** quando `ok: true`. Em falha: `toast.error`, não criar registro em `tax_reform_documents`, alerta de “documentos pendentes” continua ativo.
- Persistir `storage_path` (caminho cru no bucket) + `storage_bucket`. Manter `file_url` legado opcional.
- Acrescentar `getTaxReformDocumentSignedUrl(doc)` que chama `storage.from(bucket).createSignedUrl(storagePath, 300)`. Visualizar/baixar usam essa URL assinada (bucket é privado).
- Migrar callers em `src/pages/ReformaTributaria.tsx` e em qualquer hook/serviço de upload do módulo para o novo contrato.

### 3. Score, perguntas decisivas e recomendação

Atualizar `src/features/tax-reform/score.ts`, `rules.ts`, `recommendation.ts` (+ testes em `rules.test.ts`):

- **Perguntas decisivas (ampliadas)**: regime, atividade principal, % B2C, % B2B, clientes usam créditos, risco de perda comercial, % B2B no Lucro Real, % insumos sobre faturamento, regime predominante de fornecedores, objetivo dos sócios, aceitação de complexidade, alíquota efetiva (se Simples), proximidade do limite (quando aplicável).
- Faltou pergunta decisiva → `recommendation = 'analise_manual_necessaria'`, `risk_level = 'dados_insuficientes'`, mensagem “Revisão manual necessária — faltam respostas decisivas para recomendação segura.” Permite salvar parcial, mas marca análise como **não confiável**.
- **Score granular** (clientes ≤60 / custos ≤25 / tributário atual ≤15, total ≤100) seguindo exatamente as faixas do brief (B2B 40-70%, insumos 21-40/41-60/>60, fornecedores LR vs LP, fretes/energia/serviços/máquinas/tecnologia até +5, folha de pagamento até +5, etc.).
- **Recomendação** mais rígida e dependente do regime atual (Simples → permanecer / avaliar LP / revisão manual; LP → permanecer / avaliar Simples / revisão manual), seguindo as regras do brief.

### 4. Nível de confiança

Novo módulo `src/features/tax-reform/confidence.ts`:

- Considera só documentos com `upload_status='enviado'` e `storage_path` preenchido. `local://` e `erro_upload` não contam.
- Regras: 0 principais → `baixa`; 1–2 → `media`; 3+ → `alta`; combo DRE+PGDAS+faturamento_cliente força `alta`.
- Retorna `{ level, reason, validDocs[], missingDocs[] }`.
- Persistido em `tax_reform_analyses.confidence_level / confidence_reason`.

### 5. Tela de Resultado

Em `src/pages/ReformaTributaria.tsx` (apenas o painel de Resultado, sem mexer no resto do layout):

- Badge de status da análise: **Preliminar | Confiável | Bloqueada por dados insuficientes | Revisão manual necessária**.
- Exibir: empresa, CNPJ, regime atual, ano-base, score total, score por bloco, decisivas respondidas vs faltantes, documentos válidos (com link assinado), documentos pendentes, nível de confiança + motivo, recomendação, principais fatores que pesaram, alertas, parecer manual, decisão final.

### 6. Validação

- `bunx vitest run src/features/tax-reform` (atualizar `rules.test.ts` para nova grade).
- Smoke manual no preview: cadastrar empresa → recarregar → responder blocos → recarregar → anexar PDF (sucesso e simulação de erro) → recarregar → gerar resultado → salvar parecer/decisão → recarregar.
- `supabase--read_query` para confirmar persistência em cada passo.

## Fora do escopo

- Redesign de layout, providers, navegação, outras páginas.
- Pipeline real de extração (mantém `aguardando_leitura` / `nao_processavel`).
- Autenticação por dono (RLS continua para `authenticated`).
