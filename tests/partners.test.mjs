import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePartner, sanitizePayout, partnerSlug, partnerTag, partnerLink, computePartners } from '../lib/partners.js';
import { computeProfit } from '../lib/profit.js';
import { buildNextActions } from '../lib/next-actions.js';

const NOW = Date.UTC(2026, 9, 20);
const P = (o) => sanitizePartner({ name: 'Kasun Printers', commissionPct: 10, ...o }, { id: o?.id || 'p1' }).partner;

test('a partner needs a name and sane terms; the tag comes from the name', () => {
  assert.match(sanitizePartner({ name: 'x' }).error, /name/);
  assert.match(sanitizePartner({ name: 'Kasun', commissionPct: 150 }).error, /0 to 100/);
  assert.match(sanitizePartner({ name: 'Kasun', bountyPerWin: -5 }).error, /negative/);
  assert.match(sanitizePartner({ name: '!!!' }).error, /letters or numbers/);
  const p = P({});
  assert.deepEqual([p.slug, p.type, p.commissionPct, p.bountyPerWin, p.active], ['kasun-printers', 'referrer', 10, 0, true]);
  assert.equal(partnerTag(p), 'partner-kasun-printers');
  assert.equal(partnerSlug('  Dr. Perera & Sons!  '), 'dr-perera-sons');
});

test('the partner link is the enquiry form tagged for them, https only', () => {
  const p = P({});
  assert.equal(partnerLink({ origin: 'https://app.example.com/', key: 'ab12', partner: p }), 'https://app.example.com/enquire?k=ab12&src=partner-kasun-printers');
  assert.equal(partnerLink({ origin: 'http://app.example.com', key: 'ab12', partner: p }), '');
  assert.equal(partnerLink({ origin: 'https://a.co', key: '', partner: p }), '');
});

test('payouts need a partner and a positive amount', () => {
  assert.match(sanitizePayout({ amount: 5 }).error, /partner/);
  assert.match(sanitizePayout({ partnerId: 'p1', amount: 0 }).error, /more than 0/);
  const o = sanitizePayout({ partnerId: 'p1', amount: '1500.456', paidAt: '2026-10-01' }).payout;
  assert.deepEqual([o.amount, o.paidAt], [1500.46, '2026-10-01']);
});

test('what a partner brought, what was collected, and what you owe: commission only on cash that arrived', () => {
  const deals = [
    { email: 'a@x.com', stage: 'closed_won', value: 1000, sourceDetail: 'partner-kasun-printers' },
    { email: 'b@x.com', stage: 'closed_won', value: 2000, sourceDetail: 'partner-kasun-printers' },   // won but not paid yet
    { email: 'c@x.com', stage: 'qualified', value: 500, sourceDetail: 'partner-kasun-printers' },
    { email: 'd@x.com', stage: 'closed_won', value: 900, sourceDetail: 'instagram' },
    { email: 'e@x.com', stage: 'new', value: 0, sourceDetail: 'partner-ghost' },
  ];
  const paidInvoices = [{ email: 'a@x.com', amount: 400 }, { email: 'a@x.com', amount: 600 }, { email: 'd@x.com', amount: 900 }];
  const c = computePartners({ partners: [P({ bountyPerWin: 100 })], deals, paidInvoices, payouts: [{ partnerId: 'p1', amount: 50, paidAt: '2026-10-05' }], now: NOW });
  const r = c.rows[0];
  assert.deepEqual([r.leads, r.won, r.payingCustomers, r.revenue, r.collected], [3, 2, 1, 3000, 1000]);
  assert.equal(r.earned, 200);                       // 10% of 1000 collected + 100 for the one paying customer
  assert.equal(r.paid, 50);
  assert.equal(r.owed, 150);
  assert.deepEqual(c.unknownTags, [{ tag: 'partner-ghost', count: 1 }]);   // a lead on a tag nobody set up is not lost
  assert.equal(c.totals.owed, 150);
  assert.equal(c.totals.payouts90, 50);
  assert.equal(c.top.name, 'Kasun Printers');
});

test('overpaying is shown, never negative owed; no partners is a quiet empty state', () => {
  const c = computePartners({ partners: [P({})], deals: [], payouts: [{ partnerId: 'p1', amount: 80, paidAt: '2026-10-05' }], now: NOW });
  assert.deepEqual([c.rows[0].owed, c.rows[0].overpaid], [0, 80]);
  const none = computePartners({});
  assert.deepEqual([none.any, none.rows.length, none.top], [false, 0, null]);
  const old = computePartners({ partners: [P({})], payouts: [{ partnerId: 'p1', amount: 80, paidAt: '2025-01-01' }], now: NOW });
  assert.equal(old.totals.payouts90, 0);
});

test('partner payouts are a real cost of winning customers: they reduce the 90 day profit', () => {
  const base = { settings: {}, now: NOW, deals: [{ email: 'a@x.com', stage: 'closed_won', value: 1000, valueIsEstimate: false, deliveryCost: 0, closedAt: new Date(NOW - 5 * 864e5).toISOString(), lastUpdate: new Date(NOW - 5 * 864e5).toISOString() }] };
  const without = computeProfit(base);
  const withPay = computeProfit({ ...base, partnerPayouts90: 200 });
  assert.equal(without.netProfit90 - withPay.netProfit90, 200);
  assert.equal(withPay.partnerPayouts90, 200);
});

test('do this next: tells you what you owe partners, only when it is something', () => {
  const metrics = { settings: { currency: 'LKR', avgDealValue: 1000, probabilities: {} }, present: { openCount: 0, inboundWaiting: [], staleCount: 0, staleValue: 0 }, deals: [], past: { wonByMonth: [{ revenue: 0 }], winBack: { count: 0, value: 0 } }, future: { horizons: [{ expected: 0 }] } };
  const get = (partners) => buildNextActions({ metrics, partners }).find((a) => a.id === 'partner_owed');
  assert.equal(get(null), undefined);
  assert.equal(get({ totals: { owed: 0 }, rows: [] }), undefined);
  const a = get({ totals: { owed: 4200 }, rows: [{ name: 'Kasun Printers', owed: 3000 }, { name: 'Nimal', owed: 1200 }, { name: 'Zero', owed: 0 }] });
  assert.match(a.title, /owe your partners/);
  assert.match(a.detail, /Kasun Printers/);
  assert.doesNotMatch(a.detail, /Zero/);
  assert.equal(a.href, '/partners');
});

import { sanitizeEnquiry } from '../lib/inbound.js';
test('even a long partner name makes a tag that survives the enquiry form unchanged, so the lead is credited', () => {
  for (const name of ['Dr Perera Dental And Orthodontic Specialist Centre', 'A Very Long Business Name Trading As Something Else Entirely (Pvt) Ltd']) {
    const tag = partnerTag({ slug: partnerSlug(name) });
    const e = sanitizeEnquiry({ email: 'a@b.co', name: 'X', message: 'hello there friend', src: tag }).enquiry;
    assert.equal(e.src, tag, name);
  }
});
