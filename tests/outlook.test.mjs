import assert from 'node:assert/strict';
import { computeBusinessMetrics } from '../lib/business-metrics.js';
import { computeRecurring } from '../lib/recurring.js';
import { computeBilling } from '../lib/billing.js';
import { computeOutlook, computeUnitEconomics } from '../lib/outlook.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const ahead = (d) => new Date(NOW + d * DAY).toISOString();
const won = (email, o = {}) => ({ email, stage: 'closed_won', value: 1000, createdAt: ago(200), closedAt: ago(150), lastUpdate: ago(3), ...o });
const metricsOf = (deals) => computeBusinessMetrics({ deals, now: NOW });

t('a subscription business with an empty pipeline no longer forecasts zero: committed MRR carries the horizon', () => {
  const deals = [won('a@x.co', { recurringMonthly: 300 }), won('b@x.co', { recurringMonthly: 200 })];
  const m = metricsOf(deals);
  const rec = computeRecurring({ deals, now: NOW });
  assert.equal(m.future.horizons[0].expected, 0);
  const o = computeOutlook({ metrics: m, recurring: rec });
  assert.equal(o.any, true);
  assert.equal(o.committedMonthly, 500);
  assert.deepEqual(o.horizons.map((h) => [h.days, h.committed, h.pipeline, h.total]), [[30, 500, 0, 500], [60, 1000, 0, 1000], [90, 1500, 0, 1500]]);
});

t('a one-off business is unchanged: no committed part, pipeline numbers pass straight through', () => {
  const deals = [{ email: 'p@x.co', stage: 'proposal', value: 2000, createdAt: ago(10), lastUpdate: ago(2) }];
  const m = metricsOf(deals);
  const o = computeOutlook({ metrics: m, recurring: computeRecurring({ deals, now: NOW }) });
  assert.equal(o.any, false);
  o.horizons.forEach((h, i) => { assert.equal(h.committed, 0); assert.equal(h.total, m.future.horizons[i].expected); assert.equal(h.low, m.future.horizons[i].low); assert.equal(h.high, m.future.horizons[i].high); });
});

t('committed and pipeline add up, and pipeline deals are not double counted with subscribers', () => {
  const deals = [won('a@x.co', { recurringMonthly: 400 }), { email: 'p@x.co', stage: 'proposal', value: 3000, createdAt: ago(10), lastUpdate: ago(2) }];
  const m = metricsOf(deals);
  const o = computeOutlook({ metrics: m, recurring: computeRecurring({ deals, now: NOW }) });
  const h = o.horizons[0];
  assert.equal(h.committed, 400);
  assert.equal(h.pipeline, m.future.horizons[0].expected);
  assert.equal(h.total, h.committed + h.pipeline);
  assert.ok(h.pipeline > 0);
});

t('a subscriber whose renewal date passed is not counted as committed (uncertain), and is reported', () => {
  const deals = [won('a@x.co', { recurringMonthly: 300 }), won('b@x.co', { recurringMonthly: 200, renewalAt: ago(5) })];
  const o = computeOutlook({ metrics: metricsOf(deals), recurring: computeRecurring({ deals, now: NOW }) });
  assert.equal(o.committedMonthly, 300);
  assert.equal(o.uncertainMonthly, 200);
  assert.equal(o.horizons[0].committed, 300);
});

t('the low end assumes a subscriber renewing soon leaves, only for the time after the renewal date', () => {
  const deals = [won('a@x.co', { recurringMonthly: 300, renewalAt: ahead(15) })];
  const o = computeOutlook({ metrics: metricsOf(deals), recurring: computeRecurring({ deals, now: NOW }) });
  const [h30, , h90] = o.horizons;
  assert.equal(h30.committed, 300);
  assert.equal(h30.committedLow, 150); // gone for the last 15 of 30 days
  assert.equal(h90.committed, 900);
  assert.equal(h90.committedLow, 150); // gone for the last 75 of 90 days: 900 - 750
  assert.ok(h90.low <= h90.total && h90.high >= h90.total);
});

t('a churned subscriber is not committed', () => {
  const deals = [won('a@x.co', { recurringMonthly: 300, churnedAt: ago(10) }), won('b@x.co', { recurringMonthly: 100 })];
  const o = computeOutlook({ metrics: metricsOf(deals), recurring: computeRecurring({ deals, now: NOW }) });
  assert.equal(o.committedMonthly, 100);
});

t('cash already invoiced is reported beside the outlook, never added into it', () => {
  const deals = [won('a@x.co', { recurringMonthly: 300 })];
  const invoices = [
    { email: 'a@x.co', amount: 300, status: 'open', issuedAt: ago(40), dueAt: ago(10) },
    { email: 'a@x.co', amount: 300, status: 'open', issuedAt: ago(2), dueAt: ahead(12) },
    { email: 'a@x.co', amount: 300, status: 'paid', issuedAt: ago(70), dueAt: ago(40), paidAt: ago(45) },
  ];
  const billing = computeBilling({ invoices, now: NOW });
  const o = computeOutlook({ metrics: metricsOf(deals), recurring: computeRecurring({ deals, now: NOW }), billing });
  assert.equal(o.owed.amount, 600);
  assert.equal(o.owed.overdue, 300);
  assert.equal(o.owed.count, 2);
  assert.equal(o.horizons[0].total, 300);
});

t('missing inputs never throw', () => {
  assert.deepEqual(computeOutlook({}).horizons, []);
  assert.equal(computeOutlook({ metrics: metricsOf([]) }).any, false);
  assert.equal(computeUnitEconomics({}).verdict, null);
});

t('unit economics: lifetime value per win cost, payback in months, and a plain verdict', () => {
  const rec = { any: true, arpa: 200, ltv: { value: 4800, months: 24, capped: false } };
  const ok = computeUnitEconomics({ roi: { costPerWin: 1000 }, recurring: rec });
  assert.equal(ok.ltvToCost, 4.8);
  assert.equal(ok.paybackMonths, 5);
  assert.equal(ok.verdict, 'healthy');
  assert.equal(computeUnitEconomics({ roi: { costPerWin: 3000 }, recurring: rec }).verdict, 'thin');
  assert.equal(computeUnitEconomics({ roi: { costPerWin: 9000 }, recurring: rec }).verdict, 'losing');
});

t('unit economics withholds a number until its inputs are real (no churn yet = no lifetime value, no win = no cost per win)', () => {
  const noLtv = computeUnitEconomics({ roi: { costPerWin: 1000 }, recurring: { any: true, arpa: 250, ltv: null } });
  assert.equal(noLtv.ltvToCost, null);
  assert.equal(noLtv.paybackMonths, 4);
  assert.equal(noLtv.verdict, 'healthy');
  const noWin = computeUnitEconomics({ roi: { costPerWin: null }, recurring: { any: true, arpa: 250, ltv: { value: 5000 } } });
  assert.equal(noWin.ltvToCost, null);
  assert.equal(noWin.paybackMonths, null);
  assert.equal(computeUnitEconomics({ roi: { costPerWin: 1000 }, recurring: { any: false } }).paybackMonths, null);
  assert.equal(computeUnitEconomics({ roi: { costPerWin: 5000 }, recurring: { any: true, arpa: 200, ltv: null } }).verdict, 'slow');
});

console.log(`\n${n} outlook tests ok`);
