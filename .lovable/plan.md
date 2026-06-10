Plano para corrigir a leitura fraca nos submenus da Reforma Tributária sem redesenhar o sistema:

1. Corrigir a causa visual real no escopo do módulo
- Criar um wrapper/classe específica para Reforma Tributária que force textos internos de cards, filtros, tabelas, etapas, descrições, badges e estados para tokens legíveis.
- Reduzir o efeito “apagado” causado por glass/white translúcido + opacidade, sem alterar o menu lateral nem os demais módulos.

2. Substituir opacidade por tokens semânticos mais fortes
- Trocar textos auxiliares importantes de `text-foreground/80..90` para `text-text-secondary` ou `text-foreground` quando forem dados operacionais.
- Títulos de cards, labels, cabeçalhos de tabela, nomes de empresa, CNPJ, regime, score e recomendações ficam com `text-foreground`/peso maior.
- Textos de apoio permanecem secundários, mas com contraste claro e objetivo.

3. Cobrir todos os submenus do fluxo Reforma Tributária
- Dashboard/listagem de empresas e cards de estatística.
- Etapas do wizard: Dados da empresa, Questionário, Documentos, Resultado e Parecer manual.
- Histórico/linhas de análise, mensagens de sincronização e estados de documentos.

4. Ajustar estados ativos/inativos dos botões de etapa e filtros
- Etapa ativa continua com identidade laranja.
- Etapas inativas/concluídas ganham texto mais escuro e superfície mais legível.
- Filtros, selects e inputs mantêm layout atual, mas com labels e placeholders mais claros.

5. Validar visualmente no preview
- Abrir `/reforma-tributaria` e conferir que os textos antes “apagados” aparecem claros.
- Navegar pelos submenus do módulo para garantir que nenhum texto operacional ficou fraco.
- Não mexer no menu lateral nem em módulos fora de Reforma Tributária/Fator R.

Arquivos previstos:
- `src/features/tax-reform/components/TaxReformWorkspace.tsx`
- `src/features/tax-reform/components/TaxReformWizardHeader.tsx`
- `src/index.css` apenas para uma classe escopada de legibilidade do módulo, se necessário.