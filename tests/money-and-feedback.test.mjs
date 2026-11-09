// Money, model and feedback (Pass 202): order and contract values, price point, paid vs organic, CAC and LTV, repeated questions, and reviews for recent wins.
import assert from 'node:assert/strict';
import { economics, BUSINESS_MODELS } from '../lib/kpi-economics.js';
import { topTopics, feedbackActions } from '../lib/feedback-loop.js';
import { buildActionList } from '../lib/action-list.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000;
const now = Date.parse('2026-11-06T10:00:00Z');

t('order value, price point, contract value, LTV, CAC and paid versus organic come from the records', () => {
  const e = economics({
    now, model: 'b2c', monthlySpend: 1000,
    invoices: [{ status: 'paid', email: 'a@x.com', amountPaid: 20, paidAt: new Date(now - 10 * DAY).toISOString() }, { status: 'paid', email: 'b@x.com', amountPaid: 60, paidAt: new Date(now - 20 * DAY).toISOString() }, { status: 'paid', email: 'c@x.com', amountPaid: 100, paidAt: new Date(now - 30 * DAY).toISOString() }],
    deals: [{ stage: 'closed_won', value: 900, source: 'meta', stageTimes: { closed_won: new Date(now - 40 * DAY).toISOString() } }, { stage: 'closed_won', value: 300, source: 'referral', stageTimes: { closed_won: new Date(now - 50 * DAY).toISOString() } }],
    customersLtv: { 'a@x.com': 50, 'b@x.com': 150 },
  });
  assert.equal(e.averageOrderValue, 60);
  assert.equal(e.pricePoint, 60);
  assert.equal(e.averageContractValue, 600);
  assert.equal(e.ltv, 100);
  assert.equal(e.channelMix.paidWon, 1);
  assert.equal(e.channelMix.paidSharePct, 50);
  assert.equal(e.cac, 1000 * 12 / 5, 'spend per year over the new customers');
});

t('a missing number stays missing, not zero; the model picks its own playbook', () => {
  const e = economics({ now, model: 'rental' });
  assert.equal(e.averageOrderValue, null);
  assert.equal(e.cac, null);
  assert.equal(e.focus, BUSINESS_MODELS.rental.focus);
  assert.equal(economics({ now, model: 'nonsense' }).model, 'b2c');
});

t('a question customers repeat becomes an action; a one-off does not', () => {
  const tickets = [
    { question: 'Where is my refund for the broken lamp?' },
    { question: 'Refund status please, lamp arrived broken' },
    { question: 'Still no refund for my lamp' },
    { question: 'Do you ship to Kandy?' },
  ];
  assert.equal(topTopics(tickets)[0].topic, 'refund');
  assert.equal(topTopics(tickets).find((x) => x.topic === 'kandy'), undefined);
  assert.match(feedbackActions(tickets)[0], /asked about "refund" 3 times/);
});

t('a won account about three months old gets an account review on the weekly list', () => {
  const deals = [{ email: 'big@x.com', businessName: 'Big Co', stage: 'closed_won', value: 900, stageTimes: { closed_won: new Date(now - 100 * DAY).toISOString() } }, { email: 'new@x.com', stage: 'closed_won', value: 50, stageTimes: { closed_won: new Date(now - 10 * DAY).toISOString() } }];
  const list = buildActionList({ deals, now, tickets: [] });
  assert.ok(list.some((a) => a.kind === 'account_review' && /Big Co/.test(a.title)));
  assert.ok(!list.some((a) => a.kind === 'account_review' && /new@x\.com/.test(a.title)));
});

console.log(`\n${n} passed`);
