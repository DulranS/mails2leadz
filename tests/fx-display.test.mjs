// Approximate amounts in other currencies (Pass 132). Display only: the invoice, the payment and the books stay in the business currency.
import assert from 'node:assert/strict';
import { sanitizeFxDisplay, approxList, approxSentence, FX_DISPLAY_MAX } from '../lib/currency.js';
import { invoiceEmailText, planReminders, planOrderNudges } from '../lib/billing-automation.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000;

t('rates are parsed from text or objects; the business currency, repeats, bad rates and extras are dropped', () => {
  assert.deepEqual(sanitizeFxDisplay('EUR 0.92, gbp 0.79', 'USD'), [{ code: 'EUR', rate: 0.92 }, { code: 'GBP', rate: 0.79 }]);
  assert.deepEqual(sanitizeFxDisplay('USD 1, EUR 2, EUR 3, xyz 4, LKR -1, INR 0', 'USD'), [{ code: 'EUR', rate: 2 }]);
  assert.deepEqual(sanitizeFxDisplay([{ code: 'eur', rate: 0.5 }, { code: 'GBP', rate: 'abc' }], 'USD'), [{ code: 'EUR', rate: 0.5 }]);
  assert.deepEqual(sanitizeFxDisplay('', 'USD'), []);
  assert.deepEqual(sanitizeFxDisplay(undefined, 'USD'), []);
  const many = sanitizeFxDisplay('EUR 1, GBP 1, AUD 1, CAD 1, NZD 1, SGD 1, CHF 1', 'USD');
  assert.equal(many.length, FX_DISPLAY_MAX);
});

t('approximate amounts are rounded to cents and listed with their codes', () => {
  const fx = sanitizeFxDisplay('EUR 0.92, GBP 0.79', 'USD');
  assert.equal(approxList(100, fx), 'EUR 92.00 or GBP 79.00');
  assert.equal(approxList(33.335, [{ code: 'EUR', rate: 1 }]), 'EUR 33.34');
  assert.equal(approxList(100, []), '');
  assert.equal(approxList(100, undefined), '');
});

t('the sentence says the figures are indicative, when the rates were set, and that payment is in the business currency', () => {
  const s = approxSentence({ amount: 100, base: 'USD', fx: sanitizeFxDisplay('EUR 0.92', 'USD'), asOf: '2026-11-03T10:00:00.000Z' });
  assert.match(s, /^About EUR 92\.00 at the business's own indicative rates \(rates set on 2026-11-03\)\./);
  assert.match(s, /Payment is in USD only/);
  assert.equal(approxSentence({ amount: 100, base: 'USD', fx: [] }), '');
  assert.doesNotMatch(approxSentence({ amount: 100, base: 'USD', fx: sanitizeFxDisplay('EUR 0.92', 'USD') }), /rates set on/);
});

t('the invoice email carries the approximate sentence only when one is given', () => {
  const due = new Date(Date.now() + 14 * DAY).toISOString();
  const base = { name: 'Ann', amount: 100, currency: 'USD', dueAt: due, note: 'Design', senderName: 'Shop', total: 100 };
  const withRates = invoiceEmailText({ ...base, approx: 'About EUR 92.00 at the business\'s own indicative rates.' });
  assert.match(withRates.body, /About EUR 92\.00/);
  assert.ok(withRates.body.indexOf('About EUR') < withRates.body.indexOf('How to pay') || withRates.body.indexOf('Reply to this email') > withRates.body.indexOf('About EUR'));
  const without = invoiceEmailText(base);
  assert.doesNotMatch(without.body, /indicative/);
});

const overdue = { id: 'i1', email: 'buyer@example.com', businessName: 'Buyer Co', number: 'INV-1', status: 'open', amount: 100, total: 100, amountPaid: 0, reminders: 0, lastReminderAt: null, issuedAt: new Date(Date.now() - 40 * DAY).toISOString(), dueAt: new Date(Date.now() - 30 * DAY).toISOString() };

t('overdue reminders show the approximate amount next to the owed amount, and nothing extra without rates', () => {
  const fx = sanitizeFxDisplay('EUR 0.92', 'USD');
  const [r] = planReminders({ invoices: [overdue], now: Date.now(), currency: 'USD', senderName: 'Shop', fx });
  assert.ok(r, 'a reminder is planned');
  assert.match(r.draft.body, /\$100\.00 \(about EUR 92\.00, indicative\)/);
  const [plain] = planReminders({ invoices: [overdue], now: Date.now(), currency: 'USD', senderName: 'Shop' });
  assert.doesNotMatch(plain.draft.body, /indicative/);
});

t('storefront order nudges carry the approximate amount when rates are saved', () => {
  const order = { ...overdue, id: 'o1', source: 'storefront', status: 'open', createdAt: new Date(Date.now() - 2 * DAY).toISOString(), issuedAt: new Date(Date.now() - 2 * DAY).toISOString(), dueAt: new Date(Date.now() + 10 * DAY).toISOString(), number: 'INV-9' };
  const [o] = planOrderNudges({ invoices: [order], now: Date.now(), currency: 'USD', senderName: 'Shop', fx: sanitizeFxDisplay('GBP 0.79', 'USD') });
  assert.ok(o, 'a nudge is planned');
  assert.match(o.draft.body, /\$100\.00 \(about GBP 79\.00, indicative\)/);
});

console.log(`\n${n} passed`);
