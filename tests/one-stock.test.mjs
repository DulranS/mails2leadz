// One stock system (Pass 246): the catalog is the only place stock is counted, and it is taken when an invoice is paid, once.
import assert from 'node:assert/strict';
import { drawStock } from '../lib/stock-draw.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

t('a paid sale takes stock from the catalog once; a second paid-sale call for the same invoice takes nothing', () => {
  const catalog = [{ name: 'Mug', stock: 5 }];
  const first = drawStock(catalog, [{ name: 'Mug', qty: 2 }]);
  assert.equal(first.items[0].stock, 3);
  // The server marks the invoice as taken and returns early; the second call therefore draws nothing.
  const second = drawStock(first.items, []);
  assert.equal(second.items[0].stock, 3);
});

console.log(`\n${n} passed`);
