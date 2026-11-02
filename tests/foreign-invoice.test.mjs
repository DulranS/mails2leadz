// Foreign-currency invoices (Pass 133). The books stay in the business currency; the customer is charged in the invoice's
// currency at the rate fixed when it was issued. Covers: the invoice terms, the balance in the charge currency, the Stripe
// checkout amount, the webhook conversion back to the books, and the card refund in the charge currency.
import assert from 'node:assert/strict';
import { buildInvoiceWrite, foreignTerms, isForeignInvoice, foreignOwed, baseFromCharge, balanceOf } from '../lib/billing.js';
import { createInvoiceCheckout, paymentPatchFromSession } from '../lib/server/payments.js';
import { planCardRefund } from '../lib/returns.js';
import { ledgerCsv } from '../lib/accounting-export.js';
import { fixedRateSentence } from '../lib/currency.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const now = new Date('2026-11-03T10:00:00Z');

t('a foreign invoice stores its charge currency, the rate fixed at issue, and the charge total (tax included)', () => {
  const r = buildInvoiceWrite({ uid: 'u', email: 'buyer@example.com', businessName: 'Buyer', amount: 100, taxRate: 20, chargeCurrency: 'eur', fxRate: 0.92, now });
  assert.equal(r.ok, true);
  assert.equal(r.write.total, 120); // the books: 100 + 20% tax
  assert.equal(r.write.chargeCurrency, 'EUR');
  assert.equal(r.write.fxRate, 0.92);
  assert.equal(r.write.chargeTotal, 110.4); // 120 * 0.92
  assert.equal(r.write.fxRateAt, now.toISOString());
  assert.equal(isForeignInvoice(r.write), true);
});

t('an invoice without a charge currency is unchanged and not foreign', () => {
  const r = buildInvoiceWrite({ uid: 'u', email: 'buyer@example.com', amount: 50, now });
  assert.equal(r.write.chargeCurrency, undefined);
  assert.equal(isForeignInvoice(r.write), false);
  assert.equal(foreignTerms({ total: 50, chargeCurrency: '', fxRate: 0 }).fields.chargeTotal, undefined);
});

t('a foreign charge needs a valid code and a saved rate; a bad code or rate is refused', () => {
  assert.match(foreignTerms({ total: 10, chargeCurrency: 'EUR', fxRate: 0 }).error, /Add a rate for EUR/);
  assert.match(foreignTerms({ total: 10, chargeCurrency: 'EU1', fxRate: 1 }).error, /Pick a currency/);
  assert.match(foreignTerms({ total: 10, chargeCurrency: 'EUR', fxRate: -2 }).error, /Add a rate for EUR/);
  const bad = buildInvoiceWrite({ uid: 'u', email: 'buyer@example.com', amount: 10, chargeCurrency: 'GBP', fxRate: 0, now });
  assert.equal(bad.ok, false);
});

const foreignInv = { ...buildInvoiceWrite({ uid: 'u', email: 'buyer@example.com', businessName: 'Buyer', amount: 100, taxRate: 20, chargeCurrency: 'EUR', fxRate: 0.92, number: 'INV-7', now }).write, id: 'inv1', status: 'open', amountPaid: 0, paidAt: null, reminders: 0, lastReminderAt: null, dueAt: new Date(now.getTime() + 14 * 864e5).toISOString() };

t('what is still owed is stated in the charge currency at the fixed rate', () => {
  assert.equal(foreignOwed(foreignInv), 110.4);
  assert.equal(balanceOf(foreignInv), 120);
});

t('settling exactly what was charged records the whole business-currency balance (no rounding residue)', () => {
  assert.equal(baseFromCharge(foreignInv, 110.4), 120);
  assert.equal(baseFromCharge(foreignInv, 110.401), 120); // within a cent
  assert.equal(baseFromCharge(foreignInv, 55.2), 60); // a half charge converts at the fixed rate
});

