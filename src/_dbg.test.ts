import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
describe('dbg', () => {
  it('walks2', () => {
    const text = readFileSync(join(__dirname,'features/tax-reform/document-analysis/__tests__/fixtures/balanco-dre-zimmermann.txt'),'utf-8');
    const lines = text.replace(/\r/g,'\n').split('\n').map(l=>l.trim());
    const stopRe = /^(ADIANTAMENTOS|CR[EÉ]DITOS\s|OUTROS\s+CR|ATIVO\s+NAO|ATIVO\s+N[ÃA]O|INVESTIMENTOS|IMOBILIZADO|INTANGIVEL|P\s+A\s+S\s+S\s+I\s+V\s+O|PASSIVO|DEPRECIA)/i;
    const noiseRe = /^(Empresa:|Emp\.:|CEP:|Bairro:|Cidade:|NIRE:|CRPJ|Per[ií]odo:|Data do NIRE|IE:|CNPJ:|Endere|Fone|BALAN[ÇC]O|A T I V O|P A S S I V O|ValorContas|Folha:|Contas Cont|_{5,}|S[OÓ]CIO|CONTADOR|RG:|CPF:|CRC:|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|\d{2,}-\d{3}$|0{4,}\d|^$)/;
    const moneyOnly = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
    let nameBuf: string[]=[];
    let total = 0; let n=0;
    let stopped = -1;
    for (let i=47;i<lines.length;i++) {
      const line = lines[i];
      if (!line) continue;
      if (stopRe.test(line)) { stopped = i; break; }
      if (noiseRe.test(line)) { nameBuf=[]; continue; }
      if (moneyOnly.test(line)) {
        const amt = Number(line.replace(/\./g,'').replace(',','.'));
        if (!nameBuf.length) continue;
        const name = nameBuf.join(' ');
        total += amt; n++;
        if (n<5 || n>92) console.log(n, '"'+name+'" =', amt);
        nameBuf=[];
        continue;
      }
      nameBuf.push(line);
    }
    console.log('stopped at line', stopped, 'lines[stopped]=', lines[stopped]);
    console.log('total=', total, 'count=', n);
  });
});
