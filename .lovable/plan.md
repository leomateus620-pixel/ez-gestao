## Diagnóstico

**1. Faturamento projetado 12 meses**
- Campo aparece em `CompanyForm` (linha 524 de `TaxReformWorkspace.tsx`) e é capturado no estado `form.projectedRevenue`, persistido em `tax_reform_companies.projected_revenue`.
- Usuário não quer mais esse campo no cadastro.

**2. Contraste do formulário**
- `Label` usa `text-[hsl(var(--text-secondary))]` e `Input` usa `bg-[hsla(var(--surface-panel-strong))]` com placeholder em `text-[hsl(var(--text-tertiary))]`.
- No fundo creme da tela (GlassCard) os rótulos e placeholders ficam quase invisíveis, conforme o print enviado.
- Precisamos reforçar o contraste do rótulo (usar `--text-primary` ou peso/opacidade maior) e do placeholder dos inputs neste formulário, sem mexer no design system global.

**3. Persistência no Cloud**
- `upsertCompany` (linha 1519) atualiza apenas o estado local.
- O `useEffect` da linha 1439 detecta a mudança no `store` e chama `saveTaxReformStore(derived)` (debounce 700ms), que executa `upsertTaxReformCompany` no Supabase.
- Fluxo está correto, mas vamos confirmar editando um campo da empresa Zimmermann (rbt12, alíquota e responsável) e checando o registro em `tax_reform_companies` após o debounce. Se houver falha, ajustamos o tratamento de erro.

## Alterações

1. **Remover campo "Faturamento projetado 12 meses"**
   - Tirar o input da grade do `CompanyForm`.
   - Remover `projectedRevenue` do estado `form`, do `useEffect` de sincronização e do payload de `onSave`.
   - Manter o campo `projectedRevenue` no tipo `TaxReformCompany` e na persistência (coluna existe no banco) — apenas não enviamos mais valor pelo formulário. Isso evita migração e mantém compatibilidade com dados antigos.

2. **Corrigir contraste do formulário de empresa**
   - Trocar os `Label` deste formulário (e do `SelectField` usado nele) para tom mais escuro: `text-[hsl(var(--text-primary))]` com `font-semibold`.
   - Reforçar placeholders dos `Input` deste formulário com classe local `placeholder:text-[hsl(var(--text-secondary))]` para ficarem legíveis sobre o fundo claro.
   - Sem mexer nos componentes globais `ui/input.tsx` e `ui/label.tsx` (evita afetar o resto do app).

3. **Validar gravação no Cloud**
   - Após as alterações, abrir a empresa Zimmermann no preview, editar `rbt12`, `effectiveTaxRate` e `responsibleUser`, salvar e validar via `supabase--read_query` que a linha foi atualizada (`updated_at` mudou e valores batem).
   - Se a gravação falhar, investigar via logs do navegador e ajustar `upsertTaxReformCompany`/tratamento de erros.

4. **Não mexer** em outros painéis, parsers, Edge Function ou no aviso já removido em ajustes anteriores.

## Validação

- Form do passo "Empresa" não mostra mais "Faturamento projetado".
- Labels e placeholders nítidos no fundo claro.
- Edição da empresa persiste no Cloud (confirmado por consulta na tabela).
