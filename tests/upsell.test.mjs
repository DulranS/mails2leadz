// Upsell (Pass 278): offers are built from what the customer bought and what can be supplied now; out-of-stock and ended items are never offered; a bundle naming their purchase comes first.
import assert from 'node:assert/strict';
import { purchasedNames, upsellOptions } from '../lib/upsell.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const now = Date.parse('2026-11-14T10:00:00Z'), DAY = 86400000;
const invoices = [
  { email: 'ann@x.com', status: 'paid', saleLines: 'Blue mug x2' },
  { email: 'ann@x.com', status: 'draft', saleLines: 'Gift box x1' },
  { email: 'bo@x.com', status: 'paid', saleLines: 'Home visit' },
];
const catalog = [
  { kind: 'product', name: 'Blue mug', price: 1500, stock: 5 },
  { kind: 'product', name: 'Gift box', price: 500, stock: 0 },
  { kind: 'product', name: 'Coaster set', price: 800, stock: 2 },
  { kind: 'bundle', name: 'Mug and coaster bundle', price: 2000, stock: null, details: 'Blue mug with coaster set', endsAt: new Date(now + 5 * DAY).toISOString() },
  { kind: 'offer', name: 'Old offer', price: 100, stock: null, endsAt: new Date(now - DAY).toISOString() },
  { kind: 'package', name: 'Care plan', price: 9000, stock: null },
];

t('what a customer bought comes from their paid or sent invoices; drafts are ignored', () => {
  assert.deepEqual([...purchasedNames(invoices, 'ann@x.com')], ['blue mug']);
});

t('a bundle that names what they bought comes first; out-of-stock and ended items are never offered; what they already bought is not offered again', () => {
  const opts = upsellOptions({ purchased: purchasedNames(invoices, 'ann@x.com'), catalog, now });
  assert.equal(opts[0].name, 'Mug and coaster bundle');
  assert.match(opts[0].reason, /Pairs with blue mug/);
  assert.ok(!opts.some((o) => o.name === 'Gift box'));
  assert.ok(!opts.some((o) => o.name === 'Old offer'));
  assert.ok(!opts.some((o) => o.name === 'Blue mug'));
});

t('with nothing bought yet, options still come from what can be supplied', () => {
  const opts = upsellOptions({ purchased: new Set(), catalog, now });
  assert.ok(opts.length > 0 && opts.length <= 3);
});

console.log(`\n${n} passed`);
