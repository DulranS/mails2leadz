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
const { generateIngestKey } = await import('../lib/server/ingest-key.js');
const { NextRequest } = await import('next/server.js');
const settingsRoute = await import('../app/api/booking/settings/route.js');
const slotsRoute = await import('../app/api/book/slots/route.js');
const bookRoute = await import('../app/api/book/request/route.js');
const bookingStatusRoute = await import('../app/api/bookings/status/route.js');
const manageRoute = await import('../app/api/book/manage/route.js');
const icsRoute = await import('../app/api/bookings/ics/route.js');
const { signBookingToken } = await import('../lib/server/booking-manage.js');

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };
const UID = 'ownerUid0001';
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

// ---- bookings: a customer books a free time, the owner confirms it ----
let bookingKey; let serviceId; let bookedIso; let bookingId;
const postJson = (url, body, headers = H) => new Request(url, { method: 'POST', headers, body: JSON.stringify(body) });

await t('10. the owner sets up a service and weekday hours (Monday 09:00 to 12:00, Colombo time)', async () => {
  const key = generateIngestKey(UID);
  fake.__seed(`users/${UID}/settings/inbound_key`, { hash: key.hash, key: key.key, last4: key.last4 });
  bookingKey = key.key;
  const svc = await json(await settingsRoute.POST(postJson('https://app.example.com/api/booking/settings', { action: 'service', name: 'Consultation', minutes: 60, price: 0 })));
  assert.equal(svc.status, 200, JSON.stringify(svc.body));
  serviceId = svc.body.services[0].id;
  const hrs = await json(await settingsRoute.POST(postJson('https://app.example.com/api/booking/settings', { action: 'hours', hours: { mon: ['09:00', '12:00'] }, tzOffsetMin: 330 })));
  assert.equal(hrs.status, 200, JSON.stringify(hrs.body));
  assert.deepEqual(hrs.body.hours.mon, ['09:00', '12:00']);
});

await t('11. the public booking page lists free times for the service; a time the customer picks is one of them', async () => {
  const res = await slotsRoute.GET(new NextRequest(`https://app.example.com/api/book/slots?k=${encodeURIComponent(bookingKey)}&service=${serviceId}`));
  const { status, body } = await json(res);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.services[0].name, 'Consultation');
  assert.ok(body.slots.length > 0, 'there are free Monday times in the next weeks');
  bookedIso = body.slots[0].startIso;
  assert.equal(new Date(bookedIso).getUTCDay(), 1, 'the offered time is on a Monday in the owner\'s local hours (03:30 UTC is 09:00 Colombo)');
});

await t('12. the customer requests that time: booking recorded as requested, and an inbound deal opened', async () => {
  const { status, body } = await json(await bookRoute.POST(postJson('https://app.example.com/api/book/request', { k: bookingKey, serviceId, startIso: bookedIso, name: 'Nimal', email: 'Nimal@Example.com', phone: '+94770000000', honeypot: '' }, { 'content-type': 'application/json' })));
  assert.equal(status, 200, JSON.stringify(body));
  bookingId = body.bookingId;
  const b = fake.__read(`users/${UID}/bookings/${bookingId}`);
  assert.equal(b.status, 'requested');
  assert.equal(b.serviceName, 'Consultation');
  const deal = fake.__read(`deals/${dealDocId(UID, 'nimal@example.com')}`);
  assert.equal(deal.stage, 'new');
  assert.equal(deal.source, 'inbound');
  assert.equal(deal.sourceDetail, 'Booking request');
});

await t('13. the same time requested again is refused: a second person cannot take it', async () => {
  const { status, body } = await json(await bookRoute.POST(postJson('https://app.example.com/api/book/request', { k: bookingKey, serviceId, startIso: bookedIso, name: 'Other', email: 'other@example.com', honeypot: '' }, { 'content-type': 'application/json' })));
  assert.equal(status, 409, JSON.stringify(body));
  assert.match(body.error, /no longer free/);
});

await t('14. a bot that fills the hidden field is told it succeeded, and nothing is recorded', async () => {
  const before = fake.__all(`users/${UID}/bookings`).length;
  const { status } = await json(await bookRoute.POST(postJson('https://app.example.com/api/book/request', { k: bookingKey, serviceId, startIso: bookedIso, name: 'Bot', email: 'bot@example.com', honeypot: 'http://spam' }, { 'content-type': 'application/json' })));
  assert.equal(status, 200);
  assert.equal(fake.__all(`users/${UID}/bookings`).length, before);
});

