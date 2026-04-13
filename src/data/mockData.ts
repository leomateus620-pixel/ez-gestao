import type { Empresa, CNDItem, Documento, Envio, Alerta, LogAcesso } from './types';

export const mockEmpresas: Empresa[] = [
  {
    id: '1', razaoSocial: 'Tech Solutions Ltda', nomeFantasia: 'TechSol',
    cnpj: '12345678000190', regimeTributario: 'lucro_presumido',
    municipio: 'São Paulo', estado: 'SP', responsavelInterno: 'Ana Silva',
    responsavelCliente: 'Carlos Mendes', emailPrincipal: 'contato@techsol.com.br',
    whatsappPrincipal: '11999887766', observacoes: 'Cliente premium desde 2020',
    status: 'ativa', criadoEm: '2024-01-15', atualizadoEm: '2026-04-10',
  },
  {
    id: '2', razaoSocial: 'Construtora Horizonte S.A.', nomeFantasia: 'Horizonte',
    cnpj: '98765432000111', regimeTributario: 'lucro_real',
    municipio: 'Rio de Janeiro', estado: 'RJ', responsavelInterno: 'Pedro Santos',
    responsavelCliente: 'Lucia Ferreira', emailPrincipal: 'admin@horizonte.com.br',
    whatsappPrincipal: '21988776655', observacoes: 'Atenção especial com SEFAZ',
    status: 'ativa', criadoEm: '2023-06-01', atualizadoEm: '2026-04-12',
  },
  {
    id: '3', razaoSocial: 'Padaria Pão Dourado ME', nomeFantasia: 'Pão Dourado',
    cnpj: '11223344000155', regimeTributario: 'simples_nacional',
    municipio: 'Belo Horizonte', estado: 'MG', responsavelInterno: 'Maria Oliveira',
    responsavelCliente: 'José Costa', emailPrincipal: 'padaria@paodourado.com.br',
    whatsappPrincipal: '31977665544', observacoes: '',
    status: 'ativa', criadoEm: '2024-03-20', atualizadoEm: '2026-04-08',
  },
  {
    id: '4', razaoSocial: 'Logística Express Transportes Ltda', nomeFantasia: 'LogExpress',
    cnpj: '55667788000199', regimeTributario: 'lucro_presumido',
    municipio: 'Curitiba', estado: 'PR', responsavelInterno: 'Ana Silva',
    responsavelCliente: 'Roberto Lima', emailPrincipal: 'fiscal@logexpress.com.br',
    whatsappPrincipal: '41966554433', observacoes: 'Renovar FGTS com urgência',
    status: 'ativa', criadoEm: '2023-09-10', atualizadoEm: '2026-04-11',
  },
  {
    id: '5', razaoSocial: 'Clínica Bem Estar Ltda', nomeFantasia: 'Bem Estar',
    cnpj: '22334455000177', regimeTributario: 'lucro_presumido',
    municipio: 'Florianópolis', estado: 'SC', responsavelInterno: 'Pedro Santos',
    responsavelCliente: 'Dra. Amanda Reis', emailPrincipal: 'admin@clinicabemestar.com.br',
    whatsappPrincipal: '48955443322', observacoes: 'Checklist completo obrigatório',
    status: 'ativa', criadoEm: '2024-02-01', atualizadoEm: '2026-04-09',
  },
  {
    id: '6', razaoSocial: 'Restaurante Sabor & Arte Eireli', nomeFantasia: 'Sabor & Arte',
    cnpj: '33445566000133', regimeTributario: 'simples_nacional',
    municipio: 'Salvador', estado: 'BA', responsavelInterno: 'Maria Oliveira',
    responsavelCliente: 'Felipe Barbosa', emailPrincipal: 'contato@saborarte.com.br',
    whatsappPrincipal: '71944332211', observacoes: '',
    status: 'pausada', criadoEm: '2023-11-15', atualizadoEm: '2026-03-20',
  },
  {
    id: '7', razaoSocial: 'Indústria Metalúrgica Norte S.A.', nomeFantasia: 'MetalNorte',
    cnpj: '44556677000122', regimeTributario: 'lucro_real',
    municipio: 'Manaus', estado: 'AM', responsavelInterno: 'Ana Silva',
    responsavelCliente: 'Eng. Ricardo Souza', emailPrincipal: 'fiscal@metalnorte.com.br',
    whatsappPrincipal: '92933221100', observacoes: 'ZFM - atenção especial com SUFRAMA',
    status: 'ativa', criadoEm: '2023-04-01', atualizadoEm: '2026-04-13',
  },
  {
    id: '8', razaoSocial: 'Agropecuária Campo Verde Ltda', nomeFantasia: 'Campo Verde',
    cnpj: '66778899000144', regimeTributario: 'lucro_presumido',
    municipio: 'Goiânia', estado: 'GO', responsavelInterno: 'Pedro Santos',
    responsavelCliente: 'João Teixeira', emailPrincipal: 'adm@campoverde.agro.br',
    whatsappPrincipal: '62922110099', observacoes: '',
    status: 'ativa', criadoEm: '2024-05-10', atualizadoEm: '2026-04-07',
  },
  {
    id: '9', razaoSocial: 'Escola Futuro Brilhante ME', nomeFantasia: 'Futuro Brilhante',
    cnpj: '77889900000166', regimeTributario: 'simples_nacional',
    municipio: 'Recife', estado: 'PE', responsavelInterno: 'Maria Oliveira',
    responsavelCliente: 'Profa. Carla Nunes', emailPrincipal: 'escola@futurobrilhante.edu.br',
    whatsappPrincipal: '81911009988', observacoes: 'Isenta de alguns tributos',
    status: 'arquivada', criadoEm: '2023-07-01', atualizadoEm: '2025-12-15',
  },
  {
    id: '10', razaoSocial: 'Consultoria Alpha Assessoria Ltda', nomeFantasia: 'Alpha',
    cnpj: '88990011000188', regimeTributario: 'lucro_presumido',
    municipio: 'Porto Alegre', estado: 'RS', responsavelInterno: 'Ana Silva',
    responsavelCliente: 'Marcos Almeida', emailPrincipal: 'contato@alphaconsult.com.br',
    whatsappPrincipal: '51900998877', observacoes: 'Nova empresa, verificar todos os docs',
    status: 'ativa', criadoEm: '2026-01-10', atualizadoEm: '2026-04-12',
  },
];

