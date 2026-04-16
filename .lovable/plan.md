

Vou investigar o bug ao criar empresa no menu /empresas.

## Análise

Olhando o código de `DataProvider.tsx`:

```ts
const addEmpresa = useCallback((empresa: Empresa): boolean => {
  if (cnpjExists(empresa.cnpj)) return false;
  supabase.from('empresas').insert({...}).then(() => queryClient.invalidateQueries(...));
  return true;
}, ...);
```

Problemas identificados:

1. **Sem autenticação**: As políticas RLS exigem `authenticated`, mas o projeto **não tem sistema de login**. Qualquer INSERT vai falhar com `new row violates row-level security policy` porque o usuário é anônimo.

2. **Erros silenciosos**: O `.then()` ignora erros completamente — não há `.catch()`, não há toast, não há feedback ao usuário. Por isso "nada acontece" ao salvar.

3. **Fire-and-forget**: `addEmpresa` retorna `true` antes do INSERT terminar, então o formulário fecha mesmo quando o INSERT falha no servidor.

4. **Mesmo padrão em todas as mutations** (updateEmpresa, addDocumento, addEnvio, etc.) — todas falham silenciosamente.

## Causa raiz

RLS authenticated + ausência de auth = todo INSERT é bloqueado, e o erro nunca aparece na UI.

## Correção

### Opção escolhida: ajustar RLS para permitir acesso público temporário + adicionar tratamento de erro

Como o sistema ainda não tem tela de login implementada (o plano original previa isso para uma fase futura) e o usuário precisa usar o sistema agora, a correção mais pragmática é:

**1. Migração SQL** — alterar políticas RLS de `empresas` (e demais tabelas operacionais) para aceitar `anon` além de `authenticated`, mantendo a estrutura preparada para auth futura:

```sql
-- empresas
DROP POLICY "Authenticated users can insert empresas" ON public.empresas;
DROP POLICY "Authenticated users can read empresas" ON public.empresas;
DROP POLICY "Authenticated users can update empresas" ON public.empresas;
DROP POLICY "Authenticated users can delete empresas" ON public.empresas;

CREATE POLICY "Public can manage empresas" ON public.empresas
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
```

Aplicar o mesmo padrão a: `cnd_items`, `documentos`, `envios`, `alertas`, `logs_acesso`, `audit_trail`, `cnd_historico`, `connectors`, `connector_runs`, `connector_run_steps`, `exceptions`, `automation_batches`, `automation_config`, `health_logs`, `retry_policies`, `scheduling_rules`.

**2. Refatorar `addEmpresa` (e todas as outras mutations) em `DataProvider.tsx`** para usar `useMutation` com `await`, capturando erros e mostrando `toast`:

```ts
const addEmpresaMutation = useMutation({
  mutationFn: async (empresa: Empresa) => {
    const { error } = await supabase.from('empresas').insert({...});
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['empresas'] });
    toast({ title: 'Empresa criada com sucesso' });
  },
  onError: (err) => {
    toast({ title: 'Erro ao salvar empresa', description: err.message, variant: 'destructive' });
  },
});

const addEmpresa = (empresa: Empresa): boolean => {
  if (cnpjExists(empresa.cnpj)) {
    toast({ title: 'CNPJ já cadastrado', variant: 'destructive' });
    return false;
  }
  addEmpresaMutation.mutate(empresa);
  return true;
};
```

Aplicar o mesmo padrão (await + try/catch + toast) a `updateEmpresa`, `addDocumento`, `addEnvio`, `addLog`, `resolveAlerta`, `markAlertaLido`, `resolveAllAlertas`, `markAllAlertasLidos` e `generateChecklistForRegime`.

⚠️ **Nota de segurança**: Abrir RLS para `anon` é um workaround temporário para o sistema funcionar sem auth. Quando você adicionar login (recomendado em seguida), as políticas devem voltar a `authenticated` e idealmente filtrar por `user_id`.

## Arquivos afetados

- **Nova migração SQL** — abertura das políticas RLS para anon
- **`src/data/DataProvider.tsx`** — todas as mutations com error handling + toast

