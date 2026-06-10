# Plano — Corrigir parser da Folha de Pagamento (Reforma Tributária)

## Diagnóstico

O PDF real `71052026_000071_ESCRITORIO CONTABIL ZIMMERMANN LTDA.pdf` contém camada de texto e a linha:
`Total: 22.680,85 0,00 24.565,24 2.343,08 19.673,40 321,79 22.944,24 1.835,52 24.565,24 4.072,87 20.492,37`
seguida de `Total de empregados: 7`.

O parser atual falha porque:
1. Em `extractors.ts` (`parsePayrollSummaryDocument`) e em `process-tax-reform-document/index.ts` (`parsePayrollTotals`), a detecção usa `/^\s*Total:/i` — exige `Total:` no início da linha, ignorando linhas com `Total:` no meio ou com valores na mesma linha.
2. O mapeamento de colunas atual está deslocado em relação à ordem real do relatório JB Folha (Salário, S.Fam., Base INSS, INSS, Base IRRF, IRRF, Base FGTS, FGTS, Prov./Vant., Descontos, Líquido).
3. `employeesCount` só aceita número na linha seguinte, não na mesma linha.
4. `decisiveFieldsMissing` não exige `grossPayroll`.
5. Status `lido` é atribuído sempre que `confidence > 0` — permissivo demais.

A fixture `folha-zimmermann.txt` (e os testes em `parsers-large.test.ts`) foi criada com uma ordem de colunas diferente da real e precisa ser realinhada à ordem JB Folha correta.

## Alterações

### 1. `src/features/tax-reform/document-analysis/extractors.ts` — `parsePayrollSummaryDocument`

Substituir a detecção atual por uma busca em 4 camadas:

- **A. Regex no texto completo:** `/\bTotal\s*:\s*((?:-?\d{1,3}(?:\.\d{3})*,\d{2}\s*){11})/gi`. Coletar todas as ocorrências como blocos candidatos.
- **B. Busca por linhas:** se A não encontrar, varrer linhas com `/\bTotal\s*:/i` (excluindo `/Total de empregados/i`). Acumular até 30 linhas seguintes parando em barreiras: `Empregado`, `Empresa:`, `Inscr. Fed.`, `CNPJ:`, `RESUMO`, novo `Total:`, `Cargo:`, `Departamento:`, `Página`, `JB Folha`, `Pacote`. Extrair exatamente 11 monetários.
- **C. Fallback rodapé:** procurar nas últimas 80 linhas um bloco com exatamente 11 monetários. Aceitar somente se o texto contiver `RESUMO DE CÁLCULO`, `Empregado`, `Prov./Vant.`, `Descontos`, `Líquido`.
- **D. Fallback por soma:** identificar linhas `/^\s*\d{6}\s+/` com 11 monetários. Somar coluna a coluna. Aceitar somente se ≥1 empregado e contagem confere com `Total de empregados` (ou diferença explicada).

Para multi-estabelecimento (vários `Total:` válidos via A/B), agregar somando blocos e marcar `establishmentsAggregated`.

Mapeamento fixo (em todos os caminhos):
```
salaryTotal=cols[0]; familySalary=cols[1];
inssBase=cols[2]; inssValue=cols[3];
irrfBase=cols[4]; irrfValue=cols[5];
fgtsBase=cols[6]; fgtsValue=cols[7];
grossPayroll=cols[8]; discounts=cols[9]; netPayroll=cols[10];
```

Adicionar `familySalary?: number` em `types.ts` (`TaxReformExtractedValues`).

**Validação de coerência** antes de aceitar o bloco:
- `|netPayroll - (grossPayroll - discounts)| ≤ 1`
- `salaryTotal ≤ grossPayroll`
- `inssValue ≤ inssBase`, `fgtsValue ≤ fgtsBase`, `irrfValue ≤ irrfBase`
Se falhar: descartar bloco com warning `"bloco Total descartado: valores incoerentes"`; se nenhum bloco passar, emitir warning crítico `"Linha Total encontrada, mas valores incoerentes."` e não preencher campos decisivos.

**employeesCount:** procurar `Total de empregados:\s*(\d+)` na mesma linha; se ausente, próximo inteiro isolado (1–4 dígitos) nas 6 linhas seguintes, ignorando datas (`\d{2}/\d{2}/\d{4}`), `Página`, `Pacote` e monetários (com vírgula).

