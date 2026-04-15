

# Integração Real com Serpro + Backend Lovable Cloud

## Contexto Importante

O sistema atual opera 100% com dados mock no frontend. Para conectar APIs reais do Serpro, precisamos:

1. **Ativar Lovable Cloud** (Supabase gerenciado) para ter banco de dados + Edge Functions
2. **Criar schema completo** no banco para todas as entidades (empresas, CNDs, documentos, envios, alertas, logs, automação)
3. **Criar Edge Functions** que fazem proxy para a API do Serpro
4. **Migrar o frontend** de `useReducer` com mock para `react-query` + Supabase client
5. **Remover arquivos mock** (`mockData.ts`, `automationMockData.ts`)

## Pré-requisito: Credenciais Serpro

Você precisará de:
- **Consumer Key** e **Consumer Secret** do Serpro (obtidos no portal Serpro)
- Contrato ativo para os serviços: CND Federal, CNDT, CRF/FGTS

As APIs Serpro disponíveis são:
- **Consulta CNPJ** — dados cadastrais
- **CND Federal / PGFN** — certidão negativa de débitos federais
- **CNDT (TST)** — certidão negativa de débitos trabalhistas
- **CRF/FGTS** — certificado de regularidade FGTS

Para SEFAZ e Municipal, o Serpro **não cobre** — essas fontes continuarão com fluxo de upload manual ou integração futura com outro provider.

## Plano de Implementação

### Etapa 1 — Ativar Lovable Cloud e Criar Banco

Criar tabelas via migrations:

```text
empresas          — cadastro de empresas (id uuid PK, cnpj, razao_social, etc.)
cnd_items         — checklist de certidões por empresa
documentos        — PDFs e arquivos armazenados no Storage
envios            — registros de envio (email/whatsapp)
alertas           — alertas de vencimento e pendências
logs_acesso       — auditoria operacional
audit_trail       — trilha de auditoria detalhada

connectors        — conectores de integração
connector_runs    — execuções de coleta
connector_run_steps — etapas de cada execução
exceptions        — fila de exceções
automation_batches — lotes de coleta
health_logs       — logs de saúde dos conectores
```

RLS habilitado em todas as tabelas. Storage bucket para PDFs de certidões.

### Etapa 2 — Edge Functions para Serpro

Criar Edge Functions que fazem proxy autenticado para o Serpro:

- **`serpro-auth`** — obtém token OAuth2 do Serpro (client_credentials grant)
- **`consulta-cnd-federal`** — consulta CND/CPDEN da Receita Federal por CNPJ
- **`consulta-cndt`** — consulta CNDT do TST por CNPJ
- **`consulta-crf-fgts`** — consulta CRF do FGTS por CNPJ
- **`consulta-cnpj`** — consulta dados cadastrais do CNPJ

Cada function: valida input (Zod), autentica usuário via JWT, chama Serpro, normaliza resposta, salva no banco.

### Etapa 3 — Migrar Providers para Supabase

- **`DataProvider.tsx`** — trocar `useReducer` + mock por queries Supabase (`useQuery`/`useMutation` via react-query)
- **`AutomationProvider.tsx`** — idem, queries reativas ao banco
- Criar hooks: `useEmpresas()`, `useCNDs(empresaId)`, `useDocumentos()`, `useExecucoes()`, etc.
- Remover `mockData.ts` e `automationMockData.ts`
- Criar `src/integrations/supabase/client.ts` e tipos gerados

### Etapa 4 — Conectar Telas ao Backend Real

Cada tela passa a consumir dados do Supabase em vez do state local:

| Tela | Fonte de dados |
|------|---------------|
| Dashboard | Query agregada de empresas + cnds + alertas |
| Empresas | `select * from empresas` com paginação |
| EmpresaDetalhe | Join empresas + cnd_items + documentos |
| Certidões | `select * from cnd_items` com joins |
| Documentos | `select * from documentos` + Storage URLs |
| Envios | `select * from envios` |
| Alertas | `select * from alertas` |
| Logs | `select * from logs_acesso + audit_trail` |
| Automação | Queries em connector_runs + exceptions |
| Execuções | `select * from connector_runs` com paginação |
| Integrações | `select * from connectors + health_logs` |
| Exceções | `select * from exceptions` com filtros |

### Etapa 5 — Orquestrador Real

Refatorar `useOrchestrator` para chamar Edge Functions reais:
- `executarColeta(empresaId, cndTipo)` → chama a Edge Function correspondente
- Resultado é persistido no banco automaticamente pela Edge Function
- Frontend recebe atualização via react-query invalidation

### Etapa 6 — Limpar Mocks

Remover completamente:
- `src/data/mockData.ts`
- `src/data/automationMockData.ts`
- Todas as referências a dados hardcoded

---

## Arquivos

**Novos (~15):**
- `supabase/migrations/001_schema.sql` — schema completo
- `supabase/functions/serpro-auth/index.ts`
- `supabase/functions/consulta-cnd-federal/index.ts`
- `supabase/functions/consulta-cndt/index.ts`
- `supabase/functions/consulta-crf-fgts/index.ts`
- `supabase/functions/consulta-cnpj/index.ts`
- `src/integrations/supabase/client.ts`
- `src/hooks/useEmpresas.ts`
- `src/hooks/useCNDs.ts`
- `src/hooks/useDocumentos.ts`
- `src/hooks/useAlertas.ts`
- `src/hooks/useEnvios.ts`
- `src/hooks/useLogs.ts`
- `src/hooks/useConnectorRuns.ts`
- `src/hooks/useExceptions.ts`

**Modificados (~15):**
- `src/data/DataProvider.tsx` — Supabase queries
- `src/data/AutomationProvider.tsx` — Supabase queries
- `src/pages/Dashboard.tsx` — consumir hooks reais
- `src/pages/Empresas.tsx` — idem
- `src/pages/EmpresaDetalhe.tsx`
- `src/pages/Certidoes.tsx`
- `src/pages/Documentos.tsx`
- `src/pages/Envios.tsx`
- `src/pages/Alertas.tsx`
- `src/pages/Logs.tsx`
- `src/pages/Automacao.tsx`
- `src/pages/Execucoes.tsx`
- `src/pages/Integracoes.tsx`
- `src/pages/Excecoes.tsx`
- `src/hooks/useOrchestrator.ts`

**Removidos (2):**
- `src/data/mockData.ts`
- `src/data/automationMockData.ts`

## Ordem de Execução

Dado o volume, sugiro implementar em 3 blocos sequenciais:

1. **Bloco A**: Ativar Cloud, criar schema, criar Supabase client, secrets do Serpro
2. **Bloco B**: Edge Functions + hooks de dados + migrar Providers
3. **Bloco C**: Migrar todas as telas + remover mocks + testar

