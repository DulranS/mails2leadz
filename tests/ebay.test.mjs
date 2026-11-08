// eBay inventory (Pass 191): only valid SKUs are sent; archived products and products without a SKU are not; quantity is never negative.
import assert from 'node:assert/strict';
import { ebaySku, ebayInventoryBody } from '../lib/ebay.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('an eBay SKU is letters, digits, hyphen or underscore, up to 50 characters', () => {
  assert.equal(ebaySku('MUG-01_a'), 'MUG-01_a');
  assert.equal(ebaySku('bad sku!'), null);
  assert.equal(ebaySku('x'.repeat(51)), null);
});

t('the inventory item carries the quantity (never negative) and title; archived or sku-less products are skipped', () => {
  const item = ebayInventoryBody({ name: 'Mug', sku: 'MUG1', stockOnHand: -3, description: 'Ceramic' });
  assert.equal(item.sku, 'MUG1');
  assert.equal(item.body.availability.shipToLocationAvailability.quantity, 0);
  assert.equal(item.body.product.title, 'Mug');
  assert.equal(ebayInventoryBody({ name: 'Old', sku: 'O1', archived: true }), null);
  assert.equal(ebayInventoryBody({ name: 'NoSku', sku: '' }), null);
});

console.log(`\n${n} passed`);
