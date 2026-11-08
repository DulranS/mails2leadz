// eBay publishing (Pass 192): an offer needs the owner's category, policies and price; without them nothing is published.
import assert from 'node:assert/strict';
import { offerBody, pickPolicies } from '../lib/ebay.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const policies = { fulfillmentPolicyId: 'F1', paymentPolicyId: 'P1', returnPolicyId: 'R1' };

t('an offer is built only with a category, a price and all three of the owner\'s policies', () => {
  const o = offerBody({ sku: 'MUG1', categoryId: '20625', quantity: 4, price: 12.5, currency: 'usd', description: 'Ceramic', policies });
  assert.equal(o.pricingSummary.price.value, '12.50');
  assert.equal(o.pricingSummary.price.currency, 'USD');
  assert.equal(o.listingPolicies.paymentPolicyId, 'P1');
  assert.equal(o.availableQuantity, 4);
  assert.equal(offerBody({ sku: 'MUG1', categoryId: '', price: 12.5, policies }), null, 'no category, nothing published');
  assert.equal(offerBody({ sku: 'MUG1', categoryId: '20625', price: 12.5, policies: { ...policies, returnPolicyId: undefined } }), null, 'missing policy, nothing published');
  assert.equal(offerBody({ sku: 'MUG1', categoryId: '20625', price: 0, policies }), null, 'no price, nothing published');
});

t('the owner\'s first policy of each kind is used, and a missing kind means no publishing', () => {
  assert.deepEqual(pickPolicies({ fulfillment: { fulfillmentPolicies: [{ fulfillmentPolicyId: 'F9' }] }, payment: { paymentPolicies: [{ paymentPolicyId: 'P9' }] }, returns: { returnPolicies: [{ returnPolicyId: 'R9' }] } }), { fulfillmentPolicyId: 'F9', paymentPolicyId: 'P9', returnPolicyId: 'R9' });
  assert.equal(pickPolicies({ fulfillment: { fulfillmentPolicies: [] }, payment: {}, returns: {} }), null);
});

console.log(`\n${n} passed`);
