// Deals (Pass 187): buy-side signals are transparent, prices are checked against the owner's benchmark, stages move one at a time, and only new red flags are reported.
import assert from 'node:assert/strict';
import { parseSearch, parseProfile, scoreSignals } from '../lib/deals/companies.js';
import { dealCheck, valueRange, readiness } from '../lib/deals/valuation.js';
import { canMove, newRedFlags } from '../lib/deals/pipeline.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const now = Date.parse('2026-11-05T10:00:00Z');

t('a search reply is read into company summaries; entries without a number are dropped', () => {
  const r = parseSearch({ items: [{ company_number: '01234567', title: 'ACME LTD', company_status: 'active', date_of_creation: '2008-03-01' }, { title: 'No number' }] });
  assert.deepEqual(r.map((x) => x.companyNumber), ['01234567']);
});

t('signals are transparent: each has a reason and a weight, and red flags are listed on their own', () => {
  const company = parseProfile({
    profile: { company_number: '01234567', company_name: 'ACME LTD', company_status: 'active', date_of_creation: '2005-01-01', sic_codes: ['62012'], accounts: { overdue: true, last_accounts: { made_up_to: '2025-03-31' } }, has_insolvency_history: false },
    charges: { unsatisfied_count: 1 },
    officers: { items: [{ resigned_on: '2026-01-01' }, { resigned_on: '2025-06-01' }] },
  }, { now });
  const s = scoreSignals(company, { sicFit: ['62012'] });
  assert.ok(s.redFlags.some((f) => /overdue/.test(f)));
  assert.ok(s.redFlags.some((f) => /unsatisfied/.test(f)));
  assert.ok(s.reasons.every((r) => typeof r.text === 'string' && typeof r.weight === 'number'));
  assert.ok(s.score >= 0 && s.score <= 100);
});

t('a price is checked against the owner\'s benchmark, with the implied multiple and a note that it is not advice', () => {
  const below = dealCheck({ price: 200000, profit: 100000, benchmarkLow: 2.5, benchmarkHigh: 4 });
  assert.equal(below.impliedMultiple, 2);
  assert.equal(below.verdict, 'below_benchmark');
  assert.equal(dealCheck({ price: 300000, profit: 100000 }).verdict, 'within_benchmark');
  assert.equal(dealCheck({ price: 500000, profit: 100000 }).verdict, 'above_benchmark');
  assert.match(below.note, /Not a valuation or investment advice/);
  assert.equal(dealCheck({ price: 0, profit: 10 }), null);
});

t('the value range comes from the owner\'s multiples, and readiness lists what to fix', () => {
  assert.deepEqual(valueRange({ profit: 100000, low: 2.5, high: 4 }), { low: 250000, high: 400000, lowMultiple: 2.5, highMultiple: 4, basis: 'Profit multiple (your assumption)' });
  const r = readiness({ accountsUpToDate: true, topCustomerShare: 0.6, recurringShare: 0.5, ownerDependence: 0.4, growthLastYear: 1, unsatisfiedCharges: 0 });
  assert.equal(r.score, 83);
  assert.match(r.toFix[0], /30%/);
});

t('a deal moves one stage at a time, and is won only from the offer stage', () => {
  assert.equal(canMove('sourced', 'contacted').ok, true);
  assert.equal(canMove('sourced', 'offer').ok, false);
  assert.equal(canMove('offer', 'closed_won').ok, true);
  assert.equal(canMove('contacted', 'closed_won').ok, false);
  assert.equal(canMove('closed_won', 'contacted').ok, false);
  assert.equal(canMove('nda', 'closed_lost').ok, true);
});

t('only red flags that were not there last week are reported', () => {
  assert.deepEqual(newRedFlags(['Annual accounts are overdue at Companies House.'], ['Annual accounts are overdue at Companies House.', 'The company has an insolvency history.']), ['The company has an insolvency history.']);
});

console.log(`\n${n} passed`);
