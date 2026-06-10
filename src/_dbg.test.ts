import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
describe('dbg', () => {
  it('walks', () => {
    const text = readFileSync(join(__dirname,'features/tax-reform/document-analysis/__tests__/fixtures/balanco-dre-zimmermann.txt'),'utf-8');
    const lines = text.replace(/\r/g,'\n').split('\n').map(l=>l.trim());
    let start = -1;
    for (let i=0;i<lines.length;i+=1) if (/^CLIENTES\s*$/.test(lines[i])) { start = i+1; break; }
    console.log('start=',start, 'firstNext=', lines[start]);
    // find all CLIENTES lines
    const allClients: number[] = [];
    lines.forEach((l,i)=>{ if (/^CLIENTES\s*$/.test(l)) allClients.push(i); });
    console.log('CLIENTES lines:', allClients);
    // find ADIANTAMENTOS
    lines.forEach((l,i)=>{ if (/^ADIANTAMENTOS/.test(l)) console.log('ADIANT at', i, '"'+l+'"'); });
  });
});
