import type { CaptureResult, ConfidenceLevel } from '@/data/automation-types';

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

export function deveSubstituirVersao(
  novaValidade: string | null,
  validadeAtual: string | null,
  confiancaNova: ConfidenceLevel,
): boolean {
  if (!novaValidade) return false;
  if (!validadeAtual) return true;
  if (confiancaNova === 'baixa') return false;
  return new Date(novaValidade) > new Date(validadeAtual);
}
