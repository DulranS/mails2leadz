// Pass 348: the software referral programme. A partner brings a company; the partner earns a share of that company's subscription for
// a fixed number of months; refunds and disputes claw it back in proportion; the owner records each payment to the partner.
// Pure rules are tested directly. The wiring (webhook, routes, rules) is checked against the source, since the server needs Firestore.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  partnerTerms, newReferralCode, normalizeCode, sanitizePartner, accrualFor, clawbackFor, payoutFor, partnerBalances, statementFor,
  ledgerActionFor, DEFAULT_TERMS, statementToken, checkStatementToken, statementHtml,
} from '../lib/software-partners.js';
import { priceMapFromEnv } from '../lib/billing-saas.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const PARTNER = { code: 'ABCDEFGH', status: 'active', name: 'Acme Partner', email: 'p@example.com' };
const TENANT = { userId: 'u1', referredBy: 'ABCDEFGH' };
const INVOICE = { id: 'in_1', amountPaid: 10000, currency: 'usd', paidAt: '2026-11-01T00:00:00.000Z' };

t('the default terms are 20% for 12 months, paid out at 50.00 or more', () => {
  assert.deepEqual(DEFAULT_TERMS, { pct: 20, months: 12, minPayoutMinor: 5000 });
  assert.deepEqual(partnerTerms(''), DEFAULT_TERMS);
});

t('terms from the environment are kept inside safe limits', () => {
  assert.deepEqual(partnerTerms('{"pct":90,"months":500,"minPayoutMinor":-4}'), { pct: 50, months: 60, minPayoutMinor: 0 });
  assert.deepEqual(partnerTerms('{"pct":15,"months":24,"minPayoutMinor":10000}'), { pct: 15, months: 24, minPayoutMinor: 10000 });
  assert.deepEqual(partnerTerms('not json'), DEFAULT_TERMS);
});

t('a new code is eight characters from the look-alike-free set', () => {
  const code = newReferralCode(() => 0.5);
  assert.equal(code.length, 8);
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
});

t('a typed code is cleaned; codes with I, O, 0 or 1 are refused', () => {
  assert.equal(normalizeCode(' abcd-efgh '), 'ABCDEFGH');
  assert.equal(normalizeCode('ABCD1EFG'), null);
  assert.equal(normalizeCode('ABCDOEFG'), null);
  assert.equal(normalizeCode('abc'), null);
});

t('a partner needs a name and an email; a code is generated when none is given', () => {
  assert.match(sanitizePartner({ name: '', email: 'a@b.co' }, { code: 'ABCDEFGH' }).error, /Name/);
  assert.match(sanitizePartner({ name: 'X', email: 'nope' }, { code: 'ABCDEFGH' }).error, /email/);
  const ok = sanitizePartner({ name: ' Rivera  Ltd ', email: 'Ops@Rivera.lk', payoutMethod: 'wallet??' }, { code: 'ABCDEFGH' });
  assert.equal(ok.partner.name, 'Rivera Ltd');
  assert.equal(ok.partner.email, 'ops@rivera.lk');
  assert.equal(ok.partner.payoutMethod, 'bank_transfer');
  assert.equal(ok.partner.status, 'active');
});

t('a payout note cannot hold an account number', () => {
  const r = sanitizePartner({ name: 'X', email: 'a@b.co', payoutNote: 'Account 0123456789' }, { code: 'ABCDEFGH' });
  assert.match(r.error, /account numbers/);
  assert.equal(sanitizePartner({ name: 'X', email: 'a@b.co', payoutNote: 'Sampath, ask for Ruwan' }, { code: 'ABCDEFGH' }).partner.payoutNote, 'Sampath, ask for Ruwan');
});

