

# Hardening Completo — Fase 2 do Motor de Automação

## Visão Geral
Endurecer toda a camada de automação com resiliência real (circuit breaker, retry com backoff, concurrency limiter), validações críticas no pipeline de captura, prevenção de duplicidades, monitoramento interno de degradação, e performance otimizada para alto volume.

## 1. Infraestrutura de Resiliência (`src/lib/automation-resilience.ts`) — NOVO

Criar módulo com primitivas de resiliência reutilizáveis:

- **CircuitBreaker**: por conector — estados `closed | half_open | open`. Abre após N falhas consecutivas, fecha após teste bem-sucedido. Previne storm de retries contra portal degradado.
- **RetryWithBackoff**: `retry(fn, policy)` — exponential backoff com jitter. Respeita `maxTentativas`, `intervaloBase`, `backoffMultiplier`, `timeoutSegundos` do `RetryPolicy` já existente.
- **ConcurrencyLimiter**: limita execuções simultâneas por conector (max 2-3). Previne sobrecarga de portais e race conditions.
- **DeduplicationGuard**: verifica se já existe run ativa para o mesmo `(empresaId, cndTipo)` antes de iniciar nova execução. Previne duplicidade por duplo-clique ou lotes sobrepostos.

## 2. Validações Críticas no Pipeline (`src/lib/capture-validator.ts`) — NOVO

Módulo de validação pós-captura, chamado antes de qualquer publicação:

- `validarCNPJMatch(captura, empresa)` — CNPJ do documento deve coincidir com empresa alvo
- `validarTipoCertidao(captura, cndTipo)` — tipo retornado deve corresponder ao solicitado
- `validarCoerenciaDatas(emissao, validade)` — validade > emissão, ambas no futuro razoável (não >5 anos), emissão não no futuro
- `validarHashDuplicidade(hash, runsExistentes)` — documento idêntico já processado não gera nova versão
- `validarConfiancaMinima(confianca, limiar)` — bloqueia autopublicação abaixo do limiar configurável
- `validarOrgaoEsperado(captura, connector)` — órgão do resultado deve coincidir com órgão do conector
- Retorna `{ valido: boolean, erros: string[], avisos: string[] }` — erros bloqueiam, avisos geram flag de revisão

## 3. Orquestrador Endurecido (`src/hooks/useOrchestrator.ts`) — MODIFICAR

Refatorar `executarColeta` para incluir:

1. **Guard de duplicidade**: verificar se já existe run ativa para `(empresaId, cndTipo)` antes de prosseguir
2. **Circuit breaker check**: se conector está em estado `open`, rejeitar imediatamente e criar exceção `portal_indisponivel`
3. **Retry automático**: envolver execução em `retryWithBackoff` usando a `RetryPolicy` do conector
4. **Validação pós-captura**: chamar `validarCaptura()` antes de `avaliarResultado()`. Se inválido, criar exceção com tipologia correta em vez de publicar
5. **Concurrency limiter**: respeitar limite por conector
6. **Fallback para manual**: se conector principal falhar após max retries, verificar se existe conector alternativo ou marcar para upload manual
7. **Tipologia automática**: derivar tipologia da exceção a partir do tipo de erro (timeout → `portal_indisponivel`, CNPJ mismatch → `cnpj_inconsistente`, etc.)

## 4. Jobs Endurecidos (`src/hooks/useAutomationJobs.ts`) — MODIFICAR

- **Batch com controle de concorrência**: processar lote com `Promise.allSettled` + semáforo (max 3 simultâneos)
- **Progresso incremental**: atualizar `AutomationBatch.progressoAtual` a cada item processado
- **Detecção de lote travado**: timeout global por lote (ex: 5min para mock)
- **Retry de falhas transitórias**: novo job `retryFalhasTransitorias()` — reprocessa runs com status `falha` onde `tentativa < maxTentativas` e conector não está em circuit breaker aberto
- **Health check**: novo job `monitorarConectores()` — compara taxa de sucesso atual vs. média e gera `IntegrationHealthLog` se degradou. Muda status do conector para `manutencao` se taxa cair abaixo de limiar

