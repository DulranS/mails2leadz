import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCashForecast, sanitizeBill, billDates, WEEKS } from '../lib/cashflow.js';
import { computeNps, cleanScore } from '../lib/nps.js';
import { computeProfit } from '../lib/profit.js';
import { computeRunway } from '../lib/runway.js';
import { buildDealWrite } from '../lib/deal-utils.js';

const NOW = Date.UTC(2026, 9, 20, 9);       // Tue 20 Oct 2026
const START = Date.UTC(2026, 9, 20);
const DAY = 864e5;
const inv = (amount, daysFromNow, state = 'open') => ({ amount, dueAt: START + daysFromNow * DAY, state });
const iso = (daysFromNow) => new Date(START + daysFromNow * DAY).toISOString().slice(0, 10);

test('bills need a name, a positive amount and a due date', () => {
  assert.match(sanitizeBill({ name: '', amount: 5, dueDate: '2026-11-01' }).error, /what the bill is for/);
  assert.match(sanitizeBill({ name: 'Rent', amount: '', dueDate: '2026-11-01' }).error, /amount/);
  assert.match(sanitizeBill({ name: 'Rent', amount: 0, dueDate: '2026-11-01' }).error, /amount/);
  assert.match(sanitizeBill({ name: 'Rent', amount: 5, dueDate: 'x' }).error, /due/);
  const ok = sanitizeBill({ name: '  Rent ', amount: '1200.456', dueDate: '2026-11-01', repeat: 'monthly' });
  assert.deepEqual([ok.bill.name, ok.bill.amount, ok.bill.repeat, ok.bill.status], ['Rent', 1200.46, 'monthly', 'due']);
  assert.equal(sanitizeBill({ name: 'x', amount: 1, dueDate: '2026-11-01', repeat: 'weird' }).bill.repeat, 'once');
});

test('bill dates: one-offs once, past unpaid ones are due now, monthly ones repeat, paid ones never', () => {
  const end = START + WEEKS * 7 * DAY;
  assert.equal(billDates({ dueDate: iso(10), repeat: 'once', status: 'due' }, START, end).length, 1);
  assert.deepEqual(billDates({ dueDate: iso(-5), repeat: 'once', status: 'due' }, START, end), [START]);
  assert.equal(billDates({ dueDate: iso(10), repeat: 'once', status: 'paid' }, START, end).length, 0);
  assert.equal(billDates({ dueDate: iso(200), repeat: 'once', status: 'due' }, START, end).length, 0);
  const monthly = billDates({ dueDate: '2026-01-31', repeat: 'monthly', status: 'due' }, START, end);
  assert.equal(monthly.length, 3); // end of Oct is past (the 31st is in window: Oct 31, Nov 30, Dec 31) within 13 weeks
  assert.equal(new Date(monthly[1]).toISOString().slice(0, 10), '2026-11-30'); // month ends are respected
});

test('no starting cash, no forecast', () => {
  assert.equal(computeCashForecast({ now: NOW }).set, false);
  assert.equal(computeCashForecast({ cash: '', now: NOW }).set, false);
  assert.equal(computeCashForecast({ cash: -1, now: NOW }).set, false);
});

test('bills due before invoices are paid is a shortfall, and the late scenario is the harsher one', () => {
  const f = computeCashForecast({ cash: 1000, now: NOW, operatingMonthly: 0, invoices: [inv(5000, 20)], bills: [{ name: 'Supplier', amount: 3000, dueDate: iso(7), repeat: 'once', status: 'due' }] });
  assert.equal(f.set, true);
  assert.equal(f.onTime.shortfall.week, 2);          // bill in week 2 (day 7), money only in week 3
  assert.equal(f.onTime.lowest.amount, -2000);
  assert.equal(f.state, 'short');
  assert.match(f.message, /Even if everyone pays on time/);
  assert.equal(f.onTime.weeks[2].in, 5000);          // arrives on the due date, day 20 = week 3
  assert.equal(f.late.weeks[4].in, 5000);            // 14 days later: day 34 = week 5
});

test('fine on time but short if payments slip is its own state', () => {
  const f = computeCashForecast({ cash: 1000, now: NOW, operatingMonthly: 0, invoices: [inv(1000, 5)], bills: [{ name: 'Rent', amount: 1500, dueDate: iso(10), repeat: 'once', status: 'due' }] });
  assert.equal(f.onTime.shortfall, null);
  assert.equal(f.late.shortfall.week, 2);
  assert.equal(f.state, 'tight');
  assert.match(f.message, /If payments come late/);
});

test('overdue invoices: expected soon in the happy case, never in the cautious one', () => {
  const f = computeCashForecast({ cash: 100, now: NOW, invoices: [inv(900, -10, 'overdue')], operatingMonthly: 0 });
  assert.equal(f.onTime.endCash, 1000);
  assert.equal(f.late.endCash, 100);
});

