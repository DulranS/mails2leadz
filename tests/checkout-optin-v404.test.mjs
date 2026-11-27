// v404: a marketing opt-in at checkout. Only a ticked box asks for email, it is recorded after the order, and it confirms by email first. Run: node --test tests/checkout-optin-v404.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeBasket } from '../lib/shop.js';

const route = readFileSync(new URL('../app/api/shop/checkout/route.js', import.meta.url), 'utf8');
const site = readFileSync(new URL('../app/site/page.js', import.meta.url), 'utf8');

test('the opt-in is off unless the box is ticked', () => {
  assert.equal(sanitizeBasket({ email: 'a@b.co', items: [] }).marketingOptIn, false, 'absent means no');
  assert.equal(sanitizeBasket({ email: 'a@b.co', items: [], marketingOptIn: '' }).marketingOptIn, false, 'blank means no');
  assert.equal(sanitizeBasket({ email: 'a@b.co', items: [], marketingOptIn: 'no' }).marketingOptIn, false, 'no means no');
  assert.equal(sanitizeBasket({ email: 'a@b.co', items: [], marketingOptIn: true }).marketingOptIn, true, 'a ticked box is yes');
  assert.equal(sanitizeBasket({ email: 'a@b.co', items: [], marketingOptIn: 'on' }).marketingOptIn, true, 'the browser value on is yes');
});

test('the checkout signs the customer up only after the order is recorded, and only when ticked', () => {
  const gate = route.indexOf('if (basket.marketingOptIn) {');
  const signup = route.indexOf('requestSignup(db, uid,');
  const order = route.indexOf("stopColdFollowUps(db, uid, basket.email, 'ordered online')");
  assert.ok(gate > 0 && signup > gate, 'the sign-up call sits behind the ticked box');
  assert.ok(order > 0 && gate > order, 'it runs after the order is recorded');
  assert.ok(route.includes("source: 'checkout'"), 'the source is recorded as checkout');
});

test('a failed sign-up does not fail the order', () => {
  assert.match(route, /requestSignup\([^;]*\)\.catch\(\(\) => \{\}\);/s, 'the sign-up call is caught');
});

test('the storefront box is unticked by default and is sent with the order', () => {
  assert.match(site, /useState\(false\); \/\/ v404/, 'starts unticked');
  assert.ok(site.includes('marketingOptIn }),'), 'the order body carries the box');
  assert.ok(site.includes('your order does not depend on it'), 'the box says the order does not depend on it');
});