function d(offset: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  return dt.toISOString().split('T')[0];
}

export const mockCNDItems: CNDItem[] = [
  { id: 'c1', empresaId: '1', tipo: 'receita_federal', status: 'valida', dataEmissao: d(-60), dataVencimento: d(120), origem: 'Portal e-CAC', arquivoId: 'd1', observacao: '', responsavel: 'Ana Silva', historico: [] },
  { id: 'c2', empresaId: '1', tipo: 'fgts', status: 'vencendo', dataEmissao: d(-25), dataVencimento: d(5), origem: 'CRF Online', arquivoId: 'd2', observacao: 'Renovar em breve', responsavel: 'Ana Silva', historico: [] },
  { id: 'c3', empresaId: '1', tipo: 'trabalhista', status: 'valida', dataEmissao: d(-30), dataVencimento: d(150), origem: 'TST', arquivoId: 'd3', observacao: '', responsavel: 'Ana Silva', historico: [] },
  { id: 'c4', empresaId: '1', tipo: 'municipal', status: 'vencida', dataEmissao: d(-200), dataVencimento: d(-10), origem: 'Prefeitura SP', arquivoId: null, observacao: 'Aguardando novo PDF', responsavel: 'Ana Silva', historico: [] },
  { id: 'c5', empresaId: '1', tipo: 'sefaz', status: 'valida', dataEmissao: d(-45), dataVencimento: d(135), origem: 'SEFAZ SP', arquivoId: 'd4', observacao: '', responsavel: 'Ana Silva', historico: [] },

  { id: 'c6', empresaId: '2', tipo: 'receita_federal', status: 'vencida', dataEmissao: d(-200), dataVencimento: d(-5), origem: 'Portal e-CAC', arquivoId: null, observacao: 'URGENTE', responsavel: 'Pedro Santos', historico: [] },
  { id: 'c7', empresaId: '2', tipo: 'fgts', status: 'valida', dataEmissao: d(-10), dataVencimento: d(170), origem: 'CRF Online', arquivoId: 'd5', observacao: '', responsavel: 'Pedro Santos', historico: [] },
  { id: 'c8', empresaId: '2', tipo: 'trabalhista', status: 'vencendo', dataEmissao: d(-170), dataVencimento: d(2), origem: 'TST', arquivoId: 'd6', observacao: '', responsavel: 'Pedro Santos', historico: [] },
  { id: 'c9', empresaId: '2', tipo: 'sefaz', status: 'erro', dataEmissao: null, dataVencimento: null, origem: 'SEFAZ RJ', arquivoId: null, observacao: 'Erro ao consultar', responsavel: 'Pedro Santos', historico: [] },

  { id: 'c10', empresaId: '3', tipo: 'receita_federal', status: 'valida', dataEmissao: d(-20), dataVencimento: d(160), origem: 'Portal e-CAC', arquivoId: 'd7', observacao: '', responsavel: 'Maria Oliveira', historico: [] },
  { id: 'c11', empresaId: '3', tipo: 'fgts', status: 'pendente', dataEmissao: null, dataVencimento: null, origem: '', arquivoId: null, observacao: 'Aguardando emissão', responsavel: 'Maria Oliveira', historico: [] },
  { id: 'c12', empresaId: '3', tipo: 'municipal', status: 'valida', dataEmissao: d(-15), dataVencimento: d(165), origem: 'Prefeitura BH', arquivoId: 'd8', observacao: '', responsavel: 'Maria Oliveira', historico: [] },

  { id: 'c13', empresaId: '4', tipo: 'receita_federal', status: 'vencendo', dataEmissao: d(-170), dataVencimento: d(1), origem: 'Portal e-CAC', arquivoId: 'd9', observacao: 'Vence amanhã!', responsavel: 'Ana Silva', historico: [] },
  { id: 'c14', empresaId: '4', tipo: 'fgts', status: 'vencida', dataEmissao: d(-190), dataVencimento: d(-3), origem: 'CRF Online', arquivoId: null, observacao: '', responsavel: 'Ana Silva', historico: [] },
  { id: 'c15', empresaId: '4', tipo: 'trabalhista', status: 'valida', dataEmissao: d(-40), dataVencimento: d(140), origem: 'TST', arquivoId: 'd10', observacao: '', responsavel: 'Ana Silva', historico: [] },
  { id: 'c16', empresaId: '4', tipo: 'sefaz', status: 'valida', dataEmissao: d(-50), dataVencimento: d(130), origem: 'SEFAZ PR', arquivoId: 'd11', observacao: '', responsavel: 'Ana Silva', historico: [] },

  { id: 'c17', empresaId: '5', tipo: 'receita_federal', status: 'valida', dataEmissao: d(-30), dataVencimento: d(150), origem: 'Portal e-CAC', arquivoId: 'd12', observacao: '', responsavel: 'Pedro Santos', historico: [] },
  { id: 'c18', empresaId: '5', tipo: 'fgts', status: 'valida', dataEmissao: d(-20), dataVencimento: d(160), origem: 'CRF Online', arquivoId: 'd13', observacao: '', responsavel: 'Pedro Santos', historico: [] },
  { id: 'c19', empresaId: '5', tipo: 'trabalhista', status: 'vencendo', dataEmissao: d(-170), dataVencimento: d(6), origem: 'TST', arquivoId: 'd14', observacao: 'Renovar em breve', responsavel: 'Pedro Santos', historico: [] },
  { id: 'c20', empresaId: '5', tipo: 'municipal', status: 'pendente', dataEmissao: null, dataVencimento: null, origem: '', arquivoId: null, observacao: 'Solicitar à prefeitura', responsavel: 'Pedro Santos', historico: [] },

  { id: 'c21', empresaId: '7', tipo: 'receita_federal', status: 'vencida', dataEmissao: d(-200), dataVencimento: d(-15), origem: 'Portal e-CAC', arquivoId: null, observacao: 'Situação crítica', responsavel: 'Ana Silva', historico: [] },
  { id: 'c22', empresaId: '7', tipo: 'fgts', status: 'vencida', dataEmissao: d(-195), dataVencimento: d(-8), origem: 'CRF Online', arquivoId: null, observacao: '', responsavel: 'Ana Silva', historico: [] },
  { id: 'c23', empresaId: '7', tipo: 'sefaz', status: 'vencendo', dataEmissao: d(-170), dataVencimento: d(3), origem: 'SEFAZ AM', arquivoId: 'd15', observacao: '', responsavel: 'Ana Silva', historico: [] },

  { id: 'c24', empresaId: '8', tipo: 'receita_federal', status: 'valida', dataEmissao: d(-10), dataVencimento: d(170), origem: 'Portal e-CAC', arquivoId: 'd16', observacao: '', responsavel: 'Pedro Santos', historico: [] },
  { id: 'c25', empresaId: '8', tipo: 'fgts', status: 'valida', dataEmissao: d(-15), dataVencimento: d(165), origem: 'CRF Online', arquivoId: 'd17', observacao: '', responsavel: 'Pedro Santos', historico: [] },

  { id: 'c26', empresaId: '10', tipo: 'receita_federal', status: 'pendente', dataEmissao: null, dataVencimento: null, origem: '', arquivoId: null, observacao: 'Empresa nova', responsavel: 'Ana Silva', historico: [] },
  { id: 'c27', empresaId: '10', tipo: 'fgts', status: 'pendente', dataEmissao: null, dataVencimento: null, origem: '', arquivoId: null, observacao: '', responsavel: 'Ana Silva', historico: [] },
  { id: 'c28', empresaId: '10', tipo: 'municipal', status: 'pendente', dataEmissao: null, dataVencimento: null, origem: '', arquivoId: null, observacao: '', responsavel: 'Ana Silva', historico: [] },
];

