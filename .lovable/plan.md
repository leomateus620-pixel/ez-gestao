

# Refinamento Premium da Fase 2 — Central de Automação Enterprise

## Visão Geral
Transformar as 5 telas de automação (Central, Execuções, Detalhe, Integrações, Exceções) de "funcional" para "enterprise premium", adicionando blocos operacionais avançados, fila de exceções inteligente com tipologias, revisão assistida, e observabilidade profunda.

## 1. Dados Mock Enriquecidos (`src/data/automationMockData.ts`)

Expandir exceções de 5 para ~12, cobrindo todas as tipologias:
- CNPJ inconsistente, PDF ausente, validade ambígua, portal indisponível, CAPTCHA, documento incompatível, baixa confiança, erro de parsing, falha de integração, dado cadastral insuficiente, certidão positiva, retorno inesperado

Adicionar campos aos `ExceptionItem` mock: `tipologia`, `tentativas`, `slaHoras`, `responsavel`

Expandir `mockRuns` para ~20 com mais variedade de resultados.

Expandir `mockHealthLogs` para ~15 entradas com histórico multi-dia.

## 2. Tipos Expandidos (`src/data/automation-types.ts`)

Adicionar a `ExceptionItem`:
- `tipologia`: enum de 12 tipos de exceção (cnpj_inconsistente, pdf_ausente, validade_ambigua, portal_indisponivel, captcha_bloqueante, documento_incompativel, baixa_confianca, erro_parsing, falha_integracao, dado_cadastral_insuficiente, certidao_positiva, retorno_inesperado)
- `tentativas: number`
- `slaHoras: number`
- `responsavel: string | null`
- `cnpj: string`
- `cndTipo: string`
- `connectorNome: string`

## 3. Central de Automação (`src/pages/Automacao.tsx`) — Redesign Completo

Criar 4 blocos operacionais premium:

**Bloco 1 — Visão Operacional do Dia**: métricas top com coletas, sucesso, falha, revisão, exceções, agendados (já existe, refinar layout para 2 rows com cards mais expressivos)

**Bloco 2 — Visão de Risco**: card dedicado mostrando empresas sem atualização recente (>7d), CNDs vencidas sem coleta, conectores instáveis (taxa <80%), exceções críticas pendentes

**Bloco 3 — Visão de Gargalos**: tempo médio por conector (mini bar chart visual), fila de retry pendente, lotes atrasados, exceções por tipologia (top 3)

**Bloco 4 — Produtividade**: taxa de automação (% resolvido sem intervenção), tempo médio de resolução de exceções, coletas/dia trend (últimos 7 dias como mini sparkline CSS)

Quick actions refinadas: Executar Lote, Forçar Revalidação, Ver Exceções Críticas, Pausar Automação

Conectores e execuções recentes mantidos mas com layout mais sofisticado.

## 4. Execuções (`src/pages/Execucoes.tsx`) — Upgrade

- Adicionar filtro por empresa (select com lista de empresas)
- Adicionar filtro por período (hoje, 7d, 30d, todos)
- Mostrar motivo da falha inline na row (coluna extra colapsável ou tooltip)
- Mostrar tentativa como "2/3" (tentativa atual / max do retry policy)
- Expandir row inline com collapsible para ver steps sem navegar
- Adicionar ação "Reprocessar" e "Enviar para Exceção" inline

## 5. Detalhe da Execução (`src/pages/ExecucaoDetalhe.tsx`) — Auditoria Premium

- Timeline com etapas colapsáveis (usar Collapsible)
- Adicionar seção "Motor de Decisão" explicando POR QUE o sistema publicou automaticamente ou exigiu revisão (mostrar score de confiança com breakdown visual)
- Seção de resultado expandida: status bruto, normalizado, confiança com barra visual
- Seção "Impacto": mostrar que alertas foram gerados, que CND foi atualizada, que exceção foi aberta
- Botões de ação: Reprocessar, Criar Exceção Manual, Ver Empresa

