# Plano: FGTS Digital com identificação por razão social

Objetivo: permitir que guias FGTS Digital/GFD sem CNPJ completo no PDF sejam identificadas com segurança pela razão social do empregador (ou alias exato), mantendo o pipeline seguro — envio automático só com correspondência única e exata.

## 1. Schema (migration)

- `empresas`: adicionar
  - `aliases text[] not null default '{}'` — nomes alternativos normalizados manualmente ou aprendidos via revisão.
  - `cnpj_raiz text generated always as (substring(regexp_replace(cnpj,'\\D','','g') from 1 for 8)) stored` (ou coluna comum populada por trigger se generated não couber).
- `guias`: adicionar
  - `subtipo text` (ex.: `fgts_digital_gfd`)
  - `empregador_documento_raw text`
  - `empregador_documento_tipo text` (`cnpj_completo` | `cnpj_raiz` | `documento_parcial` | `cpf`)
  - `empregador_nome_razao_social text`
  - `identificador_guia text`
  - `match_method text` (`cnpj_exact` | `exact_normalized_legal_name` | `alias_exact` | `similarity` | `none`)
- Recalcular `dedup_hash` para FGTS sem CNPJ completo: `sha256(empresa_id|tipo_guia|competencia|vencimento|valor|identificador_guia?)`.
- Manter RLS atual; sem novas tabelas.

## 2. Parser (`supabase/functions/_shared/guide-parser.ts`)

- Expandir `extractFGTSDigitalData`:
  - Detectores: `GFD`, `Guia do FGTS Digital`, `FGTS Digital`, `CPF/CNPJ do Empregador`, `Nome/Razão Social do Empregador`, `Valor a recolher`, `Total da Guia`, `Pagar este documento até`, `Identificador`, `Competência`.
  - Extrair: `tipo='fgts'`, `subtipo='fgts_digital_gfd'`, `empregador_documento_raw`, `empregador_documento_tipo`, `empregador_nome_razao_social`, `competencia`, `vencimento` (de "Pagar este documento até"), `valor` (preferir "Total da Guia"/"Valor a recolher"), `identificador_guia`, `codigo_pix`/`pix_copia_cola` (quando presentes), `data_geracao`.
  - Classificar documento parcial: 14 dígitos = `cnpj_completo`; 8 dígitos = `cnpj_raiz`; outros = `documento_parcial`. NÃO completar CNPJ automaticamente.
- `analyzeGuideText`: quando `tipo='fgts'` e CNPJ completo ausente, NÃO emitir erro `cnpj_invalid`; emitir issue informativa `fgts_partial_employer_document` e seguir com `razao_social` como campo crítico alternativo.

## 3. Identificação (`run-guide-scan-now` + `src/features/guias/guide-rules.ts`)

Nova função `matchCompanyForFGTSGuide(extracted, empresas)`:

Normalização (compartilhada): remover acentos, uppercase, remover pontuação, colapsar espaços; gerar duas formas — completa e sem termos societários (`LTDA, EIRELI, ME, EPP, SA, S/A, SOCIEDADE, LIMITADA, MEI`).

Ordem de matching para FGTS sem CNPJ completo:
1. CNPJ completo → `cnpj_exact`.
2. CNPJ raiz (8 dígitos) → só aceita se houver exatamente 1 empresa ativa com mesma raiz; múltiplas filiais → `revisao_manual`.
3. Razão social normalizada exata (forma completa) → `exact_normalized_legal_name`.
4. Alias exato (normalizado) → `alias_exact`.
5. Razão social normalizada sem termos societários, exata e única → `exact_normalized_legal_name`.
6. Similaridade (Jaro-Winkler ou Dice bigram) `>= 0.94` e única → `similarity` (NUNCA auto, sempre revisão rápida).
7. Caso contrário → `revisao_manual`/`nao_identificada`.

Bloqueios: múltiplas candidatas em qualquer etapa → `revisao_manual`; empresa inativa → `revisao_manual` com motivo `company_inactive`.

## 4. Matriz de decisão e confidence score

Estender a matriz em `run-guide-scan-now`:

