import { describe, expect, it } from 'vitest';
import { classifyFatorR, cnpjMatchesExpected, isValidFatorROperationalResult, parsePgdasFatorR } from './fatorRParser';

const fixtures = {
  naoSeAplica: `
Extrato do Simples Nacional
PGDAS-D 2018 Versao 2.2.29
1) Informacoes do Contribuinte
CNPJ Basico: 55.371.662 Nome Empresarial: FELIPE HAMMES DIESEL
Data de Abertura: 03/06/2024 Regime de Apuracao: Competencia Optante pelo Simples Nacional: Sim
2) Informacoes da Apuracao 55371662202604001
Total de Receitas Brutas (R$) Mercado Interno Mercado Externo Total
Receita Bruta do PA (RPA) - Competencia 31.250,00 0,00 31.250,00
Receita bruta acumulada nos doze meses anteriores ao PA
(RBT12) 248.528,94 0,00 248.528,94
2.3) Folha de Salarios Anteriores (R$)
Nenhuma
2.4) Fator r
Fator r = Nao se aplica
3) Informacoes dos Estabelecimentos - valores referentes as Receitas Informadas
CNPJ Estabelecimento: 55.371.662/0001-60
Prestacao de Servicos, exceto para o exterior - Nao sujeitos ao fator "r" e tributados pelo Anexo III
Receita Bruta Informada: R$ 31.250,00
IRPJ CSLL COFINS PIS/Pasep INSS/CPP ICMS IPI ISS Total
92,92 81,31 326,39 70,85 1.008,21 0,00 0,00 743,38 2.323,06
6) Informacoes sobre DAS Gerado na apuracao: 55371662202604001
Principal 2.323,06 Multa 0,00 Juros 0,00 Total 2.323,06
6.2) Informacoes da Arrecadacao do DAS gerado nesta apuracao
Nao foi reconhecido pagamento ate a presente data
`,
  atencao: `
Extrato do Simples Nacional
PGDAS-D 2018 Versao 2.2.29
1) Informacoes do Contribuinte
CNPJ Basico: 44.527.939 Nome Empresarial: CRISTINE SCHWINGEL LTDA
Data de Abertura: 08/12/2021 Regime de Apuracao: Competencia Optante pelo Simples Nacional: Sim
2) Informacoes da Apuracao 44527939202604001
Total de Receitas Brutas (R$) Mercado Interno Mercado Externo Total
Receita Bruta do PA (RPA) - Competencia 23.000,00 0,00 23.000,00
Receita bruta acumulada nos doze meses anteriores ao PA
(RBT12) 244.000,00 0,00 244.000,00
2.3) Folhas de Salarios Anteriores
12/2025 6.216,05 01/2026 6.218,71 02/2026 7.221,33 03/2026 7.324,75
2.3.1) Total de Folhas de Salarios Anteriores (R$) R$ 76.608,07
2.4) Fator r
Fator r = 0,31 - Anexo III
3) Informacoes dos Estabelecimentos - valores referentes as Receitas Informadas
CNPJ Estabelecimento: 44.527.939/0001-84
Prestacao de Servicos, exceto para o exterior - Sujeitos ao fator "r", sem retencao/substituicao tributaria de ISS
Receita Bruta Informada: R$ 23.000,00
IRPJ CSLL COFINS PIS/Pasep INSS/CPP ICMS IPI ISS Total
67,75 59,28 237,97 51,66 735,07 0,00 0,00 541,99 1.693,72
6) Informacoes sobre DAS Gerado na apuracao: 44527939202604001
Principal 1.693,72 Multa 0,00 Juros 0,00 Total 1.693,72
6.2) Informacoes da Arrecadacao do DAS gerado nesta apuracao
Nao foi reconhecido pagamento ate a presente data
`,
  critico: `
Extrato do Simples Nacional
PGDAS-D 2018 Versao 2.2.29
1) Informacoes do Contribuinte
CNPJ Basico: 54.767.050 Nome Empresarial: E R ZANCAN CORRETORA DE SEGUROS LTDA
Data de Abertura: 17/04/2024 Regime de Apuracao: Competencia Optante pelo Simples Nacional: Sim
2) Informacoes da Apuracao 54767050202604001
Total de Receitas Brutas (R$) Mercado Interno Mercado Externo Total
Receita Bruta do PA (RPA) - Competencia 9.276,02 0,00 9.276,02
Receita bruta acumulada nos doze meses anteriores ao PA
(RBT12) 196.305,84 0,00 196.305,84
2.3) Folhas de Salarios Anteriores
12/2025 4.469,89 01/2026 4.347,91 02/2026 4.000,00 03/2026 4.604,60
2.3.1) Total de Folhas de Salarios Anteriores (R$) R$ 55.437,28
2.4) Fator r
Fator r = 0,28 - Anexo III
3) Informacoes dos Estabelecimentos - valores referentes as Receitas Informadas
CNPJ Estabelecimento: 54.767.050/0001-28
Prestacao de Servicos, exceto para o exterior - Sujeitos ao fator "r", sem retencao/substituicao tributaria de ISS
Receita Bruta Informada: R$ 9.276,02
IRPJ CSLL COFINS PIS/Pasep INSS/CPP ICMS IPI ISS Total
23,87 20,88 83,83 18,20 258,94 0,00 0,00 190,92 596,64
6) Informacoes sobre DAS Gerado na apuracao: 54767050202604001
Principal 596,64 Multa 0,00 Juros 0,00 Total 596,64
6.2) Informacoes da Arrecadacao do DAS gerado nesta apuracao
Nao foi reconhecido pagamento ate a presente data
`,
};

