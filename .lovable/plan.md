## Diagnóstico

A empresa **Leonardo** foi criada com sucesso (`POST /empresas → 201`) e está no banco com `status = 'ativa'`. O motivo de ela não aparecer na lista é o **filtro de status** ativo na página `/empresas`.

Pelo replay da sessão, o filtro de status foi alterado para **"Arquivada"** logo antes da criação. Como a nova empresa nasce com status `ativa`, ela é removida pelo predicado `matchStatus = filtroStatus === 'todos' || e.status === filtroStatus` em `src/pages/Empresas.tsx` (linha 60). O `react-query` invalida `['empresas']` corretamente após o insert, então o problema é puramente de UX: a lista parece "vazia" porque os filtros escondem as empresas existentes.

## Correção proposta

Pequenas mudanças apenas em `src/pages/Empresas.tsx` (UI/front-end), sem mexer no DataProvider nem no banco:

1. **Resetar filtros ao criar empresa com sucesso**  
   No `handleSubmit`, após o `addEmpresa` retornar sucesso, além de fechar o form, redefinir `filtroStatus = 'todos'`, `filtroRegime = 'todos'`, `busca = ''` e `page = 1`. Garante que a empresa recém-criada apareça imediatamente.

2. **Banner de "empresas ocultas por filtro"**  
   Quando `state.empresas.length > 0` e `empresasFiltradas.length === 0` (ou for menor que o total), mostrar acima da lista uma mensagem discreta tipo:  
   _"X empresa(s) oculta(s) pelos filtros atuais."_ com botão **"Limpar filtros"** que zera busca/status/regime.

3. **EmptyState mais claro**  
   Quando não há resultados mas existem empresas no estado, trocar o texto atual ("Nenhuma empresa encontrada") por uma variação que indique que os filtros estão ativos e oferecer a ação "Limpar filtros" em vez de "Nova Empresa".

## Fora de escopo

- Nenhuma mudança em `DataProvider`, mutations, schema ou edge functions — o fluxo de insert e invalidação já funciona.
- Sem mexer no design system / tokens.