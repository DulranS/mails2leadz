import test from 'node:test';
import assert from 'node:assert/strict';
import { pickAsks, postSaleMessages, POST_SALE_BRIEF } from '../lib/post-sale.js';

const eligible = (over = {}) => ({ review: { eligible: false }, feedback: { eligible: false }, ...over });

test('a customer ready for a public review is asked for one; feedback is the fallback', () => {
  const picks = pickAsks([
    { email: 'a@x.com', businessName: 'A', ...eligible({ feedback: { eligible: true } }) },
    { email: 'b@x.com', businessName: 'B', ...eligible({ review: { eligible: true }, feedback: { eligible: true } }) },
    { email: 'c@x.com', businessName: 'C', ...eligible() },
  ]);
  assert.deepEqual(picks, [
    { email: 'a@x.com', business: 'A', purpose: 'feedback_ask' },
    { email: 'b@x.com', business: 'B', purpose: 'review_ask' },
  ]);
});

test('customers already in the queue are skipped, and no more than the nightly limit is drafted', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ email: `c${i}@x.com`, businessName: `C${i}`, ...eligible({ review: { eligible: true } }) }));
  assert.equal(pickAsks(many, { max: 3 }).length, 3);
  const picks = pickAsks(many, { max: 10, skip: new Set(['c0@x.com', 'c1@x.com']) });
  assert.equal(picks.length, 8);
  assert.ok(!picks.some((p) => p.email === 'c0@x.com'));
});

test('the wording is the same wording the Customers page uses, and a review ask carries only the owner\'s own link', () => {
  const profile = { offer: 'Bookkeeping for small shops' };
  const withLink = postSaleMessages({ profile, purpose: 'review_ask', businessName: 'Shop', to: 'owner@shop.example', refLink: 'https://g.page/r/abc' });
  assert.ok(withLink.system.includes(POST_SALE_BRIEF.review_ask));
  assert.ok(withLink.prompt.includes('https://g.page/r/abc'));
  const noLink = postSaleMessages({ profile, purpose: 'review_ask', businessName: 'Shop', to: 'owner@shop.example', refLink: '' });
  assert.ok(noLink.prompt.includes('No review link is set'));
  assert.ok(!noLink.prompt.includes('https://'));
});

test('feedback asks never mention a review link', () => {
  const m = postSaleMessages({ profile: { offer: 'x' }, purpose: 'feedback_ask', businessName: 'Shop', to: 'o@shop.example' });
  assert.ok(m.system.includes(POST_SALE_BRIEF.feedback_ask));
  assert.ok(!/review link/i.test(m.prompt));
});
