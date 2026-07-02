## Ajuste: renomear referências para "FATOR R - PGDAS"

O fluxo já é robusto a rename porque usa o **ID** da pasta no Drive (`FATOR_R_INBOX_FOLDER_ID`), não o nome. O mês do PGDAS é lido do texto do PDF (`Período de Apuração`), então extratos de maio funcionam sem alteração de código no parser.

Só precisamos atualizar textos visíveis na UI e docs internos que ainda mencionam "PGDAS JULHO", para não confundir o usuário.

### Alterações

1. `src/pages/FatorR.tsx`
   - Subtítulo do `PageHeader`: trocar "no dia 20 de cada mês" já está ok; ajustar menção da pasta.
   - Botão "Abrir pasta PGDAS" → manter (genérico).
   - Empty state: "coloque os extratos na pasta **PGDAS JULHO**" → "coloque os extratos na pasta **FATOR R - PGDAS**".

2. `.lovable/plan.md` e `docs/fator-r-monitoring.md` (opcional): atualizar referência textual à pasta.

### Fora de escopo
- Nada de mudança em Edge Function, cron, parser, schema ou secret. O ID da pasta continua o mesmo.
- Não travar por mês: o parser já aceita qualquer `MM/AAAA`; extratos de maio entram normalmente.
