## Diagnóstico

- O erro da folha vem do parser do PDF no backend: a extração atual (`unpdf extractText` com páginas mescladas) perde a estrutura visual da tabela da folha.
- No arquivo mostrado, alguns valores monetários chegam colados na mesma string, por exemplo `1.835,52321,79` e `22.944,2419.673,40`.
- Como o parser exige 11 valores na linha/bloco `Total`, esses valores colados fazem a leitura encontrar menos colunas do que deveria. Resultado: `Linha "Total" não encontrada` e a folha é marcada como `erro_leitura`.
- A folha é essencial para o cálculo porque alimenta `grossPayroll`, encargos (`inssValue`, `fgtsValue`) e o percentual de folha sobre receita/RBT12 usado em `payroll_revenue_percent`.
- O aviso `Faltam documentos-chave: Balancete, Faturamento por cliente, Relação de fornecedores.` aparece em dois pontos:
  - no bloco de upload/documentos;
  - no painel de resultado, via pendências/alertas de documentos faltantes.

## Correção proposta

1. **Corrigir a extração de texto da folha no backend**
   - Substituir a leitura genérica do PDF por reconstrução linha-a-linha baseada em coordenadas quando o arquivo for PDF.
   - Agrupar itens pela posição vertical, ordenar pela posição horizontal e preservar espaços/colunas.
   - Isso evita que valores da tabela sejam colados e permite detectar corretamente a linha `Total`.

2. **Fortalecer o parser da folha**
   - Melhorar a leitura dos blocos `Total:` para aceitar valores colados por falha do PDF quando ainda for possível separar com segurança.
   - Manter a validação contábil obrigatória: `Líquido = Proventos/Vantagens - Descontos`.
   - Persistir dados da folha somente quando os campos decisivos estiverem válidos: período, total de salários, proventos/vantagens e líquido a pagar.

3. **Sincronizar parser local e Edge Function**
   - Aplicar a mesma lógica no parser frontend/testável e no backend para evitar divergência entre testes e produção.

4. **Adicionar testes regressivos para a folha Zimmermann**
   - Cobrir exatamente o caso do arquivo exibido, inclusive valores colados como `1.835,52321,79` e `22.944,2419.673,40`.
   - Validar os valores esperados:
     - empregados: `7`;
     - salário total: `22.680,85`;
     - proventos/vantagens: `24.565,24`;
     - descontos: `4.072,87`;
     - líquido: `20.492,37`;
     - INSS: `2.343,08`;
     - FGTS: `1.835,52`.

5. **Remover o aviso solicitado da interface**
   - Remover o banner `Faltam documentos-chave...` no menu/documentos.
   - Remover documentos faltantes e o alerta equivalente do painel Resultado.
   - Manter erros reais de leitura visíveis, especialmente erro de folha, porque isso afeta o cálculo.

6. **Validar e reimplantar**
   - Rodar os testes do parser.
   - Reimplantar a Edge Function `process-tax-reform-document`.
   - Reprocessar a folha já anexada e confirmar que fica `lido`, com confiança suficiente e alimentando o score.