# Plano — Leitura real e robusta de documentos na Reforma Tributária

Foco: corrigir extração de PGDAS, Balanço/DRE e Folha de Pagamento dos documentos reais do Escritório Zimmermann, com validações cruzadas, score confiável e painel Resultado completo. Sem redesign, sem mocks, sem mudar outros menus.

## Escopo de arquivos

- `supabase/functions/process-tax-reform-document/index.ts` — orquestração, caps, timeout, status unificado.
- `src/features/tax-reform/document-analysis/normalize.ts` — helpers de número BR e busca por linha.
- `src/features/tax-reform/document-analysis/extractors.ts` — parsers PGDAS, DRE/Balanço, Folha.
- `src/features/tax-reform/document-analysis/reconcile.ts` — cruzamentos CNPJ / Receita / Alíquota / Folha / Fator R.
- `src/features/tax-reform/document-analysis/documentScore.ts` — score documental com gates.
- `src/features/tax-reform/confidence.ts` — distinção financeira × comercial × extração.
- `src/features/tax-reform/components/TaxReformWorkspace.tsx` (apenas seção Resultado, sem redesign).
- Testes: `__tests__/parsers-large.test.ts`, `parsers.test.ts`, fixtures dos 3 documentos reais.

## 1. Garantias gerais (edge function)

- Cap de 200 páginas; warning "Documento truncado em 200 páginas".
- Cap de 5.000.000 chars; warning "Texto truncado por segurança".
- `Promise.race` 50s → `reading_status='nao_processavel'`, `extraction_confidence=0`.
- Status unificado:
  - `lido`: campos decisivos presentes + validações OK + confiança ≥ 70.
  - `erro_leitura`: dados encontrados mas inconsistentes/decisivos ausentes (lista campos faltantes).
  - `nao_processavel`: PDF não parseável.
- Score só consome documentos `lido` com confiança ≥ 70.

## 2. Helpers em `normalize.ts`

- `parseBrMoney`: aceita `1.234,56`, `(1.234,56)` (negativo), `-1.234,56`, `0,00`; rejeita CNPJ/CPF/ano/página/código contábil/folha/protocolo (filtros por contexto).
- `extractLastMoneyFromLine(label, lines)`: localiza linha do rótulo; retorna o **último** valor monetário da linha; se a linha não tiver número, olha próxima não-vazia; sem cap de 80 chars; ignora códigos e cabeçalhos. Substitui o frágil `numberAfter({0,80})`.
- `splitDocumentSections(text, markers)`: separa Balanço-Ativo, Balanço-Passivo e DRE em blocos independentes antes da extração.

## 3. PGDAS

- Seccionar por blocos (2.1 Discriminativo, 2.4 Fator r, 6 DAS, Total Geral da Empresa); em retransmissão, escolher bloco mais recente/completo dentro da seção certa.
- `firstNumberNear` ampliado para 10 linhas com barreiras (novo rótulo/seção/estabelecimento/anexo/página).
- Extrair: nome, CNPJ básico e do estabelecimento, período, optante, regime, Receita PA, RBT12, RBA, RBAA, limite/sublimite, DAS, IRPJ, CSLL, COFINS, PIS, INSS/CPP, ICMS, IPI, ISS, Fator R, mercado externo.
- `effectiveTaxRate = dasTotal / monthlyRevenue * 100` quando não escrita.
- Validar `|dasTotal − Σ tributos| ≤ 1,00`; senão warning + −0.2 de confiança.
- Campos decisivos: `monthlyRevenue` + `grossRevenue12m` + (`dasTotal` ou `effectiveTaxRate`).
- Esperado Zimmermann: PA 04/2026, Receita 80.220,40, RBT12 958.935,69, RBAA 902.870,81, DAS 6.651,30, alíquota 8,29%, Fator R "não se aplica".

## 4. Balanço + DRE

- Separar seções antes de extrair; valores de Balanço **nunca** entram como folha/custo/despesa.
- Lista negra para folha: Ativo, Ativo Circulante, Disponível, Clientes, Passivo, PL, AFAC, número da folha do relatório.
- Balanço (contexto financeiro): `assetsTotal, currentAssets, cashAndBanks, financialInvestments, accountsReceivable, nonCurrentAssets, liabilitiesTotal, currentLiabilities, suppliersBalance, laborObligations, taxObligations, simplesPayable, irrfPayable, equity, afac`.
- DRE: `grossRevenue, serviceRevenue, simplesNacionalExpense, netRevenue, serviceCosts, grossProfit, operatingExpenses, adminExpenses, proLabore, pjServices, taxExpenses, financialResult, otherOperatingExpenses, netProfit`.
- Derivados: `annualEffectiveTaxRate, inputCostPercent, grossMargin, netMargin`.
- Campos decisivos DRE: `grossRevenue` + (`serviceCosts` | `grossProfit` | `netProfit`).
- Balancetes com colunas largas: usar o **último** valor monetário da linha do rótulo (via `extractLastMoneyFromLine`).

## 5. Folha anual pela DRE

Somar apenas contas trabalhistas explícitas: 13º, FGTS, Férias, Ordenados/Gratificações, Aviso Prévio, Estagiários, Ajuda de Custo, Pró-labore.

- Esperado Zimmermann: `annualPayrollFromDre = 386.359,35`, `payrollPercentFromDre = 42,79%` (corrige o errôneo 89,39%).

## 6. Folha de Pagamento (RESUMO DE CÁLCULO)

