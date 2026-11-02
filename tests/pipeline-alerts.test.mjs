// Pipeline alerts (Pass 136): stalled deals, old lost deals, booking reminders and the owner's digest. Nothing here contacts a customer
// except the booking reminder, which is the transactional message the customer's booking already implies.
import assert from 'node:assert/strict';
import { planStallAlerts, planLostRevivals, planRenewalAlerts, dueBookingReminders, reminderText, alertsDigest, STALL_DAYS, sanitizeStallDays, stallThresholds, lastMonthWinLoss } from '../lib/pipeline-alerts.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000;
const now = Date.parse('2026-11-03T10:00:00Z');
const daysAgo = (d) => new Date(now - d * DAY).toISOString();

t('a deal sitting in its stage past the threshold gets one stall alert for that stage entry', () => {
  const deals = [{ email: 'Ann@Example.com', stage: 'proposal', stageTimes: { proposal: daysAgo(8) }, lastUpdate: daysAgo(8) }];
  const [a] = planStallAlerts({ deals, tasks: [], now });
  assert.equal(a.email, 'ann@example.com');
  assert.equal(a.task.kind, 'stall_alert');
  assert.match(a.task.reason, /In Proposal for 8 days/);
  // the same stage entry, seen again on a later run, is not alerted again
  assert.equal(planStallAlerts({ deals, tasks: [a.task], now }).length, 0);
});

t('a deal under its stage threshold is not alerted; each stage has its own threshold', () => {
  assert.equal(STALL_DAYS.qualified, 10);
  const under = [{ email: 'b@example.com', stage: 'qualified', stageTimes: { qualified: daysAgo(8) } }];
  assert.equal(planStallAlerts({ deals: under, tasks: [], now }).length, 0);
  const over = [{ email: 'c@example.com', stage: 'negotiation', stageTimes: { negotiation: daysAgo(15) } }];
  assert.equal(planStallAlerts({ deals: over, tasks: [], now }).length, 1);
});

t('a deal that moved to a new stage gets a fresh alert when that stage stalls; closed deals never stall', () => {
  const first = { email: 'd@example.com', stage: 'proposal', stageTimes: { proposal: daysAgo(9) } };
  const [a] = planStallAlerts({ deals: [first], tasks: [], now });
  const moved = { email: 'd@example.com', stage: 'negotiation', stageTimes: { proposal: daysAgo(9), negotiation: daysAgo(20) } };
  const [b] = planStallAlerts({ deals: [moved], tasks: [a.task], now });
  assert.ok(b, 'new stage entry is alerted');
  assert.equal(planStallAlerts({ deals: [{ email: 'e@example.com', stage: 'closed_won', stageTimes: { closed_won: daysAgo(90) } }], tasks: [], now }).length, 0);
});

const lost = (email, reason, d) => ({ email, stage: 'closed_lost', lostReason: reason, lostAt: daysAgo(d) });

t('a revisitable lost deal is suggested once, after 90 days', () => {
  const [r] = planLostRevivals({ deals: [lost('f@example.com', 'price', 100)], tasks: [], now });
  assert.equal(r.task.kind, 'lost_revival');
  assert.match(r.task.reason, /Lost 100 days ago \(Price \/ budget\)/);
  assert.equal(planLostRevivals({ deals: [lost('f@example.com', 'price', 30)], tasks: [], now }).length, 0);
  assert.equal(planLostRevivals({ deals: [lost('f@example.com', 'price', 100)], tasks: [r.task], now }).length, 0);
});

t('a lost deal for a reason the owner must respect is never suggested', () => {
  assert.equal(planLostRevivals({ deals: [lost('g@example.com', 'unsubscribed', 200)], tasks: [], now }).length, 0);
});

t('booking reminders go once, to confirmed bookings starting within two days only', () => {
  const soon = { id: 'b1', email: 'h@example.com', status: 'confirmed', startIso: new Date(now + 30 * 3600000).toISOString() };
  const far = { id: 'b2', email: 'i@example.com', status: 'confirmed', startIso: new Date(now + 5 * DAY).toISOString() };
  const done = { id: 'b3', email: 'j@example.com', status: 'confirmed', startIso: new Date(now + 10 * 3600000).toISOString(), reminderSentAt: daysAgo(0) };
  const cancelled = { id: 'b4', email: 'k@example.com', status: 'cancelled', startIso: new Date(now + 10 * 3600000).toISOString() };
  const past = { id: 'b5', email: 'l@example.com', status: 'confirmed', startIso: new Date(now - 3600000).toISOString() };
  const due = dueBookingReminders([soon, far, done, cancelled, past], now);
  assert.deepEqual(due.map((b) => b.id), ['b1']);
});

