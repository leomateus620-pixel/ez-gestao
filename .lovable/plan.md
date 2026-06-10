## Objetivo

Substituir a extração genérica do módulo Reforma Tributária por parsers fiéis aos documentos contábeis reais do escritório (PGDAS, Balanço+DRE em PDF único, Folha "Resumo de Cálculo"), com cruzamentos obrigatórios e impacto direto no score. Nenhum dado fictício; campos não encontrados ficam marcados como ausentes com explicação.

## Arquivos afetados

- `supabase/functions/process-tax-reform-document/index.ts` — usar os novos parsers no servidor.
- `src/features/tax-reform/document-analysis/extractors.ts` — parsers reescritos por tipo.
- `src/features/tax-reform/document-analysis/types.ts` — novos campos extraídos.
- `src/features/tax-reform/document-analysis/normalize.ts` — helpers de seção/linha "Total".
- `src/features/tax-reform/document-analysis/reconcile.ts` — novos cruzamentos (CNPJ, RBAA×DRE, alíquota anual, folha).
- `src/features/tax-reform/document-analysis/documentScore.ts` — alimentar `answers` (custos, folha, alíquota, limite, operações).
- `src/features/tax-reform/confidence.ts` — adicionar `financialTaxConfidence` separada da confiança comercial.
- `src/features/tax-reform/components/TaxReformResultPanel.tsx` (dentro do `TaxReformWorkspace`) — exibir blocos PGDAS / DRE / Folha e divergências.
- Testes novos em `src/features/tax-reform/document-analysis/__tests__/` com fixtures de texto baseadas nos 3 PDFs reais.

## 1. Parsers específicos

Criar três funções puras chamadas pelo `extractTaxReformDocumentFromText`:

- `parsePgdasDocument(text)`
- `parseBalanceAndDreDocument(text)` (mesmo PDF do "balancete"/"dre")
- `parsePayrollSummaryDocument(text)`

Cada uma retorna `{ values, findings, summary, confidence, warnings }` no formato `TaxReformDocumentExtraction`.

### PGDAS

Identificar CNPJ básico/estabelecimento, nome empresarial, PA, optante Simples, regime de apuração, Receita Bruta do PA, RBT12, RBA, RBAA, limite (4.800.000) e sublimite (3.600.000), DAS total, IRPJ, CSLL, COFINS, PIS, INSS/CPP, ICMS, IPI, ISS, status Fator R, mercado externo, descrição da receita.

Cálculos:
- `effectiveTaxRate = dasTotal / receitaBrutaPA * 100` quando não houver rótulo explícito.
- `simplesLimitUsagePercent = rbt12 / 4_800_000 * 100`.
- `sublimitUsagePercent = rbt12 / 3_600_000 * 100`.
- `nearSimplesLimit = simplesLimitUsagePercent >= 80`.
- `factorRStatus`: lê "Fator r" no texto; se "Não se aplica" → `'nao_se_aplica'`, e `shouldCalculateFactorR = false`.

### Balanço + DRE (PDF único)

Separar por seções via headings ("BALANÇO PATRIMONIAL", "ATIVO", "PASSIVO", "DEMONSTRAÇÃO DO RESULTADO"/"DRE"). Buscar valores **dentro** da seção apropriada (não global) para não confundir contas.

Balanço: ativo total, circulante, disponível, aplicações, clientes (apenas como saldo), não circulante, investimentos, imobilizado, depreciações, intangível, passivo total, circulante, fornecedores, obrigações trabalhistas/tributárias, Simples a recolher, IRRF a recolher, PL, capital social, lucros acumulados, AFAC.

DRE: receita bruta operacional, prestação de serviços, deduções, Simples Nacional, receita líquida, custo dos serviços, lucro bruto, despesas operacionais/administrativas, pró-labore, serviços PJ, despesas tributárias, resultado financeiro, outras receitas/despesas operacionais, resultado operacional, resultado líquido.

Folha anual a partir da DRE: somar contas explícitas (Décimo Terceiro, FGTS, Férias, Ordenados e Gratificações, Aviso Prévio, Estagiários, Ajuda de Custo, Pró-labore). Não usar regex genérica de "folha". Serviços PJ entra como custo de terceirização, não como folha.

Cálculos derivados na DRE:
- `annualEffectiveTaxRate = simplesNacionalExpense / grossRevenue * 100`.
- `inputCostPercent = serviceCosts / grossRevenue * 100`.
- `grossMargin`, `netMargin`, `payrollPercentFromDre`.

Regra explícita: **não** usar conta "Clientes" do balanço para B2B/B2C/top10. Marcar como indício fraco.

### Folha de pagamento (Resumo de Cálculo)

