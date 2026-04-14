import type {
  Connector, ConnectorRun, ConnectorRunStep, ExceptionItem,
  AutomationBatch, IntegrationHealthLog, RetryPolicy, SchedulingRule,
} from './automation-types';

function d(offset: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  return dt.toISOString();
}

function ts(offset: number, hours = 0, mins = 0): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  dt.setHours(hours, mins, 0, 0);
  return dt.toISOString();
}

export const mockConnectors: Connector[] = [
  {
    id: 'conn-rf', nome: 'Receita Federal API', tipo: 'api_direta', orgao: 'receita_federal',
    status: 'ativo', versao: '2.1.0', ultimoTeste: d(0), taxaSucesso: 94.5,
    tempoMedio: 3.2, config: { endpoint: 'https://api.rfb.gov.br/cnd', auth: 'certificado_digital' },
    descricao: 'Consulta CND/CPDEN via API REST da Receita Federal com certificado digital A1.',
  },
  {
    id: 'conn-fgts', nome: 'FGTS / CRF Online', tipo: 'api_direta', orgao: 'fgts',
    status: 'ativo', versao: '1.4.2', ultimoTeste: d(0), taxaSucesso: 97.1,
    tempoMedio: 2.1, config: { endpoint: 'https://consulta-crf.caixa.gov.br/api' },
    descricao: 'Consulta CRF (Certificado de Regularidade do FGTS) via API da Caixa.',
  },
  {
    id: 'conn-sefaz', nome: 'SEFAZ Browser', tipo: 'browser_headless', orgao: 'sefaz',
    status: 'ativo', versao: '1.2.0', ultimoTeste: d(-1), taxaSucesso: 82.3,
    tempoMedio: 8.7, config: { browser: 'chromium', headless: true },
    descricao: 'Automação headless para portais SEFAZ estaduais. Suporta SP, RJ, MG, PR.',
  },
  {
    id: 'conn-mun', nome: 'Municipal Assistida', tipo: 'integracao_assistida', orgao: 'municipal',
    status: 'ativo', versao: '1.0.0', ultimoTeste: d(-2), taxaSucesso: 68.0,
    tempoMedio: 15.4, config: { modo: 'assistido' },
    descricao: 'Integração assistida para prefeituras sem API. Requer intervenção em captchas.',
  },
  {
    id: 'conn-tst', nome: 'TST API', tipo: 'api_direta', orgao: 'trabalhista',
    status: 'ativo', versao: '1.3.1', ultimoTeste: d(0), taxaSucesso: 98.7,
    tempoMedio: 1.5, config: { endpoint: 'https://cndt-certidao.tst.jus.br/api' },
    descricao: 'Consulta CNDT (Certidão Negativa de Débitos Trabalhistas) via API do TST.',
  },
  {
    id: 'conn-manual', nome: 'Upload Manual', tipo: 'upload_manual', orgao: 'personalizada',
    status: 'ativo', versao: '1.0.0', ultimoTeste: d(0), taxaSucesso: 100,
    tempoMedio: 0, config: {},
    descricao: 'Fallback para upload manual de PDFs quando a automação não é possível.',
  },
];

function makeSteps(runId: string, _status: 'sucesso' | 'falha', failAt?: ConnectorRunStep['etapa']): ConnectorRunStep[] {
  const etapas: ConnectorRunStep['etapa'][] = ['autenticacao', 'consulta', 'captura', 'parsing', 'persistencia'];
  return etapas.map((etapa, i) => {
    const isFail = failAt === etapa;
    const isAfterFail = failAt && etapas.indexOf(failAt) < i;
    return {
      id: `step-${runId}-${i}`,
      runId,
      etapa,
      status: isFail ? 'falha' : isAfterFail ? 'pulado' : 'sucesso',
      inicio: ts(0, 8, i * 2),
      fim: isFail || isAfterFail ? null : ts(0, 8, i * 2 + 1),
      detalhes: isFail ? 'Erro: timeout na conexão' : isAfterFail ? '' : `${etapa} concluída com sucesso`,
    };
  });
}