describe('parsePgdasFatorR', () => {
  it('interpreta 042026 SERV. 7,43%.pdf como nao aplicavel e sem e-mail', () => {
    const result = parsePgdasFatorR(fixtures.naoSeAplica, '042026 SERV. 7,43%.pdf');

    expect(result.notApplicable).toBe(true);
    expect(result.fatorR).toBeNull();
    expect(result.fatorRValue).toBeNull();
    expect(result.status).toBe('not_applicable');
    expect(result.shouldSendEmail).toBe(false);
    expect(result.shouldAlert).toBe(false);
    expect(result.companyName).toContain('FELIPE HAMMES DIESEL');
    expect(result.cnpjBase).toBe('55.371.662');
    expect(result.period).toBe('04/2026');
    expect(result.rpa).toBe(31250);
    expect(result.rbt12).toBe(248528.94);
    expect(result.payroll12).toBeNull();
    expect(result.folhaAusente).toBe(true);
    expect(result.dasTotal).toBe(2323.06);
    expect(result.paymentRecognized).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('interpreta 042026 SERV. 7,36%.pdf como atencao e gera alerta preventivo', () => {
    const result = parsePgdasFatorR(fixtures.atencao, '042026 SERV. 7,36%.pdf');

    expect(result.notApplicable).toBe(false);
    expect(result.fatorR).toBe(0.31);
    expect(result.fatorRPercent).toBe(31);
    expect(result.status).toBe('attention');
    expect(result.shouldSendEmail).toBe(true);
    expect(result.shouldAlert).toBe(true);
    expect(result.companyName).toContain('CRISTINE SCHWINGEL LTDA');
    expect(result.cnpjBase).toBe('44.527.939');
    expect(result.period).toBe('04/2026');
    expect(result.rpa).toBe(23000);
    expect(result.rbt12).toBe(244000);
    expect(result.payroll12).toBe(76608.07);
    expect(result.declaredFatorRValue).toBe(0.31);
    expect(result.computedFatorRValue).toBeCloseTo(0.3139675, 6);
    expect(result.anexo).toBe('III');
    expect(result.dasTotal).toBe(1693.72);
    expect(result.paymentRecognized).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifica Fator R abaixo de 28% como critico e gera alerta urgente', () => {
    const criticalText = fixtures.critico.replace('Fator r = 0,28 - Anexo III', 'Fator r = 0,27 - Anexo III');
    const result = parsePgdasFatorR(criticalText, '042026 SERV. 6,43%.pdf');

    expect(result.notApplicable).toBe(false);
    expect(result.fatorR).toBe(0.27);
    expect(result.fatorRPercent).toBe(27);
    expect(result.status).toBe('critical');
    expect(result.shouldSendEmail).toBe(true);
    expect(result.shouldAlert).toBe(true);
    expect(result.companyName).toContain('E R ZANCAN CORRETORA DE SEGUROS LTDA');
    expect(result.cnpjBase).toBe('54.767.050');
    expect(result.period).toBe('04/2026');
    expect(result.rpa).toBe(9276.02);
    expect(result.rbt12).toBe(196305.84);
    expect(result.payroll12).toBe(55437.28);
    expect(result.declaredFatorRValue).toBe(0.27);
    expect(result.computedFatorRValue).toBeCloseTo(0.2824, 4);
    expect(result.anexo).toBe('III');
    expect(result.dasTotal).toBe(596.64);
    expect(result.paymentRecognized).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('nao usa a aliquota do nome do arquivo como Fator R', () => {
    const textWithoutFatorR = fixtures.atencao.replace('Fator r = 0,31 - Anexo III', '2.4) Fator r');
    const result = parsePgdasFatorR(textWithoutFatorR, '042026 SERV. 7,36%.pdf');

    expect(result.declaredFatorRValue).toBeNull();
    expect(result.fatorR).toBeNull();
    expect(result.fatorRPercent).toBeNull();
    expect(result.status).toBe('parse_error');
    expect(result.confidence).toBeLessThan(0.7);
    expect(result.errors).toContain('Nao foi possivel identificar Fator R no documento.');
    expect(result.computedFatorRValue).toBeCloseTo(0.3139675, 6);
    expect(result.fatorR).not.toBe(0.0736);
  });

  it('ignora valores de ISS/DAS quando a secao 2.3.1 nao traz o total da folha', () => {
    const text = fixtures.atencao.replace(
      '2.3.1) Total de Folhas de Salarios Anteriores (R$) R$ 76.608,07',
      '2.3.1) Total de Folhas de Salarios Anteriores (R$)\nISS R$ 541,99\nTotal Geral da Empresa R$ 1.234,56',
    );

    const result = parsePgdasFatorR(text, '042026 SERV. 7,36%.pdf');
    expect(result.payroll12).toBeNull();
    expect(result.declaredFatorRValue).toBe(0.31);
    expect(result.status).toBe('attention');
  });

  it('classifica as faixas operacionais de 28% e 32%', () => {
    expect(classifyFatorR(0.2799)).toBe('critical');
    expect(classifyFatorR(0.28)).toBe('attention');
    expect(classifyFatorR(0.3199)).toBe('attention');
    expect(classifyFatorR(0.32)).toBe('safe');
  });

  it('classifica Fator R de 32% como OK', () => {
    const safeText = fixtures.atencao.replace('Fator r = 0,31 - Anexo III', 'Fator r = 0,32 - Anexo III');
    const result = parsePgdasFatorR(safeText, '042026 SERV. 7,36%.pdf');

    expect(result.fatorR).toBe(0.32);
    expect(result.fatorRPercent).toBe(32);
    expect(result.status).toBe('safe');
    expect(result.shouldSendEmail).toBe(false);
    expect(isValidFatorROperationalResult(result)).toBe(true);
  });

  it('detecta CNPJ divergente contra empresa esperada', () => {
    const result = parsePgdasFatorR(fixtures.atencao, '042026 SERV. 7,36%.pdf');

    expect(cnpjMatchesExpected(result.cnpj ?? result.cnpjBase, '44.527.939/0001-84')).toBe(true);
    expect(cnpjMatchesExpected(result.cnpj ?? result.cnpjBase, '55.371.662/0001-60')).toBe(false);
  });

  it('mantem chaves historicas distintas para periodos diferentes do mesmo CNPJ', () => {
    const april = parsePgdasFatorR(fixtures.atencao, '042026 SERV. 7,36%.pdf');
    const mayText = fixtures.atencao.replace('44527939202604001', '44527939202605001');
    const may = parsePgdasFatorR(mayText, '052026 SERV. 7,36%.pdf');
    const keyFor = (result: typeof april) => `${result.cnpjBase}:${result.referenceYear}:${result.referenceMonth}`;

    expect(april.cnpjBase).toBe(may.cnpjBase);
    expect(april.period).toBe('04/2026');
    expect(may.period).toBe('05/2026');
    expect(keyFor(april)).not.toBe(keyFor(may));
  });
});

describe('fluxo E2E simulado do Fator R', () => {
  it('processa Drive mockado, move para Analisados e dispara e-mail seco apenas para atencao/critico', () => {
    const driveInput = [
      { fileId: 'drive-743', name: '042026 SERV. 7,43%.pdf', text: fixtures.naoSeAplica },
      { fileId: 'drive-736', name: '042026 SERV. 7,36%.pdf', text: fixtures.atencao },
      { fileId: 'drive-643', name: '042026 SERV. 6,43%.pdf', text: fixtures.critico.replace('Fator r = 0,28 - Anexo III', 'Fator r = 0,27 - Anexo III') },
    ];

    const analyzedFolder: string[] = [];
    const emailDryRuns: Array<{ to: string; subject: string; status: string }> = [];
    const cards = driveInput.map((file) => {
      const parsed = parsePgdasFatorR(file.text, file.name);
      if (parsed.status !== 'parse_error') analyzedFolder.push(file.fileId);
      if (parsed.shouldSendEmail) {
        emailDryRuns.push({
          to: 'teste-fator-r@example.com',
          subject: `Alerta Fator R — ${parsed.companyName} — ${parsed.period}`,
          status: parsed.status,
        });
      }
      return {
        fileName: file.name,
        companyName: parsed.companyName,
        period: parsed.period,
        fatorR: parsed.fatorR,
        status: parsed.status,
        movedToAnalyzed: analyzedFolder.includes(file.fileId),
        emailSent: parsed.shouldSendEmail,
      };
    });

    expect(analyzedFolder).toEqual(['drive-743', 'drive-736', 'drive-643']);
    expect(emailDryRuns).toHaveLength(2);
    expect(emailDryRuns.map((email) => email.status)).toEqual(['attention', 'critical']);
    expect(cards).toMatchObject([
      { fileName: '042026 SERV. 7,43%.pdf', status: 'not_applicable', movedToAnalyzed: true, emailSent: false },
      { fileName: '042026 SERV. 7,36%.pdf', status: 'attention', movedToAnalyzed: true, emailSent: true },
      { fileName: '042026 SERV. 6,43%.pdf', status: 'critical', movedToAnalyzed: true, emailSent: true },
    ]);
  });
});