await t('15. the owner confirms: booking confirmed, deal moved to demo, and the time leaves the public calendar', async () => {
  const { status, body } = await json(await bookingStatusRoute.POST(postJson('https://app.example.com/api/bookings/status', { id: bookingId, status: 'confirmed' })));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(fake.__read(`users/${UID}/bookings/${bookingId}`).status, 'confirmed');
  assert.equal(fake.__read(`deals/${dealDocId(UID, 'nimal@example.com')}`).stage, 'demo');
  const res = await slotsRoute.GET(new NextRequest(`https://app.example.com/api/book/slots?k=${encodeURIComponent(bookingKey)}&service=${serviceId}`));
  const after = await json(res);
  assert.ok(!after.body.slots.some((s) => s.startIso === bookedIso), 'the confirmed time is no longer offered');
});

await t('16. a wrong booking key shows no calendar at all', async () => {
  const res = await slotsRoute.GET(new NextRequest(`https://app.example.com/api/book/slots?k=${encodeURIComponent(bookingKey)}x&service=${serviceId}`));
  assert.equal(res.status, 404);
});

// ---- paid bookings, customer self-service, calendar feed, no-shows ----
const DAYMS = 86400000;
let fittingId; let paidBookingId; let paidInvoiceId; let seededId;
const seedBooking = (id, extra) => fake.__seed(`users/${UID}/bookings/${id}`, { id, serviceId, serviceName: 'Consultation', minutes: 60, staffId: 'owner', endIso: new Date(Date.parse(extra.startIso) + 3600000).toISOString(), name: 'Seeded', phone: '', createdAt: new Date().toISOString(), ...extra });

await t('17. a priced service: the booking waits for card payment, with an invoice and a pay link', async () => {
  const svc = await json(await settingsRoute.POST(postJson('https://app.example.com/api/booking/settings', { action: 'service', name: 'Fitting', minutes: 60, price: 50, staffId: 'owner' })));
  assert.equal(svc.status, 200, JSON.stringify(svc.body));
  fittingId = svc.body.services.find((x) => x.name === 'Fitting').id;
  const slots = await json(await slotsRoute.GET(new NextRequest(`https://app.example.com/api/book/slots?k=${encodeURIComponent(bookingKey)}&service=${fittingId}`)));
  assert.ok(!slots.body.slots.some((x) => x.startIso === bookedIso), 'the first Consultation time is taken for the owner, so Fitting does not offer it');
  const pick = slots.body.slots[0].startIso;
  const { status, body } = await json(await bookRoute.POST(postJson('https://app.example.com/api/book/request', { k: bookingKey, serviceId: fittingId, startIso: pick, name: 'Pay Person', email: 'pay@example.com', honeypot: '' }, { 'content-type': 'application/json' })));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.status, 'awaiting_payment');
  assert.match(body.payLink, /^https:\/\/app\.example\.com\/api\/pay\?t=/);
  paidBookingId = body.bookingId;
  const inv = fake.__all('invoices').find((i) => i.bookingId === paidBookingId);
  assert.ok(inv, 'the booking invoice exists');
  assert.equal(inv.total, 50);
  paidInvoiceId = inv.id;
  assert.equal(fake.__read(`users/${UID}/bookings/${paidBookingId}`).status, 'awaiting_payment');
});

await t('18. the signed payment event confirms the paid booking and moves its deal to demo', async () => {
  const payload = event('checkout.session.completed', session('cs_book_1', 5000, paidInvoiceId));
  const res = await webhookRoute.POST(new Request('https://app.example.com/api/payments/webhook', { method: 'POST', headers: { 'stripe-signature': signed(payload) }, body: payload }));
  assert.equal(res.status, 200);
  assert.equal(fake.__read(`users/${UID}/bookings/${paidBookingId}`).status, 'confirmed');
  assert.equal(fake.__read(`deals/${dealDocId(UID, 'pay@example.com')}`).stage, 'demo');
});

