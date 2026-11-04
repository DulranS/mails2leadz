// Bundles (Pass 161): SKUs parse, a bundle sale takes stock from each component, and a bundle cannot oversell a component.
import assert from 'node:assert/strict';
import { parseBundleText, bundleComponentIds, expandForStock } from '../lib/bundles.js';
import { planStockHold } from '../lib/products.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('bundle text reads "SKU x2" and plain SKUs; empty means no bundle', () => {
  assert.deepEqual(parseBundleText('MUG x2, COASTER').items, [{ sku: 'MUG', qty: 2 }, { sku: 'COASTER', qty: 1 }]);
  assert.deepEqual(parseBundleText('').items, []);
  assert.match(parseBundleText('MUG x0').error, /quantity from 1/);
  assert.match(parseBundleText('MUG x2, mug').error, /listed twice/);
  assert.match(parseBundleText(Array.from({ length: 11 }, (_, i) => `P${i}`).join(', ')).error, /at most 10/);
});

const mug = { name: 'Mug', stockOnHand: 10, holdBack: 0 };
const coaster = { name: 'Coaster', stockOnHand: 1, holdBack: 0 };
const set = { name: 'Gift set', price: 50, bundleItems: [{ productId: 'mug', qty: 2 }, { productId: 'coaster', qty: 1 }] };

t('a bundle sale is turned into its component lines, times the quantity sold', () => {
  const ids = bundleComponentIds([{ product: set, quantity: 1 }]);
  assert.deepEqual(ids.sort(), ['coaster', 'mug']);
  const out = expandForStock([{ productId: 'set', variantId: '', quantity: 2, product: set }], { mug, coaster });
  assert.deepEqual(out.lines.map((l) => [l.productId, l.quantity]), [['mug', 4], ['coaster', 2]]);
});

t('a bundle with a component that is missing or archived is refused, not sold', () => {
  const out = expandForStock([{ productId: 'set', variantId: '', quantity: 1, product: set }], { mug, coaster: null });
  assert.match(out.error, /no longer on sale/);
});

t('the stock check refuses a bundle the components cannot cover (no oversell)', () => {
  const lines = expandForStock([{ productId: 'set', variantId: '', quantity: 1, product: set }], { mug, coaster: { ...coaster, stockOnHand: 0 } }).lines;
  assert.equal(planStockHold(lines).ok, false);
});

t('a bundle that the stock covers takes the right stock from each component', () => {
  const lines = expandForStock([{ productId: 'set', variantId: '', quantity: 1, product: set }], { mug, coaster }).lines;
  const plan = planStockHold(lines);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.holds.map((h) => [h.productId, h.quantity]), [['mug', 2], ['coaster', 1]]);
});

console.log(`\n${n} passed`);
