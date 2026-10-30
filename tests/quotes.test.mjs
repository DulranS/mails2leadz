import assert from 'node:assert/strict';
import { dealForAcceptedQuote, quoteBoard, nudgeDraft, quoteFollowUpDigest, invoiceForQuote, quoteSendPlan } from '../lib/quotes.js';
import { planWonInvoices } from '../lib/billing-automation.js';
import { sanitizeQuote, quoteState, respondToQuote, signQuoteToken, verifyQuoteToken, quoteLink, quoteEmail, quoteMailto } from '../lib/quotes.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.UTC(2026, 9, 31, 12);
const KEY = 'test-secret-key';
const good = (o = {}) => ({ title: 'Website care plan', email: 'Client@Example.com', customerName: 'Nimal', currency: 'lkr', lines: [{ description: 'Monthly care', qty: 1, unitPrice: 15000 }, { description: 'Extra hours', qty: 2.5, unitPrice: 800 }], taxPercent: 0, validUntil: '2026-11-30', terms: 'Payment within 7 days.', ...o });

t('a valid quote is saved with computed totals and a lowercase email', () => {
  const r = sanitizeQuote(good());
  assert.ok(r.quote, r.error);
  assert.equal(r.quote.customerEmail, 'client@example.com');
  assert.equal(r.quote.currency, 'LKR');
  assert.equal(r.quote.subtotal, 17000);
  assert.equal(r.quote.tax, 0);
  assert.equal(r.quote.total, 17000);
  assert.equal(r.quote.status, 'open');
});

t('tax is applied on top of the subtotal and rounded to cents', () => {
  const r = sanitizeQuote(good({ taxPercent: 8, lines: [{ description: 'Item', qty: 1, unitPrice: 10.01 }] }));
  assert.equal(r.quote.subtotal, 10.01);
  assert.equal(r.quote.tax, 0.8);
  assert.equal(r.quote.total, 10.81);
});

t('blank rows are ignored; a row with a price but no description is refused', () => {
  const ok = sanitizeQuote(good({ lines: [{ description: '', unitPrice: '' }, { description: 'Set-up', unitPrice: 500 }] }));
  assert.ok(ok.quote, ok.error);
  assert.equal(ok.quote.lines.length, 1);
  assert.match(sanitizeQuote(good({ lines: [{ description: '', unitPrice: 500 }] })).error, /description/);
});

t('bad input is refused with a reason, not saved', () => {
  assert.match(sanitizeQuote(good({ title: '  ' })).error, /title/);
  assert.match(sanitizeQuote(good({ email: 'not-an-email' })).error, /email/);
  assert.match(sanitizeQuote(good({ lines: [] })).error, /at least one line/);
  assert.match(sanitizeQuote(good({ lines: [{ description: 'x', unitPrice: -5 }] })).error, /price/);
  assert.match(sanitizeQuote(good({ lines: [{ description: 'x', unitPrice: 'abc' }] })).error, /price/);
  assert.match(sanitizeQuote(good({ lines: [{ description: 'x', qty: 0, unitPrice: 5 }] })).error, /quantity/);
  assert.match(sanitizeQuote(good({ taxPercent: 150 })).error, /Tax/);
  assert.equal(sanitizeQuote(null).error, 'Nothing to save.');
});

t('an invalid currency code is dropped rather than shown', () => {
  assert.equal(sanitizeQuote(good({ currency: 'RUPEES!' })).quote.currency, '');
});

t('quote state: open, expired after the valid-until day, accepted and declined', () => {
  const q = sanitizeQuote(good({ validUntil: '2026-10-30' })).quote;
  assert.equal(quoteState(q, NOW), 'expired');
  assert.equal(quoteState({ ...q, validUntil: '2026-11-30' }, NOW), 'open');
  assert.equal(quoteState({ ...q, validUntil: '', status: 'accepted' }, NOW), 'accepted');
  assert.equal(quoteState({ ...q, validUntil: '', status: 'declined' }, NOW), 'declined');
  assert.equal(quoteState(null, NOW), 'missing');
});

t('the customer can accept an open quote once, and the answer is recorded', () => {
  const q = sanitizeQuote(good()).quote;
  const r = respondToQuote(q, 'accept', { now: NOW, name: '  Nimal <b>  ' });
  assert.equal(r.patch.status, 'accepted');
  assert.equal(r.patch.acceptedBy, 'Nimal <b>');
  assert.equal(r.patch.acceptedAt, new Date(NOW).toISOString());
  const again = respondToQuote({ ...q, ...r.patch }, 'accept', { now: NOW });
  assert.equal(again.code, 'ACCEPTED');
  assert.equal(respondToQuote({ ...q, ...r.patch }, 'decline', { now: NOW }).code, 'ACCEPTED');
});

