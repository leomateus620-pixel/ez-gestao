## Problema

Várias informações nos sub-menus de **Reforma Tributária** (Dados da empresa, Questionário, Documentos, Resultado, Parecer manual, Histórico) aparecem com cinza muito claro sobre o fundo glass quente — subtítulos, helper text, listas de documentos, perguntas respondidas, status. Isso vem do uso massivo de `text-foreground/45..70` (33 ocorrências em `TaxReformWorkspace.tsx` + 2 em `TaxReformWizardHeader.tsx`) que combina opacidade com o fundo claro e perde contraste.

O design system já expõe tokens prontos (`--text-secondary` = 220 18% 24%, `--text-tertiary` = 220 12% 38%) — só falta aplicá-los e subir os níveis de opacidade usados.

## Escopo

Apenas `src/features/tax-reform/components/TaxReformWorkspace.tsx` e `src/features/tax-reform/components/TaxReformWizardHeader.tsx`. Nada fora do módulo Reforma Tributária. Sem mudar layout, espaçamento, cor de marca, gradientes, glass cards, badges ou tamanhos de fonte. Sem renderizar nenhuma seção a mais ou a menos.

## Mudanças (apenas contraste de tipografia)

Substituições mecânicas, mantendo a hierarquia visual (helper continua mais leve que título, mas legível):

| Atual | Novo | Uso |
|---|---|---|
| `text-foreground/45` | `text-foreground/70` | ícone de busca |
| `text-foreground/55` | `text-foreground/80` | metadados auxiliares (data de atualização, rodapé do histórico) |
| `text-foreground/60` | `text-foreground/85` | subtítulos curtos, "Nenhum documento anexado", helper de bloco do questionário, mensagem preliminar |
| `text-foreground/65` | `text-foreground/85` | subtítulos de painel (Resultado, Wizard header) |
| `text-foreground/70` | `text-foreground/90` | corpo de listas (documentos usados, perguntas respondidas, parecer manual, decisão final, sumário) e botões inativos do wizard |
| `opacity-80` (status preliminar) | `opacity-95` | descrição do badge de status e lista de razões de confiança |
| `text-amber-700` em mensagens de erro de upload | `text-amber-800` | erros de upload/leitura na lista de documentos |

Helper text dentro de campos (`Label`, inputs) já usa contraste padrão do shadcn — não tocar.

Cores semânticas (amber, rose, emerald, sky, primary) usadas em alertas/badges permanecem; só ajustamos amber-700→amber-800 nas mensagens em texto pequeno sobre fundo branco que ficam pouco visíveis.

## Validação

1. `bunx vitest run` (testes não devem ser afetados — pura classe Tailwind).
2. Verificar no preview as 5 etapas: Dados da empresa, Questionário, Documentos, Resultado, Parecer manual, e o painel de Histórico — todas as informações que estavam apagadas nas screenshots ficam claramente legíveis sem alterar layout.

## Fora de escopo

- Nenhuma alteração em outros menus do EZ Gestão.
- Sem novos componentes, sem mover seções, sem mexer em badges/Glass/tokens de marca.
- Sem trocar fonte ou tamanho.
