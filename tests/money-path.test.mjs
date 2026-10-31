// End-to-end check of the money path, in memory: quote -> accept -> deal -> invoices -> payments.
// It runs the same functions the routes call, in the same order, and carries the state from one step to the next.
// It does NOT run the HTTP routes or the Firestore calls: those are covered by the build and by the live run.
import assert from 'node:assert/strict';
import { sanitizeQuote, respondToQuote, dealForAcceptedQuote, milestonesFor, nextMilestoneIndex, supersedeMilestones, quoteState } from '../lib/quote-core.js';
import { buildInvoiceWrite, invoiceBase, paidSoFar } from '../lib/billing.js';
import { planWonInvoices } from '../lib/billing-automation.js';
import { paymentPatchFromSession, amountOwedOnline } from '../lib/server/payments.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.UTC(2026, 9, 31, 12);
const STRIPE = (amountMajor, id) => ({ id, payment_status: 'paid', amount_total: Math.round(amountMajor * 100) });

// A tiny in-memory store: invoices are added with an id, as addDoc would.
function store() {
  const invoices = [];
  let seq = 0;
  return {
    invoices,
    addInvoice(write) { const id = `inv-${++seq}`; const row = { id, ...write }; invoices.push(row); return row; },
    update(id, patch) { const row = invoices.find((i) => i.id === id); Object.assign(row, patch); return row; },
    get(id) { return invoices.find((i) => i.id === id); },
  };
}

const quoteInput = (extra = {}) => ({
  title: 'Website care plan', email: 'Client@Example.com', customerName: 'Nimal',
  lines: [{ description: 'Build', qty: 1, unitPrice: 1000 }], taxPercent: 0, validUntil: '2026-11-30', ...extra,
});

t('a plain quote: accepted, one deal won at the net price, one invoice, paid in full through the payment webhook, and a repeated event changes nothing', () => {
  const db = store();
  const made = sanitizeQuote(quoteInput());
  assert.ok(made.quote, made.error);
  const quote = { ...made.quote, id: 'q1' };
  assert.equal(quoteState(quote, NOW), 'open');

  // the customer accepts
  const accepted = respondToQuote(quote, 'accept', { now: NOW, name: 'Nimal' });
  assert.equal(accepted.patch.status, 'accepted');
  const acceptedQuote = { ...quote, ...accepted.patch };

  // the deal is won at the net price, and the nightly routine invoices it
  const deal = dealForAcceptedQuote({ uid: 'u1', quote: acceptedQuote, now: NOW });
  assert.equal(deal.stage, 'closed_won');
  assert.equal(deal.value, 1000);
  const plans = planWonInvoices({ uid: 'u1', deals: [{ ...deal, userId: 'u1' }], invoices: [], now: NOW + 1000, termsDays: 14, taxRate: 0 });
  assert.equal(plans.length, 1);
  const inv = db.addInvoice({ ...plans[0].write, number: 'INV-0001' });
  assert.equal(inv.total, 1000);

  // the customer pays by card, and Stripe sends the completed session
  const owed = amountOwedOnline(inv);
  assert.equal(owed, 1000);
  const first = paymentPatchFromSession({ invoice: inv, session: STRIPE(owed, 'cs_1'), now: new Date(NOW) });
  assert.equal(first.ok, true);
  db.update(inv.id, first.patch);
  assert.equal(db.get(inv.id).status, 'paid');
  assert.equal(paidSoFar(db.get(inv.id)), 1000);

  // Stripe sends the same event again: nothing changes
  const again = paymentPatchFromSession({ invoice: db.get(inv.id), session: STRIPE(owed, 'cs_1'), now: new Date(NOW) });
  assert.equal(again.duplicate, true);
  assert.equal(db.invoices.length, 1);
});

t('a payment schedule: the deposit is invoiced on acceptance, the nightly routine skips the deal, the deposit is paid in part, and the completion is held back until released', () => {
  const db = store();
  const made = sanitizeQuote(quoteInput({ taxPercent: 10, schedule: 'Deposit:30, Completion:70' }));
  assert.ok(made.quote, made.error);
  const quote = { ...made.quote, id: 'q2' };
  const accepted = respondToQuote(quote, 'accept', { now: NOW, name: 'Nimal' });
  const acceptedQuote = { ...quote, ...accepted.patch };

  const deal = dealForAcceptedQuote({ uid: 'u1', quote: acceptedQuote, now: NOW });
  assert.equal(deal.billingSchedule, true);
  assert.equal(planWonInvoices({ uid: 'u1', deals: [{ ...deal, userId: 'u1' }], invoices: [], now: NOW + 1000, termsDays: 14, taxRate: 10 }).length, 0, 'no full-amount invoice');

  // acceptance invoices the deposit: 30% of the net price, plus the account's tax
  const milestones = milestonesFor(acceptedQuote);
  assert.deepEqual(milestones.map((m) => m.amount), [300, 700]);
  const built = buildInvoiceWrite({ uid: 'u1', email: acceptedQuote.customerEmail, businessName: 'Nimal', amount: milestones[0].amount, termsDays: 14, taxRate: 10, note: 'Deposit', now: new Date(NOW) });
  assert.equal(built.ok, true);
  const deposit = db.addInvoice(built.write);
  assert.equal(invoiceBase(deposit), 330);

  // the customer pays half the deposit by card
  const half = paymentPatchFromSession({ invoice: deposit, session: STRIPE(165, 'cs_d1'), now: new Date(NOW) });
  db.update(deposit.id, half.patch);
  assert.equal(db.get(deposit.id).status, 'partial');
  assert.equal(amountOwedOnline(db.get(deposit.id)), 165);

  // the rest of the deposit is paid
  const rest = paymentPatchFromSession({ invoice: db.get(deposit.id), session: STRIPE(165, 'cs_d2'), now: new Date(NOW) });
  db.update(deposit.id, rest.patch);
  assert.equal(db.get(deposit.id).status, 'paid');

  // the completion milestone is not invoiced until the owner releases it, in order
  const after = milestones.map((m, i) => (i === 0 ? { ...m, invoiceId: deposit.id } : m));
  assert.equal(nextMilestoneIndex(after), 1);
});

t('a payment that does not fit the balance is refused for review, and never forced through', () => {
  const db = store();
  const inv = db.addInvoice(buildInvoiceWrite({ uid: 'u1', email: 'c@example.com', amount: 100, termsDays: 14, taxRate: 0, now: new Date(NOW) }).write);
  const over = paymentPatchFromSession({ invoice: inv, session: STRIPE(250, 'cs_over'), now: new Date(NOW) });
  assert.equal(over.ok, false);
  assert.equal(over.review, true);
  assert.equal(db.get(inv.id).status, 'open', 'nothing applied');
});

t('a revision accepted after the deposit: the deposit stays billed, and the uninvoiced completion is replaced', () => {
  const milestones = [
    { index: 0, label: 'Deposit', percent: 30, amount: 300, invoiceId: 'inv-1' },
    { index: 1, label: 'Completion', percent: 70, amount: 700, invoiceId: null },
  ];
  const after = supersedeMilestones(milestones);
  assert.equal(after[0].invoiceId, 'inv-1', 'deposit still billed');
  assert.equal(after[1].superseded, true, 'completion replaced');
  assert.equal(nextMilestoneIndex(after), -1, 'nothing left to invoice from the old quote');
});

console.log(`money-path: ${n} passed`);
