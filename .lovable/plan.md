## Problema

O campo "Alíquota efetiva atual (%)" é `<input type="number">`, que não aceita vírgula como separador decimal em pt-BR. Ao digitar `8,29`, o navegador descarta a vírgula e envia `829`, que viola a regra de 0–100% no backend.

## Correção

Arquivo: `src/features/tax-reform/components/TaxReformWorkspace.tsx`

1. Trocar o input da alíquota de `type="number"` para `type="text"` com `inputMode="decimal"` e `pattern` permitindo vírgula ou ponto, mantendo placeholder "0,00".
2. Ajustar `normalizeNumber` (ou o ponto de envio do form) para aceitar vírgula: substituir `,` por `.` antes do `Number(...)`.
3. Aplicar o mesmo tratamento de vírgula nos campos "Faturamento últimos 12 meses" e "Faturamento projetado 12 meses" (já são `text`, mas hoje não convertem vírgula).
4. Validar antes de salvar: se alíquota fora de 0–100, mostrar toast objetivo "Alíquota efetiva deve estar entre 0 e 100%." (evita o erro genérico atual).

Sem alterações em outros módulos, schema ou backend.
