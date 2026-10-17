import assert from 'node:assert/strict';
import { buildDealWrite } from '../lib/deal-utils.js';
import { computeRecurring, computeSubscriptionsDue } from '../lib/recurring.js';
import { computeBusinessMetrics } from '../lib/business-metrics.js';
import { buildNextActions } from '../lib/next-actions.js';
import { computeWeeklyKpis, weeklyReportText } from '../lib/weekly-kpi.js';
import { computeCustomers } from '../lib/customers.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const ahead = (d) => new Date(NOW + d * DAY).toISOString();
const deal = (email, o = {}) => ({ email, stage: 'closed_won', createdAt: ago(210), closedAt: ago(200), lastUpdate: ago(5), ...o });

t('deal write: monthly amount is cleaned, a bad or empty one means one-off (0), and nothing is touched when not given', () => {
  const w = (extra) => buildDealWrite({ uid: 'u', email: 'a@b.co', stage: 'closed_won', existing: { stage: 'closed_won' }, ...extra });
  assert.equal(w({ recurringMonthly: '99.999' }).recurringMonthly, 100);
  assert.equal(w({ recurringMonthly: '12.345' }).recurringMonthly, 12.35);
  for (const bad of ['', 'abc', -5, 0, null]) assert.equal(w({ recurringMonthly: bad }).recurringMonthly, 0);
  const none = w({});
  for (const k of ['recurringMonthly', 'renewalAt', 'churnedAt', 'churnReason']) assert.equal(k in none, false, k);
});
t('deal write: renewal date parses, an empty or unreadable one clears it', () => {
  const w = (renewalAt) => buildDealWrite({ uid: 'u', email: 'a@b.co', stage: 'closed_won', existing: { stage: 'closed_won' }, renewalAt });
  assert.equal(w('2026-11-01').renewalAt, '2026-11-01T00:00:00.000Z');
  for (const bad of ['', null, 'not a date']) assert.equal(w(bad).renewalAt, null);
});
t('deal write: churning keeps the stage (never a lost deal), keeps the FIRST leave date, stores a short reason; reactivating clears both', () => {
  const first = buildDealWrite({ uid: 'u', email: 'a@b.co', existing: { stage: 'closed_won' }, churn: true, churnReason: '  too   expensive  ', now: new Date(NOW) });
  assert.equal(first.stage, 'closed_won');
  assert.equal(first.churnedAt, new Date(NOW).toISOString());
  assert.equal(first.churnReason, 'too expensive');
  assert.equal(first.lostReason, undefined);
  const again = buildDealWrite({ uid: 'u', email: 'a@b.co', existing: { stage: 'closed_won', churnedAt: ago(30) }, churn: true, now: new Date(NOW) });
  assert.equal(again.churnedAt, ago(30));
  const back = buildDealWrite({ uid: 'u', email: 'a@b.co', existing: { stage: 'closed_won', churnedAt: ago(30) }, churn: false });
  assert.equal(back.churnedAt, null);
  assert.equal(back.churnReason, null);
});

const deals = [
  deal('a@x.co', { recurringMonthly: 100, renewalAt: ahead(10) }),                       // active, renews soon
  deal('b@x.co', { recurringMonthly: 50, churnedAt: ago(20), renewalAt: ahead(5) }),     // left 20 days ago
  deal('c@x.co', { recurringMonthly: 30, createdAt: ago(12), closedAt: ago(10), renewalAt: ago(3) }), // new, renewal date passed
  deal('d@x.co'),                                                                         // one-off customer: ignored
  deal('e@x.co', { recurringMonthly: 70, stage: 'proposal' }),                            // not won yet: ignored
  deal('f@x.co', { recurringMonthly: 80, createdAt: ago(320), closedAt: ago(300), churnedAt: ago(150) }), // left long ago
];