t('the first paid invoice of a referred company earns 20% and starts the 12-month window', () => {
  const r = accrualFor({ invoice: INVOICE, partner: PARTNER, tenant: TENANT, terms: undefined });
  assert.equal(r.entry.id, 'acc_in_1');
  assert.equal(r.entry.kind, 'commission');
  assert.equal(r.entry.amountMinor, 2000);
  assert.equal(r.entry.basisMinor, 10000);
  assert.equal(r.entry.currency, 'USD');
  assert.equal(r.startsReferral, INVOICE.paidAt);
});

t('later invoices inside the window earn the share without restarting the window', () => {
  const r = accrualFor({ invoice: { ...INVOICE, id: 'in_2', paidAt: '2027-10-01T00:00:00.000Z' }, partner: PARTNER, tenant: { ...TENANT, referralStartedAt: INVOICE.paidAt } });
  assert.equal(r.entry.amountMinor, 2000);
  assert.equal(r.startsReferral, null);
});

t('an invoice after the window earns nothing', () => {
  const r = accrualFor({ invoice: { ...INVOICE, id: 'in_3', paidAt: '2027-12-01T00:00:00.000Z' }, partner: PARTNER, tenant: { ...TENANT, referralStartedAt: INVOICE.paidAt } });
  assert.equal(r.entry, null);
  assert.equal(r.reason, 'window_closed');
});

t('a paused or ended partner earns nothing from new payments', () => {
  assert.equal(accrualFor({ invoice: INVOICE, partner: { ...PARTNER, status: 'paused' }, tenant: TENANT }).reason, 'partner_not_active');
  assert.equal(accrualFor({ invoice: INVOICE, partner: null, tenant: TENANT }).reason, 'partner_not_active');
});

t('a refund takes back the commission in proportion, and a repeat of the same total books nothing', () => {
  const original = accrualFor({ invoice: INVOICE, partner: PARTNER, tenant: TENANT }).entry;
  const half = clawbackFor({ original, cumulativeRefundedMinor: 5000, alreadyReversedMinor: 0, at: '2026-12-01T00:00:00.000Z' });
  assert.equal(half.entry.amountMinor, -1000);
  assert.equal(half.entry.id, 'rev_in_1_5000');
  assert.equal(clawbackFor({ original, cumulativeRefundedMinor: 5000, alreadyReversedMinor: 1000 }).reason, 'already_reversed');
  const rest = clawbackFor({ original, cumulativeRefundedMinor: 10000, alreadyReversedMinor: 1000 });
  assert.equal(rest.entry.amountMinor, -1000);
});

t('a refund larger than the payment reverses no more than the commission', () => {
  const original = accrualFor({ invoice: INVOICE, partner: PARTNER, tenant: TENANT }).entry;
  assert.equal(clawbackFor({ original, cumulativeRefundedMinor: 99999 }).entry.amountMinor, -2000);
});

t('a payout is refused when it is more than is owed in that currency', () => {
  const balance = { payable: 2000 };
  assert.match(payoutFor({ code: 'ABCDEFGH', currency: 'USD', amountMinor: 2500, balance, at: '2026-11-21T00:00:00.000Z' }).error, /Only 2000/);
  const ok = payoutFor({ code: 'ABCDEFGH', currency: 'usd', amountMinor: 2000, balance, at: '2026-11-21T00:00:00.000Z' });
  assert.equal(ok.entry.amountMinor, -2000);
  assert.equal(ok.entry.currency, 'USD');
  assert.equal(ok.entry.kind, 'payout');
});

t('balances add up earnings, clawbacks and payouts, and mark who is over the payout minimum', () => {
  const entries = [
    { kind: 'commission', code: 'ABCDEFGH', currency: 'USD', amountMinor: 2000 },
    { kind: 'clawback', code: 'ABCDEFGH', currency: 'USD', amountMinor: -1000 },
    { kind: 'payout', code: 'ABCDEFGH', currency: 'USD', amountMinor: -500 },
  ];
  const [row] = partnerBalances(entries, { minPayoutMinor: 5000 });
  assert.deepEqual({ earned: row.earned, clawedBack: row.clawedBack, paidOut: row.paidOut, payable: row.payable }, { earned: 2000, clawedBack: -1000, paidOut: 500, payable: 500 });
  assert.equal(row.eligible, false);
  assert.equal(partnerBalances(entries, { minPayoutMinor: 400 })[0].eligible, true);
});

