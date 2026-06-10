import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBalanceAndDreDocument } from './features/tax-reform/document-analysis/extractors';
describe('dbg', () => {
  it('shows balance clients', () => {
    const t = readFileSync(join(__dirname,'features/tax-reform/document-analysis/__tests__/fixtures/balanco-dre-zimmermann.txt'), 'utf-8');
    const r = parseBalanceAndDreDocument(t);
    console.log({
      annualPayrollFromDre: r.values.annualPayrollFromDre,
      payrollPercentFromDre: r.values.payrollPercentFromDre,
      balanceClientsTotal: r.values.balanceClientsTotal,
      b2bAmount: r.values.b2bBalanceAmount,
      b2cAmount: r.values.b2cBalanceAmount,
      entityAmount: r.values.entityBalanceAmount,
      b2bPct: r.values.b2bPercentFromBalanceClients,
      b2cPct: r.values.b2cPercentFromBalanceClients,
      entityPct: r.values.entityPercentFromBalanceClients,
      top10: r.values.top10BalanceClientsConcentration,
    });
  });
});
