// Pass 282: ROAS per campaign (enquiry campaign carried to the deal, campaign on spend); a look-back of 3, 6 or 12 months;
// the sales order record created on quote acceptance, linked to its invoices by quote id.
import assert from 'node:assert/strict';
import { sanitizeSpend, computeMarketing, campaignKey } from '../lib/marketing.js';
import { orderForAcceptedQuote, orderStatusFromInvoices } from '../lib/orders.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const NOW = Date.parse('2026-11-15T00:00:00Z');

t('a campaign name is matched the same way everywhere: trimmed, lower case, single spaces', () => {
  assert.equal(campaignKey('  Spring   ADS '), 'spring ads');
  assert.equal(campaignKey(''), '');
  assert.equal(campaignKey(undefined), '');
});

t('spend can carry a campaign name; without one it is empty and still valid', () => {
  const withCampaign = sanitizeSpend({ channel: 'paid_ads', amount: 10, month: '2026-11', campaign: '  Spring   Ads ' });
  assert.equal(withCampaign.entry.campaign, 'spring ads');
  const without = sanitizeSpend({ channel: 'paid_ads', amount: 10, month: '2026-11' });
  assert.equal(without.entry.campaign, '');
});

t('ROAS per campaign: won value over that campaign\'s spend; a spend-only campaign has no ROAS yet', () => {
  const spend = [
    { channel: 'paid_ads', amount: 100, month: '2026-11', campaign: 'spring ads' },
    { channel: 'paid_ads', amount: 50, month: '2026-11', campaign: 'Summer Promo' },
  ];
  const deals = [
    { stage: 'closed_won', closedAt: '2026-11-05T00:00:00Z', value: 300, source: 'inbound', campaign: 'Spring Ads' },
    { stage: 'closed_won', closedAt: '2026-11-06T00:00:00Z', value: 200, source: 'inbound' }, // no campaign: counted overall only
  ];
  const m = computeMarketing({ spend, deals, now: NOW });
  const spring = m.byCampaign.find((c) => c.campaign === 'spring ads');
  assert.equal(spring.spend, 100);
  assert.equal(spring.wins, 1);
  assert.equal(spring.wonValue, 300);
  assert.equal(spring.roas, 3);
  assert.equal(spring.costPerWin, 100);
  const summer = m.byCampaign.find((c) => c.campaign === 'summer promo');
  assert.equal(summer.wins, 0);
  assert.equal(summer.roas, null);
  assert.equal(m.roas, 3.33); // overall still counts the untagged win: 500 / 150
});

t('the look-back window is 3, 6 or 12 months; older spend counts only when the window reaches it', () => {
  const spend = [{ channel: 'paid_ads', amount: 80, month: '2026-06' }];
  assert.equal(computeMarketing({ spend, deals: [], now: NOW, months: 3 }).spend90, 0);
  assert.equal(computeMarketing({ spend, deals: [], now: NOW, months: 6 }).spend90, 80);
  assert.equal(computeMarketing({ spend, deals: [], now: NOW, months: 12 }).months.length, 12);
});

t('a sales order is created when a quote is accepted: it links to the quote and carries the commitment', () => {
  const order = orderForAcceptedQuote({
    uid: 'u1', now: Date.parse('2026-11-14T10:00:00Z'),
    quote: { id: 'q9', customerEmail: ' Ann@X.com ', customerName: 'Ann', title: 'Website', total: 1200.456, signedName: 'Ann Clinic', status: 'accepted' },
  });
  assert.equal(order.id, 'q9');
  assert.equal(order.quoteId, 'q9');
  assert.equal(order.customerEmail, 'ann@x.com');
  assert.equal(order.total, 1200.46);
  assert.equal(order.status, 'confirmed');
  assert.equal(order.signedName, 'Ann Clinic');
  assert.equal(order.confirmedAt, '2026-11-14T10:00:00.000Z');
});

t('no order is made without a quote id', () => {
  assert.equal(orderForAcceptedQuote({ uid: 'u1', quote: { total: 5 } }), null);
});

t('order status comes from its invoices: confirmed, then invoiced, then paid when the invoices cover the total', () => {
  const order = { quoteId: 'q9', total: 1000 };
  assert.equal(orderStatusFromInvoices(order, []), 'confirmed');
  assert.equal(orderStatusFromInvoices(order, [{ quoteId: 'q9', status: 'sent', total: 400 }]), 'invoiced');
  assert.equal(orderStatusFromInvoices(order, [{ quoteId: 'q9', status: 'paid', amountPaid: 400 }, { quoteId: 'q9', status: 'sent', total: 600 }]), 'invoiced');
  assert.equal(orderStatusFromInvoices(order, [{ quoteId: 'q9', status: 'paid', total: 400 }, { quoteId: 'q9', status: 'paid', total: 600 }]), 'paid');
  assert.equal(orderStatusFromInvoices(order, [{ quoteId: 'other', status: 'paid', total: 1000 }]), 'confirmed');
  assert.equal(orderStatusFromInvoices(order, [{ quoteId: 'q9', status: 'void', total: 1000 }]), 'confirmed');
});

console.log(`\n${n} passed`);