export const mockRuns: ConnectorRun[] = [
  {
    id: 'run-1', connectorId: 'conn-rf', empresaId: '1', cndItemId: 'c1', status: 'sucesso',
    inicioExecucao: ts(-1, 8, 0), fimExecucao: ts(-1, 8, 3), tentativa: 1, duracao: 3.2,
    resultadoBruto: 'CERTIDAO_NEGATIVA_DEBITOS_VALIDA', statusNormalizado: 'valida',
    confianca: 'alta', evidencias: ['PDF baixado', 'Hash verificado'], erroDetalhes: null,
    steps: makeSteps('run-1', 'sucesso'),
  },
  {
    id: 'run-2', connectorId: 'conn-fgts', empresaId: '1', cndItemId: 'c2', status: 'sucesso',
    inicioExecucao: ts(-1, 8, 5), fimExecucao: ts(-1, 8, 7), tentativa: 1, duracao: 2.1,
    resultadoBruto: 'REGULARIDADE_CONFIRMADA', statusNormalizado: 'valida',
    confianca: 'alta', evidencias: ['CRF emitido'], erroDetalhes: null,
    steps: makeSteps('run-2', 'sucesso'),
  },
  {
    id: 'run-3', connectorId: 'conn-sefaz', empresaId: '2', cndItemId: 'c9', status: 'falha',
    inicioExecucao: ts(-1, 9, 0), fimExecucao: ts(-1, 9, 9), tentativa: 3, duracao: 8.7,
    resultadoBruto: 'TIMEOUT_PORTAL', statusNormalizado: 'erro',
    confianca: 'baixa', evidencias: ['Screenshot do erro'], erroDetalhes: 'Portal SEFAZ RJ indisponível após 3 tentativas',
    steps: makeSteps('run-3', 'falha', 'consulta'),
  },
  {
    id: 'run-4', connectorId: 'conn-tst', empresaId: '1', cndItemId: 'c3', status: 'sucesso',
    inicioExecucao: ts(-1, 8, 10), fimExecucao: ts(-1, 8, 11), tentativa: 1, duracao: 1.5,
    resultadoBruto: 'NADA_CONSTA', statusNormalizado: 'valida',
    confianca: 'alta', evidencias: ['CNDT emitida'], erroDetalhes: null,
    steps: makeSteps('run-4', 'sucesso'),
  },
  {
    id: 'run-5', connectorId: 'conn-mun', empresaId: '1', cndItemId: 'c4', status: 'revisao',
    inicioExecucao: ts(-1, 10, 0), fimExecucao: ts(-1, 10, 15), tentativa: 1, duracao: 15.4,
    resultadoBruto: 'CERTIDAO_POSITIVA_COM_EFEITO_NEGATIVA', statusNormalizado: 'valida',
    confianca: 'media', evidencias: ['Captura de tela', 'Texto parcial extraído'], erroDetalhes: null,
    steps: makeSteps('run-5', 'sucesso'),
  },
  {
    id: 'run-6', connectorId: 'conn-rf', empresaId: '2', cndItemId: 'c6', status: 'sucesso',
    inicioExecucao: ts(-2, 8, 0), fimExecucao: ts(-2, 8, 4), tentativa: 1, duracao: 3.8,
    resultadoBruto: 'CERTIDAO_POSITIVA', statusNormalizado: 'positiva',
    confianca: 'alta', evidencias: ['PDF baixado — certidão positiva'], erroDetalhes: null,
    steps: makeSteps('run-6', 'sucesso'),
  },
  {
    id: 'run-7', connectorId: 'conn-rf', empresaId: '4', cndItemId: 'c13', status: 'sucesso',
    inicioExecucao: ts(0, 6, 0), fimExecucao: ts(0, 6, 3), tentativa: 1, duracao: 3.1,
    resultadoBruto: 'CERTIDAO_NEGATIVA_DEBITOS_VALIDA', statusNormalizado: 'vencendo',
    confianca: 'alta', evidencias: ['PDF baixado'], erroDetalhes: null,
    steps: makeSteps('run-7', 'sucesso'),
  },
  {
    id: 'run-8', connectorId: 'conn-fgts', empresaId: '4', cndItemId: 'c14', status: 'falha',
    inicioExecucao: ts(0, 6, 5), fimExecucao: ts(0, 6, 8), tentativa: 2, duracao: 4.2,
    resultadoBruto: 'IRREGULARIDADE_CADASTRAL', statusNormalizado: 'erro',
    confianca: 'baixa', evidencias: ['Mensagem de erro do portal'], erroDetalhes: 'CNPJ com irregularidade cadastral na CEF',
    steps: makeSteps('run-8', 'falha', 'captura'),
  },
  {
    id: 'run-9', connectorId: 'conn-tst', empresaId: '5', cndItemId: 'c19', status: 'sucesso',
    inicioExecucao: ts(0, 7, 0), fimExecucao: ts(0, 7, 2), tentativa: 1, duracao: 1.8,
    resultadoBruto: 'NADA_CONSTA', statusNormalizado: 'valida',
    confianca: 'alta', evidencias: ['CNDT emitida'], erroDetalhes: null,
    steps: makeSteps('run-9', 'sucesso'),
  },
  {
    id: 'run-10', connectorId: 'conn-sefaz', empresaId: '7', cndItemId: 'c23', status: 'timeout',
    inicioExecucao: ts(0, 8, 0), fimExecucao: ts(0, 8, 30), tentativa: 3, duracao: 30,
    resultadoBruto: '', statusNormalizado: 'erro',
    confianca: 'baixa', evidencias: [], erroDetalhes: 'Timeout após 30s no portal SEFAZ AM',
    steps: makeSteps('run-10', 'falha', 'autenticacao'),
  },
  {
    id: 'run-11', connectorId: 'conn-rf', empresaId: '7', cndItemId: 'c21', status: 'sucesso',
    inicioExecucao: ts(0, 8, 35), fimExecucao: ts(0, 8, 38), tentativa: 1, duracao: 3.4,
    resultadoBruto: 'CERTIDAO_POSITIVA', statusNormalizado: 'positiva',
    confianca: 'alta', evidencias: ['PDF baixado — pendências fiscais'], erroDetalhes: null,
    steps: makeSteps('run-11', 'sucesso'),
  },
  {
    id: 'run-12', connectorId: 'conn-fgts', empresaId: '7', cndItemId: 'c22', status: 'revisao',
    inicioExecucao: ts(0, 9, 0), fimExecucao: ts(0, 9, 5), tentativa: 1, duracao: 4.8,
    resultadoBruto: 'SITUACAO_PARCIAL_REGULARIZADA', statusNormalizado: 'exige_revisao',
    confianca: 'media', evidencias: ['Texto extraído com ambiguidade'], erroDetalhes: null,
    steps: makeSteps('run-12', 'sucesso'),
  },
  {
    id: 'run-13', connectorId: 'conn-rf', empresaId: '3', cndItemId: 'c10', status: 'sucesso',
    inicioExecucao: ts(0, 10, 0), fimExecucao: ts(0, 10, 3), tentativa: 1, duracao: 2.9,
    resultadoBruto: 'CERTIDAO_NEGATIVA_DEBITOS_VALIDA', statusNormalizado: 'valida',
    confianca: 'alta', evidencias: ['PDF baixado', 'Hash verificado'], erroDetalhes: null,
    steps: makeSteps('run-13', 'sucesso'),
  },
  {
    id: 'run-14', connectorId: 'conn-rf', empresaId: '8', cndItemId: 'c24', status: 'agendado',
    inicioExecucao: ts(1, 6, 0), fimExecucao: null, tentativa: 0, duracao: null,
    resultadoBruto: '', statusNormalizado: '',
    confianca: 'alta', evidencias: [], erroDetalhes: null, steps: [],
  },
  {
    id: 'run-15', connectorId: 'conn-mun', empresaId: '3', cndItemId: 'c12', status: 'sucesso',
    inicioExecucao: ts(0, 11, 0), fimExecucao: ts(0, 11, 14), tentativa: 1, duracao: 14.2,
    resultadoBruto: 'NADA_CONSTA_TRIBUTOS_MUNICIPAIS', statusNormalizado: 'valida',
    confianca: 'alta', evidencias: ['PDF baixado da prefeitura BH'], erroDetalhes: null,
    steps: makeSteps('run-15', 'sucesso'),
  },
  // New runs for variety
  {
    id: 'run-16', connectorId: 'conn-rf', empresaId: '5', cndItemId: 'c16', status: 'sucesso',
    inicioExecucao: ts(0, 7, 10), fimExecucao: ts(0, 7, 13), tentativa: 1, duracao: 3.0,
    resultadoBruto: 'CERTIDAO_NEGATIVA_DEBITOS_VALIDA', statusNormalizado: 'valida',
    confianca: 'alta', evidencias: ['PDF baixado'], erroDetalhes: null,
    steps: makeSteps('run-16', 'sucesso'),
  },
  {
    id: 'run-17', connectorId: 'conn-sefaz', empresaId: '5', cndItemId: 'c18', status: 'falha',
    inicioExecucao: ts(0, 7, 20), fimExecucao: ts(0, 7, 28), tentativa: 2, duracao: 7.6,
    resultadoBruto: 'CAPTCHA_DETECTED', statusNormalizado: 'erro',
    confianca: 'baixa', evidencias: ['Screenshot: CAPTCHA exibido'], erroDetalhes: 'CAPTCHA detectado no portal SEFAZ SP. Automação bloqueada.',
    steps: makeSteps('run-17', 'falha', 'autenticacao'),
  },
  {
    id: 'run-18', connectorId: 'conn-fgts', empresaId: '3', cndItemId: 'c11', status: 'sucesso',
    inicioExecucao: ts(0, 10, 5), fimExecucao: ts(0, 10, 7), tentativa: 1, duracao: 2.3,
    resultadoBruto: 'REGULARIDADE_CONFIRMADA', statusNormalizado: 'valida',
    confianca: 'alta', evidencias: ['CRF emitido'], erroDetalhes: null,
    steps: makeSteps('run-18', 'sucesso'),
  },
  {
    id: 'run-19', connectorId: 'conn-mun', empresaId: '2', cndItemId: 'c8', status: 'revisao',
    inicioExecucao: ts(0, 11, 30), fimExecucao: ts(0, 11, 45), tentativa: 1, duracao: 14.8,
    resultadoBruto: 'SITUACAO_REGULAR_COM_PENDENCIA_MENOR', statusNormalizado: 'exige_revisao',
    confianca: 'media', evidencias: ['Texto parcial extraído', 'PDF com qualidade baixa'], erroDetalhes: null,
    steps: makeSteps('run-19', 'sucesso'),
  },
  {
    id: 'run-20', connectorId: 'conn-tst', empresaId: '3', cndItemId: 'c12', status: 'sucesso',
    inicioExecucao: ts(0, 10, 10), fimExecucao: ts(0, 10, 11), tentativa: 1, duracao: 1.2,
    resultadoBruto: 'NADA_CONSTA', statusNormalizado: 'valida',
    confianca: 'alta', evidencias: ['CNDT emitida'], erroDetalhes: null,
    steps: makeSteps('run-20', 'sucesso'),
  },
];