- FGTS + CNPJ completo válido + empresa única → fluxo padrão.
- FGTS sem CNPJ completo + `exact_normalized_legal_name` única + demais campos válidos → `pronta_envio` (auto).
- FGTS sem CNPJ completo + `alias_exact` única + demais campos válidos → `pronta_envio` (auto).
- FGTS sem CNPJ completo + `similarity` → `revisao_manual` (rápida).
- FGTS sem CNPJ completo + múltiplas → `revisao_manual`.
- FGTS sem CNPJ completo + razão social ausente → `nao_identificada`.
- FGTS + CNPJ raiz + múltiplas filiais → `revisao_manual`.
- Campo crítico (valor/vencimento/competência) ausente → `revisao_manual`.

Score alternativo (apenas quando `tipo='fgts'` e CNPJ completo ausente):
- company_match exato/alias: 0.40
- tipo FGTS confirmado: 0.20
- competência: 0.15
- vencimento: 0.15
- valor: 0.10
- Limite auto: `>= 0.92`. Similaridade reduz o peso do match para 0.25 (não atinge 0.92).

## 5. Evidências e auditoria

`critical_fields_json` ganha `razao_social` e `company_match` conforme exemplo do briefing; `cnpj` registrado como `status='partial'` quando aplicável, com `raw` e `method='fgts_employer_document_partial'`. `decision_reason` explica: "FGTS Digital identificado por razão social do empregador, pois CNPJ completo não estava disponível no PDF." Auditar em `guide_audit`.

## 6. Deduplicação

`dedup_hash` para FGTS sem CNPJ completo usa `empresa_id + tipo + competencia + vencimento + valor + identificador_guia` (se houver); fallback sem identificador. Recalcular no `run-guide-scan-now` antes do upsert.

## 7. Revisão manual (UI)

`src/pages/guias/RevisaoManual.tsx` e `GuiaDetalhe.tsx`:
- Quando guia for FGTS sem CNPJ completo, mostrar banner: "Esta guia FGTS Digital não possui CNPJ completo…".
- Exibir: razão social extraída, documento parcial, empresas sugeridas com score, método de match, motivo.
- Ações: selecionar empresa, "Salvar como alias da empresa" (checkbox), aprovar e enviar, aprovar sem enviar, reprocessar.
- Ao aprovar com nova empresa: append em `empresas.aliases` (se ainda não existir, valor normalizado), gravar `guia.revisao_correcoes` e `guide_audit`.

## 8. Cadastro de empresas

`src/pages/EmpresaDetalhe.tsx`: editor de `aliases` (tags), com dica para FGTS Digital (sem acento, sem LTDA, nome fantasia, etc.). Persistir o array.

## 9. Testes

- `guide-parser-safety.test.ts`: novo caso FGTS Digital com documento parcial `21.205.304` validando `tipo='fgts'`, `subtipo='fgts_digital_gfd'`, `empregador_documento_raw`, `cnpj=null`, `razao_social`, `competencia='05/2026'`, `vencimento='2026-06-19'`, `valor=370.58`, `identificador_guia='0126060842429268-9'`, sem issue de erro.
- `guide-rules.test.ts`: cenários (a) razão social exata única → `automatic=true`, method `exact_normalized_legal_name`; (b) alias exato → `alias_exact`; (c) múltiplas similares → `revisao_manual`; (d) empresa não cadastrada → `revisao_manual`; (e) CNPJ raiz com múltiplas filiais → `revisao_manual`.
- Fixture em `test-fixtures/guias/golden-set.json` adicionando o caso GFD.

## 10. Documentação

Atualizar `docs/guias-automation.md`:
- DAS/DARF: identificação por CNPJ completo.
- FGTS Digital: fallback por razão social do empregador, regras de auto vs. revisão, uso de aliases, deduplicação por `identificador_guia`.

## Critérios de aceite

- Guias FGTS Digital sem CNPJ completo NÃO vão automaticamente para erro.
- Parser extrai razão social, competência, vencimento, valor e identificador.
- Matching por razão social normalizada exata e por alias exato funciona.
- Múltiplas candidatas ou similaridade nunca disparam envio automático.
- Evidência registra método de match e motivo da decisão.
- `dedup_hash` funciona sem CNPJ completo (usa identificador).
- Revisão manual mostra contexto e permite salvar alias.
- Build + testes verdes; nenhum envio para empresa errada.

## Fora de escopo

- Drive/Gmail/WhatsApp (mantidos).
- Tax Reform, Fator R, Classifica.
- Mudanças no provedor WhatsApp Cloud API (recém finalizado).
