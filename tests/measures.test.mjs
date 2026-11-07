// Measures (Pass 189): Land Registry comparables, the support queue and its measures, and the sales measures on one screen.
import assert from 'node:assert/strict';
import { normalisePostcode, soldPricesQuery, parseSoldPrices } from '../lib/landregistry.js';
import { ticketFor, supportKpis, SLA_HOURS } from '../lib/support.js';
import { salesKpis } from '../lib/sales-kpis.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const H = 3600000, DAY = 86400000;
const now = Date.parse('2026-11-05T12:00:00Z');

t('a postcode is normalised to the UK form, and anything else is refused (so nothing unsafe reaches the query)', () => {
  assert.equal(normalisePostcode('sw1a1aa'), 'SW1A 1AA');
  assert.equal(normalisePostcode('M1 1AE'), 'M1 1AE');
  assert.equal(normalisePostcode('x"; DROP'), null);
  assert.equal(soldPricesQuery('bad'), null);
  assert.match(soldPricesQuery('SW1A 1AA'), /lrcommon:postcode "SW1A 1AA"/);
});

t('sold prices are read from the reply; rows without a price are dropped', () => {
  const comps = parseSoldPrices({ results: { bindings: [
    { price: { value: '350000' }, date: { value: '2026-03-01T00:00:00' }, paon: { value: '12' } },
    { date: { value: '2026-02-01' } },
  ] } });
  assert.deepEqual(comps, [{ price: 350000, date: '2026-03-01', description: '12' }]);
});

t('a support ticket is due two hours after it opens, and a complaint is high priority', () => {
  const tk = ticketFor({ stageKey: 'support:a', leadEmail: 'ann@x.com', stage: 'complaint', reason: 'Refund please' }, now);
  assert.equal(tk.priority, 'high');
  assert.equal(Date.parse(tk.dueAt) - Date.parse(tk.openedAt), SLA_HOURS * H);
});

t('the support measures: what is open, what is past target, and how often the target is met', () => {
  const tickets = [
    { status: 'open', openedAt: new Date(now - 5 * H).toISOString(), dueAt: new Date(now - 3 * H).toISOString(), kind: 'complaint' },
    { status: 'resolved', openedAt: new Date(now - 2 * DAY).toISOString(), dueAt: new Date(now - 2 * DAY + 2 * H).toISOString(), resolvedAt: new Date(now - 2 * DAY + 1 * H).toISOString() },
    { status: 'resolved', openedAt: new Date(now - 3 * DAY).toISOString(), dueAt: new Date(now - 3 * DAY + 2 * H).toISOString(), resolvedAt: new Date(now - 3 * DAY + 5 * H).toISOString() },
  ];
  const k = supportKpis(tickets, now);
  assert.equal(k.open, 1);
  assert.equal(k.overdue, 1);
  assert.equal(k.complaintsOpen, 1);
  assert.equal(k.targetMetPct, 50);
  assert.equal(k.resolvedThisWeek, 2);
});

t('the sales measures: pipeline, last twelve months, win rate, waiting leads and the buy side realised margin', () => {
  const k = salesKpis({
    now,
    deals: [
      { stage: 'proposal', value: 1000 },
      { stage: 'closed_won', value: 3000, stageTimes: { closed_won: new Date(now - 10 * DAY).toISOString() } },
      { stage: 'closed_lost', value: 500 },
    ],
    leads: [{ status: 'new' }, { status: 'replied' }],
    targets: [{ side: 'buy', stage: 'closed_won', actualSale: 120, totalCost: 100 }, { side: 'buy', stage: 'offer' }],
    tickets: [{ status: 'open' }],
  });
  assert.deepEqual(k.pipeline, { open: 1, value: 1000 });
  assert.equal(k.sales.wonLast12Months, 1);
  assert.equal(k.sales.winRatePct, 50);
  assert.equal(k.speed.newLeadsWaiting, 1);
  assert.equal(k.buySide.realisedMarginPct, 20);
  assert.equal(k.support.open, 1);
});

console.log(`\n${n} passed`);