t('a declined quote can be recorded as declined; expired and unknown actions are refused', () => {
  const q = sanitizeQuote(good()).quote;
  assert.equal(respondToQuote(q, 'decline', { now: NOW }).patch.status, 'declined');
  assert.equal(respondToQuote(q, 'maybe', { now: NOW }).code, 'BAD_ACTION');
  assert.equal(respondToQuote({ ...q, validUntil: '2026-10-01' }, 'accept', { now: NOW }).code, 'EXPIRED');
});

t('the signed token round-trips and rejects tampering, a different key and garbage', () => {
  const tok = signQuoteToken('user1', 'quote9', KEY);
  assert.deepEqual(verifyQuoteToken(tok, KEY), { uid: 'user1', id: 'quote9' });
  const [p, s] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'user2', q: 'quote9' })).toString('base64url');
  assert.equal(verifyQuoteToken(`${forged}.${s}`, KEY), null);
  assert.equal(verifyQuoteToken(tok, 'other-key'), null);
  assert.equal(verifyQuoteToken(`${p}.${s}.extra`, KEY), null);
  assert.equal(verifyQuoteToken('nonsense', KEY), null);
  assert.equal(verifyQuoteToken(undefined, KEY), null);
  assert.equal(signQuoteToken('', 'q', KEY), null);
});

t('the accept link needs a signing key and a public address; https in production', () => {
  assert.equal(quoteLink('u', 'q', { base: '', key: KEY, production: true }), null);
  assert.equal(quoteLink('u', 'q', { base: 'https://app.example.com/', key: '', production: true }), null);
  assert.equal(quoteLink('u', 'q', { base: 'http://app.example.com', key: KEY, production: true }), null);
  assert.equal(quoteLink('u', 'q', { base: 'http://localhost:3000', key: KEY, production: false }).startsWith('http://localhost:3000/api/quote?t='), true);
  const link = quoteLink('u', 'q', { base: 'https://app.example.com', key: KEY, production: true });
  assert.match(link, /^https:\/\/app\.example\.com\/api\/quote\?t=/);
  assert.deepEqual(verifyQuoteToken(decodeURIComponent(link.split('t=')[1]), KEY), { uid: 'u', id: 'q' });
});

t('the email states only the quote numbers and includes the accept link', () => {
  const q = { ...sanitizeQuote(good({ taxPercent: 0 })).quote, id: 'q1' };
  const e = quoteEmail({ quote: q, senderName: 'Hato', acceptUrl: 'https://app.example.com/api/quote?t=abc' });
  assert.equal(e.subject, 'Quote: Website care plan');
  assert.match(e.text, /Total: LKR 17000\.00/);
  assert.match(e.text, /Extra hours \(x2\.5\): LKR 2000\.00/);
  assert.match(e.text, /valid until 2026-11-30/);
  assert.match(e.text, /https:\/\/app\.example\.com\/api\/quote\?t=abc/);
  assert.doesNotMatch(e.text, /Tax \(/);
  const withTax = quoteEmail({ quote: sanitizeQuote(good({ taxPercent: 10 })).quote, senderName: 'Hato' });
  assert.match(withTax.text, /Tax \(10%\): LKR 1700\.00/);
  assert.doesNotMatch(withTax.text, /To accept/);
});

t('the mailto link opens the owner mail app with the subject and body filled in', () => {
  const q = sanitizeQuote(good()).quote;
  const e = quoteEmail({ quote: q, senderName: 'Hato' });
  const m = quoteMailto(q, e);
  assert.ok(m.startsWith('mailto:client%40example.com?subject='));
  assert.equal(decodeURIComponent(m.split('body=')[1]), e.text);
});

t('an accepted quote moves its deal to won at the net price, with the owner\'s uid and a close date', () => {
  const q = { ...sanitizeQuote(good({ taxPercent: 10 })).quote, customerEmail: 'client@example.com' };
  const w = dealForAcceptedQuote({ uid: 'u1', quote: q, now: NOW });
  assert.equal(w.stage, 'closed_won');
  assert.equal(w.value, 17000); // net: the invoice adds the account's own tax
  assert.equal(w.valueIsEstimate, false);
  assert.equal(w.userId, 'u1');
  assert.equal(w.email, 'client@example.com');
  assert.equal(w.closedAt, new Date(NOW).toISOString());
});

t('an existing deal is won without touching its source; a second acceptance does not re-win it', () => {
  const q = { ...sanitizeQuote(good()).quote, customerEmail: 'client@example.com' };
  const existing = { stage: 'proposal', source: 'inbound', businessName: 'Kandy Dental', closedAt: null };
  const w = dealForAcceptedQuote({ uid: 'u1', quote: q, existing, now: NOW });
  assert.equal(w.stage, 'closed_won');
  assert.equal(w.source, undefined); // source is only set on new deals; the merge keeps the existing one
  assert.equal(w.businessName, 'Kandy Dental');
  assert.equal(dealForAcceptedQuote({ uid: 'u1', quote: q, existing: { stage: 'closed_won', closedAt: new Date(NOW).toISOString() }, now: NOW }), null);
});

t('the accepted deal is picked up by the existing won-invoice routine exactly once, for the net price', () => {
  const q = { ...sanitizeQuote(good({ taxPercent: 10 })).quote, customerEmail: 'client@example.com' };
  const w = dealForAcceptedQuote({ uid: 'u1', quote: q, now: NOW });
  const plan = planWonInvoices({ uid: 'u1', deals: [w], invoices: [], now: NOW + 1000 });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].write.amount, 17000);
  // once the invoice exists for that deal, the routine must not invoice it again
  const again = planWonInvoices({ uid: 'u1', deals: [w], invoices: plan.map((p) => p.write), now: NOW + 1000 });
  assert.equal(again.length, 0);
});

