import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLineLabelValueMap } from './features/tax-reform/document-analysis/normalize';
describe('dbg', () => {
  it('shows', () => {
    const t = readFileSync(join(__dirname,'features/tax-reform/document-analysis/__tests__/fixtures/balanco-dre-zimmermann.txt'), 'utf-8');
    const map = buildLineLabelValueMap(t);
    for (const kw of ['G.T.S','FGTS','Ajuda','Pro-Labore','Decimo Terceiro','Ferias','Ordenados','Aviso','Estagi']) {
      const m = map.filter(x=>x.label.toLowerCase().includes(kw.toLowerCase()));
      console.log(kw, '→', m.slice(0,5).map(f=>`[${f.lineIndex}] "${f.label}"=${f.value}`).join(' | '));
    }
  });
});
