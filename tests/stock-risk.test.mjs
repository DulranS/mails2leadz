import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeItem, computeStock, stockSalesSince, MIN_SOLD_FOR_FORECAST } from '../lib/stock.js';
import { computeRisks } from '../lib/risk.js';
import { computeValidation } from '../lib/validation.js';
import { computeProfit } from '../lib/profit.js';
import { computeUnitEconomics } from '../lib/outlook.js';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const D = (n) => new Date(NOW - n * 864e5).toISOString().slice(0, 10);
const item = (o) => ({ id: o.name, status: 'in_stock', supplier: '', acquiredAt: D(10), ...o });

test('stock items: a name and a cost are required, sold needs a price, dates make sense', () => {
  assert.match(sanitizeItem({ name: '', cost: 5 }).error, /name/);
  assert.match(sanitizeItem({ name: 'x', cost: '' }).error, /cost/);
  assert.match(sanitizeItem({ name: 'x', cost: -1 }).error, /cost/);
  assert.match(sanitizeItem({ name: 'x', cost: 5, status: 'sold' }).error, /sold for/);
  assert.match(sanitizeItem({ name: 'x', cost: 5, status: 'sold', soldPrice: 9, acquiredAt: '2026-10-10', soldAt: '2026-10-01' }).error, /before it was bought/);
  const ok = sanitizeItem({ name: '  Honda  Vezel ', cost: '1500000.456', supplier: ' Auction ', askingPrice: '', status: 'bogus' }, { now: NOW });
  assert.equal(ok.item.name, 'Honda Vezel');
  assert.equal(ok.item.cost, 1500000.46);
  assert.equal(ok.item.status, 'in_stock');
  assert.equal(ok.item.askingPrice, null);
  assert.equal(ok.item.acquiredAt, '2026-10-20');
  assert.equal(sanitizeItem({ name: 'x', cost: 0 }).item.cost, 0);
});

test('capital tied up, ageing, expected profit, and what is missing is said', () => {
  const s = computeStock({ items: [item({ name: 'a', cost: 100, askingPrice: 150, acquiredAt: D(10) }), item({ name: 'b', cost: 200, askingPrice: 260, acquiredAt: D(45) }), item({ name: 'c', cost: 300, acquiredAt: D(120) })], now: NOW });
  assert.equal(s.inStock.capitalTied, 600);
  assert.equal(s.inStock.expectedProceeds, 410);
  assert.equal(s.inStock.expectedProfit, 110);
  assert.deepEqual(s.ageing.map((b) => b.count), [1, 1, 0, 1]);
  assert.equal(s.slowCapital, 300);
  assert.equal(s.slow[0].name, 'c');
  assert.ok(s.notes.some((n) => /no asking price/.test(n)));
  assert.equal(s.forecast, null);
  assert.ok(s.notes.some((n) => /needs 3 sold items/.test(n)));
  assert.equal(computeStock({ items: [], now: NOW }).notes.length, 1);
});

test('realised profit, margin, days to sell, yearly return, write-offs', () => {
  const sold = (n, cost, price, bought, soldDay) => ({ id: n, name: n, status: 'sold', cost, soldPrice: price, acquiredAt: D(bought), soldAt: D(soldDay), supplier: 'S' });
  const s = computeStock({ items: [sold('a', 100, 150, 50, 20), sold('b', 200, 240, 40, 10), sold('c', 100, 130, 30, 0), item({ name: 'x', cost: 50, status: 'written_off', acquiredAt: D(60) })], now: NOW });
  assert.equal(s.sold.revenue, 520);
  assert.equal(s.sold.cost, 400);
  assert.equal(s.sold.writtenOff, 50);
  assert.equal(s.sold.realisedProfit, 70);
  assert.equal(s.sold.marginPct, 23);
  assert.equal(s.sold.avgDaysToSell, 30);
  assert.equal(s.sold.roiPerYearPct, Math.round((70 / 400) * (365 / 30) * 100));
});

test('forecast needs enough sales; then priced items are placed by the usual time to sell', () => {
  const sold = (n, bought, soldDay) => ({ id: n, name: n, status: 'sold', cost: 10, soldPrice: 20, acquiredAt: D(bought), soldAt: D(soldDay) });
  const base = [sold('a', 40, 10), sold('b', 40, 10), sold('c', 40, 10)]; // 30 days each
  const s = computeStock({ items: [...base, item({ name: 'new', cost: 10, askingPrice: 100, acquiredAt: D(5) }), item({ name: 'old', cost: 10, askingPrice: 50, acquiredAt: D(100) })], now: NOW });
  assert.equal(MIN_SOLD_FOR_FORECAST, 3);
  assert.deepEqual([s.forecast.d30, s.forecast.d60, s.forecast.d90], [150, 150, 150]); // new: 25 days left; old: overdue so due now
  assert.equal(s.forecast.basedOn, 3);
});

