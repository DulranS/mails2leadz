// Pass 115: industry routing, cohort repeat buying, basket pricing, and testimonials shown only with written consent.
import assert from 'node:assert/strict';
import { pickOwner, industryOf, planReroutes } from '../lib/assignment.js';
import { computeCohorts } from '../lib/cohorts.js';
import { sanitizeBasket, priceBasket } from '../lib/shop.js';
import { sanitizeSite, publicSite, sanitizeTestimonials } from '../lib/site.js';
import { planOrderNudges, planReceipts, shippedDraft } from '../lib/billing-automation.js';
import { sanitizeProduct, planStockHold, holdsToRelease, availableToSell } from '../lib/products.js';
import { calendarLinks } from '../lib/calendar-links.js';
import { hashToken } from '../lib/shop-basket.js';
import { buildStatement } from '../lib/statement.js';
import { sanitizePostage, quotePostage, formatPostage } from '../lib/postage.js';
import { planReturn, returnable, planCardRefund } from '../lib/returns.js';
import { sanitizeTaxRates, rateForCountry } from '../lib/tax-rates.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const owners = [
  { key: 'owner', label: 'You', away: false, maxOpen: null, territories: [], industries: [] },
  { key: 'm1', label: 'Ann', away: false, maxOpen: null, territories: [], industries: ['software'] },
];

t('an industry word on an owner takes a matching deal when that owner is free', () => {
  assert.equal(pickOwner(owners, [], { industry: 'Software development' }), 'm1');
});
t('a deal in an industry no one lists goes to the least-loaded owner as before', () => {
  assert.equal(pickOwner(owners, [], { industry: 'Bakery' }), 'owner');
});
t('industry words are stored lower case, trimmed and capped', () => {
  assert.equal(industryOf('  Software   Dev  '), 'software dev');
  assert.equal(industryOf(''), '');
});

const DAY = 86400000;
const now = Date.UTC(2026, 10, 2);
t('a customer counts as repeating only if they pay again within the window', () => {
  const r = computeCohorts({ now, invoices: [
    { email: 'a@x.com', total: 100, status: 'paid', paidAt: Date.UTC(2026, 0, 10) },
    { email: 'a@x.com', total: 50, status: 'paid', paidAt: Date.UTC(2026, 1, 20) },
    { email: 'b@x.com', total: 80, status: 'paid', paidAt: Date.UTC(2026, 0, 15) },
  ] });
  const jan = r.cohorts.find((c) => c.month === '2026-01');
  assert.equal(jan.retention[1], 0);   // the repeat came after the first month
  assert.equal(jan.retention[3], 50);  // and within three months for one of two
  assert.equal(jan.retention[12], null); // the twelve-month window is not yet complete
});
t('void, unpaid and future-dated invoices are not counted', () => {
  const r = computeCohorts({ now, invoices: [
    { email: 'c@x.com', total: 9, status: 'void', paidAt: Date.UTC(2026, 0, 1) },
    { email: 'd@x.com', total: 9, status: 'open', paidAt: null },
    { email: 'e@x.com', total: 9, status: 'paid', paidAt: now + DAY },
  ] });
  assert.equal(r.overall.customers, 0);
});

t('a basket takes its prices from the product list, merges duplicates, and refuses unknown or free items', () => {
  const b = sanitizeBasket({ email: ' Buy@X.com ', items: [{ productId: 'p1', quantity: 2 }, { productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 0 }] });
  assert.deepEqual(b.items, [{ productId: 'p1', variantId: '', quantity: 5 }]);
  const priced = priceBasket(b.items, { p1: { name: 'Mug', price: 12.5 } });
  assert.equal(priced.amount, 62.5);
  assert.equal(priceBasket([{ productId: 'zz', quantity: 1 }], {}).ok, false);
  assert.equal(priceBasket([{ productId: 'p1', quantity: 1 }], { p1: { name: 'Free', price: 0 } }).ok, false);
});
t('a filled honeypot marks the basket as a bot', () => {
  assert.equal(sanitizeBasket({ website: 'spam', items: [] }).bot, true);
});