t('balances are kept per currency', () => {
  const rows = partnerBalances([
    { kind: 'commission', code: 'ABCDEFGH', currency: 'USD', amountMinor: 100 },
    { kind: 'commission', code: 'ABCDEFGH', currency: 'LKR', amountMinor: 900 },
  ]);
  assert.equal(rows.length, 2);
});

t('a partner statement runs oldest first with a running balance', () => {
  const lines = statementFor([
    { kind: 'commission', code: 'ABCDEFGH', currency: 'USD', amountMinor: 2000, at: '2026-11-01T00:00:00.000Z', id: 'b' },
    { kind: 'clawback', code: 'ABCDEFGH', currency: 'USD', amountMinor: -1000, at: '2026-12-01T00:00:00.000Z', id: 'c' },
    { kind: 'commission', code: 'OTHERCODE', currency: 'USD', amountMinor: 9, at: '2026-11-02T00:00:00.000Z', id: 'x' },
  ], 'ABCDEFGH', 'USD');
  assert.deepEqual(lines.map((l) => l.balanceMinor), [2000, 1000]);
});

t('an invoice paid event becomes an accrual with its paid time', () => {
  const a = ledgerActionFor({ type: 'invoice.paid', created: 1793000000, data: { object: { id: 'in_9', amount_paid: 5000, currency: 'usd', customer: 'cus_1', status_transitions: { paid_at: 1793000100 } } } });
  assert.equal(a.kind, 'accrue');
  assert.equal(a.invoice.amountPaid, 5000);
  assert.equal(a.invoice.paidAt, new Date(1793000100000).toISOString());
});

t('a refund names its invoice; a dispute names only the charge', () => {
  const r = ledgerActionFor({ type: 'charge.refunded', created: 1793000200, data: { object: { id: 'ch_1', invoice: 'in_9', amount_refunded: 2500 } } });
  assert.deepEqual([r.kind, r.invoiceId, r.cumulativeRefundedMinor], ['clawback', 'in_9', 2500]);
  const d = ledgerActionFor({ type: 'charge.dispute.created', created: 1793000300, data: { object: { charge: 'ch_1', amount: 5000 } } });
  assert.deepEqual([d.kind, d.invoiceId, d.chargeId, d.cumulativeRefundedMinor], ['clawback', '', 'ch_1', 5000]);
});

t('other Stripe events are not partner events', () => {
  assert.equal(ledgerActionFor({ type: 'customer.created', data: { object: {} } }), null);
  assert.equal(ledgerActionFor({ type: 'charge.refunded', data: { object: { id: 'ch_1' } } }), null);
});

t('the Stripe webhook books partner entries after it applies the subscription change', () => {
  const src = read('app/api/stripe/webhook/route.js');
  assert.match(src, /import \{ recordPartnerEvent \} from/);
  assert.ok(src.indexOf('writeTenant(db, uid') < src.indexOf('recordPartnerEvent(db, event'));
});

