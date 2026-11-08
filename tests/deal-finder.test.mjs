// Deal finder (Pass 199): a listing is a candidate only when it is well below the middle of enough listings; it is never called a sold price or a valuation.
import assert from 'node:assert/strict';
import { parseEbaySearch, findUndervalued } from '../lib/deals/discover.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const listing = (id, price) => ({ itemId: id, title: `Item ${id}`, price, currency: 'USD', condition: 'Used', url: `https://ebay.example/${id}` });

t('the eBay search reply is read; listings without a price are dropped', () => {
  const r = parseEbaySearch({ itemSummaries: [{ itemId: 'a1', title: 'Mug', price: { value: '12.50', currency: 'usd' }, condition: 'New', itemWebUrl: 'https://x' }, { itemId: 'a2', title: 'No price' }] });
  assert.equal(r.length, 1);
  assert.equal(r[0].price, 12.5);
  assert.equal(r[0].currency, 'USD');
});

t('a listing is a candidate only when it is twenty percent or more below the middle, and the middle needs enough listings', () => {
  const items = [listing('a', 100), listing('b', 100), listing('c', 100), listing('d', 100), listing('e', 100), listing('f', 100), listing('g', 100), listing('cheap', 60)];
  const r = findUndervalued(items);
  assert.equal(r.median, 100);
  assert.deepEqual(r.candidates.map((c) => c.itemId), ['cheap']);
  assert.equal(r.candidates[0].discountPct, 40);
  assert.match(r.note, /not sold prices/);
  assert.deepEqual(findUndervalued(items.slice(0, 3)).candidates, []);
  assert.match(findUndervalued(items.slice(0, 3)).note, /at least 8/);
});
console.log(`\n${n} passed`);