await t('19. the customer reschedules a booking by the signed manage link, and the owner must confirm the new time', async () => {
  seededId = 'seeded-future-1';
  seedBooking(seededId, { startIso: new Date(Date.now() + 10 * DAYMS).toISOString(), status: 'confirmed', email: 'future@example.com' });
  const tok = signBookingToken('manage', UID, seededId);
  const view = await json(await manageRoute.GET(new NextRequest(`https://app.example.com/api/book/manage?t=${encodeURIComponent(tok)}`)));
  assert.equal(view.status, 200, JSON.stringify(view.body));
  assert.equal(view.body.canChange, true);
  assert.ok(view.body.slots.length > 0, 'free times are offered for the move');
  const target = view.body.slots[0].startIso;
  const moved = await json(await manageRoute.POST(postJson('https://app.example.com/api/book/manage', { t: tok, action: 'reschedule', startIso: target })));
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  const b = fake.__read(`users/${UID}/bookings/${seededId}`);
  assert.equal(b.startIso, target);
  assert.equal(b.status, 'requested');
});

await t('20. the customer cancels by the link; a link for another booking, or one with a forged token, does nothing', async () => {
  const cancelId = 'seeded-future-2';
  seedBooking(cancelId, { startIso: new Date(Date.now() + 12 * DAYMS).toISOString(), status: 'confirmed', email: 'cancel@example.com' });
  const tok = signBookingToken('manage', UID, cancelId);
  const out = await json(await manageRoute.POST(postJson('https://app.example.com/api/book/manage', { t: tok, action: 'cancel' })));
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(fake.__read(`users/${UID}/bookings/${cancelId}`).status, 'cancelled');
  const forged = await json(await manageRoute.POST(postJson('https://app.example.com/api/book/manage', { t: `${tok}x`, action: 'cancel' })));
  assert.equal(forged.status, 400);
  const feedAsManage = signBookingToken('feed', UID, 'calendar');
  const wrongKind = await json(await manageRoute.POST(postJson('https://app.example.com/api/book/manage', { t: feedAsManage, action: 'cancel' })));
  assert.equal(wrongKind.status, 400, 'a calendar feed link cannot be used to cancel a booking');
});

await t('21. the calendar feed lists the confirmed bookings, and not the cancelled one', async () => {
  const feed = signBookingToken('feed', UID, 'calendar');
  const res = await icsRoute.GET(new NextRequest(`https://app.example.com/api/bookings/ics?t=${encodeURIComponent(feed)}`));
  assert.equal(res.status, 200);
  const ics = await res.text();
  assert.match(ics, new RegExp(`UID:${bookedIso ? paidBookingId : ''}@autoleads`));
  assert.doesNotMatch(ics, /seeded-future-2@autoleads/);
});

