// Sales tools (Pass 209): pricing maths, a pitch built only from given figures, and agreements that leave the legal terms to a lawyer.
import assert from 'node:assert/strict';
import { priceQuote } from '../lib/pricing.js';
import { pitchOutline } from '../lib/pitch.js';
import { agreementDraft } from '../lib/agreement.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a quote is priced with discount, tax, deposit and balance, and bad input is refused', () => {
  const q = priceQuote({ unitPrice: 100, quantity: 3, discountPct: 10, taxPct: 20, depositPct: 50 });
  assert.equal(q.subtotal, 300);
  assert.equal(q.discountAmount, 30);
  assert.equal(q.total, 324);
  assert.equal(q.deposit, 162);
  assert.equal(q.balance, 162);
  assert.equal(q.perUnit, 108);
  assert.equal(priceQuote({ unitPrice: 0, quantity: 1 }).ok, false);
});

t('the pitch uses only the figures it was given, and marks everything else for the owner', () => {
  const p = pitchOutline({ businessName: 'Ann Clinic', offer: 'Booking system', measures: { won: 12, winRatePct: 40 } });
  assert.match(p, /# Ann Clinic/);
  assert.match(p, /Customers won in the last twelve months: 12/);
  assert.match(p, /\[WHO IS DOING THE WORK/);
  assert.doesNotMatch(p, /Value won/, 'no figure was given, so none is shown');
});

t('an agreement fills the parties, date and fee, leaves the legal terms to a lawyer, and says it is not advice', () => {
  const a = agreementDraft({ kind: 'service', seller: 'Ann Clinic', buyer: 'Bo Ltd', date: '2026-11-06', value: 1500, currency: 'usd', scope: 'Set up the booking system' });
  assert.equal(a.ok, true);
  assert.match(a.text, /Ann Clinic/);
  assert.match(a.text, /1500\.00 USD/);
  assert.match(a.text, /TO BE SET BY A LAWYER/);
  assert.match(a.text, /not legal advice/);
  assert.equal(agreementDraft({ kind: 'lease' }).ok, false);
});

console.log(`\n${n} passed`);
