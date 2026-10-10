import assert from 'node:assert/strict';
import { buildInvoiceWrite, invoiceState, dunningLevel, canRemind, computeBilling, computeUnbilled, dunningFallbackDraft } from '../lib/billing.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 10, 12); // 10 Oct 2026
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
const inv = (o) => ({ _id: Math.random().toString(36).slice(2), email: 'a@x.com', amount: 1000, status: 'open', issuedAt: iso(20), dueAt: iso(6), ...o });

t('invoice write validates email, amount and date', () => {
  assert.equal(buildInvoiceWrite({ uid: 'u', email: 'bad', amount: 10 }).ok, false);
  assert.equal(buildInvoiceWrite({ uid: 'u', email: 'a@x.com', amount: 0 }).ok, false);
  assert.equal(buildInvoiceWrite({ uid: 'u', email: 'a@x.com', amount: -5 }).ok, false);
  assert.equal(buildInvoiceWrite({ uid: 'u', email: 'a@x.com', amount: 10, issuedAt: new Date(NOW + 10 * DAY).toISOString(), now: new Date(NOW) }).ok, false);
  const r = buildInvoiceWrite({ uid: 'u', email: ' A@X.com ', amount: '1234.567', termsDays: 30, number: 'INV-1\nX', now: new Date(NOW) });
  assert.equal(r.ok, true);
  assert.equal(r.write.email, 'a@x.com');
  assert.equal(r.write.amount, 1234.57);
  assert.equal(r.write.number, 'INV-1 X'); // one line only
  assert.equal(new Date(r.write.dueAt).getTime() - new Date(r.write.issuedAt).getTime(), 30 * DAY);
  assert.equal(r.write.status, 'open');
  assert.equal(r.write.userId, 'u');
});
t('terms are clamped and default when nonsense', () => {
  const r = buildInvoiceWrite({ uid: 'u', email: 'a@x.com', amount: 5, termsDays: 9999, now: new Date(NOW) });
  assert.equal((new Date(r.write.dueAt) - new Date(r.write.issuedAt)) / DAY, 180);
  const z = buildInvoiceWrite({ uid: 'u', email: 'a@x.com', amount: 5, termsDays: 'abc', now: new Date(NOW) });
  assert.equal((new Date(z.write.dueAt) - new Date(z.write.issuedAt)) / DAY, 14);
});
t('state: open, overdue (at least 1 day), paid, void', () => {
  assert.deepEqual(invoiceState(inv({ dueAt: iso(-5) }), NOW), { state: 'open', daysOverdue: 0 });
  assert.equal(invoiceState(inv({ dueAt: iso(0.2) }), NOW).daysOverdue, 1);
  assert.equal(invoiceState(inv({ dueAt: iso(10) }), NOW).daysOverdue, 10);
  assert.equal(invoiceState(inv({ status: 'paid' }), NOW).state, 'paid');
  assert.equal(invoiceState(inv({ status: 'void', dueAt: iso(90) }), NOW).state, 'void');
});
t('dunning is polite and escalates with lateness', () => {
  assert.equal(dunningLevel(3).level, 1);
  assert.equal(dunningLevel(7).level, 2);
  assert.equal(dunningLevel(20).level, 2);
  assert.equal(dunningLevel(21).level, 3);
});
t('reminders are spaced at least 3 days apart and never for settled invoices', () => {
  assert.equal(canRemind(inv({ lastReminderAt: iso(1) }), NOW).ok, false);
  assert.equal(canRemind(inv({ lastReminderAt: iso(4) }), NOW).ok, true);
  assert.equal(canRemind(inv({}), NOW).ok, true);
  assert.equal(canRemind(inv({ status: 'paid' }), NOW).ok, false);
});
t('billing summary: outstanding, overdue, aging, cash, speed of payment', () => {
  const b = computeBilling({ now: NOW, invoices: [
    inv({ amount: 1000, dueAt: iso(5) }),                       // overdue 5d
    inv({ amount: 500, dueAt: iso(45) }),                       // overdue 45d
    inv({ amount: 250, dueAt: iso(-3) }),                       // due in 3d
    inv({ amount: 2000, dueAt: iso(-40) }),                     // not due for a while
    inv({ amount: 800, status: 'paid', issuedAt: iso(30), dueAt: iso(16), paidAt: iso(20) }), // paid in 10 days, on time
    inv({ amount: 400, status: 'paid', issuedAt: iso(60), dueAt: iso(46), paidAt: iso(40) }), // paid in 20 days, late
    inv({ amount: 9999, status: 'void' }),
  ] });
  assert.equal(b.outstanding, 3750);
  assert.equal(b.outstandingCount, 4);
  assert.deepEqual({ c: b.overdue.count, a: b.overdue.amount, o: b.overdue.oldestDays }, { c: 2, a: 1500, o: 45 });
  assert.deepEqual(b.dueSoon, { count: 1, amount: 250 });
  assert.equal(b.aging.find((x) => x.id === 'd1_30').amount, 1000);
  assert.equal(b.aging.find((x) => x.id === 'd31_60').amount, 500);
  assert.equal(b.aging.find((x) => x.id === 'current').amount, 2250);
  assert.equal(b.collected.last30, 800);
  assert.equal(b.collected.last90, 1200);
  assert.equal(b.avgDaysToPay, 15);
  assert.equal(b.onTimeRate, 0.5);
  assert.equal(b.dueNext30, 1750); // 1000 + 500 late, 250 due in 3 days
  assert.equal(b.rows[0].state, 'overdue');
  assert.equal(b.rows[0].daysOverdue, 45); // most overdue first
  assert.equal(b.cashByMonth.length, 6);
});
t('empty billing is all zeros and no averages', () => {
  const b = computeBilling({ invoices: [], now: NOW });
  assert.equal(b.outstanding, 0);
  assert.equal(b.avgDaysToPay, null);
  assert.equal(b.onTimeRate, null);
});
t('unbilled: won deals with no invoice, voided invoices do not count as billed', () => {
  const deals = [
    { email: 'a@x.com', stage: 'closed_won', value: 3000, estimated: false },
    { email: 'b@x.com', stage: 'delivery', value: 1000, estimated: true },
    { email: 'c@x.com', stage: 'qualified', value: 500, estimated: false },
    { email: 'd@x.com', stage: 'closed_won', value: 700, estimated: false },
  ];
  const u = computeUnbilled({ deals, invoices: [{ email: 'a@x.com', status: 'open' }, { email: 'D@x.com', status: 'void' }] });
  assert.deepEqual(u.list.map((x) => x.email), ['b@x.com', 'd@x.com']);
  assert.equal(u.amount, 1700);
  assert.equal(u.estimatedCount, 1);
});
t('fallback drafts carry amount, due date, payment info; never threaten', () => {
  for (const level of [1, 2, 3]) {
    const d = dunningFallbackDraft({ level, name: 'Acme', number: 'INV-7', amountText: '$1,000.00', dueText: '1 Oct', senderName: 'Sam', paymentInfo: 'Bank X 123', daysOverdue: 9 });
    assert.match(d.body, /\$1,000\.00/);
    assert.match(d.body, /Bank X 123/);
    assert.match(d.subject, /INV-7/);
    assert.doesNotMatch(d.body, /legal|lawyer|court|collections agency|fee|interest/i);
  }
});
console.log(`\n${n} passed`);