export const mockDocumentos: Documento[] = [
  { id: 'd1', empresaId: '1', cndItemId: 'c1', nome: 'CND_RF_TechSol_2026.pdf', tipo: 'receita_federal', dataUpload: d(-60), responsavel: 'Ana Silva', validade: d(120), observacao: '', versao: 1, tamanho: '245 KB', url: '#' },
  { id: 'd2', empresaId: '1', cndItemId: 'c2', nome: 'CRF_FGTS_TechSol_2026.pdf', tipo: 'fgts', dataUpload: d(-25), responsavel: 'Ana Silva', validade: d(5), observacao: '', versao: 2, tamanho: '189 KB', url: '#' },
  { id: 'd3', empresaId: '1', cndItemId: 'c3', nome: 'CNDT_TechSol_2026.pdf', tipo: 'trabalhista', dataUpload: d(-30), responsavel: 'Ana Silva', validade: d(150), observacao: '', versao: 1, tamanho: '156 KB', url: '#' },
  { id: 'd4', empresaId: '1', cndItemId: 'c5', nome: 'CND_SEFAZ_SP_TechSol.pdf', tipo: 'sefaz', dataUpload: d(-45), responsavel: 'Ana Silva', validade: d(135), observacao: '', versao: 1, tamanho: '210 KB', url: '#' },
  { id: 'd5', empresaId: '2', cndItemId: 'c7', nome: 'CRF_FGTS_Horizonte.pdf', tipo: 'fgts', dataUpload: d(-10), responsavel: 'Pedro Santos', validade: d(170), observacao: '', versao: 1, tamanho: '198 KB', url: '#' },
  { id: 'd6', empresaId: '2', cndItemId: 'c8', nome: 'CNDT_Horizonte.pdf', tipo: 'trabalhista', dataUpload: d(-170), responsavel: 'Pedro Santos', validade: d(2), observacao: '', versao: 1, tamanho: '167 KB', url: '#' },
  { id: 'd7', empresaId: '3', cndItemId: 'c10', nome: 'CND_RF_PaoDourado.pdf', tipo: 'receita_federal', dataUpload: d(-20), responsavel: 'Maria Oliveira', validade: d(160), observacao: '', versao: 1, tamanho: '234 KB', url: '#' },
  { id: 'd8', empresaId: '3', cndItemId: 'c12', nome: 'CND_Municipal_BH.pdf', tipo: 'municipal', dataUpload: d(-15), responsavel: 'Maria Oliveira', validade: d(165), observacao: '', versao: 1, tamanho: '178 KB', url: '#' },
  { id: 'd9', empresaId: '4', cndItemId: 'c13', nome: 'CND_RF_LogExpress.pdf', tipo: 'receita_federal', dataUpload: d(-170), responsavel: 'Ana Silva', validade: d(1), observacao: 'Vence amanhã', versao: 1, tamanho: '241 KB', url: '#' },
  { id: 'd10', empresaId: '4', cndItemId: 'c15', nome: 'CNDT_LogExpress.pdf', tipo: 'trabalhista', dataUpload: d(-40), responsavel: 'Ana Silva', validade: d(140), observacao: '', versao: 1, tamanho: '155 KB', url: '#' },
  { id: 'd11', empresaId: '4', cndItemId: 'c16', nome: 'CND_SEFAZ_PR_LogExpress.pdf', tipo: 'sefaz', dataUpload: d(-50), responsavel: 'Ana Silva', validade: d(130), observacao: '', versao: 1, tamanho: '203 KB', url: '#' },
  { id: 'd12', empresaId: '5', cndItemId: 'c17', nome: 'CND_RF_BemEstar.pdf', tipo: 'receita_federal', dataUpload: d(-30), responsavel: 'Pedro Santos', validade: d(150), observacao: '', versao: 1, tamanho: '225 KB', url: '#' },
  { id: 'd13', empresaId: '5', cndItemId: 'c18', nome: 'CRF_FGTS_BemEstar.pdf', tipo: 'fgts', dataUpload: d(-20), responsavel: 'Pedro Santos', validade: d(160), observacao: '', versao: 1, tamanho: '192 KB', url: '#' },
  { id: 'd14', empresaId: '5', cndItemId: 'c19', nome: 'CNDT_BemEstar.pdf', tipo: 'trabalhista', dataUpload: d(-170), responsavel: 'Pedro Santos', validade: d(6), observacao: '', versao: 1, tamanho: '164 KB', url: '#' },
  { id: 'd15', empresaId: '7', cndItemId: 'c23', nome: 'CND_SEFAZ_AM_MetalNorte.pdf', tipo: 'sefaz', dataUpload: d(-170), responsavel: 'Ana Silva', validade: d(3), observacao: '', versao: 1, tamanho: '218 KB', url: '#' },
  { id: 'd16', empresaId: '8', cndItemId: 'c24', nome: 'CND_RF_CampoVerde.pdf', tipo: 'receita_federal', dataUpload: d(-10), responsavel: 'Pedro Santos', validade: d(170), observacao: '', versao: 1, tamanho: '237 KB', url: '#' },
  { id: 'd17', empresaId: '8', cndItemId: 'c25', nome: 'CRF_FGTS_CampoVerde.pdf', tipo: 'fgts', dataUpload: d(-15), responsavel: 'Pedro Santos', validade: d(165), observacao: '', versao: 1, tamanho: '185 KB', url: '#' },
];

