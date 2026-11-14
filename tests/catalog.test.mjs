// Catalog and stock (Pass 242): any business can list what it sells; out-of-stock items are never promised to customers; ended offers are never offered; low stock is reminded.
import assert from 'node:assert/strict';
import { parseCatalog, stockStatus, currentItems, lowStockItems, catalogBlock } from '../lib/catalog.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');

t('products, services, packages, offers and bundles are all accepted; bad lines are skipped and counted', () => {
  const r = parseCatalog('product | Mug | 1500 | 12\nservice | Home visit | 3000 |  | Colombo\npackage | Starter | 9000\noffer | Autumn | 2500 |  |  | ends 2026-12-15\nbundle | Mug + visit | 4000 | 5\nwidget | Nope | 1\noffer | No end date | 100');
  assert.equal(r.items.length, 5);
  assert.equal(r.skipped, 2);
  assert.deepEqual(r.items.map((i) => i.kind), ['product', 'service', 'package', 'offer', 'bundle']);
});

t('stock is tracked only where given; zero is out, three or fewer is low', () => {
  assert.equal(stockStatus({ stock: null }), 'untracked');
  assert.equal(stockStatus({ stock: 0 }), 'out');
  assert.equal(stockStatus({ stock: 3 }), 'low');
  assert.equal(stockStatus({ stock: 10 }), 'in');
});

t('an offer that has ended is never offered again', () => {
  const items = [
    { kind: 'offer', name: 'Old', endsAt: new Date(now - DAY).toISOString() },
    { kind: 'offer', name: 'Running', endsAt: new Date(now + DAY).toISOString() },
    { kind: 'product', name: 'Mug', stock: 5 },
  ];
  assert.deepEqual(currentItems(items, now).map((i) => i.name), ['Running', 'Mug']);
});

t('the AI is told what is on offer and marks out-of-stock items so it never promises them', () => {
  const block = catalogBlock([
    { kind: 'product', name: 'Mug', price: 1500, stock: 0 },
    { kind: 'service', name: 'Home visit', price: 3000, stock: null, details: 'Colombo' },
    { kind: 'offer', name: 'Autumn', endsAt: new Date(now - DAY).toISOString() },
  ], now);
  assert.match(block, /OUT OF STOCK: do not promise it/);
  assert.match(block, /service: Home visit at 3000 - Colombo/);
  assert.doesNotMatch(block, /Autumn/);
  assert.equal(catalogBlock([], now), '');
});

t('low and out-of-stock items are counted for the Do now list', () => {
  const items = [{ kind: 'product', name: 'A', stock: 0 }, { kind: 'product', name: 'B', stock: 2 }, { kind: 'product', name: 'C', stock: 50 }];
  assert.equal(lowStockItems(items, now).length, 2);
});

console.log(`\n${n} passed`);
// Outcome framing (Pass 243): the catalog block tells the AI to sell the result, not the effort.
import assert2 from 'node:assert/strict';
import { catalogBlock as cb } from '../lib/catalog.js';
assert2.match(cb([{ kind: 'service', name: 'Home visit', stock: null }], Date.now()), /Sell the outcome each item gives the customer, not the effort behind it/);
console.log('  ok - the AI is told to sell the outcome, not the effort');
