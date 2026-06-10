## Causa do erro

O PDF da folha (`71052026_..._ZIMMERMANN_LTDA.pdf`) **tem camada de texto** — `pdftotext` extrai normalmente o cabeçalho, a tabela de empregados e a linha `Total: 22.680,85 ... 20.492,37`.

O problema está na **edge function** `supabase/functions/process-tax-reform-document/index.ts`:

- A função `extract()` tem branches só para `dre`, `balancete`, `pgdas`, `faturamento_cliente` e um `else` genérico.
- **Não existe branch para `folha_pagamento`**. O documento cai no `else`, que procura por `receita`, `faturamento`, `fornecedores`, `compras`, `custos` — nada disso aparece numa folha → 0 achados → `confidence = 0` → `reading_status = 'erro_leitura'` com a mensagem genérica "Nenhum campo tributário decisivo foi identificado com segurança no documento."

Os parsers novos em `src/features/tax-reform/document-analysis/extractors.ts` (`parsePayrollSummaryDocument`) **nunca foram espelhados** na edge function — e é a edge function que efetivamente lê o arquivo enviado.

## Correção

**Arquivo:** `supabase/functions/process-tax-reform-document/index.ts`

1. Adicionar branch `documentType === 'folha_pagamento'` em `extract()` que:
   - Extrai `cnpj` (regex), `companyName` (após `Empresa:`), `period` (após `Período: dd/MM/yyyy`), `employeesCount` (após `Total de empregados:`).
   - Localiza a linha que começa com `Total:` (com tolerância a quebras de linha do unpdf — usa `text.split(/\n/)` e procura a primeira linha cujo trim começa com `Total:`; se o restante da linha tiver < 5 números, junta com as 1-2 linhas seguintes até completar 11 números).
   - Extrai os 11 números na ordem do JB Folha "RESUMO DE CÁLCULO": Salário, S.Fam., BaseINSS, INSS, BaseIRRF, IRRF, BaseFGTS, FGTS, Prov./Vant., Descontos, Líquido — mapeando para `salaryTotal`, `inssBase`, `inssValue`, `irrfBase`, `irrfValue`, `fgtsBase`, `fgtsValue`, `grossPayroll`, `discounts`, `netPayroll`.
   - Empurra findings (`cnpj`, `period`, `employeesCount`, `salaryTotal`, `inssValue`, `fgtsValue`, `grossPayroll`, `netPayroll`) com confiança 0.85–0.9.

2. Estender `summary()` para incluir resumo da folha (`salário total`, `líquido`, `funcionários`) quando presentes — para a UI mostrar "Dados extraídos: salários R$ 22.680,85; líquido R$ 20.492,37; 7 funcionários." em vez da mensagem de erro.

3. **Importante:** confirmar que a ordem dos números no PDF real (via unpdf) bate com a ordem do cabeçalho do JB Folha. O cabeçalho mostra `Salário S.Fam. BaseINSS INSS BaseIRRF IRRF BaseFGTS FGTS Prov./Vant. Descontos Líquido` — corrigir a ordem se o parser src/ atual (que usa `[4]=FGTS, [5]=IRRF`) estiver invertida; usar a ordem do cabeçalho como verdade.

## Validação

- Executar `bunx vitest run` para garantir que `parsers.test.ts` continua passando (e adicionar/ajustar fixture se a ordem mudar).
- Re-upload do PDF de folha no menu Reforma Tributária e confirmar status "Lido" com os valores totais corretos.

## Fora de escopo

- OCR para folhas escaneadas (este PDF tem texto nativo, não precisa).
- Mudanças visuais.
