# Validação Reforma Tributária — Lovable Cloud

## Causa raiz já identificada

Os logs do console mostram erro recorrente ao salvar a análise:

```
code: 42P10 — there is no unique or exclusion constraint matching the ON CONFLICT specification
```

Investigação no banco real confirma:

- `tax_reform_alerts` só possui `PRIMARY KEY (id)` — **não tem** `UNIQUE (analysis_id, alert_type)`.
- O código em `src/features/tax-reform/persistence.ts:328` chama `upsert(..., { onConflict: 'analysis_id,alert_type' })`.

Resultado: toda persistência de alertas falha silenciosamente no Supabase real, e a função `saveTaxReformStore` rejeita, fazendo o sistema cair para localStorage sem aviso claro — exatamente o sintoma que o usuário descreveu ("localStorage funcionando como persistência silenciosa").

Demais tabelas estão OK:
- `tax_reform_answers` tem `UNIQUE (analysis_id, question_key)` ✓
- `tax_reform_companies`, `tax_reform_analyses`, `tax_reform_documents` usam `onConflict: 'id'` (PK) ✓

E o `GuideProvider` já é corretamente gated por `pathname` (`/guias`, `/integracoes`, `/`), então rotas como `/reforma-tributaria`, `/classifica`, `/configuracoes`, `/whatsapp` **não** disparam queries de guias. Não há refator de provider necessário.

## Escopo da correção

### 1. Migration — adicionar UNIQUE em tax_reform_alerts

```sql
-- Limpar duplicatas antes de aplicar UNIQUE (mantém o mais recente por par)
DELETE FROM public.tax_reform_alerts a
USING public.tax_reform_alerts b
WHERE a.analysis_id = b.analysis_id
  AND a.alert_type  = b.alert_type
  AND a.created_at < b.created_at;

ALTER TABLE public.tax_reform_alerts
  ADD CONSTRAINT tax_reform_alerts_analysis_type_key
  UNIQUE (analysis_id, alert_type);
```

### 2. Aviso explícito quando cair em modo local

Em `src/features/tax-reform/persistence.ts` (ou no wrapper que chama `saveTaxReformStore`), quando qualquer upsert do Supabase falhar, exibir `toast.warning` claro: "Modo rascunho local — alterações não foram salvas na nuvem" e marcar a análise como `Preliminar` no painel Resultado (não permitir badge `Confiável`).

Sem isso, o usuário não distingue persistência real de localStorage — que é o ponto 2 do checklist do usuário.

### 3. Validação real no preview (após migration aplicada)

Roteiro manual via `browser--view_preview` em `/reforma-tributaria`:

1. Cadastrar empresa → verificar via `supabase--read_query` em `tax_reform_companies`.
2. Responder questionário → verificar `tax_reform_answers` (uma linha por questão).
3. Upload PDF → verificar arquivo no bucket `tax-reform-documents` e linha em `tax_reform_documents` com `storage_path` e `upload_status='enviado'`.
4. Clicar "Abrir" no documento → confirmar que a URL assinada (`createSignedUrl`) abre.
5. Salvar parecer manual + decisão final → verificar `tax_reform_analyses.manual_review_notes` e campos de decisão.
6. Recarregar página e abrir em aba anônima autenticada → confirmar dados vindos do Supabase.
7. Repetir para um segundo `analysis_year` na mesma empresa — confirmar que histórico não sobrescreve.
8. Simular falha de upload (arquivo inválido) → confirmar `upload_status='erro_upload'`, documento não conta para confiança, alerta de documento pendente continua aparecendo.

### 4. Validação de navegação (sem mudanças de código)

Browser smoke test: Dashboard → Guias → Empresas → Fator R → Reforma Tributária → Classifica → WhatsApp → Dashboard. Confirmar que nenhuma rota quebra e que /reforma-tributaria está no menu.

### 5. Verificações de qualidade

- `bunx vitest run` (suite completa)
- Build automático do harness

## Fora de escopo

- Redesign de qualquer tela
- Refator de providers (GuideProvider já está corretamente gated)
- Mudanças em Classifica, WhatsApp, Fator R, Guias além de smoke test
- Pipeline real de extração de PDF
- Atualização de README (separar para outra task se o usuário pedir)

## Entregáveis

1. Migration que adiciona `UNIQUE (analysis_id, alert_type)` em `tax_reform_alerts`.
2. Aviso de modo rascunho em `persistence.ts` / painel Resultado.
3. Relatório final com: tabelas verificadas via SQL, screenshots dos passos críticos do roteiro, resultado do vitest, e confirmação de que o erro 42P10 sumiu dos logs do console.