test('suppliers: share of spend, margin and speed, and concentration only with 2 or more known suppliers', () => {
  const mk = (n, sup, cost, price) => ({ id: n, name: n, status: price ? 'sold' : 'in_stock', supplier: sup, cost, soldPrice: price, acquiredAt: D(30), soldAt: price ? D(0) : null });
  const s = computeStock({ items: [mk('a', 'A', 800, 1000), mk('b', 'B', 200, 0), mk('c', '', 100, 0)], now: NOW });
  assert.equal(s.suppliers[0].supplier, 'A');
  assert.equal(s.suppliers[0].sharePct, 73);
  assert.equal(s.suppliers[0].marginPct, 20);
  assert.equal(s.supplierConcentrationPct, 73);
  assert.equal(computeStock({ items: [mk('a', 'A', 800, 0)], now: NOW }).supplierConcentrationPct, null);
});

test('capital budget: headroom and over-budget', () => {
  const s = computeStock({ items: [item({ name: 'a', cost: 700 })], capitalBudget: '1000', now: NOW });
  assert.deepEqual([s.capital.headroom, s.capital.usedPct, s.capital.over], [300, 70, false]);
  assert.equal(computeStock({ items: [item({ name: 'a', cost: 1200 })], capitalBudget: 1000, now: NOW }).capital.over, true);
  assert.equal(computeStock({ items: [item({ name: 'a', cost: 5 })], now: NOW }).capital, null);
});

test('stock sales flow into profit as costed sales', () => {
  const sold = [{ id: 'a', name: 'Vezel', status: 'sold', cost: 800, soldPrice: 1000, acquiredAt: D(30), soldAt: D(5) }, { id: 'b', name: 'Old', status: 'sold', cost: 1, soldPrice: 9, acquiredAt: D(300), soldAt: D(200) }];
  const sales = stockSalesSince(sold, 90, NOW);
  assert.equal(sales.length, 1);
  const p = computeProfit({ deals: [], stockSales: sales, now: NOW });
  assert.equal(p.revenue, 1000);
  assert.equal(p.deliveryCosts, 800);
  assert.equal(p.grossProfit, 200);
  assert.equal(p.marginPct, 20);
  assert.equal(p.ready, true);
});

test('risk: customer concentration, predictability, supplier, price, capacity', () => {
  const won = (name, value, extra = {}) => ({ stage: 'closed_won', businessName: name, email: `${name}@x.com`, value, closedAt: new Date(NOW - 30 * 864e5).toISOString(), ...extra });
  const r = computeRisks({ deals: [won('Big', 8000), won('B', 1000), won('C', 1000)], now: NOW });
  assert.equal(r.concentration.top1Pct, 80);
  assert.equal(r.findings[0].level, 'high');
  assert.match(r.findings[0].title, /80%/);
  const watch = computeRisks({ deals: [won('A', 3000), won('B', 3000), won('C', 2500), won('D', 1500)], now: NOW });
  assert.equal(watch.findings.find((f) => f.id === 'customer').level, 'watch');
  assert.equal(computeRisks({ deals: [won('A', 1000), won('B', 1000)], now: NOW }).enough, false);
  const pred = computeRisks({ deals: [won('A', 3000), won('B', 3000), won('C', 3000)], mrr: 100, now: NOW });
  assert.ok(pred.predictablePct < 30);
  assert.ok(pred.findings.some((f) => f.id === 'predictable'));
  const extra = computeRisks({ deals: [], supplierConcentrationPct: 85, pricePct: 60, whyRecorded: 6, capacity: { set: true, state: 'full' }, now: NOW });
  assert.deepEqual(extra.findings.map((f) => f.id).sort(), ['capacity', 'price', 'supplier']);
  assert.equal(extra.findings[0].level, 'high');
  assert.equal(computeRisks({ deals: [], pricePct: 60, whyRecorded: 2, now: NOW }).findings.length, 0);
});

test('validation: never judges a tiny sample; payment is the only proof', () => {
  assert.equal(computeValidation({ contacted: 10, replied: 0 }).state, 'early');
  assert.equal(computeValidation({ contacted: 10, won: 1 }).state, 'paid');
  assert.equal(computeValidation({ contacted: 80, replied: 1 }).state, 'silent');
  assert.equal(computeValidation({ contacted: 80, replied: 6, qualified: 1 }).state, 'replies');
  assert.equal(computeValidation({ contacted: 80, replied: 8, qualified: 4 }).state, 'interest');
  assert.equal(computeValidation({ contacted: 200, replied: 10 }).replyPct, 5);
  assert.equal(computeValidation({}).state, 'early');
});

test('unit economics on profit: only with a margin, and never flattering', () => {
  const roi = { costPerWin: 100 };
  const rec = { any: true, arpa: 200, ltv: { value: 1200, capped: false } };
  const plain = computeUnitEconomics({ roi, recurring: rec });
  assert.equal(plain.paybackMonths, 0.5);
  assert.equal(plain.gpLtv, null);
  assert.equal(plain.gpPaybackMonths, null);
  const gp = computeUnitEconomics({ roi, recurring: rec, marginPct: 50 });
  assert.equal(gp.gpLtv, 600);
  assert.equal(gp.gpPaybackMonths, 1);
  assert.equal(gp.gpLtvToCost, 6);
  assert.equal(computeUnitEconomics({ roi, recurring: rec, marginPct: 0 }).gpLtv, null);
  assert.equal(computeUnitEconomics({ roi, recurring: rec, marginPct: 120 }).gpLtv, null);
});