await t('22. a booking cannot be marked a no-show before it starts; two no-shows make the next free booking flagged for review', async () => {
  const early = await json(await bookingStatusRoute.POST(postJson('https://app.example.com/api/bookings/status', { id: paidBookingId, status: 'no_show' })));
  assert.equal(early.status, 409);
  for (const [i, days] of [[1, 3], [2, 4]]) {
    seedBooking(`past-${i}`, { startIso: new Date(Date.now() - days * DAYMS).toISOString(), status: 'confirmed', email: 'noshow@example.com' });
    const r = await json(await bookingStatusRoute.POST(postJson('https://app.example.com/api/bookings/status', { id: `past-${i}`, status: 'no_show' })));
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const slots = await json(await slotsRoute.GET(new NextRequest(`https://app.example.com/api/book/slots?k=${encodeURIComponent(bookingKey)}&service=${serviceId}`)));
  const req = await json(await bookRoute.POST(postJson('https://app.example.com/api/book/request', { k: bookingKey, serviceId, startIso: slots.body.slots[0].startIso, name: 'No Show', email: 'noshow@example.com', honeypot: '' }, { 'content-type': 'application/json' })));
  assert.equal(req.status, 200, JSON.stringify(req.body));
  assert.equal(req.body.needsReview, true, 'a free service with two no-shows is flagged, not refused');
});

// ---- two people for one service, their own hours, the confirmation ----
let pairId; let staffBookingId;
await t('23. a service done by two people, with the second person on their own hours (Monday 10:00 to 12:00)', async () => {
  const made = await json(await settingsRoute.POST(postJson('https://app.example.com/api/booking/settings', { action: 'service', name: 'Pair session', minutes: 60, price: 0, staffIds: ['owner', 'staffTwo'] })));
  assert.equal(made.status, 200, JSON.stringify(made.body));
  pairId = made.body.services.find((x) => x.name === 'Pair session').id;
  const hrs = await json(await settingsRoute.POST(postJson('https://app.example.com/api/booking/settings', { action: 'hours', staffId: 'staffTwo', hours: { mon: ['10:00', '12:00'] }, tzOffsetMin: 330 })));
  assert.equal(hrs.status, 200, JSON.stringify(hrs.body));
  assert.deepEqual(hrs.body.staffHours.staffTwo.mon, ['10:00', '12:00']);
  assert.deepEqual(hrs.body.hours.mon, ['09:00', '12:00'], 'the owner\'s shared hours are unchanged');
});

await t('24. the public page offers one list across both people; the second person only at their own hours', async () => {
  const res = await json(await slotsRoute.GET(new NextRequest(`https://app.example.com/api/book/slots?k=${encodeURIComponent(bookingKey)}&service=${pairId}`)));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.slots.length > 0);
  for (const sl of res.body.slots.filter((x) => x.staffId === 'staffTwo')) {
    assert.ok(Number(sl.label.slice(11, 13)) >= 10, 'staffTwo is only offered from 10:00 local time');
  }
  assert.ok(res.body.slots.some((x) => x.staffId === 'owner'), 'the owner is offered too');
  const shared = res.body.slots.map((x) => x.startIso);
  assert.equal(new Set(shared).size, shared.length, 'no time is offered twice');
});

await t('25. a customer books the second person; the booking belongs to them, and a person not offered for the service is refused', async () => {
  const slots = await json(await slotsRoute.GET(new NextRequest(`https://app.example.com/api/book/slots?k=${encodeURIComponent(bookingKey)}&service=${pairId}&staff=staffTwo`)));
  const pick = slots.body.slots.find((x) => x.staffId === 'staffTwo');
  assert.ok(pick, 'a staffTwo time is free');
  const ok = await json(await bookRoute.POST(postJson('https://app.example.com/api/book/request', { k: bookingKey, serviceId: pairId, staffId: 'staffTwo', startIso: pick.startIso, name: 'Pair Customer', email: 'pair@example.com', honeypot: '' }, { 'content-type': 'application/json' })));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  staffBookingId = ok.body.bookingId;
  assert.equal(fake.__read(`users/${UID}/bookings/${staffBookingId}`).staffId, 'staffTwo');
  const stranger = await json(await bookRoute.POST(postJson('https://app.example.com/api/book/request', { k: bookingKey, serviceId: pairId, staffId: 'stranger', startIso: pick.startIso, name: 'X', email: 'x@example.com', honeypot: '' }, { 'content-type': 'application/json' })));
  assert.equal(stranger.status, 400);
});

await t('26. the owner confirms: the booking is confirmed; with no Gmail connected, the confirmation is skipped and said so', async () => {
  const { status, body } = await json(await bookingStatusRoute.POST(postJson('https://app.example.com/api/bookings/status', { id: staffBookingId, status: 'confirmed' })));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.confirmation.skipped, 'no_gmail');
  assert.equal(fake.__read(`users/${UID}/bookings/${staffBookingId}`).status, 'confirmed');
});

await t('27. an owner calendar that cannot be read blocks the owner\'s times rather than risking a double booking', async () => {
  fake.__seed(`users/${UID}/settings/integrations`, { ...fake.__read(`users/${UID}/settings/integrations`), OWNER_CALENDAR_ICS: encryptSecret('http://not-secure.example/cal.ics') });
  const res = await json(await slotsRoute.GET(new NextRequest(`https://app.example.com/api/book/slots?k=${encodeURIComponent(bookingKey)}&service=${pairId}`)));
  assert.equal(res.status, 200);
  assert.ok(res.body.calendarWarning, 'the public page says some times are hidden');
  assert.ok(!res.body.slots.some((x) => x.staffId === 'owner'), 'the owner\'s times are not offered');
  assert.ok(res.body.slots.some((x) => x.staffId === 'staffTwo'), 'the second person is still offered');
});

console.log(`routes-e2e: ${n} passed`);
