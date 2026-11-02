// Charging sales in another currency (Pass 134): quotes, storefront orders and buy links. The rate is the owner's, fixed on the sale.
import assert from 'node:assert/strict';
import { chargeTerms, offeredCurrencies, quoteDisplay } from '../lib/currency.js';
import { quoteEmail, nudgeDraft } from '../lib/quote-core.js';
import { buildInvoiceWrite } from '../lib/billing.js';
import { planWonInvoices } from '../lib/billing-automation.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const biz = { currency: 'USD', fxDisplay: [{ code: 'EUR', rate: 0.92 }, { code: 'GBP', rate: 0.79 }] };

t('a sale in the business currency, or with no choice, is not converted', () => {
  assert.deepEqual(chargeTerms(biz, ''), { chargeCurrency: '', fxRate: 0 });
  assert.deepEqual(chargeTerms(biz, 'usd'), { chargeCurrency: '', fxRate: 0 });
});

t('a saved currency takes its rate from the owner\'s saved rates; an unsaved one is refused', () => {
  assert.deepEqual(chargeTerms(biz, 'eur'), { chargeCurrency: 'EUR', fxRate: 0.92 });
  assert.match(chargeTerms(biz, 'INR').error, /INR is not offered/);
  assert.match(chargeTerms({ currency: 'USD' }, 'EUR').error, /EUR is not offered/);
});

t('the customer is offered the business currency first, then the saved rates', () => {
  assert.deepEqual(offeredCurrencies(biz), [{ code: 'USD', rate: 1 }, { code: 'EUR', rate: 0.92 }, { code: 'GBP', rate: 0.79 }]);
});

const quote = { currency: 'USD', chargeCurrency: 'EUR', fxRate: 0.92, total: 120, subtotal: 100, tax: 20, taxPercent: 20, title: 'Website', customerName: 'Ann', lines: [{ description: 'Design', qty: 1, unitPrice: 100 }] };

t('a quote shows its amounts converted at its fixed rate, in the charge currency', () => {
  const d = quoteDisplay(quote);
  assert.equal(d.cur, 'EUR');
  assert.equal(d.conv(120), 110.4);
  assert.equal(d.conv(100), 92);
});

t('a quote with no charge currency keeps its amounts and currency as they are', () => {
  const plain = { currency: 'USD', total: 120, lines: [] };
  const d = quoteDisplay(plain);
  assert.equal(d.cur, 'USD');
  assert.equal(d.conv(120), 120);
});

t('the quote email states the converted lines, tax and total in the charge currency', () => {
  const e = quoteEmail({ quote, senderName: 'Shop' });
  assert.match(e.text, /- Design: EUR 92\.00/);
  assert.match(e.text, /Tax \(20%\): EUR 18\.40/);
  assert.match(e.text, /Total: EUR 110\.40/);
  assert.doesNotMatch(e.text, /USD/);
});

t('the follow-up note states the converted total', () => {
  const d = nudgeDraft({ quote });
  assert.match(d.text, /\(EUR 110\.40 in total\)/);
});

t('a milestone or buy-link invoice for a converted sale carries the charge at the fixed rate', () => {
  const r = buildInvoiceWrite({ uid: 'u', email: 'ann@example.com', amount: 100, taxRate: 20, chargeCurrency: 'EUR', fxRate: 0.92, now: new Date('2026-11-03T10:00:00Z') });
  assert.equal(r.ok, true);
  assert.equal(r.write.total, 120);
  assert.equal(r.write.chargeTotal, 110.4);
});

t('an automatic invoice for a won deal is charged in the deal\'s currency at the owner\'s fixed rate', () => {
  const now = Date.parse('2026-11-03T10:00:00Z');
  const deal = { email: 'ann@example.com', businessName: 'Ann Ltd', stage: 'closed_won', value: 100, valueIsEstimate: false, closedAt: new Date(now - 864e5).toISOString(), chargeCurrency: 'EUR' };
  const [p] = planWonInvoices({ uid: 'u', deals: [deal], invoices: [], now, settings: biz });
  assert.ok(p, 'an invoice is planned');
  assert.equal(p.write.chargeCurrency, 'EUR');
  assert.equal(p.write.chargeTotal, 92);
  assert.equal(p.write.amount, 100);
});

t('a won deal whose currency is no longer offered is not invoiced, never invoiced in the wrong currency', () => {
  const now = Date.parse('2026-11-03T10:00:00Z');
  const deal = { email: 'ann@example.com', businessName: 'Ann Ltd', stage: 'closed_won', value: 100, valueIsEstimate: false, closedAt: new Date(now - 864e5).toISOString(), chargeCurrency: 'INR' };
  assert.equal(planWonInvoices({ uid: 'u', deals: [deal], invoices: [], now, settings: biz }).length, 0);
});

t('a won deal with no charge currency is invoiced in the business currency as before', () => {
  const now = Date.parse('2026-11-03T10:00:00Z');
  const deal = { email: 'ann@example.com', businessName: 'Ann Ltd', stage: 'closed_won', value: 100, valueIsEstimate: false, closedAt: new Date(now - 864e5).toISOString() };
  const [p] = planWonInvoices({ uid: 'u', deals: [deal], invoices: [], now, settings: biz });
  assert.equal(p.write.chargeCurrency, undefined);
  assert.equal(p.write.amount, 100);
});

console.log(`\n${n} passed`);