t('testimonials without the written-consent tick are never saved or shown', () => {
  const kept = sanitizeTestimonials([
    { quote: 'Great service', name: 'Sam', company: 'Acme', consent: true },
    { quote: 'Not agreed', name: 'Kim', consent: false },
  ]);
  assert.equal(kept.length, 1);
  const pub = publicSite({ businessName: 'X', site: { testimonials: [{ quote: 'Hidden', consent: false }, { quote: 'Shown', consent: true }] } });
  assert.deepEqual(pub.testimonials, [{ quote: 'Shown', name: '', company: '' }]);
});
t('a text-only save does not wipe the testimonials already on the page', () => {
  assert.equal('testimonials' in sanitizeSite({ tagline: 'Hi' }).site, false);
});

t('a storefront order unpaid for a day gets one nudge, not before, not after it is overdue, and never twice', () => {
  const placed = now - 2 * DAY;
  const base = { source: 'storefront', email: 'buy@x.com', status: 'open', total: 62.5, amount: 62.5, number: 'INV-7', businessName: 'Mug Co', createdAt: new Date(placed).toISOString(), dueAt: new Date(placed + 30 * DAY).toISOString() };
  const fresh = { ...base, id: 'f', createdAt: new Date(now - 3600000).toISOString() };
  const sent = { ...base, id: 's', orderNudgeAt: 'x' };
  const direct = { ...base, id: 'd', source: 'manual' };
  const due = { ...base, id: 'o', dueAt: new Date(now - 5 * DAY).toISOString() };
  const plan = planOrderNudges({ invoices: [fresh, sent, direct, due, { ...base, id: 'k' }], now, payLinkOf: (id) => `https://pay.example/${id}` });
  assert.deepEqual(plan.map((p) => p.invoice.id), ['k']);
  assert.match(plan[0].draft.body, /https:\/\/pay\.example\/k/);
  assert.match(plan[0].draft.body, /INV-7/);
});

const HOUR = 3600000;
const T = Date.UTC(2026, 10, 2, 12);
const rOwners = [
  { key: 'owner', label: 'You', away: false, maxOpen: null, territories: [], industries: [] },
  { key: 'm1', label: 'Ann', away: false, maxOpen: null, territories: [], industries: [] },
];
const fresh = (over) => ({ id: 'd', email: 'buyer@x.com', assignedTo: 'owner', stage: 'new', assignedAt: new Date(T - 2 * HOUR).toISOString(), lastUpdate: new Date(T - 2 * HOUR).toISOString(), ...over });

t('an untouched new deal moves once to another free owner after an hour', () => {
  const ch = planReroutes(rOwners, [fresh({})], { now: T });
  assert.deepEqual(ch.map((c) => [c.id, c.from, c.to]), [['d', 'owner', 'm1']]);
});
t('a deal touched after the handover stays with its owner', () => {
  const ch = planReroutes(rOwners, [fresh({ lastTouchAt: new Date(T - HOUR / 2).toISOString() })], { now: T });
  assert.deepEqual(ch, []);
});
t('a deal whose touch time is unknown is never moved', () => {
  assert.deepEqual(planReroutes(rOwners, [fresh({ lastUpdate: undefined })], { now: T }), []);
});
t('only new deals move; a deal already moved does not move again', () => {
  assert.deepEqual(planReroutes(rOwners, [fresh({ stage: 'qualified' })], { now: T }), []);
  assert.deepEqual(planReroutes(rOwners, [fresh({ reroutedAt: new Date(T - HOUR).toISOString() })], { now: T }), []);
});
t('a deal is not moved to an owner who is away or full, and not moved inside the hour', () => {
  const away = [rOwners[0], { ...rOwners[1], away: true }];
  assert.deepEqual(planReroutes(away, [fresh({})], { now: T }), []);
  assert.deepEqual(planReroutes(rOwners, [fresh({ assignedAt: new Date(T - 10 * 60000).toISOString() })], { now: T }), []);
});

