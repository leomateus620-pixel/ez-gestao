

# Fase 2 — Motor de Automação e Coleta Inteligente de CNDs

## Visão Geral
Implementar sobre a Fase 1 existente (sem refatorações destrutivas) toda a camada de automação: conectores modulares, orquestrador de coleta, parsing de documentos, fila de exceções, e 4 novas telas administrativas premium.

## Arquitetura

```text
┌─────────────────────────────────────────────────┐
│                  DataProvider (Fase 1)           │
│  empresas, cnds, docs, envios, alertas, logs    │
├─────────────────────────────────────────────────┤
│           AutomationProvider (Fase 2)            │
│  connectors, runs, exceptions, batches, health  │
├─────────────────────────────────────────────────┤
│  Orchestrator → Adapter → Parser → Decision     │
│  Engine          Registry   Pipeline  Engine     │
└─────────────────────────────────────────────────┘
```

---

## 1. Tipos e Modelagem de Dados

**`src/data/automation-types.ts`** — Novos tipos para Fase 2:

- `ConnectorType`: `'api_direta' | 'browser_headless' | 'integracao_assistida' | 'upload_manual'`
- `ConnectorStatus`: `'ativo' | 'inativo' | 'manutencao' | 'erro'`
- `RunStatus`: `'agendado' | 'executando' | 'sucesso' | 'falha' | 'revisao' | 'timeout'`
- `ExceptionStatus`: `'pendente' | 'em_analise' | 'resolvida' | 'descartada'`
- `ConfidenceLevel`: `'alta' | 'media' | 'baixa'`
- `CNDStatusExtended` — adiciona `'positiva' | 'negativa_indisponivel' | 'exige_revisao' | 'erro_operacional'` ao tipo existente

Interfaces principais:
- `Connector` — id, nome, tipo, orgao (CNDTipo), status, versao, ultimoTeste, taxaSucesso, tempoMedio, config
- `ConnectorRun` — id, connectorId, empresaId, cndItemId, status, inicioExecucao, fimExecucao, tentativa, duracao, resultadoBruto, statusNormalizado, confianca, evidencias, erroDetalhes, steps[]
- `ConnectorRunStep` — id, runId, etapa ('autenticacao'|'consulta'|'captura'|'parsing'|'persistencia'), status, inicio, fim, detalhes
- `ExceptionItem` — id, runId, empresaId, cndItemId, motivo, criticidade, statusExcecao, acaoSugerida, criadoEm, resolvidoEm, resolvidoPor
- `CaptureResult` — cnpjConsultado, tipoCertidao, orgaoEmissor, statusBruto, statusNormalizado, dataEmissao, dataValidade, numeroCertidao, protocolo, hashDocumento, nomeArquivo, conectorUtilizado, confianca, necessitaRevisao, motivoExcecao
- `AutomationBatch` — id, agendadoPara, empresaIds, status, progressoAtual, totalItems
- `IntegrationHealthLog` — id, connectorId, timestamp, status, latencia, detalhes
- `RetryPolicy` — maxTentativas, intervaloBase, backoffMultiplier, timeoutSegundos
- `SchedulingRule` — connectorId, cndTipo, intervaloHoras, diasAntesVencimento, prioridade

## 2. Dados Mock de Automação

**`src/data/automationMockData.ts`** — Dados mock realistas:
- 6 conectores (Receita Federal API, FGTS/CRF, SEFAZ Browser, Municipal Assistida, TST API, Personalizada Manual)
- ~15 execuções com diferentes status (sucesso, falha, revisão, timeout)
- Steps por execução
- ~5 exceções na fila
- Batches agendados
- Health logs dos conectores
- Políticas de retry e scheduling rules

## 3. Provider de Automação

**`src/data/AutomationProvider.tsx`** — Contexto separado usando `useReducer`:
- Estado: connectors, runs, exceptions, batches, healthLogs, schedulingRules, retryPolicies
- Actions: `ADD_RUN`, `UPDATE_RUN`, `ADD_EXCEPTION`, `RESOLVE_EXCEPTION`, `UPDATE_CONNECTOR_STATUS`, `ADD_BATCH`, `UPDATE_BATCH`, `REQUEUE_EXCEPTION`, `ADD_HEALTH_LOG`
- Hook `useAutomation()` para acessar

Wrappado no App.tsx ao redor de `DataProvider` (ou dentro), sem alterar a lógica existente.

## 4. Motor de Automação (Hooks e Lógica)

**`src/hooks/useOrchestrator.ts`** — Orquestrador de coleta:
- `getEmpresasElegiveis()` — filtra por prioridade (vencidas > vencendo > críticas > novas)
- `executarColeta(empresaId, cndTipo)` — seleciona conector, dispara mock run, registra steps
- `processarResultado(run)` — chama parser, decision engine, atualiza CND na Fase 1

**`src/lib/connector-registry.ts`** — Registry de conectores:
- `getConnectorForCND(cndTipo)` — retorna conector adequado
- `getConnectorHealth(connectorId)` — retorna métricas de saúde
- Status mapping entre respostas externas e status internos

**`src/lib/capture-parser.ts`** — Pipeline de parsing:
- `parseCapture(rawData, tipo)` — extrai dados estruturados do resultado bruto
- `extractValidade(text)` — detecta data de validade em texto
- `extractEmissao(text)` — detecta data de emissão
- `calcularConfianca(result)` — retorna score de confiança
- `normalizarStatus(statusBruto, orgao)` — mapeamento para status interno
- Validações: validade > emissão, CNPJ match, hash deduplicação