## 5. Decision Engine Endurecido (`src/lib/decision-engine.ts`) — MODIFICAR

- Adicionar `avaliarResultadoSeguro(capture, cndAtual, validacao)` que recebe o resultado da validação
- Se validação tem erros → sempre `criar_excecao` independente da confiança
- Se validação tem avisos → rebaixar confiança de `alta` para `media`
- `deveSubstituirVersao()` agora também verifica: hash diferente, e confiança nova >= confiança atual

## 6. Tipos Expandidos (`src/data/automation-types.ts`) — MODIFICAR

Adicionar:
- `RunStatus`: adicionar `'cancelado'` e `'bloqueado'` (circuit breaker)
- `ConnectorRun`: adicionar campos `hashDocumento?: string`, `validacaoErros?: string[]`, `validacaoAvisos?: string[]`
- `CircuitBreakerState` interface: `{ connectorId, estado, falhasConsecutivas, ultimaFalha, proximoTeste }`
- `AutomationConfig` interface: `{ confiancaMinima: ConfidenceLevel, maxConcorrenciaPorConector: number, timeoutGlobalLote: number, circuitBreakerLimiar: number }`

## 7. AutomationProvider Expandido (`src/data/AutomationProvider.tsx`) — MODIFICAR

- Adicionar ao state: `circuitBreakers: Record<string, CircuitBreakerState>`, `automationConfig: AutomationConfig`
- Novas actions: `UPDATE_CIRCUIT_BREAKER`, `UPDATE_AUTOMATION_CONFIG`, `CANCEL_RUN`
- Computed: `connectorsDegradados` (taxa caindo), `runsDuplicadas` (mesmo empresa+tipo em paralelo)

## 8. Monitoramento e Alertas Técnicos — Integrado nas telas existentes

**`src/pages/Automacao.tsx`** — Adicionar novo bloco "Saúde dos Conectores":
- Indicador de circuit breaker por conector (verde/amarelo/vermelho)
- Alerta visual quando conector entrou em modo proteção
- Contador de retries pendentes
- Alerta de lote travado

**`src/pages/Integracoes.tsx`** — Adicionar:
- Estado do circuit breaker por conector
- Botão "Resetar Circuit Breaker" (reabrir manualmente)
- Histórico de ativações do circuit breaker

## 9. Auditoria de Automação — Integrar com audit trail existente

Toda ação de automação (publicação auto, criação de exceção, retry, circuit breaker ativado, validação falhou) gera entrada no audit trail da Fase 1 via `dataDispatch({ type: 'ADD_LOG' })`.

## 10. Performance

- `useOrchestrator`: memoizar `connectorMapping` e `empresasElegiveis` com `useMemo`
- `useAutomationJobs`: usar `Promise.allSettled` em vez de loop sequencial para itens independentes
- Limitar tamanho de `state.runs` mantido em memória (últimas 500 runs, paginação lazy para histórico)
- `Automacao.tsx`: consolidar métricas em um único `useMemo` em vez de vários

---

## Arquivos

**Novos (2):**
- `src/lib/automation-resilience.ts` — CircuitBreaker, RetryWithBackoff, ConcurrencyLimiter, DeduplicationGuard
- `src/lib/capture-validator.ts` — Validações pós-captura

**Modificados (7):**
- `src/data/automation-types.ts` — novos tipos (CircuitBreakerState, AutomationConfig, RunStatus expandido)
- `src/data/AutomationProvider.tsx` — circuit breakers no state, novas actions
- `src/hooks/useOrchestrator.ts` — pipeline com validação, circuit breaker, dedup, retry, fallback
- `src/hooks/useAutomationJobs.ts` — concorrência controlada, health check, retry de falhas
- `src/lib/decision-engine.ts` — validação integrada, substituição segura
- `src/pages/Automacao.tsx` — bloco de saúde com circuit breakers
- `src/pages/Integracoes.tsx` — circuit breaker visual e controle manual