Adicionar warning crítico se faltar `period`, `salaryTotal`, `grossPayroll` ou `netPayroll`.

### 2. `supabase/functions/process-tax-reform-document/index.ts`

- Reescrever `parsePayrollTotals` com a mesma lógica das 4 camadas e mesmo mapeamento.
- Em `decisiveFieldsMissing` para `folha_pagamento`: exigir `period`, `salaryTotal`, `grossPayroll`, `netPayroll`. Mensagem: `"Campos decisivos ausentes: Período, Total de salários, Proventos/Vantagens, Líquido a pagar."`.
- Trocar `const status = result.confidence > 0 ? 'lido' : 'erro_leitura'` por:
  ```
  const hasCriticalWarnings = warnings.some(w => /incoerentes|não encontrada|ausentes/i.test(w));
  const status = result.confidence >= 0.7 && !hasCriticalWarnings ? 'lido' : 'erro_leitura';
  ```
- Quando `status === 'erro_leitura'`, gravar `extraction_confidence = 0` e `extraction_error` específico.
- Manter cálculos cross-document Folha×PGDAS já existentes (`payrollPercentByMonthlyRevenue`, etc.) — só rodam quando folha tem `grossPayroll` válido.

### 3. Score / consumo

Em `documentScore.ts` (já filtra por `readingStatus === 'lido'`): adicionar guarda extra exigindo `extractionConfidence ?? 0 ≥ 0.7` antes de incluir extracted values no score.

### 4. Fixture e testes

- Reescrever `__tests__/fixtures/folha-zimmermann.txt` com o texto real (formato tabela linearizado) do PDF Zimmermann, com ordem correta de colunas.
- Em `parsers-large.test.ts` ajustar `buildFolha` para gerar valores na ordem JB Folha real e adicionar casos:
  - `Total:` + valores na **mesma** linha.
  - `Total:` em linha separada + valores na linha seguinte.
  - `Total de empregados: 7` na mesma linha.
  - `Total de empregados:` com `7` na linha seguinte.
  - Sem `Total:`, com 7 linhas de empregados válidas → fallback D.
  - Bloco `Total:` com `netPayroll` inconsistente → `erro_leitura` e sem campos.
  - Ordem das colunas: assert `irrfBase=19673.40`, `irrfValue=321.79`, `fgtsBase=22944.24`, `fgtsValue=1835.52`, `grossPayroll=24565.24`, `netPayroll=20492.37`.
- Novo teste para `parsers.test.ts` consumindo a fixture real e validando os 11 campos + `employeesCount=7` + `confidence ≥ 0.7`.

### 5. Redeploy + validação end-to-end

- Redeploy de `process-tax-reform-document`.
- Resetar a leitura do documento Zimmermann via SQL:
  ```sql
  update public.tax_reform_documents
  set reading_status='aguardando_leitura', extraction_error=null,
      extracted_summary=null, extracted_values=null,
      extracted_findings=null, extraction_confidence=null, updated_at=now()
  where file_name ilike '71052026_000071%';
  ```
- Verificar no preview: folha aparece **Lido** com salários 22.680,85 / Prov. 24.565,24 / Líquido 20.492,37 / 7 empregados, e os percentuais cross-document com PGDAS aparecem.

## Arquivos alterados

- `src/features/tax-reform/document-analysis/extractors.ts`
- `src/features/tax-reform/document-analysis/types.ts` (adiciona `familySalary`)
- `src/features/tax-reform/document-analysis/documentScore.ts` (guarda `confidence ≥ 0.7`)
- `supabase/functions/process-tax-reform-document/index.ts`
- `src/features/tax-reform/document-analysis/__tests__/fixtures/folha-zimmermann.txt`
- `src/features/tax-reform/document-analysis/__tests__/parsers-large.test.ts`
- `src/features/tax-reform/document-analysis/__tests__/parsers.test.ts`

## Critérios de aceite

- PDF Zimmermann lê como `lido` com os 11 valores corretos + `employeesCount=7`.
- Mensagem "Linha Total não encontrada" desaparece.
- Documentos com coerência ruim ficam `erro_leitura` e não alimentam o score.
- Todos os testes (incluindo os novos) passam.
- PGDAS e DRE continuam funcionando inalterados.