t('no subscriptions: the whole feature stays out of sight', () => {
  assert.deepEqual(computeRecurring({ deals: [deal('d@x.co')], now: NOW }), { any: false });
  assert.deepEqual(computeRecurring({ deals: [], now: NOW }), { any: false });
});
t('MRR, ARR, subscribers, new and lost MRR in the last 30 days', () => {
  const r = computeRecurring({ deals, now: NOW });
  assert.equal(r.any, true);
  assert.equal(r.mrr, 130); assert.equal(r.arr, 1560); assert.equal(r.subscribers, 2); assert.equal(r.arpa, 65);
  assert.equal(r.newMrr30, 30); assert.equal(r.churnedMrr30, 50); assert.equal(r.netNewMrr30, -20);
  assert.deepEqual(r.churned, { total: 2, last90: 1 });
});
t('churn is measured on subscriptions that existed 90 days ago; a rough-guide flag with few customers; lifetime value from it', () => {
  const r = computeRecurring({ deals, now: NOW });
  assert.equal(r.churn.base, 2); assert.equal(r.churn.lost, 1); assert.equal(r.churn.rate90, 0.5); assert.equal(r.churn.confidence, 'rough');
  const monthly = 1 - Math.pow(0.5, 1 / 3);
  assert.ok(Math.abs(r.churn.monthlyRate - monthly) < 1e-9);
  assert.equal(r.ltv.value, Math.round(65 * (1 / monthly))); assert.equal(r.ltv.capped, false);
});
t('no churn yet: no lifetime value is invented', () => {
  const r = computeRecurring({ deals: [deals[0]], now: NOW });
  assert.equal(r.churn.lost, 0); assert.equal(r.churn.monthlyRate, 0); assert.equal(r.ltv, null);
});
t('lifetime value is capped at 5 years', () => {
  const many = Array.from({ length: 200 }, (_, i) => deal(`s${i}@x.co`, { recurringMonthly: 10, churnedAt: i === 0 ? ago(10) : null }));
  const r = computeRecurring({ deals: many, now: NOW });
  assert.equal(r.ltv.capped, true); assert.equal(r.ltv.months, 60); assert.equal(r.ltv.value, 600);
});
t('monthly trend ends at today\'s MRR and rises when a subscriber joins', () => {
  const r = computeRecurring({ deals, now: NOW });
  assert.equal(r.mrrByMonth.length, 6);
  assert.equal(r.mrrByMonth[5].mrr, 130);
  assert.equal(r.mrrByMonth[0].mrr, 150); // five months ago: a (100) + b (50); c had not joined, f had already left
});
t('renewals: due within 30 days, and dates that passed with no record of leaving; churned customers never listed', () => {
  const r = computeRecurring({ deals, now: NOW });
  assert.equal(r.renewals.dueSoon.count, 1); assert.equal(r.renewals.dueSoon.mrr, 100); assert.equal(r.renewals.dueSoon.list[0].email, 'a@x.co');
  assert.equal(r.renewals.lapsed.count, 1); assert.equal(r.renewals.lapsed.list[0].email, 'c@x.co'); assert.equal(r.renewals.lapsed.list[0].days, -3);
});
t('the latest write per email wins (a customer reactivated later counts again)', () => {
  const r = computeRecurring({ deals: [deal('a@x.co', { recurringMonthly: 100, churnedAt: ago(40), lastUpdate: ago(30) }), deal('a@x.co', { recurringMonthly: 100, churnedAt: null, lastUpdate: ago(2) })], now: NOW });
  assert.equal(r.mrr, 100); assert.equal(r.subscribers, 1);
});

