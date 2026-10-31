// End-to-end over the REAL HTTP route handlers: create quote -> customer views it -> customer accepts -> deposit invoice ->
// second milestone -> payment webhook (real Stripe signature) -> duplicate and forged events. Database = in-memory fake.
// Not covered here (needs Stripe's network API): creating the Checkout page for a pay link (GET /api/pay). Covered by the live run.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import Stripe from 'stripe';

register(new URL('./fixtures/loader.mjs', import.meta.url));

process.env.TOKEN_ENC_KEY = '0'.repeat(63) + '1';
process.env.QUOTE_SECRET = 'quote-test-secret';
process.env.PAY_SECRET = 'pay-test-secret';
process.env.NEXT_PUBLIC_BASE_URL = 'https://app.example.com';
process.env.NODE_ENV = 'test';

const fake = await import('./fixtures/fake-firestore.mjs');
const quoteRoute = await import('../app/api/quotes/route.js');
const acceptRoute = await import('../app/api/quote/route.js');
const milestoneRoute = await import('../app/api/quotes/milestone/route.js');
const webhookRoute = await import('../app/api/payments/webhook/route.js');
const { encryptSecret } = await import('../lib/server/token-vault.js');
const { dealDocId } = await import('../lib/deal-utils.js');
const { signPayToken, verifyPayToken } = await import('../lib/server/payments.js');

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };
const UID = 'u1';
const H = { 'x-user-id': UID, 'content-type': 'application/json' };
const WHSEC = 'whsec_test_secret_value';
const SK = 'sk_test_123';

const seed = () => {
  fake.__reset();
  fake.__seed(`users/${UID}/settings/business`, { taxRate: 0, paymentTermsDays: 14, currency: 'USD', businessName: 'Hato Studio' });
  fake.__seed(`users/${UID}/settings/integrations`, {
    STRIPE_PAYMENTS_SECRET_KEY: encryptSecret(SK),
    STRIPE_PAYMENTS_WEBHOOK_SECRET: encryptSecret(WHSEC),
  });
};

const json = async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) });
const tokenFrom = (url) => new URL(url).searchParams.get('t');

let quoteId; let acceptUrl; let depositInvoiceId;

await t('1. the owner creates a quote with a 30/70 payment schedule, through the real POST /api/quotes', async () => {
  seed();
  const req = new Request('https://app.example.com/api/quotes', {
    method: 'POST', headers: H,
    body: JSON.stringify({ title: 'Website care plan', email: 'Client@Example.com', customerName: 'Nimal', currency: 'USD', lines: [{ description: 'Build', qty: 1, unitPrice: 1000 }], taxPercent: 0, validUntil: '2099-01-01', schedule: 'Deposit:30, Completion:70' }),
  });
  const { status, body } = await json(await quoteRoute.POST(req));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  quoteId = body.id;
  acceptUrl = body.acceptUrl;
  assert.match(acceptUrl, /^https:\/\/app\.example\.com\/api\/quote\?t=/);
  const saved = fake.__read(`users/${UID}/quotes/${quoteId}`);
  assert.equal(saved.status, 'open');
  assert.equal(saved.subtotal, 1000);
  assert.equal(saved.schedule.length, 2);
});

await t('2. the customer opens the link: the page shows the quote and changes nothing', async () => {
  const res = await acceptRoute.GET(new Request(acceptUrl));
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Website care plan/);
  assert.match(html, /1000\.00/);
  assert.match(html, /Accept this quote/);
  assert.equal(fake.__read(`users/${UID}/quotes/${quoteId}`).status, 'open');
});

await t('3. the customer accepts: quote accepted, deal won at the net price, deposit invoiced at once', async () => {
  const form = new URLSearchParams({ action: 'accept', name: 'Nimal' });
  const res = await acceptRoute.POST(new Request(acceptUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form }));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Your acceptance is recorded/);
  const q = fake.__read(`users/${UID}/quotes/${quoteId}`);
  assert.equal(q.status, 'accepted');
  assert.equal(q.acceptedBy, 'Nimal');
  const deal = fake.__read(`deals/${dealDocId(UID, 'client@example.com')}`);
  assert.equal(deal.stage, 'closed_won');
  assert.equal(deal.value, 1000);
  assert.equal(deal.billingSchedule, true);
  assert.equal(q.milestones.length, 2);
  assert.equal(q.milestones[0].invoiceId !== null, true, 'deposit invoice id saved on the quote');
  assert.equal(q.milestones[1].invoiceId, null, 'completion not yet invoiced');
  const invoices = fake.__all('invoices');
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].amount, 300);
  assert.equal(invoices[0].total, 300);
  assert.equal(invoices[0].number, 'INV-0001');
  assert.equal(invoices[0].email, 'client@example.com');
  depositInvoiceId = invoices[0].id;
});

