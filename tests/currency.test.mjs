import assert from 'node:assert/strict';
import { makeMoney, normalizeCurrency, currencySymbol, CURRENCIES } from '../lib/currency.js';
import { computeBusinessMetrics } from '../lib/business-metrics.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('unknown or empty currency falls back to USD', () => {
  assert.equal(normalizeCurrency(''), 'USD');
  assert.equal(normalizeCurrency('xyz'), 'USD');
  assert.equal(normalizeCurrency('lkr'), 'LKR');
});
t('whole-unit and two-decimal formatting', () => {
  assert.equal(makeMoney('USD')(1234.6), '$1,235');
  assert.equal(makeMoney('USD', 2)(0.034), '$0.03');
  assert.equal(makeMoney('GBP')(5000), '£5,000');
  assert.match(makeMoney('LKR')(250000), /250,000/);
  assert.equal(makeMoney('EUR')(null), '€0');
});
t('symbol for input labels', () => {
  assert.equal(currencySymbol('USD'), '$');
  assert.equal(currencySymbol('GBP'), '£');
  assert.ok(CURRENCIES.length >= 20);
});
t('AI cost (USD) is converted with the customer rate before it enters ROI', () => {
  const deals = [{ email: 'a@x.com', stage: 'closed_won', value: 100000, valueIsEstimate: false, createdAt: new Date(Date.now() - 20 * 864e5).toISOString(), closedAt: new Date().toISOString(), lastUpdate: new Date().toISOString() }];
  const base = { deals, outreach: { sent: 10, replied: 2 }, aiCostUsd: 2 };
  const usd = computeBusinessMetrics({ ...base, settings: { monthlyCost: 1000 } });
  assert.equal(usd.roi.cost, 3002); // 1000*3 + 2 USD at 1:1
  const lkr = computeBusinessMetrics({ ...base, settings: { monthlyCost: 1000, currency: 'LKR', usdRate: 300 } });
  assert.equal(lkr.roi.cost, 3600); // 1000*3 + 2 USD * 300
  assert.equal(lkr.settings.currency, 'LKR');
  const bad = computeBusinessMetrics({ ...base, settings: { monthlyCost: 1000, usdRate: -5 } });
  assert.equal(bad.roi.cost, 3002); // nonsense rate is ignored
});
console.log(`\n${n} passed`);