t('customers: a churned customer leaves the active list (and its counts) and appears in the "left" list with the reason', () => {
  const c = computeCustomers({ deals: [...deals.slice(0, 2), deal('g@x.co', { churnReason: 'too expensive', churnedAt: ago(8), recurringMonthly: 20 })], now: NOW });
  assert.deepEqual(c.customers.map((x) => x.email).sort(), ['a@x.co']);
  assert.deepEqual(c.churnedList.map((x) => x.email).sort(), ['b@x.co', 'g@x.co']);
  const g = c.churnedList.find((x) => x.email === 'g@x.co');
  assert.equal(g.reason, 'too expensive'); assert.equal(g.recurringMonthly, 20); assert.equal(g.churnedAt, ago(8));
  assert.equal(c.total, 1);
});
t('customers: renewing within 30 days needs attention (with the days); a passed date asks you to confirm; far dates and one-offs are quiet', () => {
  const c = computeCustomers({ deals: [deals[0], deals[2], deal('far@x.co', { recurringMonthly: 10, renewalAt: ahead(200), lastTouchAt: ago(1) }), deals[3]], now: NOW });
  const by = Object.fromEntries(c.customers.map((x) => [x.email, x]));
  assert.ok(by['a@x.co'].reasons.includes('Renews in 10 days')); assert.notEqual(by['a@x.co'].health, 'healthy');
  assert.match(by['c@x.co'].reasons.join('|'), /Renewal date passed 3 days ago: confirm they renewed, or mark them as churned/);
  assert.equal(by['a@x.co'].recurringMonthly, 100); assert.equal(by['a@x.co'].renewalDays, 10);
  assert.ok(!by['far@x.co'].reasons.some((r) => /Renew/.test(r)));
  assert.equal(by['d@x.co'].recurringMonthly, 0); assert.equal(by['d@x.co'].renewalAt, null);
});

const inv = (email, daysAgo, o = {}) => ({ email, issuedAt: ago(daysAgo), status: 'open', ...o });
t('subscriptions due: invoiced before but not in ~a month; never-invoiced (already in "won but not invoiced"), recent, voided-only, churned, and one-off are not listed', () => {
  const r = computeSubscriptionsDue({
    deals: [deals[0], deals[1], deals[2], deals[3], deal('h@x.co', { recurringMonthly: 40 }), deal('i@x.co', { recurringMonthly: 60 }), deal('j@x.co', { recurringMonthly: 25 })],
    invoices: [inv('a@x.co', 31), inv('a@x.co', 62), inv('b@x.co', 90), inv('c@x.co', 5), inv('d@x.co', 90), inv('h@x.co', 28), inv('i@x.co', 27), inv('j@x.co', 90, { status: 'void' })],
    now: NOW,
  });
  assert.deepEqual(r.list.map((x) => x.email), ['a@x.co', 'h@x.co']); // most overdue first
  assert.equal(r.list[0].daysSince, 31); assert.equal(r.list[0].amount, 100); // the NEWEST invoice counts, the amount is the monthly amount
  assert.equal(r.count, 2); assert.equal(r.amount, 140);
  assert.deepEqual(computeSubscriptionsDue({ deals: [], invoices: [], now: NOW }), { count: 0, amount: 0, list: [] });
});
t('Do this next: subscription invoices and renewals are surfaced, and stay silent when there is nothing', () => {
  const metrics = computeBusinessMetrics({ now: NOW });
  const rec = computeRecurring({ deals, now: NOW });
  const subsDue = computeSubscriptionsDue({ deals, invoices: [inv('a@x.co', 40)], now: NOW });
  const ids = buildNextActions({ metrics, subsDue, recurring: rec }).map((a) => a.id);
  assert.ok(ids.includes('subsdue')); assert.ok(ids.includes('renewals_lapsed')); assert.ok(ids.includes('renewals_soon'));
  const quiet = buildNextActions({ metrics, subsDue: { count: 0, amount: 0, list: [] }, recurring: { any: false } }).map((a) => a.id);
  for (const id of ['subsdue', 'renewals_lapsed', 'renewals_soon']) assert.ok(!quiet.includes(id), id);
});
t('weekly report: a recurring-revenue line appears only for subscription businesses', () => {
  const kpis = computeWeeklyKpis({ now: NOW });
  const money = (v) => `$${Math.round(v)}`;
  const withMrr = weeklyReportText({ kpis, snapshot: { mrr: 130, subscribers: 2, netNewMrr30: -20, renewalsSoon: 1 }, money, now: NOW });
  assert.match(withMrr, /- Recurring revenue: \$130 a month from 2 subscribers, net new this month -\$20, 1 renewing within 30 days/);
  assert.ok(!/Recurring revenue/.test(weeklyReportText({ kpis, snapshot: {}, money, now: NOW })));
});
console.log(`recurring: ${n} passed`);
