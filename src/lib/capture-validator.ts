import type { CaptureResult, ConfidenceLevel, ConnectorRun } from '@/data/automation-types';
import type { Connector } from '@/data/automation-types';

export interface ValidationResult {
  valido: boolean;
  erros: string[];
  avisos: string[];
}

export function validarCaptura(
  capture: CaptureResult,
  empresaCnpj: string,
  connector: Connector,
  existingRuns: ConnectorRun[],
  confiancaMinima: ConfidenceLevel = 'media',
): ValidationResult {
  const erros: string[] = [];
  const avisos: string[] = [];

  // 1. CNPJ match
  const cnpjLimpo = (s: string) => s.replace(/\D/g, '');
  if (cnpjLimpo(capture.cnpjConsultado) !== cnpjLimpo(empresaCnpj)) {
    erros.push(`CNPJ divergente: esperado ${empresaCnpj}, obtido ${capture.cnpjConsultado}`);
  }

  // 2. Tipo certidão matches connector órgão
  if (capture.tipoCertidao !== connector.orgao) {
    erros.push(`Tipo certidão incompatível: conector ${connector.orgao}, captura ${capture.tipoCertidao}`);
  }

  // 3. Coerência de datas
  if (capture.dataEmissao && capture.dataValidade) {
    const emissao = new Date(capture.dataEmissao);
    const validade = new Date(capture.dataValidade);
    const now = new Date();
    const fiveYears = new Date(now.getTime() + 5 * 365 * 24 * 60 * 60 * 1000);

    if (validade <= emissao) {
      erros.push('Validade anterior ou igual à emissão');
    }
    if (emissao > now) {
      avisos.push('Data de emissão no futuro');
    }
    if (validade > fiveYears) {
      avisos.push('Validade superior a 5 anos — suspeita');
    }
  }

  // 4. Hash duplicidade
  if (capture.hashDocumento) {
    const duplicate = existingRuns.find(
      r => r.hashDocumento === capture.hashDocumento && r.status === 'sucesso'
    );
    if (duplicate) {
      avisos.push(`Documento com hash idêntico ao run ${duplicate.id}`);
    }
  }

  // 5. Confiança mínima para autopublicação
  const niveis: Record<ConfidenceLevel, number> = { alta: 3, media: 2, baixa: 1 };
  if (niveis[capture.confianca] < niveis[confiancaMinima]) {
    erros.push(`Confiança ${capture.confianca} abaixo do mínimo ${confiancaMinima}`);
  }

  // 6. Órgão esperado
  const orgaoConector = connector.orgao;
  if (capture.tipoCertidao !== orgaoConector) {
    // Already covered in #2, but explicit
  }

  // 7. Status normalizado coherence
  if (capture.statusNormalizado === 'erro' || capture.statusNormalizado === 'desconhecido') {
    erros.push(`Status normalizado inválido: ${capture.statusNormalizado}`);
  }

  return { valido: erros.length === 0, erros, avisos };
}

export function rebaixarConfianca(
  confianca: ConfidenceLevel,
  avisos: string[],
): ConfidenceLevel {
  if (avisos.length === 0) return confianca;
  if (confianca === 'alta') return 'media';
  return confianca;
}