Parser específico para a linha "Total" do relatório. Extrair empresa, CNPJ, período, tipo de folha, total de empregados e, da linha Total: salários, bases e valores de INSS/IRRF/FGTS, proventos, descontos, líquido.

Se houver PGDAS lido no mesmo conjunto (passado via `documentScore`), calcular:
- `payrollPercentByMonthlyRevenue`
- `payrollWithChargesPercentByMonthlyRevenue`
- `annualizedPayrollPercentByRbt12`
- `annualizedPayrollWithChargesPercentByRbt12`

(Esses cálculos cross-document ficam em `documentScore.ts`, não no parser puro.)

## 2. Reconciliação / validações cruzadas

Em `reconcile.ts`:

- **CNPJ:** se documentos divergem entre si → alerta crítico.
- **Receita anual DRE × RBAA PGDAS:** divergência > 1% → alerta crítico.
- **Alíquota anual DRE × Alíquota PGDAS:** divergência > 0,5 p.p. → alerta warning.
- **Folha DRE × Folha mensal anualizada:** apenas validação de coerência; DRE maior é esperado (13º, férias, encargos). Nunca crítico.
- **Fator R = não se aplica:** não emitir alerta de Fator R.

## 3. Impacto no score

Em `documentScore.ts`, ao montar `adjustedAnswers`:

- `inputCostPercent` da DRE → bucket de `inputs_revenue_percent`.
- `payrollPercentFromDre` (ou anualizado da folha) → `payroll_revenue_percent` numérico.
- `effectiveTaxRate` (PGDAS, calculada se preciso) → `effective_tax_rate`.
- `simplesLimitUsagePercent` → `near_simples_limit` (`sim` se ≥80, senão `nao`).
- `relevant_operations`: só preencher quando PGDAS indicar ST/monofásico/ISS retido/exportação reais.
- **Nunca** preencher `sales_b2b_percent`/`sales_b2c_percent`/`top_clients_over_50` a partir do balanço.

## 4. Confiança em duas dimensões

Em `confidence.ts` adicionar `computeFinancialTaxConfidence(docs)`:

- `alta`: DRE + PGDAS + Folha lidos.
- `media`: DRE + PGDAS lidos sem folha.
- `baixa`: faltando DRE ou PGDAS.

`computeConfidenceLevel` atual permanece como **confiança comercial** (depende de `faturamento_cliente`). Painel exibe as duas separadamente com rótulos claros.

## 5. UI do painel Resultado

No `TaxReformWorkspace` (painel de resultado), exibir três blocos quando os documentos forem lidos: PGDAS (período, receita mensal, RBT12, alíquota efetiva, uso do limite, Fator R), DRE (receita bruta, Simples, custos %, folha %, margens, lucro), Folha (período, empregados, bruta, anualizada %). Divergências aparecem como `Alert`s. Campos ausentes são marcados "não encontrado no documento" com motivo. Sem alterações de layout/design.

## 6. Edge Function

Reescrever `extract()` em `process-tax-reform-document/index.ts` reutilizando exatamente os mesmos parsers (copiando a lógica para o runtime Deno, já que a função não importa de `src/`). Atualizar `extracted_values` e `extracted_findings` com os novos campos para que o frontend leia.

## 7. Testes

Criar fixtures `*.fixture.ts` com trechos reais (texto) dos três documentos do Escritório Zimmermann e validar:

- PGDAS sem alíquota escrita → `effectiveTaxRate ≈ 8.29`, `grossRevenue12m = 958935.69`, `factorRStatus = 'nao_se_aplica'`.
- DRE → `grossRevenue = 902870.81`, `inputCostPercent ≈ 42.78`, `annualEffectiveTaxRate ≈ 8.29`, `payrollPercentFromDre ≈ 42.79`.
- Folha 05/2026 → `employeesCount = 7`, `grossPayroll = 24565.24`, `annualizedPayrollPercentByRbt12 ≈ 30.74`.
- Reconcile: CNPJ bate, DRE.grossRevenue ≈ PGDAS.rbaa, alíquotas batem, Fator R não gera alerta.
- Balanço: saldo "Clientes" não vira B2B/B2C.
- Score: `costs = 13`, `currentTax = 0`, perfil de clientes permanece dependente do questionário.

## Critérios de aceite

PGDAS calcula alíquota mesmo sem rótulo; Balanço e DRE são separados; Folha lê linha Total; CNPJ confere entre documentos; RBAA bate com DRE; alíquota anual bate; custos e folha entram no score; perfil de clientes não vem do balanço; Fator R "Não se aplica" respeitado; dados extraídos visíveis no painel; divergências viram alerta; arquivos não processáveis nunca geram dados fictícios; testes verdes.

Sem redesign de UI. Foco em interpretação contábil real e cálculo tributário/documental.