export const mockEnvios: Envio[] = [
  { id: 'e1', empresaId: '1', canal: 'email', destinatario: 'carlos@techsol.com.br', assunto: 'CNDs Atualizadas - TechSol', mensagem: 'Seguem as certidões atualizadas.', documentoIds: ['d1', 'd2', 'd3'], status: 'lido', dataEnvio: d(-5), usuario: 'Ana Silva' },
  { id: 'e2', empresaId: '2', canal: 'whatsapp', destinatario: '21988776655', assunto: '', mensagem: 'Olá Lucia, seguem as CNDs da Horizonte.', documentoIds: ['d5', 'd6'], status: 'entregue', dataEnvio: d(-3), usuario: 'Pedro Santos' },
  { id: 'e3', empresaId: '4', canal: 'email', destinatario: 'fiscal@logexpress.com.br', assunto: 'Urgente: CNDs LogExpress', mensagem: 'Documentos para renovação urgente.', documentoIds: ['d9', 'd10'], status: 'enviado', dataEnvio: d(-1), usuario: 'Ana Silva' },
  { id: 'e4', empresaId: '5', canal: 'email', destinatario: 'admin@clinicabemestar.com.br', assunto: 'CNDs Bem Estar', mensagem: 'Certidões em anexo.', documentoIds: ['d12', 'd13'], status: 'lido', dataEnvio: d(-7), usuario: 'Pedro Santos' },
  { id: 'e5', empresaId: '3', canal: 'whatsapp', destinatario: '31977665544', assunto: '', mensagem: 'José, seguem as certidões atualizadas do Pão Dourado.', documentoIds: ['d7', 'd8'], status: 'lido', dataEnvio: d(-2), usuario: 'Maria Oliveira' },
];

