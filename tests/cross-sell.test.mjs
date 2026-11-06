// Cross-sell suggestions (Pass 170): a product bought together by enough other customers, that this customer does not have yet.
import assert from 'node:assert/strict';
import { crossSellSuggestions } from '../lib/cross-sell.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const inv = (email, productIds, status = 'paid') => ({ email, status, stockHolds: productIds.map((productId) => ({ productId, quantity: 1 })) });

t('a customer is offered the product most often bought alongside one they already have, if they lack it', () => {
  const invoices = [
    inv('a@x.com', ['mug', 'coaster']), inv('b@x.com', ['mug', 'coaster']), inv('c@x.com', ['mug', 'tote']),
    inv('d@x.com', ['mug']),
  ];
  const r = crossSellSuggestions(invoices, { productNames: { coaster: 'Coaster' } });
  const d = r.find((x) => x.email === 'd@x.com');
  assert.equal(d.productId, 'coaster', 'two customers bought the coaster with a mug, the tote only one');
  assert.equal(d.productName, 'Coaster');
  assert.equal(r.find((x) => x.email === 'a@x.com'), undefined, 'a customer who has both is not offered anything');
});

t('a product bought together by too few customers is not suggested; void orders do not count', () => {
  const invoices = [inv('a@x.com', ['mug', 'tote']), inv('b@x.com', ['mug'], 'void'), inv('b@x.com', ['mug'])];
  assert.deepEqual(crossSellSuggestions(invoices), []);
});

console.log(`\n${n} passed`);