export const mockExceptions: ExceptionItem[] = [
  {
    id: 'exc-1', runId: 'run-3', empresaId: '2', cndItemId: 'c9',
    motivo: 'Portal SEFAZ RJ indisponível após 3 tentativas',
    criticidade: 'alta', statusExcecao: 'pendente',
    acaoSugerida: 'Reenfileirar em horário alternativo ou upload manual',
    criadoEm: ts(-1, 9, 9), resolvidoEm: null, resolvidoPor: null,
    tipologia: 'portal_indisponivel', tentativas: 3, slaHoras: 24, responsavel: null,
    cnpj: '23.456.789/0001-01', cndTipo: 'sefaz', connectorNome: 'SEFAZ Browser',
  },
  {
    id: 'exc-2', runId: 'run-8', empresaId: '4', cndItemId: 'c14',
    motivo: 'CNPJ com irregularidade cadastral na CEF',
    criticidade: 'critica', statusExcecao: 'pendente',
    acaoSugerida: 'Verificar dados cadastrais do FGTS da empresa',
    criadoEm: ts(0, 6, 8), resolvidoEm: null, resolvidoPor: null,
    tipologia: 'cnpj_inconsistente', tentativas: 2, slaHoras: 4, responsavel: null,
    cnpj: '45.678.901/0001-23', cndTipo: 'fgts', connectorNome: 'FGTS / CRF Online',
  },
  {
    id: 'exc-3', runId: 'run-10', empresaId: '7', cndItemId: 'c23',
    motivo: 'Timeout no portal SEFAZ AM',
    criticidade: 'media', statusExcecao: 'em_analise',
    acaoSugerida: 'Tentar novamente em horário de menor tráfego',
    criadoEm: ts(0, 8, 30), resolvidoEm: null, resolvidoPor: null,
    tipologia: 'portal_indisponivel', tentativas: 3, slaHoras: 48, responsavel: 'Ana Silva',
    cnpj: '78.901.234/0001-67', cndTipo: 'sefaz', connectorNome: 'SEFAZ Browser',
  },
  {
    id: 'exc-4', runId: 'run-12', empresaId: '7', cndItemId: 'c22',
    motivo: 'Resultado ambíguo: situação parcialmente regularizada',
    criticidade: 'alta', statusExcecao: 'pendente',
    acaoSugerida: 'Revisão manual do resultado e decisão sobre status',
    criadoEm: ts(0, 9, 5), resolvidoEm: null, resolvidoPor: null,
    tipologia: 'baixa_confianca', tentativas: 1, slaHoras: 12, responsavel: null,
    cnpj: '78.901.234/0001-67', cndTipo: 'fgts', connectorNome: 'FGTS / CRF Online',
  },
  {
    id: 'exc-5', runId: 'run-5', empresaId: '1', cndItemId: 'c4',
    motivo: 'Confiança média na captura — certidão positiva com efeito de negativa',
    criticidade: 'media', statusExcecao: 'resolvida',
    acaoSugerida: 'Aprovar leitura ou fazer upload manual',
    criadoEm: ts(-1, 10, 15), resolvidoEm: ts(0, 14, 0), resolvidoPor: 'Ana Silva',
    tipologia: 'certidao_positiva', tentativas: 1, slaHoras: 24, responsavel: 'Ana Silva',
    cnpj: '12.345.678/0001-90', cndTipo: 'municipal', connectorNome: 'Municipal Assistida',
  },
  {
    id: 'exc-6', runId: 'run-17', empresaId: '5', cndItemId: 'c18',
    motivo: 'CAPTCHA detectado no portal SEFAZ SP — automação bloqueada',
    criticidade: 'alta', statusExcecao: 'pendente',
    acaoSugerida: 'Resolver CAPTCHA manualmente ou aguardar janela sem proteção',
    criadoEm: ts(0, 7, 28), resolvidoEm: null, resolvidoPor: null,
    tipologia: 'captcha_bloqueante', tentativas: 2, slaHoras: 8, responsavel: null,
    cnpj: '56.789.012/0001-34', cndTipo: 'sefaz', connectorNome: 'SEFAZ Browser',
  },
  {
    id: 'exc-7', runId: 'run-19', empresaId: '2', cndItemId: 'c8',
    motivo: 'Documento retornado é de tipo diferente do esperado (alvará vs CND municipal)',
    criticidade: 'media', statusExcecao: 'pendente',
    acaoSugerida: 'Verificar URL do conector e reconfigurar consulta municipal',
    criadoEm: ts(0, 11, 45), resolvidoEm: null, resolvidoPor: null,
    tipologia: 'documento_incompativel', tentativas: 1, slaHoras: 24, responsavel: null,
    cnpj: '23.456.789/0001-01', cndTipo: 'municipal', connectorNome: 'Municipal Assistida',
  },
  {
    id: 'exc-8', runId: 'run-6', empresaId: '2', cndItemId: 'c6',
    motivo: 'Certidão positiva detectada — empresa com débitos fiscais federais',
    criticidade: 'critica', statusExcecao: 'pendente',
    acaoSugerida: 'Notificar cliente e registrar pendência fiscal',
    criadoEm: ts(-2, 8, 4), resolvidoEm: null, resolvidoPor: null,
    tipologia: 'certidao_positiva', tentativas: 1, slaHoras: 4, responsavel: null,
    cnpj: '23.456.789/0001-01', cndTipo: 'receita_federal', connectorNome: 'Receita Federal API',
  },
  {
    id: 'exc-9', runId: 'run-11', empresaId: '7', cndItemId: 'c21',
    motivo: 'PDF da certidão não foi gerado pela fonte — apenas resposta textual',
    criticidade: 'baixa', statusExcecao: 'pendente',
    acaoSugerida: 'Fazer download manual do PDF pelo portal ou aceitar evidência textual',
    criadoEm: ts(0, 8, 38), resolvidoEm: null, resolvidoPor: null,
    tipologia: 'pdf_ausente', tentativas: 1, slaHoras: 48, responsavel: null,
    cnpj: '78.901.234/0001-67', cndTipo: 'receita_federal', connectorNome: 'Receita Federal API',
  },
  {
    id: 'exc-10', runId: 'run-19', empresaId: '2', cndItemId: 'c8',
    motivo: 'Data de validade extraída (2019) é anterior à data de emissão (2024)',
    criticidade: 'alta', statusExcecao: 'pendente',
    acaoSugerida: 'Corrigir parsing de data ou inserir validade manualmente',
    criadoEm: ts(0, 11, 46), resolvidoEm: null, resolvidoPor: null,
    tipologia: 'validade_ambigua', tentativas: 1, slaHoras: 12, responsavel: null,
    cnpj: '23.456.789/0001-01', cndTipo: 'municipal', connectorNome: 'Municipal Assistida',
  },
  {
    id: 'exc-11', runId: 'run-3', empresaId: '2', cndItemId: 'c9',
    motivo: 'Erro ao parsear HTML do portal — estrutura da página mudou',
    criticidade: 'alta', statusExcecao: 'descartada',
    acaoSugerida: 'Atualizar seletores do conector SEFAZ Browser',
    criadoEm: ts(-3, 14, 0), resolvidoEm: ts(-2, 10, 0), resolvidoPor: 'Carlos Mendes',
    tipologia: 'erro_parsing', tentativas: 3, slaHoras: 8, responsavel: 'Carlos Mendes',
    cnpj: '23.456.789/0001-01', cndTipo: 'sefaz', connectorNome: 'SEFAZ Browser',
  },
  {
    id: 'exc-12', runId: 'run-8', empresaId: '4', cndItemId: 'c14',
    motivo: 'Empresa sem inscrição estadual cadastrada — dado obrigatório para SEFAZ',
    criticidade: 'media', statusExcecao: 'pendente',
    acaoSugerida: 'Completar cadastro da empresa com inscrição estadual',
    criadoEm: ts(0, 6, 10), resolvidoEm: null, resolvidoPor: null,
    tipologia: 'dado_cadastral_insuficiente', tentativas: 1, slaHoras: 24, responsavel: null,
    cnpj: '45.678.901/0001-23', cndTipo: 'sefaz', connectorNome: 'SEFAZ Browser',
  },
];

