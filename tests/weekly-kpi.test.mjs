import assert from 'node:assert/strict';
import { computeWeeklyKpis, weeklyHeadline, weeklyReportText } from '../lib/weekly-kpi.js';
import { makeMoney } from '../lib/currency.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 10, 12);
const iso = (d) => new Date(NOW - d * DAY).toISOString();
const ms = (d) => NOW - d * DAY;
const money = makeMoney('USD');

const emailRows = [
  { to: 'a@x.com', t: ms(1), replied: true, repliedAt: iso(0.5) },
  { to: 'b@x.com', t: ms(2), replied: false },
  { to: 'c@x.com', t: ms(3), replied: false },
  { to: 'd@x.com', t: ms(9), replied: true, repliedAt: iso(8) },
  { to: 'e@x.com', t: ms(10), replied: false },
  { to: 'f@x.com', t: ms(20), replied: true }, // old reply with no date: left out, not guessed
];
const deals = [
  { email: 'a@x.com', stage: 'qualified', stageTimes: { qualified: iso(1) }, lastUpdate: iso(1) },
  { email: 'd@x.com', stage: 'demo', stageTimes: { qualified: iso(9), demo: iso(8) }, lastUpdate: iso(8) },
  { email: 'w1@x.com', stage: 'closed_won', value: 3000, valueIsEstimate: false, closedAt: iso(2), stageTimes: { qualified: iso(20), closed_won: iso(2) }, lastUpdate: iso(2), lastTouchAt: iso(1) },
  { email: 'w2@x.com', stage: 'closed_won', value: 1000, valueIsEstimate: false, closedAt: iso(9), lastUpdate: iso(9) },
  { email: 'w3@x.com', stage: 'closed_won', value: 0, closedAt: iso(3), lastUpdate: iso(3) }, // default value, flagged
  { email: 'l1@x.com', stage: 'closed_lost', closedAt: iso(4), lostReason: 'price', lastUpdate: iso(4) },
  { email: 'u1@x.com', stage: 'closed_lost', closedAt: iso(4), lostReason: 'unsubscribed', lastUpdate: iso(4) }, // not a lost sale
];
const invoices = [
  { email: 'w1@x.com', amount: 3000, status: 'paid', issuedAt: iso(3), paidAt: iso(1) },
  { email: 'w2@x.com', amount: 1000, status: 'paid', issuedAt: iso(15), paidAt: iso(9) },
  { email: 'w3@x.com', amount: 500, status: 'open', issuedAt: iso(2), dueAt: iso(-12) },
  { email: 'z@x.com', amount: 9999, status: 'void', issuedAt: iso(2) },
];

t('this week vs last week across outreach, pipeline, wins and cash', () => {
  const k = computeWeeklyKpis({ emailRows, deals, invoices, avgDealValue: 800, now: NOW });
  const g = k.byKey;
  assert.deepEqual([g.sent.cur, g.sent.prev], [3, 2]);
  assert.deepEqual([g.replies.cur, g.replies.prev], [1, 1]);
  assert.deepEqual([g.qualified.cur, g.qualified.prev], [1, 1]); // a this week, d last week; w1 first qualified 20 days ago
  assert.deepEqual([g.demos.cur, g.demos.prev], [1, 1]); // w1 reached closed_won 2d ago counts as demo-or-later
  assert.deepEqual([g.won.cur, g.won.prev], [2, 1]);
  assert.deepEqual([g.wonRevenue.cur, g.wonRevenue.prev], [3800, 1000]); // w3 uses the 800 default
  assert.deepEqual([g.lost.cur, g.lost.prev], [1, 0]); // the opt-out is not a lost sale
  assert.deepEqual([g.invoiced.cur, g.invoiced.prev], [3500, 0]); // void ignored; the 15-day-old invoice is outside both windows
  assert.deepEqual([g.collected.cur, g.collected.prev], [3000, 1000]);
  assert.equal(g.touches.cur, 1);
  assert.equal(k.estimatedWonThisWeek, 1);
});
t('direction and good/bad: more losses is bad, more wins is good', () => {
  const g = computeWeeklyKpis({ emailRows, deals, invoices, now: NOW }).byKey;
  assert.equal(g.won.direction, 'up');
  assert.equal(g.won.good, true);
  assert.equal(g.lost.direction, 'up');
  assert.equal(g.lost.good, false);
  assert.equal(g.replies.direction, 'flat');
  assert.equal(g.replies.good, null);
  assert.equal(g.won.pct, 1);
});
t('quiet accounts say so instead of showing fake trends', () => {
  const k = computeWeeklyKpis({ now: NOW });
  assert.equal(k.noActivity, true);
  assert.equal(weeklyHeadline({ kpis: k, money }), 'No activity recorded in the last two weeks.');
});
t('headline and plain-text report use only real figures and no fancy characters', () => {
  const kpis = computeWeeklyKpis({ emailRows, deals, invoices, avgDealValue: 800, now: NOW });
  const snapshot = { overdueCount: 2, overdueAmount: 1500, openCount: 3, openValue: 9000, weighted: 4000, forecast30: 2500, outstanding: 4000, customers: 5, atRiskCount: 1, openIssues: 2 };
  const h = weeklyHeadline({ kpis, snapshot, money });
  assert.match(h, /Won 2 deals worth \$3,800/);
  assert.match(h, /2 invoices are overdue/);
  const text = weeklyReportText({ kpis, snapshot, money, businessName: 'Acme', now: NOW });
  assert.match(text, /Weekly report - Acme/);
  assert.match(text, /Deals won: 2 \(last week 1\)/);
  assert.match(text, /Cash collected: \$3,000/);
  assert.match(text, /Open pipeline: \$9,000 across 3 deals/);
  assert.doesNotMatch(text, /[^\x00-\x7F]/); // plain ASCII only
});
console.log(`\n${n} passed`);