t('the reminder carries the customer\'s manage link when one exists, and no link otherwise', () => {
  const r = reminderText({ name: 'Ann', serviceName: 'Demo', startLabel: '2026-11-04 10:00 UTC', manageLink: 'https://app.test/manage?t=x', businessName: 'Shop' });
  assert.match(r.text, /^Hello Ann,/);
  assert.match(r.text, /https:\/\/app\.test\/manage\?t=x/);
  assert.doesNotMatch(reminderText({ serviceName: 'Demo', startLabel: 'x' }).text, /manage/);
});

t('the owner digest lists new alerts, says nothing was sent, and is absent when there is nothing new', () => {
  assert.equal(alertsDigest({ stalled: [], revivals: [] }), null);
  const stalled = planStallAlerts({ deals: [{ email: 'm@example.com', stage: 'proposal', stageTimes: { proposal: daysAgo(8) } }], tasks: [], now });
  const d = alertsDigest({ stalled, revivals: [], senderName: 'Shop' });
  assert.match(d.subject, /Pipeline check: 1 to look at/);
  assert.match(d.text, /Nothing has been sent to anyone/);
  assert.match(d.text, /- m@example\.com:/);
});

t('a subscription renewing within two weeks gets one owner alert; churned or non-recurring deals do not', () => {
  const renewing = { email: 'n@example.com', stage: 'retention', recurringMonthly: 50, renewalAt: new Date(now + 5 * DAY).toISOString() };
  const [a] = planRenewalAlerts({ deals: [renewing], tasks: [], now });
  assert.equal(a.task.kind, 'renewal_due');
  assert.match(a.task.reason, /Renews in 5 days/);
  assert.equal(planRenewalAlerts({ deals: [renewing], tasks: [a.task], now }).length, 0);
  assert.equal(planRenewalAlerts({ deals: [{ ...renewing, churnedAt: daysAgo(1) }], tasks: [], now }).length, 0);
  assert.equal(planRenewalAlerts({ deals: [{ ...renewing, recurringMonthly: 0 }], tasks: [], now }).length, 0);
  assert.equal(planRenewalAlerts({ deals: [{ ...renewing, renewalAt: new Date(now + 40 * DAY).toISOString() }], tasks: [], now }).length, 0);
});

t('the owner\'s stall thresholds take only open stages and whole days, and keep the defaults for the rest', () => {
  assert.deepEqual(sanitizeStallDays('proposal 7, negotiation 14, closed_won 5, demo 0, qualified x, contacted 400'), { proposal: 7, negotiation: 14 });
  assert.deepEqual(sanitizeStallDays({ demo: 4, bogus: 2 }), { demo: 4 });
  const th = stallThresholds({ proposal: 3 });
  assert.equal(th.proposal, 3);
  assert.equal(th.qualified, STALL_DAYS.qualified);
  // a deal in proposal for 4 days is alerted under the owner's 3-day threshold
  const deals = [{ email: 'o@example.com', stage: 'proposal', stageTimes: { proposal: daysAgo(4) } }];
  assert.equal(planStallAlerts({ deals, tasks: [], now, stallDays: th }).length, 1);
  assert.equal(planStallAlerts({ deals, tasks: [], now }).length, 0);
});

t('last month\'s win and loss summary counts only that month\'s closes, with the top lost reasons', () => {
  const deals = [
    { stage: 'closed_won', value: 500, stageTimes: { closed_won: '2026-10-10T09:00:00Z' } },
    { stage: 'closed_won', value: 900, stageTimes: { closed_won: '2026-11-01T09:00:00Z' } }, // this month: not counted
    { stage: 'closed_lost', lostReason: 'price', lostAt: '2026-10-05T09:00:00Z' },
    { stage: 'closed_lost', lostReason: 'timing', stageTimes: { closed_lost: '2026-10-20T09:00:00Z' } },
    { stage: 'closed_lost', lostReason: 'price', lostAt: '2026-09-05T09:00:00Z' }, // September: not counted
  ];
  const m = lastMonthWinLoss(deals, now);
  assert.equal(m.year, 2026);
  assert.equal(m.month, 10);
  assert.equal(m.won, 1);
  assert.equal(m.wonValue, 500);
  assert.equal(m.lost, 2);
  assert.equal(m.winRate, 33);
  assert.ok(m.topLost.some((x) => x.reason === 'Price / budget' && x.count === 1));
});

t('the digest shows last month on the first of the month, even with nothing else new', () => {
  const m = lastMonthWinLoss([{ stage: 'closed_won', value: 500, stageTimes: { closed_won: '2026-10-10T09:00:00Z' } }], now);
  const d = alertsDigest({ monthly: m, senderName: 'Shop' });
  assert.equal(d.subject, 'Pipeline check: last month');
  assert.match(d.text, /Last month \(2026-10\): 1 won \(500\.00\), 0 lost, win rate 100%\./);
  assert.equal(alertsDigest({ monthly: null }), null);
});

console.log(`\n${n} passed`);