test('running costs are spread over the weeks, and a healthy business stays quiet', () => {
  const f = computeCashForecast({ cash: 52000, now: NOW, operatingMonthly: 1000, invoices: [] });
  assert.equal(f.onTime.endCash, Math.round(52000 - 1000 * 12 / 52 * WEEKS));
  assert.equal(f.state, 'ok');
  assert.match(f.message, /stay above zero/);
  const thin = computeCashForecast({ cash: 3100, now: NOW, operatingMonthly: 1000, invoices: [] });
  assert.equal(thin.state, 'thin');
  assert.equal(computeCashForecast({ cash: 500, now: NOW, operatingMonthly: 1000, invoices: [] }).state, 'short');
  assert.ok(f.notes.some((n) => /does not count new sales/.test(n)));
});

test('nps: only whole numbers 0 to 10, nothing claimed under 5 answers, detractors listed', () => {
  assert.equal(cleanScore('9'), 9); assert.equal(cleanScore(11), null); assert.equal(cleanScore(7.5), null); assert.equal(cleanScore(''), null); assert.equal(cleanScore(-1), null);
  const mk = (n, nps, name = `C${n}`) => ({ stage: 'closed_won', nps, businessName: name, email: `${name}@x.com` });
  assert.match(computeNps([]).verdict, /first win/);
  const few = computeNps([mk(1, 10), mk(2, 9), mk(3, null)]);
  assert.equal(few.score, null);
  assert.match(few.verdict, /2 of 5/);
  const c = computeNps([mk(1, 10), mk(2, 9), mk(3, 9), mk(4, 8), mk(5, 3), mk(6, 6), { stage: 'closed_lost', nps: 0 }]);
  assert.deepEqual([c.responses, c.promoters, c.passives, c.detractors, c.score], [6, 3, 1, 2, 17]);
  assert.deepEqual(c.detractorList.map((d) => d.score), [3, 6]);
  assert.match(c.verdict, /not enough to grow/);
  assert.match(computeNps([mk(1, 10), mk(2, 10), mk(3, 9), mk(4, 9), mk(5, 8)]).verdict, /recommend you/);
  assert.match(computeNps([mk(1, 1), mk(2, 2), mk(3, 3), mk(4, 9), mk(5, 8)]).verdict, /warn people off/);
});

test('deal write: hours and nps are validated, empty clears, absent is untouched', () => {
  const base = { uid: 'u', email: 'a@x.com', stage: 'closed_won', now: new Date(NOW) };
  assert.equal(buildDealWrite({ ...base, hoursSpent: '12.34' }).hoursSpent, 12.3);
  assert.equal(buildDealWrite({ ...base, hoursSpent: 0 }).hoursSpent, 0);
  assert.equal(buildDealWrite({ ...base, hoursSpent: -2 }).hoursSpent, null);
  assert.equal(buildDealWrite({ ...base, hoursSpent: '' }).hoursSpent, null);
  assert.equal(buildDealWrite({ ...base, nps: '9' }).nps, 9);
  assert.equal(buildDealWrite({ ...base, nps: 11 }).nps, null);
  assert.equal(buildDealWrite({ ...base, nps: 6.5 }).nps, null);
  assert.equal(buildDealWrite({ ...base, nps: '' }).npsAt, null);
  assert.ok(buildDealWrite({ ...base, nps: 8 }).npsAt);
  const bare = buildDealWrite(base);
  assert.equal('hoursSpent' in bare, false); assert.equal('nps' in bare, false);
});

test('time: what an hour of your own time earns, and whether it beats what you say it is worth', () => {
  const won = (v, c, h, k = Math.random()) => ({ email: `c${k}@x.com`, stage: 'closed_won', value: v, valueIsEstimate: false, deliveryCost: c, hoursSpent: h, closedAt: new Date(NOW - 5 * DAY).toISOString(), lastUpdate: new Date(NOW - 5 * DAY).toISOString() });
  const deals = [won(1000, 200, 10), won(1000, 200, 10), won(1000, 200, 10)];
  const p = computeProfit({ deals, settings: { hourlyRate: 100 }, now: NOW });
  assert.equal(p.time.perHour, 80);
  assert.equal(p.time.belowOwnRate, true);
  assert.match(p.time.verdict, /still a job/);
  const richer = computeProfit({ deals, settings: { hourlyRate: 50 }, now: NOW });
  assert.equal(richer.time.belowOwnRate, false);
  assert.match(richer.time.verdict, /more than the 50/);
  const noRate = computeProfit({ deals, settings: {}, now: NOW });
  assert.match(noRate.time.verdict, /set what your hour is worth/);
  const two = computeProfit({ deals: deals.slice(0, 2), settings: { hourlyRate: 100 }, now: NOW });
  assert.equal(two.time.enough, false);
  assert.match(two.time.verdict, /2 of 3/);
  assert.equal(computeProfit({ deals: [{ ...won(1000, 200, 10), hoursSpent: null }], now: NOW }).time.verdict, null);
});

test('runway: how long cash lasts if every sale stopped today', () => {
  const r = computeRunway({ cashOnHand: 9000, cashAsOf: new Date(NOW).toISOString(), netMonthly: 500, operatingMonthly: 1500, profitReady: true, now: NOW });
  assert.equal(r.state, 'profitable');
  assert.equal(r.monthsIfNoSales, 6);
  assert.equal(computeRunway({ cashOnHand: 9000, cashAsOf: new Date(NOW).toISOString(), operatingMonthly: 0, now: NOW }).monthsIfNoSales, null);
});