export const mockAlertas: Alerta[] = [
  { id: 'a1', empresaId: '1', cndItemId: 'c4', tipo: 'vencido', prioridade: 'critica', titulo: 'CND Municipal vencida - TechSol', descricao: 'A certidão municipal da TechSol venceu há 10 dias.', lido: false, resolvido: false, snoozedAte: null, criadoEm: d(-10) },
  { id: 'a2', empresaId: '1', cndItemId: 'c2', tipo: 'vencimento_7d', prioridade: 'alta', titulo: 'FGTS vence em 5 dias - TechSol', descricao: 'O CRF do FGTS vence em 5 dias.', lido: false, resolvido: false, snoozedAte: null, criadoEm: d(-2) },
  { id: 'a3', empresaId: '2', cndItemId: 'c6', tipo: 'vencido', prioridade: 'critica', titulo: 'CND Receita Federal vencida - Horizonte', descricao: 'A CND da Receita Federal venceu há 5 dias.', lido: false, resolvido: false, snoozedAte: null, criadoEm: d(-5) },
  { id: 'a4', empresaId: '2', cndItemId: 'c8', tipo: 'vencimento_3d', prioridade: 'alta', titulo: 'CNDT vence em 2 dias - Horizonte', descricao: 'A certidão trabalhista vence em 2 dias.', lido: true, resolvido: false, snoozedAte: null, criadoEm: d(-1) },
  { id: 'a5', empresaId: '2', cndItemId: 'c9', tipo: 'sem_pdf', prioridade: 'media', titulo: 'Sem PDF da SEFAZ - Horizonte', descricao: 'Erro na consulta da SEFAZ RJ. Sem PDF anexado.', lido: false, resolvido: false, snoozedAte: null, criadoEm: d(-3) },
  { id: 'a6', empresaId: '4', cndItemId: 'c13', tipo: 'vencimento_1d', prioridade: 'critica', titulo: 'CND RF vence amanhã - LogExpress', descricao: 'A CND da Receita Federal vence amanhã!', lido: false, resolvido: false, snoozedAte: null, criadoEm: d(0) },
  { id: 'a7', empresaId: '4', cndItemId: 'c14', tipo: 'vencido', prioridade: 'critica', titulo: 'FGTS vencido - LogExpress', descricao: 'O CRF do FGTS venceu há 3 dias.', lido: false, resolvido: false, snoozedAte: null, criadoEm: d(-3) },
  { id: 'a8', empresaId: '7', cndItemId: 'c21', tipo: 'vencido', prioridade: 'critica', titulo: 'CND RF vencida - MetalNorte', descricao: 'Situação crítica: CND vencida há 15 dias.', lido: false, resolvido: false, snoozedAte: null, criadoEm: d(-15) },
  { id: 'a9', empresaId: '7', cndItemId: 'c22', tipo: 'vencido', prioridade: 'critica', titulo: 'FGTS vencido - MetalNorte', descricao: 'CRF do FGTS vencido há 8 dias.', lido: false, resolvido: false, snoozedAte: null, criadoEm: d(-8) },
  { id: 'a10', empresaId: '7', cndItemId: 'c23', tipo: 'vencimento_3d', prioridade: 'alta', titulo: 'SEFAZ vence em 3 dias - MetalNorte', descricao: 'CND da SEFAZ AM vence em 3 dias.', lido: false, resolvido: false, snoozedAte: null, criadoEm: d(0) },
  { id: 'a11', empresaId: '10', cndItemId: null, tipo: 'checklist_incompleto', prioridade: 'media', titulo: 'Checklist incompleto - Alpha', descricao: 'Empresa nova com checklist pendente.', lido: false, resolvido: false, snoozedAte: null, criadoEm: d(-2) },
  { id: 'a12', empresaId: '5', cndItemId: 'c19', tipo: 'vencimento_7d', prioridade: 'alta', titulo: 'CNDT vence em 6 dias - Bem Estar', descricao: 'Renovar certidão trabalhista.', lido: true, resolvido: false, snoozedAte: null, criadoEm: d(-1) },
];

