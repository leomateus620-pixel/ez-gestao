import type { RetryPolicy } from '@/data/automation-types';

// ── Circuit Breaker ──────────────────────────────────────────────────────────

export type CircuitState = 'closed' | 'half_open' | 'open';

export interface CircuitBreakerConfig {
  limiarFalhas: number;      // falhas consecutivas para abrir
  tempoRecuperacao: number;  // ms até tentar half_open
}

export interface CircuitBreakerSnapshot {
  connectorId: string;
  estado: CircuitState;
  falhasConsecutivas: number;
  ultimaFalha: string | null;
  proximoTeste: string | null;
}

const DEFAULT_CB_CONFIG: CircuitBreakerConfig = { limiarFalhas: 5, tempoRecuperacao: 60_000 };

const breakers = new Map<string, CircuitBreakerSnapshot>();

export function getCircuitBreaker(connectorId: string): CircuitBreakerSnapshot {
  if (!breakers.has(connectorId)) {
    breakers.set(connectorId, {
      connectorId, estado: 'closed', falhasConsecutivas: 0,
      ultimaFalha: null, proximoTeste: null,
    });
  }
  return breakers.get(connectorId)!;
}

export function getAllCircuitBreakers(): CircuitBreakerSnapshot[] {
  return Array.from(breakers.values());
}

export function registrarSucesso(connectorId: string): CircuitBreakerSnapshot {
  const cb = getCircuitBreaker(connectorId);
  cb.estado = 'closed';
  cb.falhasConsecutivas = 0;
  cb.ultimaFalha = null;
  cb.proximoTeste = null;
  return { ...cb };
}

export function registrarFalha(
  connectorId: string,
  config: CircuitBreakerConfig = DEFAULT_CB_CONFIG,
): CircuitBreakerSnapshot {
  const cb = getCircuitBreaker(connectorId);
  cb.falhasConsecutivas += 1;
  cb.ultimaFalha = new Date().toISOString();

  if (cb.falhasConsecutivas >= config.limiarFalhas) {
    cb.estado = 'open';
    cb.proximoTeste = new Date(Date.now() + config.tempoRecuperacao).toISOString();
  }
  return { ...cb };
}

export function verificarCircuitBreaker(connectorId: string): { permitido: boolean; estado: CircuitState } {
  const cb = getCircuitBreaker(connectorId);

  if (cb.estado === 'closed') return { permitido: true, estado: 'closed' };

  if (cb.estado === 'open' && cb.proximoTeste) {
    if (new Date() >= new Date(cb.proximoTeste)) {
      cb.estado = 'half_open';
      return { permitido: true, estado: 'half_open' };
    }
    return { permitido: false, estado: 'open' };
  }

  // half_open — allow one probe
  return { permitido: true, estado: 'half_open' };
}

export function resetCircuitBreaker(connectorId: string): CircuitBreakerSnapshot {
  return registrarSucesso(connectorId);
}

// ── Retry with Backoff ────────────────────────────────────────────────────────

function jitter(base: number): number {
  return base * (0.5 + Math.random());
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  onAttempt?: (attempt: number) => void,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= policy.maxTentativas; attempt++) {
    onAttempt?.(attempt);
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), policy.timeoutSegundos * 1000)
        ),
      ]);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < policy.maxTentativas) {
        const delay = jitter(policy.intervaloBase * Math.pow(policy.backoffMultiplier, attempt - 1));
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

// ── Concurrency Limiter ───────────────────────────────────────────────────────

const concurrencyCounters = new Map<string, number>();

export function acquireConcurrency(connectorId: string, max: number): boolean {
  const current = concurrencyCounters.get(connectorId) || 0;
  if (current >= max) return false;
  concurrencyCounters.set(connectorId, current + 1);
  return true;
}

export function releaseConcurrency(connectorId: string): void {
  const current = concurrencyCounters.get(connectorId) || 0;
  concurrencyCounters.set(connectorId, Math.max(0, current - 1));
}

export function getConcurrency(connectorId: string): number {
  return concurrencyCounters.get(connectorId) || 0;
}

// ── Deduplication Guard ───────────────────────────────────────────────────────

const activeRuns = new Set<string>();

function dedupKey(empresaId: string, cndTipo: string): string {
  return `${empresaId}::${cndTipo}`;
}

export function acquireDedup(empresaId: string, cndTipo: string): boolean {
  const key = dedupKey(empresaId, cndTipo);
  if (activeRuns.has(key)) return false;
  activeRuns.add(key);
  return true;
}

export function releaseDedup(empresaId: string, cndTipo: string): void {
  activeRuns.delete(dedupKey(empresaId, cndTipo));
}

// ── Error Tipologia Derivation ────────────────────────────────────────────────

import type { ExceptionTipologia } from '@/data/automation-types';

export function derivarTipologia(error: unknown): ExceptionTipologia {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('TIMEOUT')) return 'portal_indisponivel';
  if (msg.includes('CAPTCHA')) return 'captcha_bloqueante';
  if (msg.includes('CNPJ')) return 'cnpj_inconsistente';
  if (msg.includes('PDF')) return 'pdf_ausente';
  if (msg.includes('PARSE') || msg.includes('PARSING')) return 'erro_parsing';
  if (msg.includes('INTEGRATION') || msg.includes('NETWORK')) return 'falha_integracao';
  return 'retorno_inesperado';
}
