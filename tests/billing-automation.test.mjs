import assert from 'node:assert/strict';
import { planSubscriptionInvoices, planReminders, invoiceEmailText, MAX_AUTO_REMINDERS } from '../lib/billing-automation.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const now = Date.parse('2026-10-18T06:00:00Z'); const D = 86400000;
const ago = (d) => new Date(now - d * D).toISOString();
const sub = (email, extra = {}) => ({ email, businessName: email.split('@')[0], stage: 'closed_won', value: 1000, recurringMonthly: 80, lastUpdate: ago(5), ...extra });
const inv = (email, o = {}) => ({ email, amount: 80, status: 'open', issuedAt: ago(40), createdAt: ago(40), dueAt: ago(26), reminders: 0, ...o });

t('subscription invoice: raised for a subscriber invoiced 40 days ago, with month note, terms and amount', () => {
  const p = planSubscriptionInvoices({ uid: 'u1', deals: [sub('a@x.lk')], invoices: [inv('a@x.lk', { status: 'paid' })], now, termsDays: 10 });
  assert.equal(p.length, 1);
  assert.equal(p[0].write.amount, 80);
  assert.equal(p[0].write.note, 'Subscription, October 2026');
  assert.equal(p[0].write.userId, 'u1');
  assert.equal(new Date(p[0].write.dueAt).getTime() - new Date(p[0].write.issuedAt).getTime(), 10 * D);
});
t('subscription invoice: never the first invoice, never a churned customer, never twice in a month, never a voided-only history', () => {
  const none = planSubscriptionInvoices({ uid: 'u1', deals: [sub('first@x.lk'), sub('gone@x.lk', { churnedAt: ago(3) }), sub('recent@x.lk')], invoices: [inv('gone@x.lk'), inv('recent@x.lk', { issuedAt: ago(5), createdAt: ago(5) })], now });
  assert.deepEqual(none, []);
  // running it again after the invoice exists raises nothing (idempotent)
  const first = planSubscriptionInvoices({ uid: 'u1', deals: [sub('a@x.lk')], invoices: [inv('a@x.lk')], now });
  const again = planSubscriptionInvoices({ uid: 'u1', deals: [sub('a@x.lk')], invoices: [inv('a@x.lk'), { ...first[0].write }], now });
  assert.equal(first.length, 1); assert.equal(again.length, 0);
});
t('subscription invoice: the per-run cap holds', () => {
  const deals = Array.from({ length: 30 }, (_, i) => sub(`s${i}@x.lk`)); const invoices = deals.map((d) => inv(d.email));
  assert.equal(planSubscriptionInvoices({ uid: 'u1', deals, invoices, now }).length, 20);
});
t('invoice email: amount, due date, payment info; falls back to "reply for details"', () => {
  const a = invoiceEmailText({ name: 'Acme', amount: 80, currency: 'USD', dueAt: '2026-11-01T00:00:00Z', note: 'Subscription, October 2026', senderName: 'Sam', paymentInfo: 'Bank X 123' });
  assert.match(a.body, /\$80\.00/); assert.match(a.body, /2026-11-01/); assert.match(a.body, /Bank X 123/); assert.match(a.subject, /Subscription, October 2026/);
  assert.match(invoiceEmailText({ name: '', amount: 5, dueAt: '2026-11-01T00:00:00Z' }).body, /Reply to this email/);
});
t('reminders: overdue by 2+ days only, polite level by lateness, most overdue first, one per customer', () => {
  const invs = [inv('a@x.lk', { dueAt: ago(1) }), inv('b@x.lk', { dueAt: ago(3) }), inv('c@x.lk', { dueAt: ago(25) }), inv('c@x.lk', { dueAt: ago(10) }), inv('d@x.lk', { dueAt: ago(-5) })];
  const p = planReminders({ invoices: invs, now, senderName: 'Sam', paymentInfo: 'Bank X' });
  assert.deepEqual(p.map((x) => x.invoice.email), ['c@x.lk', 'b@x.lk']);
  assert.equal(p[0].level, 3); assert.equal(p[1].level, 1);
  assert.match(p[1].draft.body, /\$80\.00/);
  assert.doesNotMatch(p.map((x) => x.draft.body).join('\n'), /legal|lawyer|court|collections agency/i);
});
t('reminders: never past the limit, never too often, never settled invoices', () => {
  const invs = [inv('a@x.lk', { dueAt: ago(9), reminders: MAX_AUTO_REMINDERS }), inv('b@x.lk', { dueAt: ago(9), lastReminderAt: ago(1) }), inv('c@x.lk', { dueAt: ago(9), status: 'paid' }), inv('d@x.lk', { dueAt: ago(9), status: 'void' }), inv('e@x.lk', { dueAt: ago(9), lastReminderAt: ago(4), reminders: 1 })];
  assert.deepEqual(planReminders({ invoices: invs, now }).map((x) => x.invoice.email), ['e@x.lk']);
});
console.log(`${n} billing-automation tests passed`);