t('Stripe checkout charges the foreign balance in the charge currency, not the business currency', async () => {
  let seen = null;
  const stripe = { checkout: { sessions: { create: async (args) => { seen = args; return { url: 'https://checkout.test' }; } } } };
  await createInvoiceCheckout({ stripe, uid: 'u', invoiceId: 'inv1', invoice: foreignInv, currency: 'USD', origin: 'https://app.test' });
  assert.equal(seen.line_items[0].price_data.currency, 'eur');
  assert.equal(seen.line_items[0].price_data.unit_amount, 11040);
  assert.equal(seen.metadata.invoiceId, 'inv1');
});

t('a completed foreign payment settles the books in the business currency and keeps the charge for refunds', () => {
  const session = { id: 'cs_1', payment_status: 'paid', currency: 'eur', amount_total: 11040, payment_intent: 'pi_test12345678' };
  const r = paymentPatchFromSession({ invoice: foreignInv, session, now });
  assert.equal(r.ok, true);
  assert.equal(r.baseAmount, 120);
  assert.equal(r.patch.status, 'paid');
  assert.equal(r.patch.amountPaid, 120);
  const entry = r.patch.onlinePaymentIntents[0];
  assert.equal(entry.amount, 120);
  assert.equal(entry.chargeAmount, 110.4);
  assert.equal(entry.chargeCurrency, 'EUR');
});

t('a payment in the wrong currency is flagged for review, not booked', () => {
  const session = { id: 'cs_2', payment_status: 'paid', currency: 'usd', amount_total: 12000, payment_intent: 'pi_test12345679' };
  const r = paymentPatchFromSession({ invoice: foreignInv, session, now });
  assert.equal(r.ok, false);
  assert.equal(r.review, true);
});

t('a resent foreign payment event is recognised as a duplicate', () => {
  const session = { id: 'cs_1', payment_status: 'paid', currency: 'eur', amount_total: 11040, payment_intent: 'pi_test12345678' };
  const r = paymentPatchFromSession({ invoice: { ...foreignInv, onlinePaymentIds: ['cs_1'] }, session, now });
  assert.equal(r.duplicate, true);
});

t('a card refund of a foreign payment is sent to Stripe in the charge currency, and the books record the business amount', () => {
  const inv = { ...foreignInv, amountPaid: 120, status: 'paid', returnRefundDue: 60, onlinePaymentIntents: [{ session: 'cs_1', intent: 'pi_test12345678', amount: 120, refunded: 0 }] };
  const p = planCardRefund({ invoice: inv, amount: 60 });
  assert.equal(p.ok, true);
  assert.equal(p.cents, 6000);
  assert.equal(p.chargeCents, 5520); // 60 * 0.92 in euro cents
});

t('a domestic card refund is unchanged', () => {
  const inv = { amountPaid: 120, status: 'paid', returnRefundDue: 60, onlinePaymentIntents: [{ session: 'cs_1', intent: 'pi_test12345678', amount: 120, refunded: 0 }] };
  const p = planCardRefund({ invoice: inv, amount: 60 });
  assert.equal(p.cents, 6000);
  assert.equal(p.chargeCents, 6000);
});

t('the ledger keeps business-currency totals and shows the charge beside a foreign invoice', () => {
  const csv = ledgerCsv([foreignInv], []);
  const [header, row] = csv.trim().split('\r\n');
  assert.match(header, /Charged currency,Charged total$/);
  assert.match(row, /,120,/); // Total in business currency
  assert.match(row, /,EUR,110\.4$/);
});

t('the fixed-rate sentence says what was fixed and when, and that the bank may convert', () => {
  const s = fixedRateSentence({ base: 'USD', charge: 'EUR', rate: 0.92, asOf: '2026-11-03T10:00:00Z' });
  assert.match(s, /includes any tax and was fixed on 2026-11-03 at 1 USD = 0\.92 EUR/);
  assert.match(s, /bank may add its own conversion charge/);
});

console.log(`\n${n} passed`);
