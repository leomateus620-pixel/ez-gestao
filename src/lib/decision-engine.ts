import type { CaptureResult, ConfidenceLevel } from '@/data/automation-types';
import type { ValidationResult } from '@/lib/capture-validator';
import { rebaixarConfianca } from '@/lib/capture-validator';

export interface DecisionResult {
  acao: 'aplicar_auto' | 'aplicar_com_revisao' | 'criar_excecao';
  motivo: string;
  confianca: ConfidenceLevel;
}

export function avaliarResultado(capture: CaptureResult): DecisionResult {
  if (capture.confianca === 'alta' && !capture.necessitaRevisao) {
    return {
      acao: 'aplicar_auto',
      motivo: 'Resultado confiável — aplicado automaticamente',
      confianca: 'alta',
    };
  }

  if (capture.confianca === 'media') {
    return {
      acao: 'aplicar_com_revisao',
      motivo: 'Resultado aplicado com flag de revisão pendente',
      confianca: 'media',
    };
  }

  return {
    acao: 'criar_excecao',
    motivo: capture.motivoExcecao || 'Baixa confiança — requer análise manual',
    confianca: 'baixa',
  };
}

/** Hardened version that integrates validation results */
export function avaliarResultadoSeguro(
  capture: CaptureResult,
  validacao: ValidationResult,
): DecisionResult {
  // Validation errors → always exception
  if (!validacao.valido) {
    return {
      acao: 'criar_excecao',
      motivo: `Validação falhou: ${validação.erros[0]}`,
      confianca: 'baixa',
    };
  }

  // Warnings → downgrade confidence
  const confiancaEfetiva = rebaixarConfianca(capture.confianca, validacao.avisos);
  const captureAjustada = { ...capture, confianca: confiancaEfetiva };

  return avaliarResultado(captureAjustada);
}

export function deveSubstituirVersao(
  novaValidade: string | null,
  validadeAtual: string | null,
  confiancaNova: ConfidenceLevel,
  hashNovo?: string | null,
  hashAtual?: string | null,
): boolean {
  if (!novaValidade) return false;
  if (!validadeAtual) return true;
  if (confiancaNova === 'baixa') return false;
  // Same document (same hash) — no need to replace
  if (hashNovo && hashAtual && hashNovo === hashAtual) return false;
  return new Date(novaValidade) > new Date(validadeAtual);
}
