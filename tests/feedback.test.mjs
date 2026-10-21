import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackState, computeCustomers, FEEDBACK_MIN_DAYS, FEEDBACK_REASK_DAYS } from '../lib/customers.js';
import { addProofPoint, parseProofPoints } from '../lib/sales-kit.js';
import { buildDealWrite } from '../lib/deal-utils.js';
import { POST_SALE_STAGES } from '../lib/default-templates.js';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 20, 12);
const ok = { activated: true, daysSinceWon: 20, openIssues: 0, overdue: false, askedAt: null, now: NOW };

test('how-did-it-go is offered at the right moment, with a plain reason when not', () => {
  assert.equal(feedbackState(ok).eligible, true);
  assert.equal(feedbackState({ ...ok, activated: false }).eligible, false);
  assert.match(feedbackState({ ...ok, daysSinceWon: FEEDBACK_MIN_DAYS - 1 }).why, /Too soon/);
  assert.match(feedbackState({ ...ok, openIssues: 1 }).why, /open issue/);
  assert.match(feedbackState({ ...ok, overdue: true }).why, /overdue/);
  assert.equal(feedbackState({ ...ok, askedAt: NOW - 10 * DAY }).eligible, false);
  assert.equal(feedbackState({ ...ok, askedAt: NOW - (FEEDBACK_REASK_DAYS + 1) * DAY }).eligible, true);
});

test('the AI knows the feedback purpose, and a customer row carries the state and the saved note', () => {
  assert.ok(POST_SALE_STAGES.includes('feedback_ask'));
  const deal = { email: 'a@x.com', stage: 'closed_won', value: 900, valueIsEstimate: false, createdAt: new Date(NOW - 60 * DAY).toISOString(), closedAt: new Date(NOW - 40 * DAY).toISOString(), lastUpdate: new Date(NOW - 5 * DAY).toISOString(), customerQuote: 'Cut no-shows by a third', onboardingDone: { welcome: true, kickoff: true, checkin: true, firstResult: true } };
  const c = computeCustomers({ deals: [deal], now: NOW }).customers?.[0] ?? computeCustomers({ deals: [deal], now: NOW }).list?.[0];
  assert.ok(c, 'customer row exists');
  assert.equal(c.customerQuote, 'Cut no-shows by a third');
  assert.equal(typeof c.feedback.eligible, 'boolean');
});

test('the deal write records the ask and a clean, short, optional note', () => {
  const base = { uid: 'u', email: 'a@x.com', stage: 'closed_won', now: new Date(NOW) };
  assert.equal(buildDealWrite({ ...base, feedbackAsked: true }).feedbackAskedAt, new Date(NOW).toISOString());
  assert.equal('feedbackAskedAt' in buildDealWrite(base), false);
  assert.equal(buildDealWrite({ ...base, customerQuote: '  Cut\nno-shows   by a third ' }).customerQuote, 'Cut no-shows by a third');
  assert.equal(buildDealWrite({ ...base, customerQuote: 'x'.repeat(400) }).customerQuote.length, 160);
  assert.equal(buildDealWrite({ ...base, customerQuote: '   ' }).customerQuote, null);
  assert.equal('customerQuote' in buildDealWrite(base), false);
});

test('adding a proof point respects the limits and never duplicates', () => {
  let r = addProofPoint('', 'Helped 12 cafes cut no-shows by about a third');
  assert.equal(r.ok, true);
  assert.deepEqual(parseProofPoints(r.text), ['Helped 12 cafes cut no-shows by about a third']);
  assert.equal(addProofPoint(r.text, 'helped 12 cafes cut no-shows by about a third').ok, false);
  assert.match(addProofPoint(r.text, 'short').reason, /few words/);
  const full = ['Result number one is real', 'Result number two is real', 'Result number three is real'].join('\n');
  assert.match(addProofPoint(full, 'A fourth real result here').reason, /all 3/);
  assert.equal(addProofPoint(r.text, '- Onboarded in under a week').ok, true);
  assert.equal(parseProofPoints(addProofPoint(r.text, 'y'.repeat(300)).text).at(-1).length, 160);
});