**`src/lib/decision-engine.ts`** — Motor de decisão:
- `avaliarResultado(capture, cndAtual)` — decide: aplicar auto, flag revisão, ou exceção
- Alta confiança → aplica automaticamente e atualiza CND no DataProvider
- Média → aplica com flag de revisão
- Baixa → cria exceção, não publica

**`src/hooks/useAutomationJobs.ts`** — Jobs internos:
- `executarLoteColeta()` — processa batch de empresas elegíveis
- `revalidarPeriodica()` — verifica CNDs que precisam reconsulta
- `retryFalhasTransitorias()` — reprocessa falhas recentes elegíveis
- `monitorarConectores()` — health check dos conectores
- Tudo roda mock (simulação com timeouts), mas com estrutura pronta para async real

## 5. Novas Telas

### 5a. Central de Automação (`src/pages/Automacao.tsx`)
- Métricas do dia: coletas executadas, sucesso, falha, revisão, pendência
- Próximos lotes agendados
- Conectores ativos com indicador de saúde
- Tempo médio por conector e taxa de sucesso
- Quick actions: executar lote, forçar revalidação, pausar automação
- Visual premium liquid glass

### 5b. Execuções (`src/pages/Execucoes.tsx`)
- Lista paginada de execuções automáticas
- Filtros: período, empresa, conector, status, tipo CND
- Colunas: empresa, conector, tipo, status, duração, tentativa, resultado
- Ações: abrir detalhe, reprocessar, enviar para exceção
- Row expandível ou link para detalhe

### 5c. Detalhe de Execução (`src/pages/ExecucaoDetalhe.tsx`)
- Header: empresa, CNPJ, conector, certidão, status final
- Timeline técnica com steps (autenticação → consulta → captura → parsing → persistência)
- Payloads seguros e metadados
- Evidências coletadas
- PDF gerado ou resposta textual
- Alertas gerados
- Vínculo com item da empresa

### 5d. Integrações (`src/pages/Integracoes.tsx`)
- Lista de conectores com cards de saúde
- Status, disponibilidade, última execução, taxa de sucesso
- Configuração por conector
- Credenciais mascaradas
- Health timeline resumida
- Ação: testar conector, pausar, editar config

### 5e. Exceções (`src/pages/Excecoes.tsx`)
- Fila de pendências com triagem por criticidade
- Filtros: motivo, empresa, conector, status
- Ações: corrigir dados, upload manual, reenfileirar, marcar N/A, aprovar leitura, vincular documento
- Cards com visão rápida do que falhou

## 6. Navegação Atualizada

**`src/components/AppSidebar.tsx`** — Expandir menu com grupo "Automação":

```
Menu Principal (existente)
  Dashboard, Empresas, Agenda, Certidões, Documentos, Envios, Alertas

Automação (novo grupo)
  Central, Execuções, Integrações, Exceções

Sistema (existente)
  Logs, Configurações
```

Badge de exceções pendentes no item "Exceções".

## 7. Rotas

**`src/App.tsx`** — Adicionar:
- `/automacao` → Automacao
- `/execucoes` → Execucoes
- `/execucoes/:id` → ExecucaoDetalhe
- `/integracoes` → Integracoes
- `/excecoes` → Excecoes

## 8. Componentes Reutilizáveis da Fase 2

- `ConnectorHealthCard.tsx` — card de saúde do conector com indicadores
- `RunStatusBadge.tsx` — badge de status de execução com cores e pulse
- `ExecutionTimeline.tsx` — timeline vertical dos steps da execução
- `ConfidenceBadge.tsx` — indicador visual de confiança (alta/média/baixa)
- `ExceptionCard.tsx` — card de exceção com ações inline

## 9. Integração com Fase 1

- Quando uma execução com confiança alta finaliza, chama `dispatch({ type: 'UPDATE_CND' })` no DataProvider existente
- Quando gera documento, chama `addDocumento()` existente
- Quando detecta vencimento/status change, `useAlertEngine` (Fase 1) já gera alertas automaticamente
- Logs de automação usam `addLog()` existente
- Audit trail usa o sistema já implementado
- Sidebar usa `useDataStore()` para badge de alertas (já existente)

## 10. Footer e Versão

Atualizar footer da sidebar: "Fase 2 — v2.0.0 — Automação Ativa"

---

## Arquivos Novos (~15)
- `src/data/automation-types.ts`
- `src/data/automationMockData.ts`
- `src/data/AutomationProvider.tsx`
- `src/hooks/useOrchestrator.ts`
- `src/hooks/useAutomationJobs.ts`
- `src/lib/connector-registry.ts`
- `src/lib/capture-parser.ts`
- `src/lib/decision-engine.ts`
- `src/pages/Automacao.tsx`
- `src/pages/Execucoes.tsx`
- `src/pages/ExecucaoDetalhe.tsx`
- `src/pages/Integracoes.tsx`
- `src/pages/Excecoes.tsx`
- `src/components/ConnectorHealthCard.tsx`
- `src/components/RunStatusBadge.tsx`
- `src/components/ExecutionTimeline.tsx`
- `src/components/ConfidenceBadge.tsx`
- `src/components/ExceptionCard.tsx`

## Arquivos Modificados (~3)
- `src/App.tsx` — AutomationProvider wrapper + novas rotas
- `src/components/AppSidebar.tsx` — menu expandido com grupo Automação
- `src/data/types.ts` — estender CNDStatus com novos valores (opcional, backward-compatible)

