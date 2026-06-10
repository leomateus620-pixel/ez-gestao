import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBalanceAndDreDocument } from './features/tax-reform/document-analysis/extractors';
describe('dbg', () => {
  it('shows', () => {
    const t = readFileSync(join(__dirname,'features/tax-reform/document-analysis/__tests__/fixtures/balanco-dre-zimmermann.txt'),'utf-8');
    const r = parseBalanceAndDreDocument(t);
    console.log({
      total: r.values.balanceClientsTotal, b2b: r.values.b2bBalanceAmount, b2c: r.values.b2cBalanceAmount, entity: r.values.entityBalanceAmount,
      b2bPct: r.values.b2bPercentFromBalanceClients, b2cPct: r.values.b2cPercentFromBalanceClients, entityPct: r.values.entityPercentFromBalanceClients,
      top10: r.values.top10BalanceClientsConcentration,
    });
  });
});