t('a receipt goes out once for a storefront order paid in the last week, and never for older or non-storefront orders', () => {
  const paidAgo = (d) => new Date(T - d * 86400000).toISOString();
  const order = { source: 'storefront', email: 'buy@x.com', status: 'paid', paidAt: paidAgo(1), total: 62.5, number: 'INV-9', businessName: 'Mug Co', basketLines: [{ name: 'Mug', quantity: 5, amount: 62.5 }] };
  const plan = planReceipts({ now: T, invoices: [
    { ...order, id: 'new' },
    { ...order, id: 'got', receiptAt: 'x' },
    { ...order, id: 'old', paidAt: paidAgo(30) },
    { ...order, id: 'manual', source: 'manual' },
  ] });
  assert.deepEqual(plan.map((p) => p.invoice.id), ['new']);
  assert.match(plan[0].draft.body, /Mug x5/);
  assert.match(plan[0].draft.body, /INV-9/);
});

t('stock on hand less the safety buffer is what can be sold; untracked stock is unlimited', () => {
  assert.equal(availableToSell({ stockOnHand: 5, holdBack: 2 }), 3);
  assert.equal(availableToSell({ stockOnHand: null }), null);
  assert.equal(availableToSell({ stockOnHand: 1, holdBack: 4 }), 0);
});
t('a basket is refused when it asks for more than is left, or more than the per-order limit, and says so', () => {
  const p = { name: 'Mug', price: 12, stockOnHand: 5, holdBack: 1, maxPerOrder: 3 };
  assert.equal(planStockHold([{ productId: 'a', quantity: 2, product: p }]).ok, true);
  assert.match(planStockHold([{ productId: 'a', quantity: 4, product: p }]).error, /up to 3/);
  assert.match(planStockHold([{ productId: 'a', quantity: 3, product: { ...p, stockOnHand: 3, holdBack: 1 } }]).error, /Only 2 of Mug/);
  assert.match(planStockHold([{ productId: 'a', quantity: 1, product: { ...p, stockOnHand: 1, holdBack: 1 } }]).error, /sold out/);
});
t('stock that is not tracked is never held, and a missing product refuses the basket', () => {
  const ok = planStockHold([{ productId: 'a', quantity: 9, product: { name: 'Gift', price: 5, stockOnHand: null } }]);
  assert.deepEqual(ok.holds, [{ productId: 'a', variantId: '', quantity: 9, tracked: false }]);
  assert.equal(planStockHold([{ productId: 'x', quantity: 1, product: null }]).ok, false);
});
t('a stock hold is released only for unpaid, open orders older than two days that hold tracked stock', () => {
  const now = Date.UTC(2026, 10, 5);
  const old = new Date(now - 3 * 86400000).toISOString();
  const fresh = new Date(now - 3600000).toISOString();
  const held = [{ productId: 'a', quantity: 1, tracked: true }];
  const plan = holdsToRelease({ now, invoices: [
    { id: 'old', status: 'open', createdAt: old, stockHolds: held },
    { id: 'fresh', status: 'open', createdAt: fresh, stockHolds: held },
    { id: 'paid', status: 'paid', createdAt: old, stockHolds: held },
    { id: 'done', status: 'open', createdAt: old, stockHolds: held, holdReleasedAt: 'x' },
    { id: 'untracked', status: 'open', createdAt: old, stockHolds: [{ tracked: false }] },
  ] });
  assert.deepEqual(plan.map((i) => i.id), ['old']);
});
t('product stock is a whole number: a fraction or a negative is refused, and blank means not tracked', () => {
  assert.match(sanitizeProduct({ name: 'x', price: 3, stockOnHand: '-1' }).error, /whole number/);
  assert.equal(sanitizeProduct({ name: 'x', price: 3, stockOnHand: '' }).product.stockOnHand, null);
  assert.match(sanitizeProduct({ name: 'x', price: 3, maxPerOrder: '0' }).error, /Most per order/);
});
t('add-to-calendar links carry the title and the time, and nothing is written to a calendar', () => {
  const l = calendarLinks({ title: 'Trim', startIso: '2026-11-05T10:00:00.000Z', endIso: '2026-11-05T10:30:00.000Z' });
  assert.match(l.google, /dates=20261105T100000Z\/20261105T103000Z/);
  assert.match(l.outlook, /subject=Trim/);
  assert.equal(calendarLinks({ title: 'x', startIso: 'not a date' }), null);
});
t('a shipment notice carries the carrier, the tracking number and the link', () => {
  const m = shippedDraft({ number: 'INV-4', name: 'Sam', carrier: 'Royal Mail', trackingNumber: 'RM123', trackingUrl: 'https://track.example/RM123', expected: 'Friday' });
  assert.match(m.body, /Tracking number: RM123/);
  assert.match(m.body, /https:\/\/track\.example\/RM123/);
  assert.equal(m.subject, 'Your order INV-4 has shipped');
});
t('a saved-basket link is kept only as a hash', () => {
  const h = hashToken('secret-token-value');
  assert.equal(h.length, 64);
  assert.notEqual(h, 'secret-token-value');
  assert.equal(hashToken('secret-token-value'), h);
});