- Detectar primeiro "Total Geral"/consolidado final; se existir, usar apenas ele.
- Sem total geral: somar todos os totais parciais válidos por estabelecimento/departamento.
- Nunca somar parcial + geral. Quando só houver `Total:`, usar o último válido.
- Lookahead até 30 linhas, parando em barreiras (Empregado, Empresa:, Inscr. Fed., RESUMO, novo CNPJ, novo Total:, Página, JB Folha, Pacote, cabeçalho de colunas, novo estab/depto).
- Validar bloco de 11 números: `|netPayroll − (grossPayroll − discounts)| ≤ 1`, `salaryTotal ≤ grossPayroll`, `fgtsValue ≤ fgtsBase`, `inssValue ≤ inssBase`. Falha → `erro_leitura`.
- Empregados: aceita mesma linha, linha seguinte, ou próximo do rodapé (filtrando página/pacote/data).
- Campos decisivos: `salaryTotal, grossPayroll, netPayroll, period`.
- Esperado Zimmermann: 7 empregados, proventos 24.565,24, INSS 2.343,08, FGTS 1.835,52, líquido 20.492,37, período 05/2026.
- Quando houver PGDAS: calcular `payrollPercentByMonthlyRevenue`, `…WithCharges…`, `annualizedPayrollPercentByRbt12` e `…WithCharges…` (esperado 30,62 / 35,83 / 30,74 / 35,97).

## 7. Clientes do Balanço (perfil comercial, não faturamento)

- Extrair `balanceClientsTotal`, lista, classificação heurística por sufixo: LTDA/EIRELI/CIA/ME/EPP/comércio/clínica/etc → `b2b_pj`; associação/condomínio/edifício/Rotary/clube → `entity`; demais sem sufixo → `b2c_pf`.
- Nunca inferir regime tributário do cliente; marcar `regime: desconhecido`.
- Saídas: `b2bPercentFromBalanceClients`, `entityPercentFromBalanceClients`, `b2cPercentFromBalanceClients`, `top10BalanceClientsConcentration`, `clientProfileSource='balance_clients_account'`, `clientProfileConfidence='medium'`.
- Mensagem no Resultado deixando explícito que não substitui relatório de faturamento por cliente.

## 8. Validações cruzadas (`reconcile.ts`)

- CNPJ idêntico entre PGDAS/DRE/Folha; divergência → alerta crítico.
- `dre.grossRevenue ≈ pgdas.rbaa` (tolerância R$ 1).
- `dre.annualEffectiveTaxRate ≈ pgdas.effectiveTaxRate` (tolerância 0,1 pp).
- Folha DRE vs folha mensal anualizada: apenas coerência (DRE maior é esperado por 13º/férias/FGTS/pró-labore).
- Fator R "Não se aplica" no PGDAS → `factorRStatus='nao_se_aplica'`, `shouldCalculateFactorR=false`, sem alerta de Fator R.

## 9. Score documental (`documentScore.ts`)

Somente documentos `lido` + confiança ≥ 70:

- Custos: `inputCostPercent=42,78` → `inputs_revenue_percent='41_60'` (+8).
- Folha: `payrollPercentFromDre=42,79` ou anualizada > 20 → +5.
- Tributário atual: alíquota 8,29 < 12 → 0 pts; `nearSimplesLimit=false` → 0 pts.
- Perfil clientes: B2B ≥ 70% → `sales_b2b_percent=94,25` (+20); Top10 ≥ 50% → +10.
- Não preencher automaticamente: clientes Lucro Real, uso de créditos, risco comercial.
- Esperado: custos 13, tributário 0, clientes 30, total 43.

## 10. Painel Resultado (sem redesign)

Apenas ampliar os dados exibidos nas seções já existentes de PGDAS, DRE e Folha conforme especificação (status, alíquota efetiva, custos %, folha %, B2B %, Top10 %, etc.) e alertas listados.

## 11. Confiança (`confidence.ts`)

Introduzir três medidores distintos: `financialTaxConfidence`, `commercialProfileConfidence`, `documentExtractionConfidence`. PGDAS+DRE+Folha lidos → alta financeira; Balanço Clientes → média comercial; sem faturamento por cliente com CNPJ/regime → comercial incompleta para créditos.

## 12. Testes

Manter verdes os existentes e adicionar em `__tests__/parsers-large.test.ts`:

- PGDAS: RBT12/Receita PA/DAS, alíquota 8,29, soma de tributos, retransmissão com 2 blocos.
- DRE: receitas/custos/lucro/margens, folha pela DRE, sem confundir Ativo Total, balancete colunas largas.
- Folha: 1 linha Total; 50 empregados; 3 estabelecimentos; parcial + geral; cabeçalho após Total; líquido inconsistente; valores Zimmermann; razões anualizadas.
- Clientes Balanço: B2B 94,25 / B2C 1,98 / entidades 3,77 / Top10 56,52; sem regime inferido.
- Score: 13/0/30/43; docs com erro não somam; recomendação "permanecer no Simples + alerta B2B".
- Sem campos decisivos: `erro_leitura`, lista de ausentes, sem findings, sem score.

## Critérios de aceite

Folha lê os 3 documentos reais, PGDAS extrai além do RBT12 com alíquota 8,29%, DRE mostra folha/receita 42,79% e não confunde Ativo Total, score só usa documentos válidos, perfil B2B aparece sem inventar regime, documentos grandes têm cap/timeout/warning, painel Resultado mostra os campos listados, todos os testes passam.

## Fora de escopo

OCR de PDFs escaneados, redesign do painel, mudanças em outros menus, mover lógica do edge para o cliente.
