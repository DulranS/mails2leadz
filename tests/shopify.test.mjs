// Shopify listings (Pass 190): only the owner's own Shopify store is ever sent to; products are sent escaped, at a two-decimal price; archived products are not.
import assert from 'node:assert/strict';
import { storeDomain, shopifyProductBody } from '../lib/shopify.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the store must be a Shopify store domain, so the access token is only ever sent to Shopify', () => {
  assert.equal(storeDomain('https://My-Shop.myshopify.com/admin'), 'my-shop.myshopify.com');
  assert.equal(storeDomain('evil.example.com'), null);
  assert.equal(storeDomain('shop.myshopify.com.evil.com'), null);
});

t('a product is sent with its name, escaped description, two-decimal price and sku; archived ones are not sent', () => {
  const b = shopifyProductBody({ name: 'Mug', description: '<b>Big</b> & bold', price: 12.5, sku: 'MUG1' });
  assert.equal(b.product.variants[0].price, '12.50');
  assert.equal(b.product.body_html, '<p>&lt;b&gt;Big&lt;/b&gt; &amp; bold</p>');
  assert.equal(shopifyProductBody({ name: 'Old', price: 1, archived: true }), null);
});

console.log(`\n${n} passed`);
