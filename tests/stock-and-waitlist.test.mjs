// Stock on payment and waitlist (Pass 244): stock is taken only for tracked items and never below zero; the waitlist keeps one entry per person and item, and notifies in order.
import assert from 'node:assert/strict';
import { parseSaleLines, drawStock } from '../lib/stock-draw.js';
import { joinWaitlist, toNotify } from '../lib/waitlist.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

t('a sale is read as "Mug x2, Home visit"', () => {
  assert.deepEqual(parseSaleLines('Mug x2, Home visit'), [{ name: 'Mug', qty: 2 }, { name: 'Home visit', qty: 1 }]);
});

t('a paid sale takes stock for tracked items, and stock never goes below zero', () => {
  const items = [{ name: 'Mug', stock: 3 }, { name: 'Visit', stock: null }];
  const r = drawStock(items, [{ name: 'mug', qty: 5 }, { name: 'Visit', qty: 1 }]);
  assert.equal(r.items[0].stock, 0);
  assert.deepEqual(r.drawn, [{ name: 'Mug', qty: 3 }]);
  assert.deepEqual(r.shortfalls, [{ name: 'mug', qty: 2, reason: 'not enough in stock' }, { name: 'Visit', qty: 1, reason: 'not tracked' }]);
});

t('a person joins a waiting list once per item, and only with an email address', () => {
  let r = joinWaitlist([], { subject: 'Mug', name: 'Ann', email: 'ann@x.com' });
  assert.equal(r.added, true);
  r = joinWaitlist(r.list, { subject: 'Mug', name: 'Ann', email: 'ANN@x.com' });
  assert.equal(r.added, false);
  assert.equal(joinWaitlist([], { subject: 'Mug', email: 'bad' }).added, false);
});

t('when places open, the first people who asked are told first, and no more than the places', () => {
  let list = [];
  for (const e of ['a@x.com', 'b@x.com', 'c@x.com']) list = joinWaitlist(list, { subject: 'Mug', email: e }).list;
  list = joinWaitlist(list, { subject: 'Other', email: 'z@x.com' }).list;
  assert.deepEqual(toNotify(list, 'Mug', 2).map((w) => w.email), ['a@x.com', 'b@x.com']);
});

console.log(`\n${n} passed`);