export const mockLogs: LogAcesso[] = [
  { id: 'l1', empresaId: '1', envioId: 'e1', documentoId: 'd1', acao: 'envio', canal: 'email', usuario: 'Ana Silva', destinatario: 'carlos@techsol.com.br', dataHora: d(-5) + 'T10:30:00', detalhes: 'Envio de 3 documentos por e-mail' },
  { id: 'l2', empresaId: '1', envioId: 'e1', documentoId: 'd1', acao: 'abertura', canal: 'email', usuario: 'Carlos Mendes', destinatario: null, dataHora: d(-5) + 'T14:22:00', detalhes: 'Link aberto pelo destinatário' },
  { id: 'l3', empresaId: '1', envioId: 'e1', documentoId: 'd1', acao: 'download', canal: 'email', usuario: 'Carlos Mendes', destinatario: null, dataHora: d(-5) + 'T14:25:00', detalhes: 'Download de CND_RF_TechSol_2026.pdf' },
  { id: 'l4', empresaId: '2', envioId: 'e2', documentoId: 'd5', acao: 'envio', canal: 'whatsapp', usuario: 'Pedro Santos', destinatario: '21988776655', dataHora: d(-3) + 'T09:15:00', detalhes: 'Envio de 2 documentos via WhatsApp' },
  { id: 'l5', empresaId: '2', envioId: 'e2', documentoId: 'd5', acao: 'visualizacao', canal: 'whatsapp', usuario: 'Lucia Ferreira', destinatario: null, dataHora: d(-3) + 'T11:40:00', detalhes: 'Documento visualizado' },
  { id: 'l6', empresaId: '4', envioId: 'e3', documentoId: 'd9', acao: 'envio', canal: 'email', usuario: 'Ana Silva', destinatario: 'fiscal@logexpress.com.br', dataHora: d(-1) + 'T16:00:00', detalhes: 'Envio urgente de 2 documentos' },
  { id: 'l7', empresaId: '5', envioId: 'e4', documentoId: 'd12', acao: 'envio', canal: 'email', usuario: 'Pedro Santos', destinatario: 'admin@clinicabemestar.com.br', dataHora: d(-7) + 'T08:45:00', detalhes: 'Envio de 2 certidões' },
  { id: 'l8', empresaId: '5', envioId: 'e4', documentoId: 'd12', acao: 'abertura', canal: 'email', usuario: 'Dra. Amanda Reis', destinatario: null, dataHora: d(-7) + 'T10:12:00', detalhes: 'Link aberto' },
  { id: 'l9', empresaId: '5', envioId: 'e4', documentoId: 'd12', acao: 'download', canal: 'email', usuario: 'Dra. Amanda Reis', destinatario: null, dataHora: d(-7) + 'T10:15:00', detalhes: 'Download realizado' },
  { id: 'l10', empresaId: '3', envioId: 'e5', documentoId: 'd7', acao: 'envio', canal: 'whatsapp', usuario: 'Maria Oliveira', destinatario: '31977665544', dataHora: d(-2) + 'T13:30:00', detalhes: 'Envio de 2 documentos via WhatsApp' },
];
