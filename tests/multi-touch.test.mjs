// Multi-touch attribution (Pass 163): revenue is split across the channels that touched each customer.
import assert from 'node:assert/strict';
import { attributeRevenue } from '../lib/multi-touch.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const customers = [{ revenue: 300, touches: [{ channel: 'referral', at: 1 }, { channel: 'email', at: 2 }, { channel: 'email', at: 3 }] }];

t('linear attribution shares revenue equally across every touch', () => {
  const r = attributeRevenue(customers, 'linear');
  assert.deepEqual(r.map((x) => [x.channel, x.amount]), [['email', 200], ['referral', 100]]);
});

t('U-shaped attribution gives the first and last touch 40% each, and shares the rest', () => {
  const r = attributeRevenue(customers, 'u_shaped');
  const get = (c) => r.find((x) => x.channel === c).amount;
  assert.equal(get('referral'), 120);
  assert.equal(get('email'), 180);
});

t('first-touch and last-touch credit one channel each', () => {
  assert.equal(attributeRevenue(customers, 'first_touch').find((x) => x.channel === 'referral').amount, 300);
  assert.equal(attributeRevenue(customers, 'last_touch').find((x) => x.channel === 'email').amount, 300);
});

t('a customer with no revenue or no touches adds nothing; an unknown model falls back to linear', () => {
  assert.deepEqual(attributeRevenue([{ revenue: 0, touches: [{ channel: 'email', at: 1 }] }, { revenue: 50, touches: [] }]), []);
  assert.deepEqual(attributeRevenue(customers, 'bogus'), attributeRevenue(customers, 'linear'));
});

console.log(`\n${n} passed`);