export const mockBatches: AutomationBatch[] = [
  {
    id: 'batch-1', agendadoPara: ts(0, 6, 0), empresaIds: ['1', '2', '4', '5', '7'],
    status: 'concluido', progressoAtual: 5, totalItems: 5,
  },
  {
    id: 'batch-2', agendadoPara: ts(0, 10, 0), empresaIds: ['3', '8', '10'],
    status: 'executando', progressoAtual: 2, totalItems: 3,
  },
  {
    id: 'batch-3', agendadoPara: ts(1, 6, 0), empresaIds: ['1', '2', '3', '4', '5', '7', '8'],
    status: 'agendado', progressoAtual: 0, totalItems: 7,
  },
];

export const mockHealthLogs: IntegrationHealthLog[] = [
  // Today
  { id: 'hl-1', connectorId: 'conn-rf', timestamp: ts(0, 8, 0), status: 'ok', latencia: 320, detalhes: 'API respondendo normalmente' },
  { id: 'hl-2', connectorId: 'conn-fgts', timestamp: ts(0, 8, 0), status: 'ok', latencia: 210, detalhes: 'Serviço operacional' },
  { id: 'hl-3', connectorId: 'conn-sefaz', timestamp: ts(0, 8, 0), status: 'degradado', latencia: 4500, detalhes: 'Latência alta nos portais estaduais' },
  { id: 'hl-4', connectorId: 'conn-mun', timestamp: ts(0, 8, 0), status: 'ok', latencia: 1200, detalhes: 'Integração assistida funcional' },
  { id: 'hl-5', connectorId: 'conn-tst', timestamp: ts(0, 8, 0), status: 'ok', latencia: 150, detalhes: 'API TST com resposta rápida' },
  // Yesterday
  { id: 'hl-6', connectorId: 'conn-rf', timestamp: ts(-1, 8, 0), status: 'ok', latencia: 280, detalhes: 'API respondendo normalmente' },
  { id: 'hl-7', connectorId: 'conn-sefaz', timestamp: ts(-1, 8, 0), status: 'indisponivel', latencia: 0, detalhes: 'Portal SEFAZ RJ fora do ar' },
  { id: 'hl-8', connectorId: 'conn-fgts', timestamp: ts(-1, 8, 0), status: 'ok', latencia: 195, detalhes: 'Serviço operacional' },
  { id: 'hl-9', connectorId: 'conn-tst', timestamp: ts(-1, 8, 0), status: 'ok', latencia: 140, detalhes: 'API TST com resposta rápida' },
  { id: 'hl-10', connectorId: 'conn-mun', timestamp: ts(-1, 8, 0), status: 'degradado', latencia: 3200, detalhes: 'Prefeitura com resposta lenta' },
  // 2 days ago
  { id: 'hl-11', connectorId: 'conn-rf', timestamp: ts(-2, 8, 0), status: 'ok', latencia: 310, detalhes: 'API operacional' },
  { id: 'hl-12', connectorId: 'conn-sefaz', timestamp: ts(-2, 8, 0), status: 'ok', latencia: 1800, detalhes: 'Portais respondendo' },
  { id: 'hl-13', connectorId: 'conn-fgts', timestamp: ts(-2, 8, 0), status: 'ok', latencia: 220, detalhes: 'Serviço operacional' },
  { id: 'hl-14', connectorId: 'conn-tst', timestamp: ts(-2, 8, 0), status: 'ok', latencia: 165, detalhes: 'API TST operacional' },
  { id: 'hl-15', connectorId: 'conn-mun', timestamp: ts(-2, 8, 0), status: 'ok', latencia: 1100, detalhes: 'Integração funcional' },
];