const DAYS = (d) => new Date(NOW - d * 864e5).toISOString();
const base = (o) => ({ id: o.id || 'q', title: 'Care plan', customerEmail: 'c@example.com', total: 100, currency: 'LKR', lines: [{ description: 'x', qty: 1, unitPrice: 100 }], validUntil: '', ...o });

t('the board sorts each quote into what needs the owner, most urgent first', () => {
  const b = quoteBoard({ now: NOW, quotes: [
    base({ id: 'draft' }),
    base({ id: 'fresh', sentAt: DAYS(1) }),
    base({ id: 'stale', sentAt: DAYS(5) }),
    base({ id: 'expiring', sentAt: DAYS(1), validUntil: '2026-11-02' }),
    base({ id: 'won', status: 'accepted', acceptedAt: DAYS(0) }),
    base({ id: 'no', status: 'declined' }),
    base({ id: 'old', sentAt: DAYS(40), validUntil: '2026-09-01' }),
    base({ id: 'gone', status: 'withdrawn' }),
  ] });
  assert.deepEqual(b.draft.map((q) => q.id), ['draft']);
  assert.deepEqual(b.waiting.map((q) => q.id), ['fresh']);
  assert.deepEqual(b.followUp.map((q) => q.id), ['expiring', 'stale']);
  assert.equal(b.followUp[0].reason, 'expiring');
  assert.equal(b.followUp[1].reason, 'no answer');
  assert.deepEqual(b.accepted.map((q) => q.id), ['won']);
  assert.deepEqual(b.declined.map((q) => q.id), ['no']);
  assert.deepEqual(b.expired.map((q) => q.id), ['old']);
  assert.deepEqual(b.withdrawn.map((q) => q.id), ['gone']);
  assert.equal(b.counts.followUp, 2);
});

t('a follow-up sent restarts the no-answer clock, so the quote leaves the follow-up list', () => {
  const quote = base({ id: 'q', sentAt: DAYS(6), lastFollowUpAt: DAYS(1) });
  const b = quoteBoard({ now: NOW, quotes: [quote] });
  assert.equal(b.followUp.length, 0);
  assert.equal(b.waiting.length, 1);
});

t('a withdrawn quote cannot be accepted, and the customer is told why', () => {
  const q = base({ status: 'withdrawn' });
  assert.equal(quoteState(q, NOW), 'withdrawn');
  const r = respondToQuote(q, 'accept', { now: NOW });
  assert.equal(r.code, 'WITHDRAWN');
  assert.match(r.error, /withdrawn/);
});

t('the follow-up draft uses only the quote numbers and carries the accept link', () => {
  const q = { ...sanitizeQuote(good({ taxPercent: 10 })).quote };
  const d = nudgeDraft({ quote: q, senderName: 'Hato', acceptUrl: 'https://app.example.com/api/quote?t=abc' });
  assert.equal(d.subject, 'Re: Quote: Website care plan');
  assert.match(d.text, /17000\.00 in total|LKR 18700\.00 in total/);
  assert.match(d.text, /https:\/\/app\.example\.com\/api\/quote\?t=abc/);
  assert.match(d.text, /valid until 2026-11-30/);
  assert.doesNotMatch(d.text, /undefined|NaN/);
});