t('the referral route and the operator route exist and check who is calling', () => {
  const ref = read('app/api/partners/referral/route.js');
  assert.match(ref, /uidFromRequest\(request\)/);
  assert.match(ref, /captureReferral\(/);
  const adm = read('app/api/admin/partners/route.js');
  assert.match(adm, /requireAdmin\(request\)/);
  assert.match(adm, /admin_audit/);
});

t('the partner collections are server-only: the browser rules do not list them', () => {
  const rules = read('firestore.rules');
  assert.equal(rules.includes("'partner_ledger'"), false);
  assert.equal(rules.includes("'software_partners'"), false);
});


const SECRET = '0123456789abcdef-secret';
t('a statement link is signed: it opens for its own code and nobody else', () => {
  const tok = statementToken('ABCDEFGH', SECRET);
  assert.match(tok, /^ABCDEFGH\.[0-9a-f]{40}$/);
  assert.equal(checkStatementToken(tok, SECRET), 'ABCDEFGH');
  assert.equal(checkStatementToken(tok + 'x', SECRET), null, 'a changed token is refused');
  assert.equal(checkStatementToken('ZZZZZZZZ.' + tok.split('.')[1], SECRET), null, 'another code with the same mac is refused');
  assert.equal(checkStatementToken(tok, 'another-secret-value-1'), null, 'another secret is refused');
});

t('no statement link without a long enough secret', () => {
  assert.equal(statementToken('ABCDEFGH', ''), null);
  assert.equal(statementToken('ABCDEFGH', 'short'), null);
  assert.equal(checkStatementToken('ABCDEFGH.0', ''), null);
});

t('the statement page escapes the partner name and shows no company or tenant', () => {
  const html = statementHtml({
    partner: { code: 'ABCDEFGH', name: '<script>x</script> Partner' },
    sections: [{ currency: 'USD', payable: 500, eligible: false, minPayoutMinor: 5000, lines: [
      { at: '2026-11-01T00:00:00.000Z', kind: 'commission', amountMinor: 2000, balanceMinor: 2000, reference: '', tenantUid: 'secret-uid' },
    ] }],
    generatedAt: '2026-11-21',
  });
  assert.ok(!html.includes('<script>x</script>'), 'the name is escaped');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('secret-uid'), 'no tenant id on the statement');
  assert.match(html, /Owed now/);
  assert.match(html, /Paid out once it reaches USD 50\.00/);
});

t('yearly prices map to the same plans as the monthly ones', () => {
  const map = priceMapFromEnv({ STRIPE_PRICE_STARTER: 'price_s', STRIPE_PRICE_STARTER_YEARLY: 'price_sy', STRIPE_PRICE_GROWTH_YEARLY: 'price_gy' });
  assert.deepEqual(map, { price_s: 'starter', price_sy: 'starter', price_gy: 'growth' });
});

t('the statement link is public (signed) and the checkout takes a billing interval', () => {
  const proxy = fs.readFileSync('proxy.js', 'utf8');
  assert.ok(proxy.includes("'/api/partners/statement'"));
  assert.match(fs.readFileSync('app/api/partners/statement/route.js', 'utf8'), /checkStatementToken\(/);
  const checkout = fs.readFileSync('app/api/saas/checkout/route.js', 'utf8');
  assert.match(checkout, /interval/);
  assert.match(checkout, /That billing option is not set up yet/);
  assert.match(fs.readFileSync('lib/server/stripe.js', 'utf8'), /_YEARLY/);
  assert.match(fs.readFileSync('app/api/tenant/route.js', 'utf8'), /yearlyPlans/);
  assert.match(fs.readFileSync('app/account/page.js', 'utf8'), /yearlyPlans/);
});

t('the referral capture is mounted in the app shell and keeps the code until the server accepts it', () => {
  const layout = fs.readFileSync('app/layout.js', 'utf8');
  assert.match(layout, /<ReferralCapture \/>/);
  const cap = fs.readFileSync('app/components/ReferralCapture.js', 'utf8');
  assert.match(cap, /\/api\/partners\/referral/);
  assert.match(cap, /r\.status === 200 \|\| r\.status === 400/);
});

t('the operator has a partners screen that reads and writes through the audited API', () => {
  const page = fs.readFileSync('app/admin/partners/page.js', 'utf8');
  assert.match(page, /\/api\/admin\/partners/);
  assert.match(page, /Copy statement link/);
  assert.match(page, /Record payment/);
});

console.log(`gap-close-348: ${n} checks passed`);
