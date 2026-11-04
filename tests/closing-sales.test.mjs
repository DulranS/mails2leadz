// Sales closures (Pass 158): quantity prices, a team quota, and paid-to-date per customer.
import assert from 'node:assert/strict';
import { parsePriceBreaks, unitForQuantity, sanitizeProduct } from '../lib/products.js';
import { priceBasket } from '../lib/shop.js';
import { sanitizeTeam } from '../lib/team.js';
import { computeCustomers } from '../lib/customers.js';
import { pointsForPayment, redeemPoints, loyaltyKey } from '../lib/loyalty.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('quantity prices parse into tiers, and a bad tier is refused', () => {
  assert.deepEqual(parsePriceBreaks('50:80, 10:90', 100).breaks, [{ minQty: 10, price: 90 }, { minQty: 50, price: 80 }]);
  assert.match(parsePriceBreaks('10:120', 100).error, /below the normal price/);
  assert.match(parsePriceBreaks('1:50', 100).error, /2 or more/);
  assert.match(parsePriceBreaks('ten:90', 100).error, /look like/);
});

t('the buyer pays the best quantity price they qualify for, else the normal price', () => {
  const p = { price: 100, priceBreaks: [{ minQty: 10, price: 90 }, { minQty: 50, price: 80 }] };
  assert.equal(unitForQuantity(p, '', 5), 100);
  assert.equal(unitForQuantity(p, '', 10), 90);
  assert.equal(unitForQuantity(p, '', 60), 80);
});

t('a basket is priced with the quantity price, so a 10-item order costs 900 not 1000', () => {
  const p = { id: 'p1', name: 'Mug', price: 100, priceBreaks: [{ minQty: 10, price: 90 }], stockOnHand: null };
  const r = priceBasket([{ productId: 'p1', variantId: '', quantity: 10 }], { p1: p });
  assert.equal(r.ok, true);
  assert.equal(r.amount, 900);
});

t('a product saved with bad quantity prices is refused, with the reason', () => {
  const r = sanitizeProduct({ name: 'Mug', price: '100', priceBreaksText: '10:150' });
  assert.match(r.error, /below the normal price/);
});

t('a team member\'s quota is kept as a positive monthly target, and is 0 when not set', () => {
  assert.equal(sanitizeTeam([{ id: 'ann', name: 'Ann', quota: '1500' }])[0].quota, 1500);
  assert.equal(sanitizeTeam([{ id: 'bob', name: 'Bob' }])[0].quota, 0);
  assert.equal(sanitizeTeam([{ id: 'cy', name: 'Cy', quota: -5 }])[0].quota, 0);
});

t('each customer shows what they have paid to date', () => {
  const deals = [{ email: 'ann@x.com', businessName: 'Ann Ltd', stage: 'closed_won', value: 500 }];
  const invoices = [{ email: 'ann@x.com', amountPaid: 300, status: 'paid' }, { email: 'ann@x.com', amountPaid: 0, status: 'open', total: 200 }];
  const cust = computeCustomers({ deals, invoices }).customers.find((c) => c.email === 'ann@x.com');
  assert.equal(cust.lifetimeValue, 300);
});

t('loyalty: points are earned on the paid amount at the owner\'s rate, whole points only', () => {
  assert.equal(pointsForPayment(120.5, 1), 120);
  assert.equal(pointsForPayment(50, 0), 0);
  assert.equal(pointsForPayment(50, 2), 100);
});

t('loyalty: 100 points take 1 unit off; points cannot exceed the balance or cover the whole amount', () => {
  const ok = redeemPoints({ balance: 500, points: 100, amount: 30 });
  assert.equal(ok.discount, 1);
  assert.equal(ok.pointsUsed, 100);
  assert.equal(ok.amount, 29);
  assert.match(redeemPoints({ balance: 50, points: 100, amount: 30 }).error, /has 50 points/);
  assert.match(redeemPoints({ balance: 5000, points: 3000, amount: 10 }).error, /whole amount/);
});

t('loyalty: a balance is keyed by a hash of the address, never the address itself', () => {
  assert.equal(loyaltyKey(' Ann@X.com '), loyaltyKey('ann@x.com'));
  assert.doesNotMatch(loyaltyKey('ann@x.com'), /ann/);
});

console.log(`\n${n} passed`);
