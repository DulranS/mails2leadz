// Acquisition funnel (Pass 265): the rates are computed from counts; a missing figure is shown as null, not as zero or a guess.
import assert from 'node:assert/strict';
import { funnelRates } from '../lib/funnel.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

t('cost per lead, conversion and churn come from the counts', () => {
  const r = funnelRates({ spend: 500, leads: 100, qualified: 40, won: 10, newCustomers: 8, customersAtStart: 200, customersLost: 20, ltv: 900 });
  assert.equal(r.costPerLead, 5);
  assert.equal(r.leadToQualified, 0.4);
  assert.equal(r.leadToWon, 0.1);
  assert.equal(r.churnRate, 0.1);
  assert.equal(r.costPerNewCustomer, 62.5);
  assert.equal(r.ltvToCac, 14.4);
});

t('a missing figure is null, never zero: no spend means no cost per lead', () => {
  const r = funnelRates({ leads: 10 });
  assert.equal(r.costPerLead, null);
  assert.equal(r.churnRate, null);
  assert.equal(r.ltvToCac, null);
});

console.log(`\n${n} passed`);