export const mockRetryPolicies: Record<string, RetryPolicy> = {
  'conn-rf': { maxTentativas: 3, intervaloBase: 60, backoffMultiplier: 2, timeoutSegundos: 30 },
  'conn-fgts': { maxTentativas: 3, intervaloBase: 30, backoffMultiplier: 2, timeoutSegundos: 20 },
  'conn-sefaz': { maxTentativas: 3, intervaloBase: 120, backoffMultiplier: 3, timeoutSegundos: 45 },
  'conn-mun': { maxTentativas: 2, intervaloBase: 300, backoffMultiplier: 1, timeoutSegundos: 60 },
  'conn-tst': { maxTentativas: 3, intervaloBase: 30, backoffMultiplier: 2, timeoutSegundos: 15 },
  'conn-manual': { maxTentativas: 1, intervaloBase: 0, backoffMultiplier: 1, timeoutSegundos: 0 },
};

export const mockSchedulingRules: SchedulingRule[] = [
  { connectorId: 'conn-rf', cndTipo: 'receita_federal', intervaloHoras: 24, diasAntesVencimento: 15, prioridade: 1 },
  { connectorId: 'conn-fgts', cndTipo: 'fgts', intervaloHoras: 24, diasAntesVencimento: 10, prioridade: 2 },
  { connectorId: 'conn-sefaz', cndTipo: 'sefaz', intervaloHoras: 48, diasAntesVencimento: 15, prioridade: 3 },
  { connectorId: 'conn-mun', cndTipo: 'municipal', intervaloHoras: 72, diasAntesVencimento: 20, prioridade: 4 },
  { connectorId: 'conn-tst', cndTipo: 'trabalhista', intervaloHoras: 24, diasAntesVencimento: 10, prioridade: 2 },
];