t('the owner digest lists quotes needing a follow-up, and stays silent when none do', () => {
  const quiet = quoteBoard({ now: NOW, quotes: [base({ id: 'a', sentAt: DAYS(1) })] });
  assert.equal(quoteFollowUpDigest({ board: quiet }), null);
  const due = quoteBoard({ now: NOW, quotes: [base({ id: 'a', title: 'Care plan', customerName: 'Nimal', sentAt: DAYS(5) }), base({ id: 'b', sentAt: DAYS(1), validUntil: '2026-11-02' })] });
  const d = quoteFollowUpDigest({ board: due, senderName: 'Hato' });
  assert.equal(d.subject, 'Quotes to follow up: 2');
  assert.match(d.text, /Nothing has been sent to any customer/);
  assert.match(d.text, /Care plan for Nimal: no answer for 5 days/);
  assert.match(d.text, /expires in 2 days/);
});

t('an accepted quote is matched to its invoice by customer, net amount and date; other invoices are ignored', () => {
  const q = { ...base({ id: 'q', status: 'accepted', acceptedAt: DAYS(2), subtotal: 17000, total: 18700, customerEmail: 'c@example.com' }) };
  assert.equal(invoiceForQuote(q, []), null);
  const other = { email: 'c@example.com', amount: 500, issuedAt: DAYS(1), status: 'open' };
  const older = { email: 'c@example.com', amount: 17000, issuedAt: DAYS(30), status: 'open' };
  assert.equal(invoiceForQuote(q, [other, older]), null);
  const made = { email: 'C@example.com', amount: 17000, issuedAt: DAYS(1), status: 'open' };
  assert.equal(invoiceForQuote(q, [older, made]).status, 'created');
  assert.equal(invoiceForQuote(q, [{ ...made, emailedAt: DAYS(1) }]).status, 'emailed');
  assert.equal(invoiceForQuote(q, [{ ...made, status: 'paid' }]).status, 'paid');
  assert.equal(invoiceForQuote(base({ id: 'o' }), [made]), null); // not accepted: no invoice to show
});

t('a quote is sent once, a follow-up only after it was sent, and never without its accept link or after an answer', () => {
  const link = 'https://app.example.com/api/quote?t=x';
  const fresh = base({ id: 'a', acceptUrl: link });
  assert.deepEqual(quoteSendPlan({ quote: fresh, kind: 'quote', now: NOW }), { ok: true });
  assert.match(quoteSendPlan({ quote: fresh, kind: 'followup', now: NOW }).error, /Send the quote before/);
  const sent = { ...fresh, sentAt: DAYS(4) };
  assert.match(quoteSendPlan({ quote: sent, kind: 'quote', now: NOW }).error, /already sent/);
  assert.deepEqual(quoteSendPlan({ quote: sent, kind: 'followup', now: NOW }), { ok: true });
  assert.match(quoteSendPlan({ quote: { ...fresh, acceptUrl: '' }, kind: 'quote', now: NOW }).error, /accept link is missing/);
  assert.match(quoteSendPlan({ quote: { ...sent, status: 'accepted' }, kind: 'followup', now: NOW }).error, /accepted/);
  assert.match(quoteSendPlan({ quote: fresh, kind: 'blast', now: NOW }).error, /Choose/);
});

t('a quote the customer has answered is shown as needing a reply, and gets no reminder', () => {
  const b = quoteBoard({ now: NOW, quotes: [base({ id: 'r', sentAt: DAYS(6), customerRepliedAt: DAYS(1) })] });
  assert.equal(b.followUp.length, 0);
  assert.deepEqual(b.replied.map((q) => q.id), ['r']);
  assert.equal(b.counts.replied, 1);
});

t('a reply marked handled goes back to waiting: no reminder, and no second reply flag from the same message', () => {
  const b = quoteBoard({ now: NOW, quotes: [base({ id: 'h', sentAt: DAYS(6), customerRepliedAt: DAYS(2), repliedHandledAt: DAYS(1) })] });
  assert.equal(b.replied.length, 0);
  assert.equal(b.followUp.length, 0);
  assert.deepEqual(b.waiting.map((q) => q.id), ['h']);
});

console.log(`quotes: ${n} passed`);
