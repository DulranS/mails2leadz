// Resale (Pass 188): comparables, the discount they imply, the margin after every cost, and stale listings to decide on.
import assert from 'node:assert/strict';
import { parseComps, compsSummary, resaleMargin, staleListings, ASSET_CLASSES } from '../lib/deals/resale.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('sold prices are read from lines; bad lines are counted and skipped', () => {
  const r = parseComps('£12,000, 2026-01-03, Toyota Corolla 2015\nnot a price\n15000,2026-02-01,Corolla 2015 low miles');
  assert.equal(r.comps.length, 2);
  assert.equal(r.comps[0].price, 12000);
  assert.equal(r.skipped, 1);
});

t('the comparables give a middle price, and the asking price is placed against it', () => {
  const s = compsSummary([{ price: 10000 }, { price: 12000 }, { price: 14000 }], 8000);
  assert.equal(s.median, 12000);
  assert.equal(s.low, 10000);
  assert.equal(s.verdict, 'well_below_comparables');
  assert.match(s.basis, /you entered/);
  assert.equal(compsSummary([]).ok, false);
});

t('the margin is what is left after the price, every cost and tax, and it is checked against your rule', () => {
  const m = resaleMargin({ buyPrice: 8000, expectedSale: 12000, fees: 200, transport: 300, repairs: 500, holdingPerMonth: 50, months: 2, taxRatePct: 20, minMarginPct: 15 });
  assert.equal(m.costs, 1100);
  assert.equal(m.netProfit, 2320);
  assert.equal(m.meetsYourRule, true);
  assert.equal(resaleMargin({ buyPrice: 8000, expectedSale: 8500, fees: 500 }).meetsYourRule, false);
  assert.equal(resaleMargin({ buyPrice: 0, expectedSale: 10 }), null);
  assert.match(m.note, /Not investment advice/);
});

t('an asset class asks for the fields that matter for it', () => {
  assert.ok(ASSET_CLASSES.vehicle.fields.includes('mileage'));
  assert.ok(ASSET_CLASSES.property.fields.includes('titleChecked'));
});

t('listings left undecided for two weeks are flagged for a decision; decided ones are not', () => {
  const now = Date.parse('2026-11-05T10:00:00Z');
  const old = new Date(now - 20 * 86400000).toISOString();
  const fresh = new Date(now - 2 * 86400000).toISOString();
  const list = staleListings([
    { id: 'a', name: 'Car A', side: 'buy', stage: 'sourced', updatedAt: old },
    { id: 'b', name: 'Land B', side: 'buy', stage: 'sourced', updatedAt: fresh },
    { id: 'c', name: 'Goods C', side: 'buy', stage: 'offer', updatedAt: old },
  ], now);
  assert.deepEqual(list.map((x) => x.id), ['a']);
  assert.equal(list[0].days, 20);
});

console.log(`\n${n} passed`);
