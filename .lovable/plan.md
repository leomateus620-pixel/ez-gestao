

# Trocar CNPJ de teste do dry-run

## O que será feito

Atualizar o CNPJ de teste usado no dry-run de **88736335000113** para **47737345000196** (CAMILA DA SILVA WEINERT SERVICOS ADMINISTRATIVOS LTDA).

## Arquivos alterados

1. **`supabase/functions/dry-run-zimmermann/index.ts`** (linha 12)
   - `const ZIMMERMANN_CNPJ = "47737345000196";`

2. **`supabase/functions/dry-run-zimmermann-status/index.ts`** (linhas 23 e 121)
   - Linha 23: `cnpj: "47737345000196",`
   - Linha 121: `cnpj: "47737345000196",`

## Deploy

Edge functions são deployadas automaticamente pelo Lovable. Nenhuma ação manual necessária.

## Resultado esperado

Próximo dry-run usará o CNPJ 47.737.345/0001-96 da CAMILA DA SILVA WEINERT SERVICOS ADMINISTRATIVOS LTDA.