## 6. Fila de Exceções (`src/pages/Excecoes.tsx`) — Redesign Completo

**Header com contadores por criticidade**: pills mostrando Críticas (X), Altas (X), Médias (X), Baixas (X)

**Filtros avançados**: status, criticidade, tipologia, empresa, conector

**Cards de exceção redesenhados** (`ExceptionCard.tsx`):
- Exibir: empresa, CNPJ, tipo CND, fonte/conector, motivo principal, criticidade badge, data/hora, tentativas, sugestão de ação, responsável, SLA (tempo restante)
- Ações expandidas: Reenfileirar, Upload Manual, Aprovar Leitura, Corrigir Validade, Marcar N/A, Ignorar com Justificativa, Escalar, Vincular PDF, Reprocessar Parsing
- Ações em dropdown menu para não poluir

**Revisão Assistida** (novo componente `ReviewPanel.tsx`):
- Sheet/dialog que abre ao clicar "Revisar" em uma exceção
- Comparação lado a lado: dados extraídos vs dados esperados
- Confiança por campo (alta/média/baixa indicator)
- Permitir aprovar campo a campo
- Botão "Publicar Resultado Revisado"
- Registra quem aprovou

## 7. Integrações (`src/pages/Integracoes.tsx`) — Refinamento

- Cards de conector redesenhados com uptime visual (mini health bar últimas 24h)
- Seção de "Últimas Falhas" por conector
- Indicador de modo manutenção
- Botão "Testar Conector" (simula health check)
- Botão "Pausar/Ativar" conector
- Tabela expandida com histórico de configuração

## 8. Componentes Novos e Refinados

**`src/components/ExceptionCard.tsx`** — Redesign completo com tipologia, CNPJ, CND tipo, tentativas, SLA, responsável, dropdown de ações

**`src/components/ReviewPanel.tsx`** — Novo. Sheet lateral com revisão assistida campo a campo

**`src/components/RiskCard.tsx`** — Novo. Card premium para blocos de risco na Central

**`src/components/ConnectorHealthCard.tsx`** — Adicionar mini health bar (últimas 24h), botões de ação

**`src/components/ExecutionTimeline.tsx`** — Etapas colapsáveis, mais detalhes visuais

**`src/components/ConfidenceBreakdown.tsx`** — Novo. Breakdown visual do score de confiança com barras por critério

## 9. AutomationProvider (`src/data/AutomationProvider.tsx`)

- Adicionar actions: `ASSIGN_EXCEPTION`, `ESCALATE_EXCEPTION`, `UPDATE_CONNECTOR_STATUS`
- Adicionar computed: `exceptionsByTipologia`, `criticalExceptions`, `unstableConnectors`

## Arquivos

**Novos (3):**
- `src/components/ReviewPanel.tsx`
- `src/components/RiskCard.tsx`
- `src/components/ConfidenceBreakdown.tsx`

**Modificados (10):**
- `src/data/automation-types.ts` — tipologia enum, campos extras em ExceptionItem
- `src/data/automationMockData.ts` — dados expandidos
- `src/data/AutomationProvider.tsx` — novas actions
- `src/pages/Automacao.tsx` — redesign com 4 blocos operacionais
- `src/pages/Execucoes.tsx` — filtros avançados, row expandível, ações inline
- `src/pages/ExecucaoDetalhe.tsx` — timeline colapsável, motor de decisão, impacto
- `src/pages/Excecoes.tsx` — redesign com tipologias, contadores, revisão assistida
- `src/pages/Integracoes.tsx` — health bar, ações, modo manutenção
- `src/components/ExceptionCard.tsx` — redesign com todos os campos
- `src/components/ConnectorHealthCard.tsx` — mini health bar, ações
- `src/components/ExecutionTimeline.tsx` — etapas colapsáveis

