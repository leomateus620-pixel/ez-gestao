import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLineLabelValueMap, findValueByLabels, findSectionLine } from './features/tax-reform/document-analysis/normalize';
describe('dbg', () => {
  it('shows', () => {
    const t = readFileSync(join(__dirname,'features/tax-reform/document-analysis/__tests__/fixtures/balanco-dre-zimmermann.txt'), 'utf-8');
    const map = buildLineLabelValueMap(t);
    const dreLine = findSectionLine(t, ['DEMONSTRAÇÃO DO RESULTADO', 'DEMONSTRACAO DO RESULTADO']);
    console.log('dreLine=', dreLine);
    const accs = ['Decimo Terceiro Salário', 'F.G.T.S.', 'FGTS', 'Ferias', 'Ordenados e Gratificações', 'Aviso Previo', 'Despesas C/ Estagiários', 'Ajuda de Custo', 'Pro-Labore'];
    let sum = 0;
    for (const a of accs) {
      const v = findValueByLabels(map, [a], { exact: true, fromLine: dreLine });
      console.log(a, '→', v);
      if (v !== undefined) sum += Math.abs(v);
    }
    console.log('sum=', sum);
  });
});