t('postage: the cheapest band that fits the weight and the country wins; a country with no band is refused, not guessed', () => {
  const bands = sanitizePostage('2, 5, GB IE\n10, 12\n1, 3, US\nnonsense');
  assert.deepEqual(bands.map((b) => b.upToKg), [1, 2, 10]);
  assert.deepEqual(quotePostage({ bands, weightKg: 1.5, country: 'gb' }), { ok: true, fee: 5, band: 'up to 2 kg' });
  assert.deepEqual(quotePostage({ bands, weightKg: 1.5, country: 'LK' }), { ok: true, fee: 12, band: 'up to 10 kg' });
  assert.equal(quotePostage({ bands, weightKg: 11, country: 'GB' }).ok, false);
  assert.match(quotePostage({ bands: sanitizePostage('1, 3, US'), weightKg: 0.5, country: 'GB' }).error, /do not post to that country/);
  assert.match(quotePostage({ bands, weightKg: 1, country: '' }).error, /country/);
});
t('postage: with no bands the single flat charge applies; a product with no weight stops a weighed quote', () => {
  assert.deepEqual(quotePostage({ bands: [], flatFee: 4, country: '' }), { ok: true, fee: 4, band: 'flat' });
  const bands = sanitizePostage('2, 5');
  assert.equal(quotePostage({ bands, weightKg: 0, country: 'GB', unweighed: ['Mug'] }).ok, false);
  assert.equal(formatPostage(bands), '2, 5');
});
t('a parcel is named in the shipping notice when there are several, and a product weight must be a number', () => {
  assert.equal(shippedDraft({ number: 'INV-5', parcelNumber: 2 }).subject, 'Your order INV-5 (parcel 2) has shipped');
  assert.equal(shippedDraft({ number: 'INV-5' }).subject, 'Your order INV-5 has shipped');
  assert.equal(sanitizeProduct({ name: 'x', price: 3, weightKg: '1.2345' }).product.weightKg, 1.235);
  assert.match(sanitizeProduct({ name: 'x', price: 3, weightKg: '-2' }).error, /kilograms/);
});

