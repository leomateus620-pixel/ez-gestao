# Corrigir leitura Balanço + DRE na Reforma Tributária

## Diagnóstico

O parser correto já existe em `src/features/tax-reform/document-analysis/extractors.ts` (`parseBalanceAndDreDocument`) e é coberto pelos testes em `parsers.test.ts` com os valores exatos do Zimmermann (grossRevenue 902.870,81 / netProfit 375.304,85 / inputCostPercent 42,78 etc.).

O problema está na **Edge Function** `supabase/functions/process-tax-reform-document/index.ts`, que tem uma cópia genérica e ultrapassada da lógica de DRE/Balancete:

- usa `numberAfter(text, ['receita', 'faturamento'])` e `['resultado']` — pega o `RESULTADO LÍQUIDO DO EXERCÍCIO` (375.304,85) como `revenue`;
- não separa seções Ativo / Passivo / DRE;
- grava `extracted_values` (revenue, inputCostPercent=100, operatingExpenses) mesmo quando o `reading_status` final é `erro_leitura`;
- gate decisivo aceita só `revenue` (campo errado) em vez de `grossRevenue` + um secundário.

A UI do painel Resultado em `TaxReformWorkspace.tsx` lê `extracted_values` direto, então qualquer dado escrito é exibido. Precisamos garantir no backend que documentos com erro não tragam números, e no frontend filtrar a exibição.

## Mudanças

### 1. `supabase/functions/process-tax-reform-document/index.ts`

- Adicionar `splitBalanceAndDreSections(text)` que separa Ativo / Passivo / DRE pelos cabeçalhos `BALANÇO PATRIMONIAL` + `A T I V O`, `P A S S I V O`, `DEMONSTRAÇÃO DO RESULTADO`.
- Substituir o bloco `if (documentType === 'dre' || documentType === 'balancete')` por chamada a uma nova `parseBalanceAndDre(text)` que:
  - extrai apenas da seção DRE: `RECEITA BRUTA OPERACIONAL` → `grossRevenue`; `PRESTAÇÃO DE SERVIÇOS` → `serviceRevenue`; `DEDUÇÕES DA RECEITA BRUTA` e `SIMPLES NACIONAL` (dentro de deduções) → `simplesNacionalExpense`; `RECEITA OPERACIONAL LÍQUIDA` → `netRevenue`; `CUSTO DOS SERVIÇOS PRESTADOS` → `serviceCosts`; `LUCRO BRUTO` → `grossProfit`; `TOTAL DESPESAS OPERACIONAIS` → `operatingExpenses`; `DESPESAS ADMINISTRATIVAS` → `adminExpenses`; `Pro-Labore` → `proLabore`; `Serviços Prestados PJ` → `pjServices`; `DESPESAS TRIBUTARIAS` → `taxExpenses`; `RESULTADO FINANCEIRO LIQUIDO` → `financialResult`; `OUTRAS DESPESAS OPERACIONAIS` → `otherOperatingExpenses`; `RESULTADO LÍQUIDO DO EXERCÍCIO` → `netProfit`;
  - extrai da seção Balanço: `assetsTotal`, `equity`, `afac`, `accountsReceivable`;
  - calcula `inputCostPercent = serviceCosts/grossRevenue*100`, `grossMargin = grossProfit/grossRevenue*100`, `netMargin = netProfit/grossRevenue*100`, `annualEffectiveTaxRate = simplesNacionalExpense/grossRevenue*100`;
  - folha DRE: itera contas trabalhistas estritas (Décimo Terceiro Salário, F.G.T.S., Férias, Ordenados e Gratificações, Aviso Previo, Despesas C/ Estagiários, Ajuda de Custo, Pro-Labore) **somente dentro da seção DRE**, soma → `annualPayrollFromDre`, calcula `payrollPercentFromDre`;
  - NÃO grava `revenue`, `operatingExpenses` ou `netProfit` se a leitura não validar (ver gate).
- Atualizar `decisiveFieldsMissing`: para `dre`/`balancete`, exigir `grossRevenue` + pelo menos um de `serviceCosts | grossProfit | netProfit | simplesNacionalExpense`. Se faltar, marcar `Campos decisivos ausentes na DRE/Balanço.`.
- Atualizar fluxo final (linha 549+): quando `status === 'erro_leitura'`, gravar `extracted_values = { warnings, confidence: 0, readMetadata }`, `extracted_findings = []`, `extracted_summary = 'Leitura falhou. Nenhum dado foi usado no score.'`.

### 2. `src/features/tax-reform/components/TaxReformWorkspace.tsx`

- No painel Resultado, ao renderizar `extracted_values`, ignorar campos numéricos quando `doc.readingStatus !== 'lido'`. Mostrar apenas: `"<Tipo> — Erro na leitura. Nenhum dado deste documento alimentou o score. Motivo: <extraction_error>"`.
- Para DRE/Balancete lido, adicionar bloco formatado com a ordem solicitada (Receita bruta, Simples Nacional, Alíquota anual, Receita líquida, Custo dos serviços, Custos/receita, Lucro bruto, Margem bruta, Lucro líquido, Margem líquida, Folha/receita).

### 3. Testes

- Em `src/features/tax-reform/document-analysis/__tests__/parsers-large.test.ts`, adicionar suíte com a fixture `balanco-dre-zimmermann.txt` validando os valores exatos listados pelo usuário (grossRevenue 902870.81, simplesNacionalExpense 74867.75, netRevenue 828003.06, serviceCosts 386206.28, grossProfit 441796.78, operatingExpenses 84851.92, netProfit 375304.85, inputCostPercent 42.78, grossMargin 48.93, netMargin 41.57, payrollPercentFromDre 42.79) e dois negativos: `values.revenue !== 375304.85` e `values.inputCostPercent !== 100`.
- Adicionar teste Deno em `supabase/functions/process-tax-reform-document/index.test.ts` (ou estender existente) reaproveitando a mesma fixture para garantir paridade com o extractor do cliente.
- Teste de UI/lógica garantindo que, com `readingStatus = 'erro_leitura'`, o Resultado não exibe valores numéricos.

### 4. Deploy + validação end-to-end

- Reimplantar `process-tax-reform-document` via `supabase--deploy_edge_functions`.
- Resetar via SQL o documento `balanco e dre 2025 ez%` (`reading_status = aguardando_leitura`, limpar campos).
- Reprocessar e conferir via `supabase--read_query` que `grossRevenue = 902870.81`, `netProfit = 375304.85`, `inputCostPercent ≈ 42.78`, `reading_status = 'lido'`, `extraction_confidence ≥ 0.7`.

## Fora do escopo

- PGDAS, folha de pagamento, faturamento por cliente.
- Layout geral / outros painéis (Dashboard, Documentos, Parecer).
- Persistência do questionário (já corrigido em loop anterior).

## Critério de aceite

- Documento Zimmermann fica `lido` com `grossRevenue` correto e sem custos 100%.
- Erros de leitura não geram mais campos numéricos no Resultado.
- Score só consome documentos `lido`.
- Testes verdes; Edge Function redeployada.