await t('4. the owner releases the completion milestone: second invoice, for the balance, in order', async () => {
  const res = await milestoneRoute.POST(new Request('https://app.example.com/api/quotes/milestone', { method: 'POST', headers: H, body: JSON.stringify({ id: quoteId }) }));
  const { status, body } = await json(res);
  assert.equal(status, 200, JSON.stringify(body));
  const invoices = fake.__all('invoices').sort((a, b) => a.number.localeCompare(b.number));
  assert.equal(invoices.length, 2);
  assert.equal(invoices[1].amount, 700);
  assert.equal(invoices[1].number, 'INV-0002');
  const again = await milestoneRoute.POST(new Request('https://app.example.com/api/quotes/milestone', { method: 'POST', headers: H, body: JSON.stringify({ id: quoteId }) }));
  assert.equal(again.status, 409, 'every milestone is invoiced once');
});

const event = (type, object) => JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, object: 'event', type, data: { object } });
const signed = (payload, secret = WHSEC) => new Stripe(SK).webhooks.generateTestHeaderString({ payload, secret });
const session = (id, amountMinor, invoiceId) => ({
  id, object: 'checkout.session', payment_status: 'paid', amount_total: amountMinor,
  metadata: { kind: 'invoice', uid: UID, invoiceId },
});

await t('5. a real signed payment event for the deposit balance marks the deposit paid', async () => {
  const payload = event('checkout.session.completed', session('cs_dep_1', 30000, depositInvoiceId));
  const res = await webhookRoute.POST(new Request('https://app.example.com/api/payments/webhook', { method: 'POST', headers: { 'stripe-signature': signed(payload) }, body: payload }));
  const { status, body } = await json(res);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.applied, true);
  const inv = fake.__read(`invoices/${depositInvoiceId}`);
  assert.equal(inv.status, 'paid');
  assert.deepEqual(inv.onlinePaymentIds, ['cs_dep_1']);
});

await t('6. the same event delivered again changes nothing', async () => {
  const payload = event('checkout.session.completed', session('cs_dep_1', 30000, depositInvoiceId));
  const res = await webhookRoute.POST(new Request('https://app.example.com/api/payments/webhook', { method: 'POST', headers: { 'stripe-signature': signed(payload) }, body: payload }));
  const { body } = await json(res);
  assert.equal(body.duplicate, true);
  assert.deepEqual(fake.__read(`invoices/${depositInvoiceId}`).onlinePaymentIds, ['cs_dep_1']);
});

await t('7. an event signed with the wrong secret is refused and changes nothing', async () => {
  const payload = event('checkout.session.completed', session('cs_forged', 70000, depositInvoiceId));
  const res = await webhookRoute.POST(new Request('https://app.example.com/api/payments/webhook', { method: 'POST', headers: { 'stripe-signature': signed(payload, 'whsec_wrong') }, body: payload }));
  assert.equal(res.status, 400);
  assert.equal(fake.__read(`invoices/${depositInvoiceId}`).status, 'paid');
});

await t('8. a payment larger than the balance is flagged for review, not applied', async () => {
  const secondInv = fake.__all('invoices').find((i) => i.number === 'INV-0002');
  const payload = event('checkout.session.completed', session('cs_big', 99999, secondInv.id));
  const res = await webhookRoute.POST(new Request('https://app.example.com/api/payments/webhook', { method: 'POST', headers: { 'stripe-signature': signed(payload) }, body: payload }));
  const { body } = await json(res);
  assert.equal(body.review, true);
  const inv = fake.__read(`invoices/${secondInv.id}`);
  assert.equal(inv.status, 'open');
  assert.equal(inv.paymentNeedsReview, true);
});

await t('9. a forged quote link and a pay link signed with another key are both refused', async () => {
  const forged = new Request(`https://app.example.com/api/quote?t=${tokenFrom(acceptUrl)}x`);
  const res = await acceptRoute.GET(forged);
  assert.equal(res.status, 400);
  const forgedPay = signPayToken(UID, depositInvoiceId, 'other-key');
  assert.equal(verifyPayToken(forgedPay), null, 'a pay link signed with another key is refused by the app');
  const realPay = signPayToken(UID, depositInvoiceId);
  assert.deepEqual(verifyPayToken(realPay), { uid: UID, id: depositInvoiceId });
});

console.log(`routes-e2e: ${n} passed`);