const order = { basketLines: [{ productId: 'a', name: 'Mug', quantity: 3, unit: 10, amount: 30 }, { productId: 'b', name: 'Jug', quantity: 1, unit: 20, amount: 20 }], amount: 50, total: 60, amountPaid: 60, returns: [] };
t('a return refunds the price paid for the lines, scaled to include tax, less the restocking fee', () => {
  const r = planReturn({ invoice: order, lines: [{ productId: 'a', quantity: 2, restock: true }], method: 'refund', restockFeePct: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.record.gross, 24);      // 20 net x 60/50
  assert.equal(r.record.restockFee, 2.4);
  assert.equal(r.refund, 21.6);
  assert.deepEqual(r.stockBack, [{ productId: 'a', variantId: '', quantity: 2, tracked: true }]);
});
t('a line cannot be returned more than once, and a restocking fee above 50 percent is refused', () => {
  const first = planReturn({ invoice: order, lines: [{ productId: 'a', quantity: 2 }] });
  const again = planReturn({ invoice: { ...order, returns: [first.record] }, lines: [{ productId: 'a', quantity: 2 }] });
  assert.equal(again.ok, false);
  assert.match(again.error, /Only 1 of Mug/);
  assert.equal(planReturn({ invoice: order, lines: [{ productId: 'a', quantity: 1 }], restockFeePct: 60 }).ok, false);
  assert.deepEqual(returnable({ ...order, returns: [first.record] }).map((l) => [l.productId, l.left]), [['a', 1], ['b', 1]]);
});
t('store credit is a return with no money owed back by the app, and a return never exceeds what was paid', () => {
  const credit = planReturn({ invoice: order, lines: [{ productId: 'b', quantity: 1 }], method: 'store_credit' });
  assert.equal(credit.record.method, 'store_credit');
  assert.equal(credit.refund, 24);
  assert.equal(planReturn({ invoice: { ...order, amountPaid: 10 }, lines: [{ productId: 'b', quantity: 1 }] }).ok, false);
});
t('tax rates by country: the owner enters them; an unlisted country uses the default rate', () => {
  const rates = sanitizeTaxRates('gb, 20\nLK, 0\nbad line\nGB, 5');
  assert.deepEqual(rates, [{ country: 'GB', rate: 5 }, { country: 'LK', rate: 0 }]);
  assert.equal(rateForCountry(rates, 'gb', 10), 5);
  assert.equal(rateForCountry(rates, 'FR', 10), 10);
  assert.equal(rateForCountry(rates, '', 10), 10);
});

t('a card refund is planned only against a stored payment with enough left, and never beyond what is owed', () => {
  const inv = { returnRefundDue: 21.6, onlinePaymentIntents: [{ intent: 'pi_1', amount: 60, refunded: 0 }] };
  assert.deepEqual(planCardRefund({ invoice: inv }), { ok: true, intent: 'pi_1', cents: 2160, index: 0 });
  assert.equal(planCardRefund({ invoice: inv, amount: 30 }).ok, false);
  assert.equal(planCardRefund({ invoice: { returnRefundDue: 5, onlinePaymentIntents: [] } }).ok, false);
  assert.match(planCardRefund({ invoice: { returnRefundDue: 5, onlinePaymentIntents: [] } }).error, /before card references/);
  assert.equal(planCardRefund({ invoice: { returnRefundDue: 0, onlinePaymentIntents: [{ intent: 'pi_2', amount: 9, refunded: 0 }] } }).ok, false);
  const used = { returnRefundDue: 10, onlinePaymentIntents: [{ intent: 'pi_3', amount: 12, refunded: 5 }] };
  assert.equal(planCardRefund({ invoice: used }).ok, false);
});

t('a card refund shows on the statement as a debit, and the balance accounts for it', () => {
  const inv = { id: 'i1', number: 'INV-1', email: 'buy@x.com', status: 'paid', amount: 50, total: 60, amountPaid: 60, issuedAt: '2026-10-01T10:00:00.000Z', paidAt: '2026-10-01T11:00:00.000Z', cardRefunds: [{ amount: 21.6, at: '2026-10-05T10:00:00.000Z' }] };
  const st = buildStatement({ invoices: [inv], customerEmail: 'buy@x.com', now: Date.UTC(2026, 9, 10) });
  assert.deepEqual(st.lines.map((l) => l.type), ['Invoice', 'Payment', 'Refund']);
  assert.equal(st.totals.refunded, 21.6);
  assert.equal(st.totals.outstanding, 21.6);
});

t('product options: each option has its own stock, a sold-out option is refused, and a return or restock is per option', () => {
  const tee = sanitizeProduct({ name: 'Tee', price: 20, variantsText: 'Small, 5\nLarge, 0' }).product;
  assert.equal(tee.stockOnHand, null);
  assert.deepEqual(planStockHold([{ productId: 'a', variantId: 'small', quantity: 2, product: tee }]).holds[0].after, 3);
  assert.match(planStockHold([{ productId: 'a', variantId: 'large', quantity: 1, product: tee }]).error, /sold out/);
  assert.match(sanitizeProduct({ name: 'Tee', price: 20, variantsText: 'Small, 5\nsmall, 2' }).error, /listed twice/);
  const inv = { basketLines: [{ productId: 'a', variantId: 'small', variantLabel: 'Small', name: 'Tee', quantity: 3, unit: 20, amount: 60 }], amount: 60, total: 60, amountPaid: 60, returns: [] };
  assert.deepEqual(planReturn({ invoice: inv, lines: [{ productId: 'a', variantId: 'small', quantity: 2, restock: true }] }).stockBack, [{ productId: 'a', variantId: 'small', quantity: 2, tracked: true }]);
  assert.match(planReturn({ invoice: inv, lines: [{ productId: 'a', variantId: 'large', quantity: 1 }] }).error, /not on this order/);
});

console.log(`growth-pass115: ${n} passed`);
